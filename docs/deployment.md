# Deployment

[← Back to Home](index.md)

This page covers how EdgeGuard is packaged, deployed, and run as a production system on the k3s Kubernetes cluster.

---

## Overview

EdgeGuard consists of four containerized services deployed via k3s, plus three systemd services running directly on Pi 5:

```
k3s Kubernetes (across Pi 3 workers + Pi 5):
  ├── Backend API        (2 replicas, Flask + PostgreSQL)
  ├── Frontend           (2 replicas, React + nginx)
  ├── PostgreSQL         (3-replica StatefulSet)
  └── MinIO              (1 replica, object storage)

Systemd on Pi 5 (outside k3s):
  ├── det.service        (AI inference + alert generation)
  ├── stress-server.service  (CPU stress for auto-scaler testing)
  └── autoscaler.service (cluster CPU monitor + Pi 4 control)

Systemd on Pi 4:
  └── main-stream.service    (ZMQ camera stream publisher)
```

`[IMAGE: kubectl get pods -o wide showing pod distribution across nodes]`

---

## Docker Setup

All k3s services are packaged as Docker images and pushed to a local registry running on Pi 5. This avoids any internet dependency at deployment time — critical for an air-gapped edge environment.

```bash
# Local registry running on Pi 5
docker run -d -p 5000:5000 --restart=always --name registry registry:2
```

### Building and Pushing Images

The backend and frontend each have their own Dockerfile. The build-push-rollout pattern used throughout the project:

```bash
# Backend
docker build -f Dockerfile.backend -t ss2026-backend:latest .
docker tag ss2026-backend:latest 10.10.10.1:5000/ss2026-backend:latest
docker push 10.10.10.1:5000/ss2026-backend:latest
kubectl rollout restart deployment/backend
kubectl rollout status deployment/backend

# Frontend
docker build -f Dockerfile.frontend -t ss2026-frontend:latest .
docker tag ss2026-frontend:latest localhost:5000/ss2026-frontend:latest
docker push localhost:5000/ss2026-frontend:latest
kubectl rollout restart deployment/frontend
kubectl rollout status deployment/frontend
```

> **Note:** The backend image must be pushed via `10.10.10.1:5000` (internal network) since the k3s nodes pull from the internal registry. The frontend image can use `localhost:5000` since it's built and pushed on Pi 5 itself.

---

## Backend

The backend is a Flask REST API that handles authentication, alert storage, benchmark data, and MinIO integration.

### Dockerfile

```dockerfile
FROM python:3.11-slim
WORKDIR /app
RUN pip install flask flask-cors minio requests sqlalchemy psycopg2-binary
COPY backend.py .
RUN mkdir -p snapshots
EXPOSE 8000
CMD ["python", "backend.py"]
```

### High Availability

The backend runs as **2 replicas** with pod anti-affinity — k3s ensures the two replicas always land on different physical nodes. If one node goes offline, the other replica continues serving all requests with no downtime.

```yaml
affinity:
  podAntiAffinity:
    preferredDuringSchedulingIgnoredDuringExecution:
      - weight: 100
        podAffinityTerm:
          topologyKey: kubernetes.io/hostname
```

### Database — PostgreSQL

Initially, EdgeGuard used SQLite for alert and user storage. After feedback from Prof. Dr. Christian Baun, we migrated to PostgreSQL, deployed as a **3-replica StatefulSet** in k3s.

The migration involved:
- Replacing `sqlite3` with **SQLAlchemy ORM** + `psycopg2-binary`
- Defining `User` and `Event` as SQLAlchemy models
- Adding connection pooling (`pool_size=10`, `max_overflow=20`, `pool_pre_ping=True`)
- Deploying PostgreSQL as a StatefulSet with streaming replication capability

**Why this matters:** SQLite locks the entire database file on every write. With two backend replicas potentially writing simultaneously (two alerts at the same moment), SQLite would produce write conflicts. PostgreSQL handles concurrent writes correctly with proper transaction isolation.

```
PostgreSQL StatefulSet:
  postgres-0  → primary (handles all writes)
  postgres-1  → replica
  postgres-2  → replica

Services:
  postgres-headless → pod-to-pod DNS
  postgres          → stable ClusterIP for backend connection
```

The backend connects using the k3s service name (`minio-service:9000`, `postgres:5432`) rather than hardcoded IPs — this is important for pod rescheduling resilience.

---

## Frontend

The frontend is a React single-page application served by nginx.

### Dockerfile

```dockerfile
FROM nginx:alpine
COPY frontend-build /usr/share/nginx/html
RUN echo 'server { listen 80; location / { root /usr/share/nginx/html; index index.html; try_files $uri $uri/ /index.html; } }' > /etc/nginx/conf.d/default.conf
EXPOSE 80
```

The `try_files $uri $uri/ /index.html` directive is essential for React Router — without it, refreshing on any page other than `/` returns a 404.

### Deployment

Like the backend, the frontend runs as **2 replicas with pod anti-affinity**, accessible via NodePort 30080:

```
http://10.100.47.201:30080
```

---

## MinIO Object Storage

MinIO stores alert snapshot images. It runs as a single k3s deployment with a PersistentVolume backed by Pi 5's local SSD.

**Important discovery during development:** A standalone Docker MinIO container was running on port 9000 from an earlier setup phase, intercepting all MinIO traffic before it reached the k3s MinIO pod. This caused alert images to upload "successfully" (the Docker container accepted them) but never appear in the k3s MinIO pod's storage. The fix was stopping the Docker container and updating the backend to connect via the k3s service name (`minio-service:9000`) rather than the host IP.

Two MinIO buckets are used:
- `surveillance-snapshots` — alert snapshot images
- `povray-renders` — Task Distributor POV-Ray render chunks and composed images

Both buckets are configured with public download access so the frontend can display images directly without authentication.

---

## Shared Storage

A shared NFS PersistentVolume (`/nfs/shared`) is mounted by all backend pods. This stores:
- `benchmarks.json` — all benchmark results (HPL, MPI, Task Distributor)
- `autoscaler.json` — auto-scaler state and event log

Using a shared NFS volume ensures both backend replicas read and write the same data consistently, even though they run on different physical nodes.

---

## NodePort Services

All external-facing services are exposed via k3s NodePort:

| Service | NodePort | URL |
|---------|----------|-----|
| Frontend | 30080 | http://10.100.47.201:30080 |
| Backend API | 30800 | http://10.100.47.201:30800 |
| MinIO API | 30900 | http://10.100.47.201:30900 |
| MinIO Console | 30901 | http://10.100.47.201:30901 |

---

## Self-Healing

k3s handles pod failure automatically. When a node goes offline:

1. k3s marks the node as `NotReady` after ~40 seconds
2. Pods on that node are evicted
3. k3s reschedules evicted pods onto healthy nodes
4. Services continue serving traffic from the surviving replicas during rescheduling

This was demonstrated repeatedly during development — unexpected Pi 3 reboots and network issues caused nodes to drop out and rejoin without any manual intervention required.

`[IMAGE: screenshot of kubectl get pods showing a pod being rescheduled]`

---

[Next: Monitoring →](monitoring.md)
