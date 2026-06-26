
# -*- coding: utf-8 -*-
"""
SS2026 Surveillance System — Complete Backend
=============================================
Run:
    pip install flask flask-cors minio --break-system-packages
    python backend.py

Default users:
    admin    / admin123  (full access)
    operator / operator123 (view only)
"""

import os
import json
import base64
import hashlib
import hmac
import sqlite3
import threading
import io
import subprocess

import requests
from datetime import datetime, timedelta
from functools import wraps
from flask import Flask, request, jsonify, g
from flask_cors import CORS

try:
    from minio import Minio
    MINIO_AVAILABLE = True
except ImportError:
    MINIO_AVAILABLE = False
    print("⚠️  MinIO not installed")

# ══════════════════════════════════════════════════════════════
# CONFIG
# ══════════════════════════════════════════════════════════════
HOST             = "0.0.0.0"
PORT             = 8000
DB_PATH          = "/shared/surveillance.db"
JWT_SECRET       = "ss2026-secret-change-in-production"
JWT_EXPIRY_HOURS = 24

MINIO_HOST   = os.getenv("MINIO_HOST", "10.10.10.1:9000")
MINIO_ACCESS = os.getenv("MINIO_ACCESS", "minioadmin")
MINIO_SECRET = os.getenv("MINIO_SECRET", "minioadmin")
MINIO_BUCKET = "surveillance-snapshots"

DETECTION_HOST = "10.10.10.1"
DETECTION_PORT = 8090
PROMETHEUS_URL = "http://10.10.10.1:9090"

HOSTS_WITHOUT_PI4 = "/home/admin/mpi_hosts_without_pi4"
HOSTS_WITH_PI4    = "/home/admin/mpi_hosts_with_pi4"
HOSTS_CURRENT     = "/home/admin/mpi_hosts_8nodes"

NODES = {
    "pi5-master": "10.10.10.1",
    "pi4-camera": "10.10.10.40",
    "pi3-node1":  "10.10.10.21",
    "pi3-node2":  "10.10.10.22",
    "pi3-node3":  "10.10.10.23",
    "pi3-node4":  "10.10.10.24",
    "pi3-node5":  "10.10.10.25",
    "pi3-node6":  "10.10.10.26",
    "pi3-node7":  "10.10.10.27",
    "pi3-node8":  "10.10.10.28",
}
BENCHMARK_FILE = "/shared/benchmarks.json"

import math

def read_benchmarks():
    try:
        with open(BENCHMARK_FILE, 'r') as f:
            return json.load(f)
    except:
        return {
            "hpl": [],
            "task_distributor": [],
            "monte_carlo_pi": [],
            "array_sum": [],
	    "monte_carlo_pi_strong": []
        }

def write_benchmarks(data):
    try:
        with open(BENCHMARK_FILE, 'w') as f:
            json.dump(data, f)
    except Exception as e:
        print(f"Benchmark write error: {e}")

def calculate_speedup_curves(results):
    """Given list of {nodes, value} results, compute actual speedup,
    Amdahl's theoretical curve, and Gustafson's theoretical curve."""
    if not results:
        return {"actual": [], "amdahl": [], "gustafson": [], "parallel_fraction": 0}

    sorted_results = sorted(results, key=lambda x: x["nodes"])
    baseline = next((r for r in sorted_results if r["nodes"] == 1), sorted_results[0])
    baseline_value = baseline["value"]

    actual = []
    for r in sorted_results:
        speedup = r["value"] / baseline_value if r.get("metric") == "gflops" else baseline_value / r["value"]
        actual.append({"nodes": r["nodes"], "speedup": round(speedup, 3)})

    max_n = max(r["nodes"] for r in sorted_results)
    best_speedup_point = max(actual, key=lambda x: x["speedup"])
    N_for_P = best_speedup_point["nodes"]
    S_for_P = best_speedup_point["speedup"]
    if N_for_P > 1 and S_for_P > 1:
        P = (1 - 1/S_for_P) / (1 - 1/N_for_P)
        P = max(0, min(1, P))
    else:
        P = 0.75

    amdahl = []
    gustafson = []
    for n in range(1, max_n + 1):
        amdahl_speedup = 1 / ((1 - P) + P / n)
        gustafson_speedup = n - (1 - P) * (n - 1)
        amdahl.append({"nodes": n, "speedup": round(amdahl_speedup, 3)})
        gustafson.append({"nodes": n, "speedup": round(gustafson_speedup, 3)})

    return {
        "actual": actual,
        "amdahl": amdahl,
        "gustafson": gustafson,
        "parallel_fraction": round(P, 3)
    }
# ══════════════════════════════════════════════════════════════
# FLASK APP
# ══════════════════════════════════════════════════════════════
app = Flask(__name__)
CORS(app)

# ══════════════════════════════════════════════════════════════
# DATABASE
# ══════════════════════════════════════════════════════════════
def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
    return g.db

@app.teardown_appcontext
def close_db(e):
    db = g.pop("db", None)
    if db:
        db.close()

def init_db():
    conn = sqlite3.connect(DB_PATH)
    c    = conn.cursor()
    c.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            username      TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role          TEXT NOT NULL DEFAULT 'operator',
            is_active     INTEGER DEFAULT 1,
            last_login    TEXT,
            created_at    TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)
    c.execute("""
        CREATE TABLE IF NOT EXISTS events (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            type          TEXT NOT NULL,
            reason        TEXT,
            confidence    REAL,
            timestamp     TEXT NOT NULL,
            camera_id     TEXT,
            image_url     TEXT,
            image_b64     TEXT,
            created_at    TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)
    c.execute("SELECT COUNT(*) FROM users")
    if c.fetchone()[0] == 0:
        users = [
            ("admin",    hash_password("admin123"),    "admin"),
            ("operator", hash_password("operator123"), "operator"),
        ]
        c.executemany(
            "INSERT INTO users (username, password_hash, role) VALUES (?,?,?)",
            users
        )
        print("✅ Default users created")
        print("   admin    / admin123")
        print("   operator / operator123")
    conn.commit()
    conn.close()

# ══════════════════════════════════════════════════════════════
# PASSWORD + JWT
# ══════════════════════════════════════════════════════════════
def hash_password(password):
    return hashlib.sha256(password.encode()).hexdigest()

def verify_password(password, hashed):
    return hash_password(password) == hashed

def create_token(user_id, username, role):
    payload = {
        "user_id":  user_id,
        "username": username,
        "role":     role,
        "exp":      (datetime.utcnow() + timedelta(hours=JWT_EXPIRY_HOURS)).isoformat()
    }
    payload_b64 = base64.b64encode(json.dumps(payload).encode()).decode()
    sig = hmac.new(JWT_SECRET.encode(), payload_b64.encode(), hashlib.sha256).hexdigest()
    return f"{payload_b64}.{sig}"

def verify_token(token):
    try:
        payload_b64, sig = token.rsplit(".", 1)
        expected = hmac.new(JWT_SECRET.encode(), payload_b64.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expected):
            return None
        payload = json.loads(base64.b64decode(payload_b64))
        if datetime.fromisoformat(payload["exp"]) < datetime.utcnow():
            return None
        return payload
    except Exception:
        return None

def get_token():
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        return auth[7:]
    return None

# ══════════════════════════════════════════════════════════════
# AUTH DECORATORS
# ══════════════════════════════════════════════════════════════
def require_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = get_token()
        if not token:
            return jsonify({"error": "No token"}), 401
        payload = verify_token(token)
        if not payload:
            return jsonify({"error": "Invalid token"}), 401
        g.current_user = payload
        return f(*args, **kwargs)
    return decorated

def require_admin(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = get_token()
        if not token:
            return jsonify({"error": "No token"}), 401
        payload = verify_token(token)
        if not payload:
            return jsonify({"error": "Invalid token"}), 401
        if payload.get("role") != "admin":
            return jsonify({"error": "Admin required"}), 403
        g.current_user = payload
        return f(*args, **kwargs)
    return decorated

# ══════════════════════════════════════════════════════════════
# MINIO
# ══════════════════════════════════════════════════════════════
minio_client = None

def init_minio():
    global minio_client
    if not MINIO_AVAILABLE:
        return
    try:
        minio_client = Minio(MINIO_HOST, access_key=MINIO_ACCESS, secret_key=MINIO_SECRET, secure=False)
        if not minio_client.bucket_exists(MINIO_BUCKET):
            minio_client.make_bucket(MINIO_BUCKET)
            print(f"✅ MinIO bucket created: {MINIO_BUCKET}")
        else:
            print(f"✅ MinIO bucket ready: {MINIO_BUCKET}")
    except Exception as e:
        print(f"⚠️  MinIO not available: {e}")
        minio_client = None

def save_to_minio(image_b64, filename):
    if not minio_client:
        return None
    try:
        image_bytes = base64.b64decode(image_b64)
        minio_client.put_object(MINIO_BUCKET, filename, io.BytesIO(image_bytes),
                                length=len(image_bytes), content_type="image/jpeg")
        return f"http://{MINIO_HOST}/{MINIO_BUCKET}/{filename}"
    except Exception as e:
        print(f"⚠️  MinIO upload failed: {e}")
        return None

# ══════════════════════════════════════════════════════════════
# PROMETHEUS HELPER
# ══════════════════════════════════════════════════════════════
def query_prometheus(query):
    try:
        r = requests.get(f"{PROMETHEUS_URL}/api/v1/query", params={"query": query}, timeout=3)
        result = r.json()["data"]["result"]
        return {item["metric"].get("instance", ""): round(float(item["value"][1]), 1) for item in result}
    except Exception:
        return {}

# ══════════════════════════════════════════════════════════════
# AUTH ENDPOINTS
# ══════════════════════════════════════════════════════════════

@app.route("/api/auth/login", methods=["POST"])
def login():
    data = request.get_json()
    if not data or not data.get("username") or not data.get("password"):
        return jsonify({"error": "Username and password required"}), 400
    db   = get_db()
    user = db.execute("SELECT * FROM users WHERE username=? AND is_active=1", (data["username"],)).fetchone()
    if not user or not verify_password(data["password"], user["password_hash"]):
        return jsonify({"error": "Invalid credentials"}), 401
    db.execute("UPDATE users SET last_login=? WHERE id=?", (datetime.now().isoformat(), user["id"]))
    db.commit()
    token = create_token(user["id"], user["username"], user["role"])
    return jsonify({"token": token, "role": user["role"], "username": user["username"], "expires_in": JWT_EXPIRY_HOURS * 3600})


@app.route("/api/auth/register", methods=["POST"])
@require_admin
def register():
    data = request.get_json()
    if not data or not data.get("username") or not data.get("password"):
        return jsonify({"error": "Username and password required"}), 400
    role = data.get("role", "operator")
    if role not in ("admin", "operator"):
        return jsonify({"error": "Role must be admin or operator"}), 400
    db = get_db()
    try:
        db.execute("INSERT INTO users (username, password_hash, role) VALUES (?,?,?)",
                   (data["username"], hash_password(data["password"]), role))
        db.commit()
        return jsonify({"status": "ok", "message": f"User {data['username']} created"})
    except sqlite3.IntegrityError:
        return jsonify({"error": "Username already exists"}), 409


@app.route("/api/auth/me", methods=["GET"])
@require_auth
def me():
    return jsonify({"username": g.current_user["username"], "role": g.current_user["role"], "user_id": g.current_user["user_id"]})

# ══════════════════════════════════════════════════════════════
# EVENTS
# ══════════════════════════════════════════════════════════════

@app.route("/api/events", methods=["POST"])
def receive_event():
    data = request.get_json()
    if not data:
        return jsonify({"error": "No data"}), 400
    image_b64 = data.get("image", "")
    image_url = None
    if image_b64:
        ts        = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename  = f"alert_{ts}_{data.get('camera_id','cam')}.jpg"
        image_url = save_to_minio(image_b64, filename)
    db = get_db()
    cursor = db.execute(
        "INSERT INTO events (type, reason, confidence, timestamp, camera_id, image_url, image_b64) VALUES (?,?,?,?,?,?,?)",
        (data.get("type", "suspicious"), data.get("reason", ""), data.get("confidence", 0.0),
         data.get("timestamp", datetime.now().isoformat()), data.get("camera_id", "unknown"),
         image_url, image_b64 if not image_url else "")
    )
    db.commit()
    print(f"📥 Alert #{cursor.lastrowid} — {data.get('reason')} @ {data.get('confidence', 0):.0%}")
    return jsonify({"status": "ok", "event_id": cursor.lastrowid})


@app.route("/api/events", methods=["GET"])
@require_auth
def get_events():
    page   = int(request.args.get("page", 1))
    limit  = int(request.args.get("limit", 20))
    offset = (page - 1) * limit
    db     = get_db()
    total  = db.execute("SELECT COUNT(*) FROM events").fetchone()[0]
    rows   = db.execute(
        "SELECT id, type, reason, confidence, timestamp, camera_id, image_url FROM events ORDER BY id DESC LIMIT ? OFFSET ?",
        (limit, offset)
    ).fetchall()
    return jsonify({"events": [dict(r) for r in rows], "total": total, "page": page, "pages": max(1, -(-total // limit))})


@app.route("/api/events/<int:event_id>", methods=["GET"])
@require_auth
def get_event(event_id):
    db  = get_db()
    row = db.execute("SELECT * FROM events WHERE id=?", (event_id,)).fetchone()
    if not row:
        return jsonify({"error": "Not found"}), 404
    return jsonify(dict(row))


@app.route("/api/events/<int:event_id>", methods=["DELETE"])
@require_admin
def delete_event(event_id):
    db = get_db()
    db.execute("DELETE FROM events WHERE id=?", (event_id,))
    db.commit()
    return jsonify({"status": "ok"})

# ══════════════════════════════════════════════════════════════
# USER MANAGEMENT
# ══════════════════════════════════════════════════════════════

@app.route("/api/users", methods=["GET"])
@require_admin
def get_users():
    db   = get_db()
    rows = db.execute("SELECT id, username, role, is_active, last_login, created_at FROM users").fetchall()
    return jsonify({"users": [dict(r) for r in rows]})


@app.route("/api/users/<int:user_id>", methods=["PUT"])
@require_admin
def update_user(user_id):
    data = request.get_json()
    db   = get_db()
    if "role"      in data: db.execute("UPDATE users SET role=? WHERE id=?",          (data["role"], user_id))
    if "is_active" in data: db.execute("UPDATE users SET is_active=? WHERE id=?",     (int(data["is_active"]), user_id))
    if "password"  in data: db.execute("UPDATE users SET password_hash=? WHERE id=?", (hash_password(data["password"]), user_id))
    db.commit()
    return jsonify({"status": "ok"})


@app.route("/api/users/<int:user_id>", methods=["DELETE"])
@require_admin
def delete_user(user_id):
    if g.current_user["user_id"] == user_id:
        return jsonify({"error": "Cannot delete yourself"}), 400
    db = get_db()
    db.execute("DELETE FROM users WHERE id=?", (user_id,))
    db.commit()
    return jsonify({"status": "ok"})

# ══════════════════════════════════════════════════════════════
# SYSTEM STATUS
# ══════════════════════════════════════════════════════════════

def ping_node(ip):
    try:
        r = requests.get(
            f"http://{ip}:9100/metrics",
            timeout=2
        )
        return r.status_code == 200
    except Exception:
        return False

@app.route("/api/system/status", methods=["GET"])
@require_auth
def system_status():
    results  = []
    node_res = {}
    cpu_data    = query_prometheus('100 - (rate(node_cpu_seconds_total{mode="idle"}[1m]) * 100)')
    ram_data    = query_prometheus('100 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes * 100)')
    uptime_data = query_prometheus('node_time_seconds - node_boot_time_seconds')

    def check(name, ip):
        instance = f"{ip}:9100"
        node_res[name] = {
            "name": name, "ip": ip, "online": ping_node(ip),
            "cpu": cpu_data.get(instance, 0), "ram": ram_data.get(instance, 0),
            "uptime": int(uptime_data.get(instance, 0))
        }

    threads = [threading.Thread(target=check, args=(n, ip)) for n, ip in NODES.items()]
    for t in threads: t.start()
    for t in threads: t.join(timeout=5)
    for name in NODES:
        results.append(node_res.get(name, {"name": name, "ip": NODES[name], "online": False, "cpu": 0, "ram": 0, "uptime": 0}))
    return jsonify({"nodes": results, "checked_at": datetime.now().isoformat()})


@app.route("/api/system/services", methods=["GET"])
@require_auth
def system_services():
    services = []
    try:
        r = requests.get(f"http://{DETECTION_HOST}:{DETECTION_PORT}/api/health", timeout=3)
        d = r.json()
        services.append({"name": "Detection Service", "status": "running", "detail": f"FPS:{d.get('fps',0)} Hailo:{d.get('hailo_ms',0)}ms"})
    except:
        services.append({"name": "Detection Service", "status": "offline", "detail": "Cannot reach detection service"})
    try:
        if minio_client and minio_client.bucket_exists(MINIO_BUCKET):
            services.append({"name": "MinIO Storage", "status": "running", "detail": f"Bucket: {MINIO_BUCKET}"})
        else:
            raise Exception()
    except:
        services.append({"name": "MinIO Storage", "status": "offline", "detail": "MinIO not connected"})
    services.append({"name": "Backend API", "status": "running", "detail": f"Port {PORT}"})
    try:
        requests.get(f"{PROMETHEUS_URL}/-/healthy", timeout=2)
        services.append({"name": "Prometheus", "status": "running", "detail": "Scraping all nodes"})
    except:
        services.append({"name": "Prometheus", "status": "offline", "detail": "Cannot reach Prometheus"})
    try:
        requests.get("http://10.10.10.1:3001/api/health", timeout=2)
        services.append({"name": "Grafana", "status": "running", "detail": "Dashboard available"})
    except:
        services.append({"name": "Grafana", "status": "offline", "detail": "Cannot reach Grafana"})
    return jsonify({"services": services, "checked_at": datetime.now().isoformat()})


@app.route("/api/stream/info", methods=["GET"])
@require_auth
def stream_info():
    return jsonify({"stream_url": f"http://{DETECTION_HOST}:{DETECTION_PORT}/video_feed",
                    "status_url": f"http://{DETECTION_HOST}:{DETECTION_PORT}/status", "camera_id": "pi4-cam-01"})


@app.route("/api/camera/settings", methods=["GET"])
@require_auth
def get_camera_settings():
    try:
        r = requests.get(f"http://{DETECTION_HOST}:{DETECTION_PORT}/api/camera/settings", timeout=3)
        return jsonify(r.json())
    except:
        return jsonify({"error": "Detection service offline"}), 503


@app.route("/api/camera/settings", methods=["POST"])
@require_admin
def update_camera_settings():
    data = request.get_json()
    try:
        r = requests.post(f"http://{DETECTION_HOST}:{DETECTION_PORT}/api/camera/settings", json=data, timeout=10)
        return jsonify(r.json())
    except:
        return jsonify({"error": "Detection service offline"}), 503

# ══════════════════════════════════════════════════════════════
# AUTO SCALER
# ══════════════════════════════════════════════════════════════
SHARED_STATE_FILE = "/shared/autoscaler.json"
autoscaler_lock = threading.Lock()

def read_autoscaler_state():
    try:
        with open(SHARED_STATE_FILE, 'r') as f:
            return json.load(f)
    except:
        return {"pi4_status": "standby", "events": []}

def write_autoscaler_state(state):
    try:
        with open(SHARED_STATE_FILE, 'w') as f:
            json.dump(state, f)
    except Exception as e:
        print(f"State write error: {e}")

@app.route("/api/autoscaler/event", methods=["POST"])
def autoscaler_event():
    data = request.json
    with autoscaler_lock:
        state = read_autoscaler_state()
        event = {
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "message": data.get("message", ""),
            "pi4_status": data.get("pi4_status", "standby"),
            "cpu": data.get("cpu", 0)
        }
        state["events"].insert(0, event)
        state["events"] = state["events"][:50]
        state["pi4_status"] = data.get("pi4_status", "standby")
        write_autoscaler_state(state)
    return jsonify({"status": "ok"})


def get_cluster_cpu():
    try:
        r = requests.get(
            "http://10.10.10.1:9090/api/v1/query",
            params={"query": "100 - (avg(rate(node_cpu_seconds_total{mode='idle',job='pi3-workers'}[1m])) * 100)"},
            timeout=3
        )
        data = r.json()
        result = data["data"]["result"]
        if result:
            return round(float(result[0]["value"][1]), 1)
        return 0
    except Exception:
        return 0



@app.route("/api/autoscaler/status", methods=["GET"])
@require_auth
def autoscaler_status():
    state = read_autoscaler_state()
    return jsonify({
        "pi4_status": state.get("pi4_status", "standby"),
        "events": state.get("events", []),
        "cluster_cpu": get_cluster_cpu(),
        "threshold_high": 80,
        "threshold_low": 50
    })

@app.route("/api/autoscaler/trigger", methods=["POST"])
@require_admin
def autoscaler_trigger():
    try:
        requests.post("http://10.10.10.1:8001/trigger", timeout=3)
    except Exception:
        pass
    return jsonify({"status": "ok", "message": "Stress test started"})

@app.route("/api/autoscaler/stop", methods=["POST"])
@require_admin
def autoscaler_stop():
    try:
        requests.post("http://10.10.10.1:8001/stop", timeout=3)
    except Exception:
        pass
    return jsonify({"status": "ok", "message": "Stress test stopped"})
@app.route("/api/autoscaler/clear", methods=["POST"])
@require_admin
def autoscaler_clear():
    with autoscaler_lock:
        state = read_autoscaler_state()
        state["events"] = []
        write_autoscaler_state(state)
    return jsonify({"status": "ok", "message": "Event log cleared"})

@app.route("/api/autoscaler/force", methods=["POST"])
@require_admin
def autoscaler_force():
    action = request.get_json().get("action", "")
    if action == "join":
        subprocess.Popen([
            "bash", "-c",
            "K3S_TOKEN=$(cat /home/admin/k3s_token.txt) && "
            "ssh admin@10.10.10.40 "
            "\"curl -sfL https://get.k3s.io | "
            "K3S_URL=https://10.10.10.1:6443 "
            "K3S_TOKEN=$K3S_TOKEN sh - > /dev/null 2>&1\" &"
        ])
        with autoscaler_lock:
            state = read_autoscaler_state()
            state["events"].insert(0, {"timestamp": datetime.now().isoformat(),
                                      "message": "Manual trigger — Pi4 joining cluster",
                                      "pi4_status": "joining", "cpu": 0})
            state["pi4_status"] = "joining"
            write_autoscaler_state(state)
        return jsonify({"status": "ok", "message": "Pi4 joining cluster"})

    elif action == "leave":
        subprocess.Popen([
            "bash", "-c",
            "sudo kubectl drain pi4-node --ignore-daemonsets "
            "--delete-emulated-pods --force 2>/dev/null; "
            "sleep 5; sudo kubectl delete node pi4-node 2>/dev/null; "
            "ssh admin@10.10.10.40 'sudo k3s-agent-uninstall.sh > /dev/null 2>&1' &"
        ])
        with autoscaler_lock:
            state = read_autoscaler_state()
            state["events"].insert(0, {"timestamp": datetime.now().isoformat(),
                                      "message": "Manual trigger — Pi4 leaving cluster",
                                      "pi4_status": "leaving", "cpu": 0})
            state["pi4_status"] = "leaving"
            write_autoscaler_state(state)
        return jsonify({"status": "ok", "message": "Pi4 leaving cluster"})

    return jsonify({"error": "Invalid action"}), 400

# ══════════════════════════════════════════════════════════════
# HEALTH CHECK
# ══════════════════════════════════════════════════════════════

@app.route("/api/health", methods=["GET"])
def health():
    db    = get_db()
    total = db.execute("SELECT COUNT(*) FROM events").fetchone()[0]
    users = db.execute("SELECT COUNT(*) FROM users").fetchone()[0]
    return jsonify({"status": "ok", "service": "ss2026-backend", "total_events": total,
                    "total_users": users, "minio": "connected" if minio_client else "offline",
                    "timestamp": datetime.now().isoformat()})


@app.route("/api/cluster/pods", methods=["GET"])
@require_auth
def cluster_pods():
    try:
        import urllib3
        urllib3.disable_warnings()
        
        # Read k3s service account token
        with open("/var/run/secrets/kubernetes.io/serviceaccount/token") as f:
            token = f.read().strip()
        
        # Call Kubernetes API directly
        r = requests.get(
            "https://10.10.10.1:6443/api/v1/namespaces/default/pods",
            headers={"Authorization": f"Bearer {token}"},
            verify=False,
            timeout=5
        )
        
        data = r.json()
        pods = []
        
        for item in data.get("items", []):
            name   = item["metadata"]["name"]
            status = item["status"].get("phase", "Unknown")
            node   = item["spec"].get("nodeName", "unknown")
            
            if 'backend'  in name: pod_type = 'backend'
            elif 'minio'  in name: pod_type = 'minio'
            elif 'frontend' in name: pod_type = 'frontend'
            else: continue
            
            pods.append({
                "name":   name,
                "node":   node,
                "status": status,
                "type":   pod_type
            })
        
        return jsonify({"pods": pods})
    except Exception as e:
        return jsonify({"pods": [], "error": str(e)})



@app.route("/api/povray-renders", methods=["GET"])
@require_auth
def get_povray_renders():
    result = {}
    try:
        if minio_client and minio_client.bucket_exists("povray-renders"):
            objects = minio_client.list_objects("povray-renders", recursive=True)
            for obj in objects:
                parts = obj.object_name.split("/", 1)
                if len(parts) != 2:
                    continue
                node_key, filename = parts
                if node_key not in result:
                    result[node_key] = {"chunks": [], "final": None}
                url = f"http://10.100.47.201:30900/povray-renders/{obj.object_name}"
                if filename.startswith("final_"):
                    result[node_key]["final"] = url
                else:
                    result[node_key]["chunks"].append({"name": filename, "url": url})
            for node_key in result:
                result[node_key]["chunks"].sort(key=lambda c: c["name"])
    except Exception as e:
        print(f"povray-renders listing error: {e}")
    return jsonify(result)

@app.route("/api/benchmarks", methods=["GET"])
@require_auth
def get_benchmarks():
    data = read_benchmarks()
    return jsonify({
        "hpl": {
            "results": data.get("hpl", []),
            "curves": calculate_speedup_curves(data.get("hpl", []))
        },
        "task_distributor": {
            "results": data.get("task_distributor", []),
            "curves": calculate_speedup_curves(data.get("task_distributor", []))
        },
        "monte_carlo_pi": {
            "results": data.get("monte_carlo_pi", []),
            "curves": calculate_speedup_curves(data.get("monte_carlo_pi", []))
        },
        "array_sum": {
            "results": data.get("array_sum", []),
            "curves": calculate_speedup_curves(data.get("array_sum", []))
        },
        "monte_carlo_pi_strong": {
            "results": data.get("monte_carlo_pi_strong", []),
            "curves": calculate_speedup_curves(data.get("monte_carlo_pi_strong", []))
        }
    })
@app.route("/api/benchmarks/record", methods=["POST"])
@require_admin
def record_benchmark():
    body = request.json
    benchmark_type = body.get("type")  # "hpl" or "task_distributor"
    nodes = body.get("nodes")
    value = body.get("value")
    metric = body.get("metric")  # "gflops" or "seconds"

    if benchmark_type not in ["hpl", "task_distributor", "monte_carlo_pi", "array_sum", "monte_carlo_pi_strong"]:
        return jsonify({"error": "Invalid benchmark type"}), 400

    data = read_benchmarks()
    if benchmark_type not in data:
        data[benchmark_type] = []
    data[benchmark_type] = [
        r for r in data[benchmark_type] if r["nodes"] != nodes
    ]
    data[benchmark_type].append({
        "nodes": nodes,
        "value": value,
        "metric": metric,
        "timestamp": datetime.now().isoformat()
    })
    write_benchmarks(data)
    return jsonify({"status": "ok"})


# ══════════════════════════════════════════════════════════════
# START
# ══════════════════════════════════════════════════════════════
if __name__ == "__main__":
    print("=" * 55)
    print("  SS2026 Surveillance Backend")
    print(f"  Port:     {PORT}")
    print(f"  Database: {DB_PATH}")
    print(f"  MinIO:    {MINIO_HOST}")
    print("=" * 55)
    init_db()
    init_minio()
    print(f"\n✅ Backend running at http://0.0.0.0:{PORT}")
    print(f"✅ Health: http://0.0.0.0:{PORT}/api/health\n")
    app.run(host=HOST, port=PORT, debug=False, threaded=True)
