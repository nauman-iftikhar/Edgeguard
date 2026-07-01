# Monitoring

[← Back to Home](index.md)

EdgeGuard includes a full monitoring stack — Prometheus for metrics collection and Grafana for visualization — giving real-time visibility into cluster health, node performance, and service status.

---

## Monitoring Stack

```
Each node (Pi 5, Pi 3 × 8, Pi 4)
  └── node_exporter (:9100)
        Exposes CPU, RAM, disk, network, temperature metrics

Pi 5
  ├── Prometheus (:9090)
  │     Scrapes node_exporter from all nodes every 15s
  │     Stores time-series metrics
  └── Grafana (:3001)
        Connects to Prometheus as data source
        Pre-configured dashboards for cluster overview
```

`[IMAGE: Grafana dashboard screenshot showing cluster overview]`

---

## What Is Monitored

### Per-Node Metrics (via node_exporter)

| Metric | Description |
|--------|-------------|
| CPU usage % | Per-node CPU utilization averaged across cores |
| RAM usage % | Used vs available memory |
| Disk I/O | Read/write throughput (relevant for Pi 5's NFS exports) |
| Network throughput | Bytes in/out on eth0 — important for PXE boot nodes |
| System uptime | Time since last boot |
| CPU temperature | Thermal monitoring (critical on Pi hardware without active cooling) |

### Service Health (via EdgeGuard backend)

The EdgeGuard backend's `/api/system/services` endpoint polls each service directly:

| Service | How Checked |
|---------|-------------|
| Detection Service | HTTP GET to det.py's `/api/health` endpoint |
| MinIO Storage | MinIO client `bucket_exists()` check |
| Backend API | Always running (self-check) |
| Prometheus | HTTP GET to `/-/healthy` |
| Grafana | HTTP GET to `/api/health` |

These service statuses are displayed in real time on the EdgeGuard dashboard's Services panel.

---

## Accessing Monitoring

**Grafana Dashboard:**
```
http://10.100.47.201:30001
```

**Prometheus Query Interface:**
```
http://10.100.47.201:9090
```

The EdgeGuard frontend also includes a direct **"Open Grafana Dashboard"** button on the Monitoring page, and displays a live node health grid showing CPU, RAM, and online status for all 10 nodes, updated every 10 seconds.

`[IMAGE: EdgeGuard monitoring page showing node health grid]`

---

## Prometheus Queries Used

The auto-scaler and dashboard use these Prometheus queries:

```promql
# Cluster average CPU (Pi 3 workers only, for auto-scaler)
100 - (avg(rate(node_cpu_seconds_total{mode="idle",job="pi3-workers"}[1m])) * 100)

# Per-node CPU
100 - (rate(node_cpu_seconds_total{mode="idle"}[1m]) * 100)

# Per-node RAM usage %
100 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes * 100)

# Per-node uptime
node_time_seconds - node_boot_time_seconds
```

---

## Why Monitoring Matters for This Cluster

Monitoring is especially important for EdgeGuard because Pi 5 runs both production services (k3s control plane, inference, Prometheus, MinIO) and benchmarking workloads simultaneously. Without monitoring, it would be impossible to know how much of Pi 5's compute capacity is being consumed by production services during a benchmark run.

This is directly relevant to our HPL benchmark results — the Monitoring page makes visible exactly why Pi 5 shows lower GFLOPS than expected when added as the 9th node: it's running at 12-15% CPU baseline just from the production stack, compared to 3-5% for idle Pi 3 workers.

`[IMAGE: Prometheus graph showing Pi 5 baseline CPU vs Pi 3 baseline CPU]`

---

[Next: Auto Scaler →](autoscaler.md)
