# Auto Scaler

[← Back to Home](index.md)

The EdgeGuard Auto Scaler is one of the most distinctive features of this project. It dynamically adds a physical compute node to the Kubernetes cluster when CPU load is high, and removes it when load drops — demonstrating real, automated horizontal scaling on physical edge hardware.

---

## The Concept

Most cloud auto-scalers provision virtual machines or containers. EdgeGuard's auto-scaler provisions a **physical Raspberry Pi 4 node** — dynamically joining it to and removing it from the k3s cluster based on real-time CPU metrics from the Pi 3 worker pool.

```
Normal operation (Pi 4 standby):
  Pi 3 workers (× 8) handle all workload
  Pi 4 is powered on but NOT in the k3s cluster
  Cluster CPU stays below 80%

High load event:
  Cluster CPU exceeds 80% threshold
  Auto-scaler detects this via Prometheus
  Pi 4 automatically joins k3s as a worker node
  k3s schedules new pods onto Pi 4
  Total compute capacity increases

Load drops:
  Cluster CPU falls below 50% threshold
  Auto-scaler gracefully drains Pi 4
  Pi 4 leaves the k3s cluster
  Returns to standby mode
```

`[IMAGE: Auto Scaler page screenshot showing real-time CPU and Pi 4 status]`

---

## Architecture

The auto-scaler (`auto_scale.sh`) runs as a systemd service on Pi 5, executing every 10 seconds:

```bash
# Simplified auto-scaler logic
while true; do
  CPU=$(query_prometheus_cluster_cpu)

  if [ $CPU -gt 80 ] && [ $PI4_STATUS = "standby" ]; then
    join_pi4_to_cluster
    PI4_STATUS="active"
  fi

  if [ $CPU -lt 50 ] && [ $PI4_STATUS = "active" ]; then
    drain_and_remove_pi4
    PI4_STATUS="standby"
  fi

  log_status $CPU $PI4_STATUS
  sleep 10
done
```

```
auto_scale.sh (Pi 5, every 10s)
  │
  ├── Query Prometheus for cluster CPU average
  │   (Pi 3 workers only, excludes Pi 5 itself)
  │
  ├── If CPU > 80% and Pi 4 is standby:
  │   └── SSH to Pi 4 → install k3s agent → join cluster
  │
  └── If CPU < 50% and Pi 4 is active:
      └── kubectl drain sensor-node → kubectl delete node
          SSH to Pi 4 → uninstall k3s agent
```

---

## Pi 4 Join Process

When the auto-scaler decides Pi 4 should join the cluster:

```bash
# 1. Read the cluster join token from Pi 5
K3S_TOKEN=$(cat /home/admin/k3s_token.txt)

# 2. SSH to Pi 4 and install k3s agent
ssh admin@10.10.10.40 "curl -sfL https://get.k3s.io | \
  K3S_URL=https://10.10.10.1:6443 \
  K3S_TOKEN=$K3S_TOKEN sh -"
```

This takes approximately 60-90 seconds. Once complete, `kubectl get nodes` shows `sensor-node` as `Ready` and k3s immediately begins scheduling pods onto it.

---

## Pi 4 Leave Process

When Pi 4 should leave the cluster:

```bash
# 1. Drain Pi 4 (move all pods off it gracefully)
kubectl drain sensor-node --ignore-daemonsets --delete-emulated-pods --force

# 2. Remove Pi 4 from the cluster
kubectl delete node sensor-node

# 3. Uninstall k3s from Pi 4
ssh admin@10.10.10.40 "sudo k3s-agent-uninstall.sh"
```

The drain step is important — it ensures any pods running on Pi 4 are safely migrated to other nodes before Pi 4 is removed, preventing service disruption.

---

## Stress Testing

To demonstrate the auto-scaler working, a stress test server (`stress_server.py`) runs on Pi 5. It can be triggered from the EdgeGuard dashboard's Auto Scaler page:

```
POST /trigger → starts CPU stress on all Pi 3 workers simultaneously
POST /stop    → stops the stress test
```

The stress server SSHes to each Pi 3 node and runs CPU-intensive workloads, driving cluster CPU above 80%. Within 10-20 seconds, the auto-scaler detects the high load and triggers Pi 4 to join the cluster.

`[IMAGE: Auto Scaler page showing stress test in progress and Pi 4 joining]`

---

## Manual Control

In addition to automatic operation, the EdgeGuard dashboard provides manual override buttons:

- **Force Join** — immediately triggers Pi 4 to join regardless of CPU level
- **Force Leave** — immediately drains and removes Pi 4
- **Start Stress Test** — triggers artificial CPU load for demonstration
- **Stop Stress Test** — stops the artificial load

This is useful for demonstrations where waiting for CPU to naturally exceed 80% is impractical.

---

## Event Log

Every auto-scaler decision is logged with timestamp, CPU value, and action taken. The last 50 events are stored in `/shared/autoscaler.json` and displayed on the Auto Scaler page in the dashboard.

`[IMAGE: Auto Scaler event log showing join/leave events with timestamps]`

---

## Why This Is Significant

Dynamic node provisioning in response to load is standard in cloud computing (AWS Auto Scaling Groups, GCP Managed Instance Groups) but unusual at the physical edge level. Most edge clusters have a fixed set of nodes.

EdgeGuard demonstrates that the same principle can be applied to physical hardware — a real Raspberry Pi physically joins and leaves the cluster, its compute capacity is available to k3s within ~90 seconds of being triggered, and it is gracefully removed when no longer needed. The entire process requires no manual intervention.

This is a concrete implementation of **elastic edge computing** — expanding and contracting physical compute capacity in response to real workload demand, which is directly relevant to the resource-constrained environments where edge systems are deployed.

---

## Thresholds

| Parameter | Value | Configurable |
|-----------|-------|-------------|
| High CPU threshold (join) | 80% | Via auto_scale.sh |
| Low CPU threshold (leave) | 50% | Via auto_scale.sh |
| Check interval | 10 seconds | Via auto_scale.sh |
| CPU metric source | Prometheus (Pi 3 workers avg) | Via Prometheus query |
| Join timeout | ~90 seconds | k3s install time |

---

[Next: Benchmarking Results →](benchmarks.md)
