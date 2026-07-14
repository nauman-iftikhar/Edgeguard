# EdgeGuard — Edge AI Surveillance System

**Frankfurt University of Applied Sciences | Cloud Computing SS2026 | Prof. Dr. Christian Baun**

EdgeGuard is a production-grade edge computing surveillance system built on a heterogeneous 10-node Raspberry Pi cluster. It performs real-time AI inference for suspicious behavior detection at 20 FPS with 14–17ms latency, deployed entirely on-premise with no cloud dependency.

`[IMAGE: photo of the full physical cluster]`

---

## Quick Links

- **Live Dashboard**: [http://10.100.47.201:30080](http://10.100.47.201:30080) *(accessible on local network)*
- **GitHub Repository**: [github.com/nauman-iftikhar/Edgeguard](https://github.com/nauman-iftikhar/Edgeguard)
- **Grafana Monitoring**: [http://10.100.47.201:30001](http://10.100.47.201:30001)

---

## Documentation

| Page | Description |
|------|-------------|
| [Cluster Setup](setup.md) | Heterogeneous hardware design, PXE diskless boot, network architecture |
| [AI Inference Pipeline](inference.md) | ZMQ camera stream, YOLOv8n training, Hailo HEF conversion |
| [Deployment](deployment.md) | Docker, k3s, PostgreSQL StatefulSet, MinIO object storage |
| [Monitoring](monitoring.md) | Prometheus, Grafana, node health, service status |
| [Auto Scaler](autoscaler.md) | Dynamic Pi 4 node join/leave based on real-time cluster CPU |
| [Benchmarks](benchmarks.md) | HPL, MPI Monte Carlo Pi (weak + strong scaling), Task Distributor |
| [API Reference](api.md) | Complete REST API endpoint reference |

---

## System Architecture

```
External Network (WiFi)
        │
        │ 10.100.47.201 (remote access)
   ┌────┴────────────────────────────────────────┐
   │            Pi 5 — master-node               │
   │                                             │
   │  k3s control plane    Hailo AI HAT+         │
   │  PostgreSQL ×3        det.py (inference)    │
   │  MinIO storage        Prometheus + Grafana  │
   │  Backend API ×2       Auto Scaler           │
   │  Frontend ×2          DHCP + TFTP + NFS     │
   └────┬────────────────────────────────────────┘
        │ 10.10.10.0/24 (dedicated switch)
        │
        ├── Pi 4 (sensor-node, 10.10.10.40)
        │   └── AI Camera → ZMQ stream → Pi 5
        │
        └── Pi 3 × 8 (pi3-01 to pi3-08)
            ├── PXE diskless boot over NFS
            ├── k3s worker nodes
            └── Backend + Frontend pod replicas
```

---

## Hardware

| Node | Model | Role | Count |
|------|-------|------|-------|
| Pi 5 | Raspberry Pi 5 + Hailo AI HAT+ | Master, inference, storage, monitoring | 1 |
| Pi 4 | Raspberry Pi 4 + AI Camera Module | Camera stream publisher | 1 |
| Pi 3 | Raspberry Pi 3B+ (7× PXE, 1× SD) | Compute workers | 8 |

---

## Key Results

| Metric | Result |
|--------|--------|
| AI inference latency | 14–17ms per frame on Hailo NPU |
| Stream frame rate | 20 FPS @ 1080p |
| MPI strong scaling (N=8) | 7.37× speedup (near-ideal) |
| MPI weak scaling | Flat time across N=1–9 (near-ideal) |
| Task Distributor best | 1.55× at N=4 |
| HPL (best) | 3.563 GFLOPS at N=8 |
| Auto-scaler response | Pi 4 joins cluster within ~90 seconds |

---

## Team

| Name | Role |
|------|------|
| Nauman Iftikhar | Infrastructure, AI inference, backend, auto-scaler, documentation |
| Abdur Rahim Nishad | HPL benchmarking, Task Distributor |
| Negar Mohammadi | MPI examples, Telegram bot |
| Ikbela Halili | MPI examples, Telegram bot |
| Muhammad Abdullah Nagori | Monitoring (Prometheus + Grafana) |
| Muhammad Saleem | Backend API, frontend |
| Muhammad Furqan Shafique | Backend API, frontend |
| Krish | Task Distributor, MPI |

---

## Tasks

| Task | Description | Status |
|------|-------------|--------|
| 1 | Heterogeneous cluster setup, PXE boot | ✅ Complete |
| 2 | HPL benchmark | ✅ Complete |
| 3 | Custom MPI programs + scaling laws | ✅ Complete |
| 4 | Task Distributor (non-MPI) | ✅ Complete |
| 5 | Monitoring (Prometheus + Grafana) | ✅ Complete |
| 6 | AI model training + Hailo inference | ✅ Complete |
| 7 | Backend REST API + PostgreSQL | ✅ Complete |
| 8 | React frontend dashboard | ✅ Complete |
| 9 | Telegram alert notifications | ✅ Complete |
| 10 | Documentation + presentation | 🔄 In Progress |

---

*Frankfurt University of Applied Sciences — Cloud Computing SS2026*
