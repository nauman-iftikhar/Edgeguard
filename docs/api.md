# API Reference

[← Back to Home](index.md)

The EdgeGuard backend exposes a REST API on port 8000 (NodePort 30800 externally). All endpoints except `/api/health` require JWT authentication.

---

## Base URL

```
http://10.100.47.201:30800
```

---

## Authentication

EdgeGuard uses JWT (JSON Web Token) authentication. Tokens expire after 24 hours.

### Login

```
POST /api/auth/login
```

**Request:**
```json
{
  "username": "admin",
  "password": "admin123"
}
```

**Response:**
```json
{
  "token": "eyJ1c2VyX2lkIjo...",
  "username": "admin",
  "role": "admin",
  "expires_in": 86400
}
```

Include the token in all subsequent requests:
```
Authorization: Bearer <token>
```

---

## Health

### Get System Health

```
GET /api/health
```

No authentication required.

**Response:**
```json
{
  "service": "ss2026-backend",
  "status": "ok",
  "timestamp": "2026-06-29T12:52:43.223395",
  "minio": "connected",
  "total_users": 2,
  "total_events": 9
}
```

---

## Events (Alerts)

### List Events

```
GET /api/events?page=1&limit=10
```

**Response:**
```json
{
  "events": [
    {
      "id": 9,
      "type": "suspicious",
      "reason": "Face is covered",
      "confidence": 0.731,
      "timestamp": "2026-06-29T13:26:00.000000",
      "camera_id": "pi4-10.10.10.40",
      "image_url": "http://10.100.47.201:30900/surveillance-snapshots/alert_20260629_132600_pi4-10.10.10.40.jpg"
    }
  ],
  "total": 9,
  "page": 1,
  "pages": 1
}
```

### Create Event (used by det.py)

```
POST /api/events
```

**Request:**
```json
{
  "type": "suspicious",
  "reason": "Face is covered",
  "confidence": 0.731,
  "timestamp": "2026-06-29T13:26:00",
  "camera_id": "pi4-10.10.10.40",
  "image": "<base64-encoded-jpeg>"
}
```

The backend decodes the base64 image, uploads it to MinIO, and stores the resulting URL in PostgreSQL. The raw base64 data is not stored in the database.

**Response:**
```json
{
  "id": 9,
  "status": "ok"
}
```

### Delete Event

```
DELETE /api/events/<id>
```

**Response:**
```json
{
  "status": "ok"
}
```

---

## Benchmarks

### Get All Benchmark Results

```
GET /api/benchmarks
```

Returns all benchmark data including raw results and computed speedup curves (Amdahl's Law, Gustafson's Law, actual).

**Response:**
```json
{
  "hpl": {
    "results": [
      { "nodes": 1, "value": 2.951, "metric": "gflops", "timestamp": "..." },
      { "nodes": 2, "value": 3.269, "metric": "gflops", "timestamp": "..." }
    ],
    "curves": {
      "amdahl": [...],
      "gustafson": [...],
      "actual": [...],
      "parallel_fraction": 0.92
    }
  },
  "task_distributor": { ... },
  "monte_carlo_pi": { ... },
  "monte_carlo_pi_strong": { ... }
}
```

### Record Benchmark Result

```
POST /api/benchmarks/record
```

**Request:**
```json
{
  "benchmark_type": "hpl",
  "nodes": 8,
  "value": 3.563,
  "metric": "gflops"
}
```

Valid `benchmark_type` values: `hpl`, `task_distributor`, `monte_carlo_pi`, `monte_carlo_pi_strong`, `array_sum`.

---

## System

### Get Service Status

```
GET /api/system/services
```

**Response:**
```json
{
  "services": [
    { "name": "Detection Service", "status": "running" },
    { "name": "MinIO Storage", "status": "running" },
    { "name": "Backend API", "status": "running" },
    { "name": "Prometheus", "status": "running" },
    { "name": "Grafana", "status": "running" }
  ]
}
```

### Get Cluster Nodes

```
GET /api/cluster/nodes
```

Returns real-time node status from k3s and CPU/RAM metrics from Prometheus.

**Response:**
```json
{
  "nodes": [
    {
      "name": "master-node",
      "ip": "10.10.10.1",
      "status": "Ready",
      "cpu": 12.6,
      "ram": 75.3,
      "role": "control-plane"
    },
    {
      "name": "pi3-01",
      "ip": "10.10.10.21",
      "status": "Ready",
      "cpu": 6.2,
      "ram": 43.8,
      "role": "worker"
    }
  ]
}
```

### Get Pod Distribution

```
GET /api/cluster/pods
```

Returns all running pods with their node assignments for the Pods page visualization.

---

## Camera

### Get Camera Settings

```
GET /api/camera/settings
```

**Response:**
```json
{
  "resolution": "1080p",
  "fps": 20,
  "jpeg_quality": 80
}
```

### Update Camera Settings

```
POST /api/camera/settings
```

**Request:**
```json
{
  "resolution": "720p",
  "fps": 15,
  "jpeg_quality": 70
}
```

Settings are forwarded to det.py on Pi 4 via ZMQ control channel.

---

## Auto Scaler

### Get Auto Scaler Status

```
GET /api/autoscaler/status
```

**Response:**
```json
{
  "pi4_status": "standby",
  "cluster_cpu": 23.4,
  "threshold_high": 80,
  "threshold_low": 50,
  "events": [
    {
      "timestamp": "2026-06-29T10:00:00",
      "action": "join",
      "cpu_at_trigger": 83.2
    }
  ]
}
```

### Trigger Stress Test

```
POST /api/autoscaler/stress/start
POST /api/autoscaler/stress/stop
```

### Manual Pi 4 Control

```
POST /api/autoscaler/join
POST /api/autoscaler/leave
```

---

## Users (Admin only)

### List Users

```
GET /api/users
```

### Create User

```
POST /api/users
```

**Request:**
```json
{
  "username": "operator",
  "password": "operator123",
  "role": "operator"
}
```

Valid roles: `admin`, `operator`.

### Delete User

```
DELETE /api/users/<id>
```

---

## Default Credentials

| Username | Password | Role |
|----------|----------|------|
| admin | admin123 | admin |
| operator | operator123 | operator |

> These are development credentials. For any production deployment, change all default passwords immediately.

---

[← Back to Home](index.md)
