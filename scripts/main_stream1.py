import time
import zmq
import cv2
import os
from picamera2 import Picamera2

# ── Config — controlled from Pi 5 via environment ──
# Set on Pi 4 startup:
# RESOLUTION=1280x720 python main_stream_pi4.py
# Or use defaults below

RES_W       = int(os.environ.get("RES_W",       1280))
RES_H       = int(os.environ.get("RES_H",        720))
FPS_TARGET  = int(os.environ.get("FPS_TARGET",    20))
JPEG_QUALITY= int(os.environ.get("JPEG_QUALITY",  80))
PORT        = int(os.environ.get("ZMQ_PORT",     5555))

RESOLUTION  = (RES_W, RES_H)

# Camera setup
picam2 = Picamera2()
config = picam2.create_video_configuration(
    main={"size": RESOLUTION, "format": "RGB888"}
)
picam2.configure(config)
picam2.start()
time.sleep(2)

# ZMQ PUSH socket
context = zmq.Context()
socket  = context.socket(zmq.PUSH)
socket.setsockopt(zmq.SNDHWM, 1)
socket.bind(f"tcp://0.0.0.0:{PORT}")

interval = 1.0 / FPS_TARGET

print(f"[Pi4] Resolution:  {RESOLUTION}")
print(f"[Pi4] FPS target:  {FPS_TARGET}")
print(f"[Pi4] JPEG quality:{JPEG_QUALITY}")
print(f"[Pi4] ZMQ port:    {PORT}")
print(f"[Pi4] Streaming...")

while True:
    start = time.time()
    frame     = picam2.capture_array()
    frame_bgr = cv2.cvtColor(frame, cv2.COLOR_RGB2BGR)
    ret, buf  = cv2.imencode(
        ".jpg", frame_bgr,
        [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY]
    )
    if ret:
        try:
            socket.send(buf.tobytes(), zmq.NOBLOCK)
        except zmq.Again:
            pass
    elapsed = time.time() - start
    time.sleep(max(0, interval - elapsed))
