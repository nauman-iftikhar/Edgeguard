# -*- coding: utf-8 -*-
"""
Suspicious Person Detection — Hailo AI HAT+ + ZMQ
===================================================
Pi 4 streams via ZMQ (main_stream_pi4.py)
Pi 5 receives, runs Hailo inference, serves results

Run on Pi 5:
    python3 det.py
"""

import cv2
import zmq
import numpy as np
import time
import threading
import base64
import os
import subprocess
import requests

from datetime import datetime
from flask import Flask, Response, jsonify, request
from hailo_platform import (
    VDevice, HEF, ConfigureParams,
    InputVStreamParams, OutputVStreamParams,
    FormatType, HailoStreamInterface,
    InputVStreams, OutputVStreams,
)

# ══════════════════════════════════════════════════════════════
# CONFIG
# ══════════════════════════════════════════════════════════════
PI4_IP         = "10.10.10.40"
PI4_USER       = "admin"
ZMQ_PORT       = 5555

HEF_PATH       = "/home/admin/hello/yolov8n.hef"
INPUT_STREAM   = "yolov8n/input_layer1"
OUTPUT_STREAM  = "yolov8n/yolov8_nms_postprocess"
INPUT_SIZE     = (640, 640)
CONFIDENCE     = 0.5
CLASS_NAMES    = {0: "face_covered", 1: "non_covered_face"}

CONFIRM_FRAMES = 5
ALERT_COOLDOWN = 20
SNAPSHOT_DIR   = "snapshots"
PORT           = 8090

BOT_TOKEN      = "8453647224:AAH3I_pACIF5SnFrsNVIhGWM38v8ckik82c"
CHAT_ID        = "-5192553294"
BACKEND_URL    = "http://10.10.10.1:30800/api/events"

# Camera settings — controllable via API
CAMERA_SETTINGS = {
    "resolution": "1280x720",
    "fps":        20,
    "quality":    80,
}

os.makedirs(SNAPSHOT_DIR, exist_ok=True)

# ══════════════════════════════════════════════════════════════
# SHARED STATE
# ══════════════════════════════════════════════════════════════
state = {
    "suspicious":        False,
    "label":             "none",
    "confidence":        0.0,
    "detection_counter": 0,
    "last_alert_time":   0,
    "alert_count":       0,
    "frame_count":       0,
    "fps":               0.0,
    "hailo_ms":          0.0,
    "stream_type":       "zmq",
}

events            = []
events_lock       = threading.Lock()
latest_frame      = None
latest_frame_lock = threading.Lock()

app = Flask(__name__)
from flask_cors import CORS
CORS(app)


# ══════════════════════════════════════════════════════════════
# HAILO DETECTOR
# ══════════════════════════════════════════════════════════════
class HailoDetector:

    def __init__(self):
        print("⏳ Loading HEF model onto Hailo AI HAT+...")
        self.hef    = HEF(HEF_PATH)
        self.target = VDevice()

        configure_params = ConfigureParams.create_from_hef(
            self.hef, interface=HailoStreamInterface.PCIe
        )
        self.network_groups       = self.target.configure(
            self.hef, configure_params
        )
        self.network_group        = self.network_groups[0]
        self.network_group_params = self.network_group.create_params()

        self.input_params = InputVStreamParams.make(
            self.network_group,
            quantized=False,
            format_type=FormatType.UINT8
        )
        self.output_params = OutputVStreamParams.make(
            self.network_group,
            quantized=False,
            format_type=FormatType.FLOAT32
        )
        print("✅ Hailo model loaded — running on AI HAT+")
        print(f"   Input:  {INPUT_STREAM}")
        print(f"   Output: {OUTPUT_STREAM}")

    def preprocess(self, frame):
        resized = cv2.resize(frame, INPUT_SIZE)
        rgb     = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB)
        return np.expand_dims(rgb, axis=0).astype(np.uint8)

    def postprocess(self, raw_output, orig_shape):
        detections = []
        h, w = orig_shape[:2]
        if raw_output is None:
            return detections
        try:
            for cls_id, class_dets in enumerate(raw_output):
                if class_dets is None or len(class_dets) == 0:
                    continue
                for det in class_dets:
                    if len(det) < 5:
                        continue
                    y1, x1, y2, x2, conf = det[:5]
                    if conf < CONFIDENCE:
                        continue
                    label = CLASS_NAMES.get(cls_id, "unknown")
                    detections.append({
                        "label":      label,
                        "confidence": float(conf),
                        "bbox": [
                            int(x1 * w), int(y1 * h),
                            int(x2 * w), int(y2 * h)
                        ]
                    })
        except Exception as e:
            print(f"⚠️  Postprocess error: {e}")
        return detections

    def detect(self, frame):
        input_data = self.preprocess(frame)
        with self.network_group.activate(self.network_group_params):
            with InputVStreams(
                self.network_group, self.input_params
            ) as instreams:
                with OutputVStreams(
                    self.network_group, self.output_params
                ) as outstreams:
                    instream  = instreams.get(INPUT_STREAM)
                    outstream = outstreams.get(OUTPUT_STREAM)
                    instream.send(input_data)
                    raw_output = outstream.recv()
        return self.postprocess(raw_output, frame.shape)

    def draw(self, frame, detections):
        for det in detections:
            x1, y1, x2, y2 = det["bbox"]
            label = det["label"]
            conf  = det["confidence"]
            color = (0, 0, 255) if label == "face_covered" \
                else (0, 200, 0)
            cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
            text = f"{label} {conf:.0%}"
            (tw, th), _ = cv2.getTextSize(
                text, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2
            )
            cv2.rectangle(
                frame, (x1, y1 - th - 8), (x1 + tw, y1),
                color, -1
            )
            cv2.putText(
                frame, text, (x1, y1 - 4),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.6, (255, 255, 255), 2
            )
        return frame

    def close(self):
        self.target.release()


# ══════════════════════════════════════════════════════════════
# TELEGRAM
# ══════════════════════════════════════════════════════════════
def send_telegram(image_path, alert_num, confidence):
    try:
        url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendPhoto"
        with open(image_path, "rb") as photo:
            requests.post(
                url,
                data={
                    "chat_id": CHAT_ID,
                    "caption": (
                        f"🚨 SUSPICIOUS PERSON DETECTED\n"
                        f"━━━━━━━━━━━━━━━━━━\n"
                        f"Alert #:    {alert_num}\n"
                        f"Confidence: {confidence:.0%}\n"
                        f"Time:       "
                        f"{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n"
                        f"Camera:     Pi 4 — {PI4_IP}\n"
                        f"Reason:     Face is covered"
                    )
                },
                files={"photo": photo},
                timeout=10
            )
        print(f"   📱 Telegram sent")
    except Exception as e:
        print(f"   ❌ Telegram error: {e}")


# ══════════════════════════════════════════════════════════════
# START PI 4 STREAM VIA SSH
# ══════════════════════════════════════════════════════════════
def start_pi4_stream(res="1280x720", fps=20, quality=80):
    w, h = res.split("x")
    print(f"⏳ Starting Pi 4 ZMQ stream — {res} {fps}fps...")

    # Kill any existing stream
    subprocess.run([
        "ssh", f"{PI4_USER}@{PI4_IP}",
        "pkill -f main_stream1.py 2>/dev/null || true"
	
    ], capture_output=True)

    time.sleep(3)

    # Start new stream
    subprocess.Popen([
        "ssh", f"{PI4_USER}@{PI4_IP}",
        f"RES_W={w} RES_H={h} FPS_TARGET={fps} "
        f"JPEG_QUALITY={quality} "
        f"nohup python3 /home/admin/main_stream1.py "
        f"> /home/admin/stream.log 2>&1 &"
    ])

    time.sleep(3)
    print(f"✅ Pi 4 stream started — {res} {fps}fps")


# ══════════════════════════════════════════════════════════════
# DETECTION LOOP — ZMQ
# ══════════════════════════════════════════════════════════════
def detection_loop():
    global latest_frame

    detector = HailoDetector()

    # Start Pi 4 stream
    res     = CAMERA_SETTINGS["resolution"]
    fps     = CAMERA_SETTINGS["fps"]
    quality = CAMERA_SETTINGS["quality"]
    start_pi4_stream(res, fps, quality)

    # ZMQ receiver
    context = zmq.Context()
    socket  = context.socket(zmq.PULL)
    socket.setsockopt(zmq.RCVHWM, 1)
    socket.setsockopt(zmq.RCVTIMEO, 5000)
    socket.setsockopt(zmq.LINGER, 0)
    socket.connect(f"tcp://{PI4_IP}:{ZMQ_PORT}")
    print(f"✅ ZMQ connected to Pi 4 at {PI4_IP}:{ZMQ_PORT}")
    print("✅ Detection loop running\n")

    frame_count = 0
    fps_timer   = time.time()

    while True:
        try:
            # Receive latest frame — flush buffer
            raw = socket.recv()
            while True:
                try:
                    raw = socket.recv(zmq.NOBLOCK)
                except zmq.Again:
                    break

            frame = cv2.imdecode(
                np.frombuffer(raw, dtype=np.uint8),
                cv2.IMREAD_COLOR
            )
            if frame is None:
                continue

            frame_count += 1
            state["frame_count"] = frame_count

            if frame_count % 30 == 0:
                elapsed      = time.time() - fps_timer
                state["fps"] = round(30 / elapsed, 1) \
                               if elapsed > 0 else 0
                fps_timer = time.time()

            if frame_count % 3 == 0:
                t0         = time.time()
                detections = detector.detect(frame)
                hailo_ms   = (time.time() - t0) * 1000
                state["hailo_ms"] = round(hailo_ms, 1)

                labels = [d["label"]      for d in detections]
                confs  = [d["confidence"] for d in detections]

                if "face_covered" in labels:
                    idx = labels.index("face_covered")
                    state["detection_counter"] += 1
                    state["confidence"]         = confs[idx]
                    state["label"]              = "face_covered"
                else:
                    state["detection_counter"]  = 0
                    state["confidence"]         = 0.0
                    state["label"]              = \
                        "non_covered_face" \
                        if "non_covered_face" in labels \
                        else "none"

                suspicious          = \
                    state["detection_counter"] >= CONFIRM_FRAMES
                state["suspicious"] = suspicious
                annotated           = detector.draw(
                    frame.copy(), detections
                )
            else:
                suspicious = state["suspicious"]
                annotated  = frame.copy()

            # Status bar
            now = time.time()
            if suspicious:
                status_text  = "SUSPICIOUS — Face Covered!"
                status_color = (0, 0, 255)
            elif state["label"] == "non_covered_face":
                status_text  = "SAFE — Face Visible"
                status_color = (0, 200, 0)
            else:
                status_text  = "Scanning..."
                status_color = (0, 200, 255)

            cv2.rectangle(
                annotated, (0, 0),
                (annotated.shape[1], 50), (0, 0, 0), -1
            )
            cv2.putText(
                annotated, status_text,
                (10, 35), cv2.FONT_HERSHEY_SIMPLEX,
                1.0, status_color, 2, cv2.LINE_AA
            )
            cv2.putText(
                annotated,
                f"FPS:{state['fps']} | Hailo:{state['hailo_ms']}ms",
                (annotated.shape[1] - 260, 35),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.6, (180, 180, 180), 1
            )

            # Fire alert
            if suspicious and \
               (now - state["last_alert_time"] > ALERT_COOLDOWN):
                state["last_alert_time"] = now
                state["alert_count"]    += 1
                alert_num = state["alert_count"]
                conf      = state["confidence"]

                print(
                    f"\n🚨 ALERT #{alert_num} — "
                    f"{conf:.0%} (frame {frame_count}) "
                    f"[Hailo: {state['hailo_ms']}ms]"
                )

                ts        = datetime.now().strftime("%Y%m%d_%H%M%S")
                snap_path = os.path.join(
                    SNAPSHOT_DIR,
                    f"alert_{alert_num}_{ts}.jpg"
                )
                cv2.imwrite(snap_path, annotated)
                print(f"   📸 {snap_path}")

                with open(snap_path, "rb") as f:
                    image_b64 = base64.b64encode(
                        f.read()
                    ).decode("utf-8")

                event = {
                    "id":            alert_num,
                    "type":          "suspicious",
                    "reason":        "Face is covered",
                    "confidence":    round(conf, 3),
                    "timestamp":     datetime.now().isoformat(),
                    "camera_id":     f"pi4-{PI4_IP}",
                    "snapshot_path": snap_path,
                    "image":         image_b64,
                }

                with events_lock:
                    events.append(event)

                # POST to backend
                try:
                    requests.post(
                        BACKEND_URL, json=event, timeout=5
                    )
                    print("   📤 Sent to backend")
                except Exception as e:
                    print(f"   ⚠️  Backend unreachable: {e}")

                send_telegram(snap_path, alert_num, conf)

            with latest_frame_lock:
                latest_frame = annotated.copy()

        except zmq.Again:
            print("⚠️  No frame from Pi 4 — retrying...")
            time.sleep(1)
        except Exception as e:
            print(f"❌ Error: {e}")
            time.sleep(0.1)


# ══════════════════════════════════════════════════════════════
# FLASK ENDPOINTS
# ══════════════════════════════════════════════════════════════

@app.route("/video_feed")
def video_feed():
    def generate():
        while True:
            with latest_frame_lock:
                frame = latest_frame
            if frame is not None:
                _, buf = cv2.imencode(
                    ".jpg", frame,
                    [cv2.IMWRITE_JPEG_QUALITY, 80]
                )
                yield (
                    b"--frame\r\n"
                    b"Content-Type: image/jpeg\r\n\r\n"
                    + buf.tobytes()
                    + b"\r\n"
                )
            time.sleep(0.033)
    return Response(
        generate(),
        mimetype="multipart/x-mixed-replace; boundary=frame"
    )


@app.route("/status")
def status():
    return jsonify({
        "suspicious":  state["suspicious"],
        "label":       state["label"],
        "confidence":  state["confidence"],
        "alert_count": state["alert_count"],
        "fps":         state["fps"],
        "hailo_ms":    state["hailo_ms"],
        "frame_count": state["frame_count"],
        "stream_type": state["stream_type"],
    })


@app.route("/api/events", methods=["GET"])
def get_events():
    with events_lock:
        result = [
            {k: v for k, v in e.items() if k != "image"}
            for e in reversed(events)
        ]
    return jsonify({"events": result, "total": len(result)})


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({
        "status":      "ok",
        "inference":   "hailo",
        "stream":      "zmq",
        "model":       HEF_PATH,
        "camera":      f"{PI4_IP}:{ZMQ_PORT}",
        "alert_count": state["alert_count"],
        "fps":         state["fps"],
        "hailo_ms":    state["hailo_ms"],
    })


@app.route("/api/camera/settings", methods=["GET"])
def get_camera_settings():
    return jsonify(CAMERA_SETTINGS)


@app.route("/api/camera/settings", methods=["POST"])
def update_camera_settings():
    data    = request.get_json()
    res     = data.get("resolution", CAMERA_SETTINGS["resolution"])
    fps     = data.get("fps",        CAMERA_SETTINGS["fps"])
    quality = data.get("quality",    CAMERA_SETTINGS["quality"])

    CAMERA_SETTINGS.update({
        "resolution": res,
        "fps":        fps,
        "quality":    quality,
    })

    # Restart Pi 4 stream with new settings
    threading.Thread(
        target=start_pi4_stream,
        args=(res, fps, quality),
        daemon=True
    ).start()

    return jsonify({
        "status":   "ok",
        "message":  f"Stream restarting at {res} {fps}fps",
        "settings": CAMERA_SETTINGS
    })


@app.route("/")
def index():
    return f"""<!DOCTYPE html>
<html>
<head>
    <title>Hailo Detection</title>
    <style>
        body{{background:#111;color:white;
              font-family:Arial,sans-serif;text-align:center}}
        h1{{font-size:32px;margin:20px 0}}
        #status{{font-size:28px;font-weight:bold;
                 padding:10px 20px;border-radius:8px;
                 display:inline-block;margin:10px 0}}
        .safe{{color:lime}}
        .danger{{color:red;animation:blink .5s infinite}}
        .scanning{{color:yellow}}
        img{{border:4px solid #444;border-radius:10px;
             margin:15px 0;max-width:95%}}
        .stats{{font-size:13px;color:#aaa;margin:6px 0}}
        @keyframes blink{{0%,100%{{opacity:1}}50%{{opacity:.2}}}}
    </style>
</head>
<body>
    <h1>Suspicious Person Detection</h1>
    <div style="font-size:12px;color:#555;margin-bottom:8px">
        Hailo AI HAT+ | ZMQ Stream | Pi 4 {PI4_IP}
    </div>
    <div id="status" class="scanning">Scanning...</div>
    <div class="stats" id="stats">
        FPS: -- | Hailo: --ms | Alerts: -- | Confidence: --
    </div>
    <br>
    <img src="/video_feed" width="800">
    <p style="color:#444;font-size:12px;margin-top:10px">
        <a href="/api/health"          style="color:#666">/api/health</a> |
        <a href="/api/events"          style="color:#666">/api/events</a> |
        <a href="/api/camera/settings" style="color:#666">/api/camera/settings</a> |
        <a href="/status"              style="color:#666">/status</a>
    </p>
    <script>
        setInterval(() => {{
            fetch("/status")
                .then(r => r.json())
                .then(d => {{
                    const el = document.getElementById("status");
                    const st = document.getElementById("stats");
                    if (d.suspicious) {{
                        el.textContent = "SUSPICIOUS — Face Covered!";
                        el.className = "danger";
                    }} else if (d.label === "non_covered_face") {{
                        el.textContent = "SAFE — Face Visible";
                        el.className = "safe";
                    }} else {{
                        el.textContent = "Scanning...";
                        el.className = "scanning";
                    }}
                    st.textContent =
                        "FPS: " + d.fps +
                        " | Hailo: " + d.hailo_ms + "ms" +
                        " | Alerts: " + d.alert_count +
                        " | Confidence: " +
                        (d.confidence * 100).toFixed(0) + "%" +
                        " | Stream: ZMQ";
                }});
        }}, 1000);
    </script>
</body>
</html>"""


# ══════════════════════════════════════════════════════════════
# START
# ══════════════════════════════════════════════════════════════
if __name__ == "__main__":
    print("=" * 55)
    print("  Suspicious Person Detection — Hailo + ZMQ")
    print(f"  Camera:  Pi 4 ZMQ at {PI4_IP}:{ZMQ_PORT}")
    print(f"  Model:   {HEF_PATH}")
    print(f"  Port:    {PORT}")
    print("=" * 55)

    t = threading.Thread(target=detection_loop, daemon=True)
    t.start()

    time.sleep(5)

    print(f"\n✅ Dashboard:    http://10.10.10.1:{PORT}")
    print(f"✅ Video stream: http://10.10.10.1:{PORT}/video_feed")
    print(f"✅ Status API:   http://10.10.10.1:{PORT}/status")
    print(f"✅ Camera API:   http://10.10.10.1:{PORT}/api/camera/settings\n")

    app.run(host="0.0.0.0", port=PORT, threaded=True)
