# AI Inference Pipeline

[← Back to Home](index.md)

This page covers the complete AI pipeline: from the camera stream coming off the Pi 4, through the model training process, to real-time inference running on Pi 5's Hailo AI HAT+.

---

## What We Were Trying to Detect

The goal was face coverage detection — identifying when a person in the camera frame has their face covered (by a mask, hood, balaclava, or similar). A covered face is treated as a suspicious behavior indicator and triggers an alert with a snapshot.

This is a binary classification problem per detected person:
- **Safe** — face visible
- **Suspicious** — face covered

`[IMAGE: example alert snapshot showing covered face detection]`

---

## Part 1 — Camera Stream

### The Initial Approach (and Why It Failed)

Our first implementation used a simple HTTP MJPEG stream from the Pi 4 camera. The Pi 4 captured frames and served them over HTTP; Pi 5 fetched them for inference.

The problem was significant lag — typically 2-4 seconds of delay between what the camera saw and when inference ran on Pi 5. For a surveillance system, a 4-second delay makes real-time detection meaningless.

The cause was HTTP streaming overhead: each frame went through HTTP request/response cycles, JPEG encoding on Pi 4, network transfer, JPEG decoding on Pi 5, then inference. The cumulative latency was unacceptable.

### The Solution — ZMQ

We replaced the HTTP stream with **ZeroMQ (ZMQ)**, a high-performance asynchronous messaging library designed for exactly this kind of low-latency data pipeline.

The new architecture:

```
Pi 4 (sensor-node)                Pi 5 (master-node)
┌─────────────────┐               ┌──────────────────────┐
│  Picamera2      │               │  ZMQ Subscriber      │
│  1280x720 @20fps│──── ZMQ ────▶│  receives raw frames  │
│  JPEG encode    │  TCP socket   │  YOLOv8n inference   │
│  ZMQ Publisher  │               │  Hailo AI HAT+       │
└─────────────────┘               └──────────────────────┘
```

ZMQ uses a publisher/subscriber pattern over a raw TCP socket. Pi 4 publishes raw JPEG frames as fast as they're captured; Pi 5 subscribes and processes them. There is no request/response overhead — frames arrive as fast as the network allows.

Result: latency dropped from 2-4 seconds to under 50ms for the network transport step, making true real-time inference possible.

`[IMAGE: screenshot of dashboard showing 20 FPS stream]`

---

## Part 2 — Dataset and Model Training

### Dataset Collection

We built a custom dataset for face coverage detection using two sources:

**Roboflow Universe** — We searched Roboflow's public dataset library for existing face mask and face coverage datasets. These provided a solid base of labeled images covering diverse scenarios, lighting conditions, and coverage types.

**Raw data collection** — We also collected our own images using the Pi 4 camera in the actual deployment environment. This was important because lighting conditions, camera angle, and image quality in our lab setting differed from generic internet images.

Both datasets were combined and augmented inside Roboflow:
- Horizontal flip
- Rotation (±15°)
- Brightness and exposure variation
- Blur augmentation

`[IMAGE: Roboflow dataset screenshot showing class distribution]`

### Training in Google Colab

We used **YOLOv8n** (nano) as our model architecture — the smallest and fastest YOLOv8 variant, optimized for edge deployment with minimal computational requirements while maintaining good detection accuracy.

Training was done in **Google Colab** using a free GPU runtime:

```python
from ultralytics import YOLO
model = YOLO('yolov8n.pt')
model.train(data='dataset.yaml', epochs=50, imgsz=640)
```

After training, the output was a standard PyTorch `.pt` weights file.

`[IMAGE: Colab training output showing loss curves]`

---

## Part 3 — The Hailo Conversion Challenge

### The Problem with .pt on Hailo

The Hailo AI HAT+ is not a general-purpose GPU — it's a dedicated neural processing unit (NPU) with its own instruction set. It cannot run PyTorch `.pt` files directly.

To use the Hailo NPU, models must be in **HEF format** (Hailo Executable Format) — Hailo's proprietary compiled model format that is optimized for their hardware architecture.

Without HEF conversion, running YOLOv8n inference in pure PyTorch on the Pi 5's CPU produced approximately **2-3 minutes of inference latency per frame** — completely unusable for any real-time application.

### The Conversion Pipeline

Converting from PyTorch to HEF requires multiple steps:

```
PyTorch (.pt)
     │
     ▼ export with Ultralytics
ONNX (.onnx)          ← intermediate format
     │
     ▼ Hailo Dataflow Compiler
HEF (.hef)            ← runs on Hailo AI HAT+
```

### Why This Was a Major Setback

The Hailo Dataflow Compiler requires significant GPU resources to run the quantization and compilation process. We did not have access to a suitable GPU locally.

We evaluated several options:
- Google Colab free tier — insufficient GPU memory for the Hailo compiler
- University GPU resources — not available for this project
- Cloud GPU providers — cost was a concern for a student project

The solution was **Massive Compute**, a cloud GPU provider that offered hourly billing with ARM64-compatible GPU instances. We used this to run the Hailo compilation pipeline and produce the `.hef` file.

`[IMAGE: comparison table showing latency before/after HEF conversion]`

### Results After Conversion

| Approach | Inference Latency | FPS |
|----------|-------------------|-----|
| PyTorch on Pi 5 CPU | ~2-3 minutes/frame | <1 |
| YOLOv8n HEF on Hailo AI HAT+ | **14-17ms/frame** | **20** |

The difference is approximately **8,000x faster** — from unusable to production-grade real-time inference.

---

## Part 4 — Running Inference (det.py)

The inference service (`det.py`) runs as a systemd service on Pi 5, starting automatically on boot.

### What it does

1. Loads the `.hef` model onto the Hailo AI HAT+
2. Connects to Pi 4's ZMQ stream
3. For each frame, runs YOLOv8n inference on the Hailo NPU
4. If a covered face is detected above the confidence threshold:
   - Saves a JPEG snapshot
   - POSTs an alert to the EdgeGuard backend API with the snapshot as base64
   - Sends a Telegram notification (Task 9)
5. Streams the annotated video feed to the dashboard

### Performance

- **Inference latency**: 14-17ms per frame on Hailo AI HAT+
- **Stream FPS**: 20 FPS sustained at 1080p
- **Alert confidence threshold**: configurable via dashboard (default ~50%)

`[IMAGE: dashboard screenshot showing live stream with detection overlay]`

---

## Key Lessons Learned

**ZMQ over HTTP for real-time streams** — HTTP streaming adds unnecessary overhead for low-latency video. ZMQ's publisher/subscriber pattern is far better suited to continuous frame delivery between two known endpoints.

**NPU-specific model formats are a real constraint** — The Hailo AI HAT+ is powerful but requires the model to be compiled for its architecture. This is not unique to Hailo — TensorRT for NVIDIA, CoreML for Apple, TFLite for generic ARM all have similar requirements. Planning for this conversion step early saves significant time.

**Dataset diversity matters** — Our initial model trained only on internet images performed poorly in our lab environment. Adding our own collected images from the actual camera and environment improved detection reliability significantly.

---

[Next: Deployment →](deployment.md)
