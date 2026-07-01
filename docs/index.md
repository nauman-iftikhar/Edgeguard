# EdgeGuard — Edge AI Surveillance System

**Frankfurt University of Applied Sciences | Cloud Computing SS2026 | Prof. Dr. Christian Baun**

EdgeGuard is a production-grade edge computing surveillance system built on a heterogeneous 10-node Raspberry Pi cluster. It performs real-time AI inference for suspicious behavior detection, deployed entirely on-premise with no cloud dependency.

---

## 🔗 Quick Links

- **Live Dashboard**: [http://10.100.47.201:30080](http://10.100.47.201:30080) *(accessible on local network)*
- **GitHub Repository**: [github.com/nauman-iftikhar/Edgeguard](https://github.com/nauman-iftikhar/Edgeguard)

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────┐
│                   EdgeGuard Cluster                  │
│                                                     │
│  Pi 5 (Master)          Pi 4 (Sensor)               │
│  ├── k3s control plane  └── AI Camera Module        │
│  ├── Hailo AI HAT+           1080p @ 20 FPS         │
│  ├── det.py (inference)                             │
│  ├── PostgreSQL (3 replicas)                        │
│  ├── MinIO (object storage)                         │
│  ├── Prometheus + Grafana                           │
│  └── NFS + DHCP + TFTP (PXE boot)                  │
│                                                     │
│  Pi 3 × 8 (Workers)                                │
│  └── PXE diskless boot over NFS                    │
│      k3s agents                                     │
│      Backend API replicas                           │
│      Frontend replicas                              │
└─────────────────────────────────────────────────────┘
```

---

## 📋 Tasks

| Task | Description | Status | Lead |
|------|-------------|--------|------|
| 1 | [Infrastructure Setup](setup.md) | ✅ Complete | Nauman Iftikhar |
| 2 | [HPL Benchmark](benchmarks.md#hpl) | ✅ Complete | Nauman Iftikhar, Abdur Rahim |
| 3 | [MPI & Scaling Laws](benchmarks.md#mpi) | ✅ Complete | Negar Mohammadi, Ikbela Halili |
| 4 | [Task Distributor](benchmarks.md#task-distributor) | ✅ Complete | Abdur Rahim Nishad, Krish |
| 5 | [Monitoring](monitoring.md) | ✅ Complete | Muhammad Abdullah Nagori |
| 6 | [Model Training](inference.md) | ✅ Complete | Nauman Iftikhar |
| 7 | [Backend Development](api.md) | ✅ Complete | Muhammad Saleem, Muhammad Furqan Shafique |
| 8 | [Frontend Development](frontend.md) | ✅ Complete | Muhammad Saleem, Muhammad Furqan Shafique |
| 9 | Telegram Bot | ✅ Complete | Negar Mohammadi, Ikbela Halili, Krish |
| 10 | Documentation & Presentation | 🔄 In Progress | All team members |

---

## 👥 Team

| Name | Student ID | Email |
|------|-----------|-------|
| Muhammad Furqan Shafique | 1521612 | muhammad.shafique@stud.fra-uas.de |
| Abdur Rahim Nishad | 1548620 | abdur.nishad@stud.fra-uas.de |
| Ikbela Halili | 1569032 | ikbela.halili@stud.fra-uas.de |
| Nauman Iftikhar | 1542251 | nauman.iftikhar@stud.fra-uas.de |
| Negar Mohammadi | 1542459 | negar.mohammadi@stud.fra-uas.de |
| Muhammad Abdullah Nagori | 1523450 | muhammad.nagori@stud.fra-uas.de |
| Muhammad Saleem | 1542590 | muhammad.saleem2@stud.fra-uas.de |
| Krish | TBD | TBD |

---

## 🛠️ Hardware

| Node | Model | Role | Count |
|------|-------|------|-------|
| Pi 5 (master-node) | Raspberry Pi 5 + Hailo AI HAT+ | Master, inference, storage | 1 |
| Pi 4 (sensor-node) | Raspberry Pi 4 + AI Camera | Camera stream | 1 |
| Pi 3 (pi3-01..08) | Raspberry Pi 3B+ | Compute workers (PXE diskless) | 8 |

---

## 🚀 Key Technical Highlights

- **PXE diskless boot** — all 8 Pi 3 nodes boot entirely over the network via TFTP/NFS, no SD cards required
- **k3s Kubernetes** — production-grade container orchestration across all nodes with pod anti-affinity for HA
- **Hailo AI HAT+** — YOLOv8n running on dedicated NPU at 14–17ms inference latency, 20 FPS at 1080p
- **PostgreSQL HA** — 3-replica StatefulSet replacing SQLite, with SQLAlchemy ORM and connection pooling
- **Near-ideal MPI scaling** — Monte Carlo Pi strong scaling: 1.96× at N=2, 3.95× at N=4, 7.37× at N=8

---

*Built with ❤️ at Frankfurt University of Applied Sciences, SS2026*
