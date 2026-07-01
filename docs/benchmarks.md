# Benchmarking Results

[← Back to Home](index.md)

EdgeGuard was benchmarked across three different parallel computing approaches: HPL (MPI-based, industry standard), custom MPI programs (Monte Carlo Pi), and Task Distributor (SSH-based, non-MPI). All benchmarks were run while the full EdgeGuard production stack was operating — inference service, k3s control plane, Prometheus, MinIO, and all other services running simultaneously.

---

## Benchmarking Under Production Load

This is an important framing point: **these benchmarks were not run on an idle cluster**.

In a typical university benchmark, services are stopped, the system is cooled, and benchmarks run in isolation. We deliberately chose not to do this. EdgeGuard is an edge computing system, and edge systems run real workloads continuously. Benchmarking under production conditions gives a more honest picture of what the cluster can actually deliver in practice.

The most visible consequence of this decision is Pi 5's performance in HPL: Pi 5 simultaneously runs the k3s control plane, det.py (AI inference at 20 FPS), Prometheus, MinIO, and PostgreSQL while also participating as the 9th HPL node. Its baseline CPU usage from these services is 12-15%, compared to 3-5% for idle Pi 3 workers. This directly explains why Pi 5's inclusion (N=9) produces lower HPL performance than the Pi 3-only configuration — not a measurement error, but an accurate reflection of real edge computing resource contention.

---

## Task 2 — HPL Benchmark (GFLOPS)

HPL (High Performance LINPACK) is the industry-standard benchmark used to rank the TOP500 supercomputers. It measures sustained floating-point performance by solving a large dense linear system using LU factorization with partial pivoting.

### Methodology

| Parameter | Value |
|-----------|-------|
| Problem size (N) | 5,000 (~190MB matrix) |
| Block size (NB) | 128 |
| MPI processes per node | 4 |
| Node ordering | pi3-08 → pi3-01 (descending), Pi 5 added 9th |
| Cooldown between tests | 90 seconds |
| Benchmark tool | hpcc v1.5.0 via OpenMPI |

Process grids (P×Q) per node count: 1→2×2, 2→2×4, 3→3×4, 4→4×4, 5→4×5, 6→4×6, 7→4×7, 8→4×8, 9→6×6.

### Results

| Nodes | GFLOPS |
|-------|--------|
| 1 (pi3-08) | 2.951 |
| 2 | 3.269 |
| 3 | 2.732 |
| 4 | 2.969 |
| 5 | 2.684 |
| 6 | 2.812 |
| 7 | 2.811 |
| 8 | 3.563 |
| 9 (+Pi 5) | 2.425 |

`[IMAGE: HPL benchmark chart from EdgeGuard dashboard]`

### Analysis

GFLOPS stayed in a tight plateau of 2.68–3.57 across all Pi 3-only configurations, with no node count showing a clear, repeatable speedup over a single node. This points to network communication overhead between nodes dominating over parallel compute gain at this problem size.

HPL requires continuous inter-rank communication throughout the factorization — every rank must exchange data with others at every step. On a Gigabit Ethernet cluster of Raspberry Pi 3 nodes, this communication overhead is significant relative to the compute work each rank performs, capping the achievable speedup regardless of how many nodes are added.

The N=8 result (3.563 GFLOPS) is the best in the dataset, achieved after an extended natural rest period — confirming that thermal state genuinely affects Pi 3 performance. N=7 and N=8 each required one retry due to transient MPI communication failures at higher node counts.

When Pi 5 was added as the 9th node, GFLOPS dropped to 2.425. As explained above, this reflects real production load on Pi 5, not a hardware deficiency.

---

## Task 3 — MPI Custom Examples (Monte Carlo Pi)

To demonstrate scaling behavior more cleanly than HPL allows, we wrote a custom MPI program in C: Monte Carlo estimation of π. This is an embarrassingly parallel workload — every rank works completely independently, with a single `MPI_Reduce` call at the very end to combine results.

### Why Monte Carlo Pi Shows What HPL Cannot

HPL's constant inter-rank communication masks whether the cluster's compute cores can actually scale. Monte Carlo Pi removes that variable entirely: if it scales poorly, the hardware is the bottleneck. If it scales well, the hardware is fine and HPL's plateau is a communication cost issue.

### Setup 1 — Weak Scaling

Each rank always processes 20,000,000 points. As node count increases, total work grows proportionally.

| Nodes | Time (s) | Total points |
|-------|----------|-------------|
| 1 | 8.23 | 80M |
| 2 | 8.18 | 160M |
| 4 | 8.44 | 320M |
| 8 | 8.28 | 640M |
| 9 | 8.36 | 720M |

Total work grew 9× while wall-clock time stayed essentially flat (8.18–8.44s). This is near-ideal weak scaling — confirming Gustafson's Law holds on this cluster.

### Setup 2 — Strong Scaling

Total workload fixed at 720,000,000 points, divided equally across however many ranks exist.

| Nodes | Time (s) | Speedup | Ideal |
|-------|----------|---------|-------|
| 1 | 73.85 | 1.00× | 1× |
| 2 | 37.62 | 1.96× | 2× |
| 4 | 18.68 | 3.95× | 4× |
| 8 | 10.02 | 7.37× | 8× |
| 9 | 8.36 | 8.83× | 9× |

`[IMAGE: Strong scaling chart from EdgeGuard dashboard showing actual vs Amdahl's Law]`

### Analysis

Near-ideal strong scaling all the way to N=8, closely tracking the theoretical linear speedup line. This demonstrates that the cluster's CPU compute scales very well when communication overhead is minimized. The contrast with HPL is clear: **the cluster hardware scales fine — HPL's plateau is a communication overhead problem, not a compute problem**.

---

## Task 4 — Task Distributor (Non-MPI)

Task Distributor is a non-MPI parallel image rendering tool by Prof. Dr. Christian Baun. It splits a POV-Ray ray-tracing job into equal horizontal row-bands, dispatches each band to a worker node via SSH, then composes the results using ImageMagick.

This serves as the non-MPI comparison case — showing how a naive master-worker SSH approach behaves compared to MPI's coordinated parallel launch.

### Methodology

| Parameter | Value |
|-----------|-------|
| Image size | 1800 × 1800 pixels |
| Split method | Equal horizontal row-bands (1800 ÷ N rows/worker) |
| Node ordering | pi3-01 → pi3-08 (ascending), Pi 5 added 9th |
| Cooldown | 90 seconds |
| Dispatch method | Sequential SSH calls |
| Composition | ImageMagick convert -append |

### Results

| Nodes | Workers | Time (s) | Speedup | vs Ideal | Observation |
|-------|---------|----------|---------|----------|-------------|
| 1 | pi3-01 | 25.10 | 1.00× | 1× | Baseline — single Pi3, zero overhead |
| 2 | pi3-01, pi3-02 | 23.01 | 1.09× | 2× | Minimal gain — SSH + composition overhead dominates |
| 4 | pi3-01 → pi3-04 | 16.17 | 1.55× | 4× | Best efficiency point — 450 rows/node |
| 8 | All 8 Pi3s | 18.20 | 1.38× | 8× | Regression — 225 rows/node too small, overhead dominates |
| 9 | Pi3s + Pi5 | 16.08 | 1.56× | 9× | Pi5's faster compute recovers N=4 performance |

`[IMAGE: Task Distributor chart from EdgeGuard dashboard]`

### Analysis

**N=4 is the optimal efficiency point.** Beyond N=4, the overhead of Task Distributor's architecture begins to outweigh the benefit of additional workers:

- The master script dispatches SSH jobs **sequentially** (one for-loop iteration per node), not simultaneously like `mpirun`. As N grows, dispatch time itself grows linearly.
- The **image composition step** (ImageMagick `convert -append`) is strictly serial and grows with N: 0.006s at N=1, rising to 1.087s at N=8. This is the serial fraction Amdahl's Law identifies as the fundamental limiter.
- At N=8, each node's row-band is only 225 rows — the compute work per node is small enough that coordination overhead becomes a meaningful fraction of total time.

The N=9 result shows Pi 5 partially recovering performance — its faster per-core speed reduces its row-band render time enough to compensate for the extra coordination overhead of a 9th worker. However, the equal row-count split gives Pi 5 the same number of rows as any Pi 3, ignoring that it's approximately 5× faster per core. A weighted split (giving Pi 5 proportionally more rows) would likely improve overall performance further.

### Comparison with MPI

| Aspect | Task Distributor | MPI (Monte Carlo Pi) |
|--------|-----------------|----------------------|
| Launch mechanism | Sequential SSH calls | mpirun (simultaneous) |
| Communication | None (NFS lockfile polling) | MPI_Reduce (one call at end) |
| Composition overhead | Grows with N | None |
| Best speedup achieved | 1.56× at N=9 | 7.37× at N=8 |
| Optimal node count | N=4 | N=8+ |

The fundamental difference: `mpirun` launches all ranks through one coordinated mechanism simultaneously, so dispatch overhead stays constant regardless of N. Task Distributor's sequential SSH approach means dispatch overhead grows linearly with N — a structural limitation of the tool's design rather than a hardware limitation.

---

## Summary

| Benchmark | Key Finding |
|-----------|-------------|
| HPL | Plateau at ~2.68–3.57 GFLOPS regardless of node count — communication overhead dominates at this problem size |
| Monte Carlo Pi (weak) | Near-ideal: 9× total work in same wall-clock time at N=9 |
| Monte Carlo Pi (strong) | Near-ideal: 7.37× speedup at N=8, closely tracks theoretical linear speedup |
| Task Distributor | Best at N=4 (1.55×); overhead grows with N; sequential SSH dispatch is the structural limiter |

The combined picture confirms the cluster hardware is capable of good parallel scaling — when communication and coordination overhead is minimized (Monte Carlo Pi), the results are excellent. When overhead is inherent to the approach (HPL's constant inter-rank communication, Task Distributor's sequential dispatch), the gains are limited by those structural factors rather than the hardware itself.

---

[Next: API Reference →](api.md)
