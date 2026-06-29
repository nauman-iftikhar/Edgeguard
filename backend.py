# -*- coding: utf-8 -*-
"""
SS2026 Surveillance System — Complete Backend
=============================================
Run:
    pip install flask flask-cors minio sqlalchemy psycopg2-binary requests
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
import threading
import io
import subprocess

import requests
from datetime import datetime, timedelta
from functools import wraps
from flask import Flask, request, jsonify, g
from flask_cors import CORS

from sqlalchemy import (
    create_engine, Column, Integer, String, Float, Text,
    DateTime, func, UniqueConstraint
)
from sqlalchemy.orm import declarative_base, sessionmaker, scoped_session
from sqlalchemy.exc import IntegrityError

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
JWT_SECRET       = "ss2026-secret-change-in-production"
JWT_EXPIRY_HOURS = 24

# PostgreSQL connection — reads from env vars so the same
# image works locally and in k3s (just change the env vars)
DB_HOST     = os.getenv("DB_HOST",     "localhost")
DB_PORT     = os.getenv("DB_PORT",     "5432")
DB_NAME     = os.getenv("DB_NAME",     "edgeguard")
DB_USER     = os.getenv("DB_USER",     "admin")
DB_PASSWORD = os.getenv("DB_PASSWORD", "admin123")

DATABASE_URL = f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

MINIO_HOST   = os.getenv("MINIO_HOST", "10.10.10.1:9000")
MINIO_PUBLIC = os.getenv("MINIO_PUBLIC", "10.100.47.201:30900")
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
BENCHMARK_FILE = os.getenv("BENCHMARK_FILE", "/shared/benchmarks.json")

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
        amdahl.append({"nodes": n, "speedup": round(1 / ((1 - P) + P / n), 3)})
        gustafson.append({"nodes": n, "speedup": round(n - (1 - P) * (n - 1), 3)})
    return {"actual": actual, "amdahl": amdahl, "gustafson": gustafson, "parallel_fraction": round(P, 3)}

# ══════════════════════════════════════════════════════════════
# SQLALCHEMY SETUP
# ══════════════════════════════════════════════════════════════
Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    id            = Column(Integer, primary_key=True, autoincrement=True)
    username      = Column(String(100), unique=True, nullable=False)
    password_hash = Column(String(256), nullable=False)
    role          = Column(String(20), nullable=False, default="operator")
    is_active     = Column(Integer, default=1)
    last_login    = Column(String(50))
    created_at    = Column(DateTime, default=datetime.utcnow)

class Event(Base):
    __tablename__ = "events"
    id         = Column(Integer, primary_key=True, autoincrement=True)
    type       = Column(String(50), nullable=False)
    reason     = Column(String(200))
    confidence = Column(Float)
    timestamp  = Column(String(50), nullable=False)
    camera_id  = Column(String(100))
    image_url  = Column(Text)
    image_b64  = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)

# Create engine with connection pooling — supports multiple
# backend replicas connecting to the same PostgreSQL instance
engine = create_engine(
    DATABASE_URL,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,   # verifies connections before use
    echo=False
)
SessionFactory = sessionmaker(bind=engine)
Session = scoped_session(SessionFactory)

def init_db():
    Base.metadata.create_all(engine)
    session = Session()
    try:
        if session.query(User).count() == 0:
            session.add_all([
                User(username="admin",    password_hash=hash_password("admin123"),    role="admin"),
                User(username="operator", password_hash=hash_password("operator123"), role="operator"),
            ])
            session.commit()
            print("✅ Default users created")
            print("   admin    / admin123")
            print("   operator / operator123")
    except Exception as e:
        session.rollback()
        print(f"init_db error: {e}")
    finally:
        session.close()

def get_db():
    if "db" not in g:
        g.db = Session()
    return g.db

# ══════════════════════════════════════════════════════════════
# FLASK APP
# ══════════════════════════════════════════════════════════════
app = Flask(__name__)
CORS(app)

@app.teardown_appcontext
def close_db(e):
    db = g.pop("db", None)
    if db:
        db.close()
        Session.remove()

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
        return f"http://{MINIO_PUBLIC}/{MINIO_BUCKET}/{filename}"
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
    user = db.query(User).filter_by(username=data["username"], is_active=1).first()
    if not user or not verify_password(data["password"], user.password_hash):
        return jsonify({"error": "Invalid credentials"}), 401
    user.last_login = datetime.now().isoformat()
    db.commit()
    token = create_token(user.id, user.username, user.role)
    return jsonify({"token": token, "role": user.role, "username": user.username, "expires_in": JWT_EXPIRY_HOURS * 3600})


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
        db.add(User(username=data["username"], password_hash=hash_password(data["password"]), role=role))
        db.commit()
        return jsonify({"status": "ok", "message": f"User {data['username']} created"})
    except IntegrityError:
        db.rollback()
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
    db    = get_db()
    event = Event(
        type       = data.get("type", "suspicious"),
        reason     = data.get("reason", ""),
        confidence = data.get("confidence", 0.0),
        timestamp  = data.get("timestamp", datetime.now().isoformat()),
        camera_id  = data.get("camera_id", "unknown"),
        image_url  = image_url,
        image_b64  = image_b64 if not image_url else ""
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    print(f"📥 Alert #{event.id} — {event.reason} @ {event.confidence:.0%}")
    return jsonify({"status": "ok", "event_id": event.id})


@app.route("/api/events", methods=["GET"])
@require_auth
def get_events():
    page   = int(request.args.get("page", 1))
    limit  = int(request.args.get("limit", 20))
    offset = (page - 1) * limit
    db     = get_db()
    total  = db.query(func.count(Event.id)).scalar()
    rows   = db.query(
        Event.id, Event.type, Event.reason, Event.confidence,
        Event.timestamp, Event.camera_id, Event.image_url
    ).order_by(Event.id.desc()).limit(limit).offset(offset).all()
    events = [
        {"id": r.id, "type": r.type, "reason": r.reason,
         "confidence": r.confidence, "timestamp": r.timestamp,
         "camera_id": r.camera_id, "image_url": r.image_url}
        for r in rows
    ]
    return jsonify({"events": events, "total": total, "page": page, "pages": max(1, -(-total // limit))})


@app.route("/api/events/<int:event_id>", methods=["GET"])
@require_auth
def get_event(event_id):
    db  = get_db()
    row = db.query(Event).filter_by(id=event_id).first()
    if not row:
        return jsonify({"error": "Not found"}), 404
    return jsonify({
        "id": row.id, "type": row.type, "reason": row.reason,
        "confidence": row.confidence, "timestamp": row.timestamp,
        "camera_id": row.camera_id, "image_url": row.image_url
    })


@app.route("/api/events/<int:event_id>", methods=["DELETE"])
@require_admin
def delete_event(event_id):
    db = get_db()
    db.query(Event).filter_by(id=event_id).delete()
    db.commit()
    return jsonify({"status": "ok"})

# ══════════════════════════════════════════════════════════════
# USER MANAGEMENT
# ══════════════════════════════════════════════════════════════
@app.route("/api/users", methods=["GET"])
@require_admin
def get_users():
    db   = get_db()
    rows = db.query(User).all()
    return jsonify({"users": [
        {"id": u.id, "username": u.username, "role": u.role,
         "is_active": u.is_active, "last_login": u.last_login,
         "created_at": str(u.created_at)} for u in rows
    ]})


@app.route("/api/users/<int:user_id>", methods=["PUT"])
@require_admin
def update_user(user_id):
    data = request.get_json()
    db   = get_db()
    user = db.query(User).filter_by(id=user_id).first()
    if not user:
        return jsonify({"error": "User not found"}), 404
    if "role"      in data: user.role          = data["role"]
    if "is_active" in data: user.is_active     = int(data["is_active"])
    if "password"  in data: user.password_hash = hash_password(data["password"])
    db.commit()
    return jsonify({"status": "ok"})


@app.route("/api/users/<int:user_id>", methods=["DELETE"])
@require_admin
def delete_user(user_id):
    if g.current_user["user_id"] == user_id:
        return jsonify({"error": "Cannot delete yourself"}), 400
    db = get_db()
    db.query(User).filter_by(id=user_id).delete()
    db.commit()
    return jsonify({"status": "ok"})

# ══════════════════════════════════════════════════════════════
# SYSTEM STATUS
# ══════════════════════════════════════════════════════════════
def ping_node(ip):
    try:
        r = requests.get(f"http://{ip}:9100/metrics", timeout=2)
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
SHARED_STATE_FILE = os.getenv("SHARED_STATE_FILE", "/shared/autoscaler.json")
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
    total = db.query(func.count(Event.id)).scalar()
    users = db.query(func.count(User.id)).scalar()
    return jsonify({"status": "ok", "service": "ss2026-backend", "total_events": total,
                    "total_users": users, "minio": "connected" if minio_client else "offline",
                    "timestamp": datetime.now().isoformat()})


@app.route("/api/cluster/pods", methods=["GET"])
@require_auth
def cluster_pods():
    try:
        import urllib3
        urllib3.disable_warnings()
        with open("/var/run/secrets/kubernetes.io/serviceaccount/token") as f:
            token = f.read().strip()
        r = requests.get(
            "https://10.10.10.1:6443/api/v1/namespaces/default/pods",
            headers={"Authorization": f"Bearer {token}"},
            verify=False, timeout=5
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
            elif 'postgres' in name: pod_type = 'postgres'
            else: continue
            pods.append({"name": name, "node": node, "status": status, "type": pod_type})
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
        "hpl":                 {"results": data.get("hpl", []),                 "curves": calculate_speedup_curves(data.get("hpl", []))},
        "task_distributor":    {"results": data.get("task_distributor", []),    "curves": calculate_speedup_curves(data.get("task_distributor", []))},
        "monte_carlo_pi":      {"results": data.get("monte_carlo_pi", []),      "curves": calculate_speedup_curves(data.get("monte_carlo_pi", []))},
        "array_sum":           {"results": data.get("array_sum", []),           "curves": calculate_speedup_curves(data.get("array_sum", []))},
        "monte_carlo_pi_strong": {"results": data.get("monte_carlo_pi_strong", []), "curves": calculate_speedup_curves(data.get("monte_carlo_pi_strong", []))}
    })

@app.route("/api/benchmarks/record", methods=["POST"])
@require_admin
def record_benchmark():
    body = request.json
    benchmark_type = body.get("type")
    nodes  = body.get("nodes")
    value  = body.get("value")
    metric = body.get("metric")
    if benchmark_type not in ["hpl", "task_distributor", "monte_carlo_pi", "array_sum", "monte_carlo_pi_strong"]:
        return jsonify({"error": "Invalid benchmark type"}), 400
    data = read_benchmarks()
    if benchmark_type not in data:
        data[benchmark_type] = []
    data[benchmark_type] = [r for r in data[benchmark_type] if r["nodes"] != nodes]
    data[benchmark_type].append({"nodes": nodes, "value": value, "metric": metric, "timestamp": datetime.now().isoformat()})
    write_benchmarks(data)
    return jsonify({"status": "ok"})

# ══════════════════════════════════════════════════════════════
# START
# ══════════════════════════════════════════════════════════════
if __name__ == "__main__":
    print("=" * 55)
    print("  SS2026 Surveillance Backend (PostgreSQL)")
    print(f"  Port:     {PORT}")
    print(f"  Database: {DATABASE_URL}")
    print(f"  MinIO:    {MINIO_HOST}")
    print("=" * 55)
    init_db()
    init_minio()
    print(f"\n✅ Backend running at http://0.0.0.0:{PORT}")
    print(f"✅ Health: http://0.0.0.0:{PORT}/api/health\n")
    app.run(host=HOST, port=PORT, debug=False, threaded=True)
