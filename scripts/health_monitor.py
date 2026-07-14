import threading, subprocess, requests, json, time
from datetime import datetime

BOT_TOKEN      = "8453647224:AAH3I_pACIF5SnFrsNVIhGWM38v8ckik82c"
CHAT_ID        = "-5192553294"
PROMETHEUS_URL = "http://10.10.10.1:9090"

NODES = {
    "master-node": "10.10.10.1",
    "pi3-01": "10.10.10.21", "pi3-02": "10.10.10.22",
    "pi3-03": "10.10.10.23", "pi3-04": "10.10.10.24",
    "pi3-05": "10.10.10.25", "pi3-06": "10.10.10.26",
    "pi3-07": "10.10.10.27", "pi3-08": "10.10.10.28",
    "sensor-node": "10.10.10.40",
}

_node_state = {}
_pod_state  = {}

def tg_send(text):
    try:
        requests.post(
            f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage",
            json={"chat_id": CHAT_ID, "text": text, "parse_mode": "HTML"},
            timeout=5
        )
        print(f"[Telegram] Sent: {text[:50]}")
    except Exception as e:
        print(f"[Telegram] Error: {e}")

def check_nodes():
    r = requests.get(f"{PROMETHEUS_URL}/api/v1/query", params={"query": "up"}, timeout=5)
    results = r.json()["data"]["result"]
    online = {res["metric"]["instance"].split(":")[0]: res["value"][1] == "1" for res in results}

    for name, ip in NODES.items():
        is_online  = online.get(ip, False)
        was_online = _node_state.get(name, True)

        if was_online and not is_online:
            tg_send(f"📴 <b>NODE OFFLINE</b>\n\n🖥️ <b>Node:</b> {name} ({ip})\n⏱️ <b>Time:</b> {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        elif not was_online and is_online:
            tg_send(f"✅ <b>NODE RECOVERED</b>\n\n🖥️ <b>Node:</b> {name} ({ip})\n⏱️ <b>Time:</b> {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

        _node_state[name] = is_online

def check_pods():
    result = subprocess.run(["kubectl", "get", "pods", "-A", "-o", "json"], capture_output=True, text=True, timeout=10)
    pods = json.loads(result.stdout).get("items", [])

    for pod in pods:
        name  = pod["metadata"]["name"]
        phase = pod["status"].get("phase", "Unknown")
        node  = pod["spec"].get("nodeName", "unknown")
        is_ok = phase in ["Running", "Succeeded"]
        was_ok = _pod_state.get(name, True)

        if was_ok and not is_ok:
            try:
                restarts = pod["status"]["containerStatuses"][0]["restartCount"]
            except:
                restarts = 0
            tg_send(f"❌ <b>POD CRASHED</b>\n\n📦 <b>Pod:</b> {name}\n🖥️ <b>Node:</b> {node}\n💥 <b>Status:</b> {phase}\n🔄 <b>Restarts:</b> {restarts}")
        elif not was_ok and is_ok:
            tg_send(f"✅ <b>POD RECOVERED</b>\n\n📦 <b>Pod:</b> {name}\n🖥️ <b>Node:</b> {node}")

        _pod_state[name] = is_ok

def check_temperature():
    r = requests.get(f"{PROMETHEUS_URL}/api/v1/query", params={"query": "node_thermal_zone_temp > 75000"}, timeout=5)
    for res in r.json()["data"]["result"]:
        node = res["metric"].get("instance", "unknown")
        temp = float(res["value"][1]) / 1000
        tg_send(f"🌡️ <b>HIGH TEMPERATURE</b>\n\n🖥️ <b>Node:</b> {node}\n🌡️ <b>Temp:</b> {temp:.1f}°C")

print("[HealthMonitor] Starting on Pi5 — checking every 15s")
while True:
    try:
        print(f"[HealthMonitor] Checking... {datetime.now().strftime('%H:%M:%S')}")
        check_nodes()
        check_pods()
        check_temperature()
    except Exception as e:
        print(f"[HealthMonitor] Error: {e}")
    time.sleep(15)
