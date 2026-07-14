# EdgeGuard SS2026 — Cloud Computing Project

> **Frankfurt University of Applied Sciences · Cloud Computing SS2026 · Prof. Dr. Christian Baun**

EdgeGuard is a distributed edge surveillance and cluster benchmarking system built on a Raspberry Pi k3s cluster. It combines real-time face-covering detection using YOLOv8 on a Hailo NPU with a full-stack web application, automated health monitoring, and systematic parallel computing benchmarks.

---

## 🏗️ Cluster Architecture

```
Pi5 (Master Node — 10.10.10.1)
  └── k3s control plane
  └── NFS server (/nfs/shared)
  └── Local Docker registry (:5000)
  └── Detection service (det.py + Hailo NPU)
  └── Health monitor (Telegram alerts)
  └── Auto-scaler service

8× Pi3B+ (Worker Nodes — 10.10.10.21–28)
  └── k3s agents
  └── MPI compute nodes (32 cores total)
  └── 100Mbit/s LAN, 2× TP-Link switches

Pi4 (Sensor Node — 10.10.10.40)
  └── Camera stream (main_stream1.py)
  └── Emergency MPI compute node
```

---

## 🚀 Features

### Task 1 — Infrastructure
- PXE boot for all Pi3 nodes from Pi5
- k3s Kubernetes cluster (v1.35.5)
- NFS shared storage across all nodes
- Local Docker registry for offline image serving

### Task 2 — HPL Benchmark
- HPCC 1.5.0 (High Performance LINPACK)
- Tested across 7 core counts (1–32 cores)
- Problem size N scaled per configuration (N=5000 to N=15000)
- Peak: **11.56 GFLOPS at 32 cores**
- Key finding: 8-core dip due to first inter-node LAN boundary

### Task 3 — MPI Parallel Computing
**Example 1 — Monte Carlo Pi:**
- Embarrassingly parallel (O(1) communication)
- 6 problem sizes: 0.1M to 10B points
- Near-ideal scaling to 8 cores (7.87× speedup)
- Parallelization limit found at 8 cores (2 nodes)

**Example 2 — Matrix Multiplication:**
- Dense matrix multiply C = A×B via MPI_Scatter/Bcast/Gather
- O(N²) communication complexity
- 8 matrix sizes: N=1000 to N=4000
- Sweet spot: N=3500 (6.44× at 32 cores)
- Gustafson's Law demonstrated across all N values

### Task 4 — Task Distributor (Non-MPI)
- Prof. Baun's Task Distributor — POV-Ray ray tracing
- 4 resolutions: 400×300 to 3200×2400
- Sequential SSH dispatch → Amdahl's Law clearly visible
- Best speedup: 1.78× at 8 nodes (3200×2400)
- Bottleneck: ImageMagick seq2 grows with node count

### Task 5 — Monitoring (Prometheus + Grafana)
- Node Exporter on all 10 nodes
- Prometheus scraping: pi3-workers, pi4-camera, pi5-master jobs
- Grafana dashboard: CPU, RAM, Network, Disk, Temperature

### Task 6 — YOLOv8 Object Detection
- Model: YOLOv8n fine-tuned on face-covered dataset
- Hardware: Hailo-8L NPU on Pi5 (via HEF conversion)
- Training: 20 epochs, Tesla T4 GPU, 18 minutes
- **mAP@0.5 = 0.951 · Precision = 0.906 · Recall = 0.857**
- face_covered class: mAP = 0.962, Recall = 0.911

### Task 7 — Backend (Flask + PostgreSQL + MinIO)
- Flask REST API with JWT authentication
- PostgreSQL StatefulSet (3 replicas, HA)
- MinIO object storage for alert snapshots
- Endpoints: auth, events, users, system status, benchmarks

### Task 8 — Frontend (React)
- 7 pages: Dashboard, Alerts, Monitoring, Pods, Cluster, Results, Admin
- Dark/Light mode toggle
- Live camera stream integration
- Interactive pod assignment visualization
- Benchmark results with GitHub Pages link

### Task 9 — Telegram Health Monitor
- Systemd service running on Pi5 (always online)
- Alerts: node offline/recovery, pod crash/recovery, high temperature
- Checks every 15 seconds
- State tracking — no alert spam, only fires on change

### Bonus — Auto-Scaler
- Prometheus-driven CPU threshold monitoring
- Automatically joins Pi4 to MPI cluster under high load
- SSH-based join/leave mechanism
- Configurable threshold and cooldown

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Orchestration | k3s (Kubernetes) |
| Container Runtime | Docker + local registry |
| Backend | Python Flask + SQLAlchemy |
| Database | PostgreSQL 15 (StatefulSet) |
| Storage | MinIO (S3-compatible) |
| Frontend | React 19 + Recharts |
| Detection | YOLOv8n + Hailo-8L NPU |
| Monitoring | Prometheus + Grafana + Node Exporter |
| Alerting | Telegram Bot API |
| MPI | OpenMPI |
| Benchmarks | HPCC 1.5.0, Monte Carlo Pi, Matrix Multiply, POV-Ray |
| Shared Storage | NFS (Pi5 server) |

---

## 📁 Repository Structure

```
EdgeGuard/
├── backend.py              # Flask REST API
├── Dockerfile.backend      # Backend container image
├── Dockerfile.frontend     # Frontend container image
├── frontend/               # React application
│   └── src/
│       ├── pages/          # Dashboard, Alerts, Monitoring, Pods, Results...
│       └── components/     # Navbar
├── k8s/                    # Kubernetes deployment YAMLs
│   ├── backend-deployment.yaml
│   ├── frontend-deployment.yaml
│   ├── postgres-deployment.yaml
│   ├── minio-deployment.yaml
│   └── shared-pv.yaml
├── docs/                   # GitHub Pages documentation
│   ├── index.html          # Project overview
│   ├── task1–9.html        # Task documentation
│   ├── results.html        # Interactive benchmark results
│   └── *.csv               # Raw benchmark data
├── scripts/                # Utility and benchmark scripts
│   ├── fix_ip.sh           # IP change automation
│   ├── health_monitor.py   # Telegram cluster monitor
│   ├── auto_scale.sh       # Pi4 auto-scaler
│   ├── mpi_hosts*          # MPI hostfiles (1–8 nodes)
│   └── main_stream1.py     # Pi4 camera stream
└── services/               # Systemd service definitions
    ├── det.py              # YOLOv8 detection service
    ├── det.service
    ├── autoscaler.service
    └── health-monitor.service
```

---

## 🌐 Links

- **📖 Documentation:** https://nauman-iftikhar.github.io/Edgeguard/
- **📊 Benchmark Results:** https://nauman-iftikhar.github.io/Edgeguard/results.html
- **🐙 GitHub:** https://github.com/nauman-iftikhar/Edgeguard

---

## 🎓 Academic Context

| | |
|--|--|
| **Course** | Cloud Computing SS2026 |
| **University** | Frankfurt University of Applied Sciences |
| **Professor** | Prof. Dr. Christian Baun |
| **Presentation** | July 16, 2026 · Room 1-234 |
| **Cluster** | 10 nodes · 32 cores · Raspberry Pi |

---

## 🔑 Default Credentials (Demo Only)

```
Admin:    admin / admin123
Operator: operator / operator123
```

> ⚠️ Change credentials before any production deployment.
