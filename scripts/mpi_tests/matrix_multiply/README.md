# Matrix Multiplication — MPI Benchmark

> **Task 3 — MPI Parallel Computing Example 2**
> Frankfurt University of Applied Sciences · Cloud Computing SS2026 · Prof. Dr. Christian Baun

---

## 📁 Folder Structure

> **Note:** All MPI benchmark files are organized under `scripts/mpi_tests/`

```
scripts/mpi_tests/matrix_multiply/
├── matrix_multiply.c          ← MPI C program (the algorithm)
├── array_sum.c                ← MPI array sum program (additional test)
├── run_matrix_sweep.sh        ← N=2000, 4 runs → matrix_results.csv
├── run_matrix_3000.sh         ← N=3000, 5 runs → matrix_results_3000.csv
├── run_matrix_4000.sh         ← N=4000, 5 runs → matrix_results_4000.csv
├── run_matrix_3000_5000.sh    ← Multiple N values → matrix_results_N.csv
└── run_matrix_transition.sh   ← N=3250 & N=3750 → crossover investigation
```

---

## 🔬 Algorithm Overview

Dense matrix multiplication **C = A × B** using MPI:

```
MPI_Scatter  → distributes rows of matrix A to each rank
MPI_Bcast    → sends full copy of matrix B to ALL ranks
Each rank    → computes its assigned rows of C independently
MPI_Gather   → collects all results back to rank 0
```

Communication complexity is **O(N²)** — matrix B must be broadcast to every process. As N grows, O(N³) compute grows faster than O(N²) communication — this is why larger N values scale better (Gustafson's Law).

---

## Step 1 — C Program

**File:** `scripts/mpi_tests/matrix_multiply/matrix_multiply.c`
**Also on Pi5:** `/home/admin/matrix_multiply.c`

```
Contains:
  - MPI_Scatter: distributes rows of A to each rank
  - MPI_Bcast: sends full matrix B to all ranks
  - Each rank performs local matrix multiply
  - MPI_Gather: collects results to rank 0
  - Rank 0 prints ONE line to stdout:
    "78.46"
    (time_seconds)

⚠️ Does NOT write to CSV
⚠️ Only prints elapsed time to terminal (stdout)
```

---

## Step 2 — Compile on Pi5

```bash
mpicc -O2 -o matrix_multiply matrix_multiply.c -lm
```

**Output binary:** `~/matrix_multiply` on Pi5

---

## Step 3 — Shell Scripts (one per N value)

Each script follows the same pattern:
- Fixed problem size N
- Loops over cores = [1, 2, 4, 8, 16, 32]
- Multiple runs per configuration
- ✅ Writes results to CSV automatically

### Script Summary

| Script | N Value | Runs | Output CSV |
|--------|---------|------|------------|
| `run_matrix_sweep.sh` | N=2000 | 4 | `matrix_results.csv` |
| `run_matrix_3000.sh` | N=3000 | 5 | `matrix_results_3000.csv` |
| `run_matrix_4000.sh` | N=4000 | 5 | `matrix_results_4000.csv` |
| `run_matrix_3000_5000.sh` | N=3000,3250,3500,3750,4000 | 5 | `matrix_results_N.csv` |
| `run_matrix_transition.sh` | N=3250, N=3750 | 5 | `matrix_results_3250.csv`, `matrix_results_3750.csv` |

> **Note:** `run_matrix_4000.sh` runs cores in DESCENDING order (32→1) to avoid memory pressure at low core counts on a warm system.

### How each script works:

```bash
# For each run and each core count:
RESULT=$(mpirun -np $CORE --hostfile $TMPHOST ~/matrix_multiply $N)
TIME=$(echo $RESULT | awk '{print $1}')

# ✅ WRITES TO CSV:
echo "$CORE,$N,$RUN,$TIME" >> $RESULTS
```

---

## Step 4 — CSV Files

**On Pi5:** `/nfs/shared/matrix_results_*.csv`
**On GitHub:** `docs/matrix_results_*.csv`

```
Format:
  cores,N,run,time_seconds
  1,2000,1,78.463657
  2,2000,1,40.984587
  4,2000,1,22.310000
  ...
  32,3500,5,68.100000
```

### All CSV files in docs/:
```
docs/matrix_results.csv          ← N=2000
docs/matrix_results_1000.csv     ← N=1000 (separate run)
docs/matrix_results_1500.csv     ← N=1500 (separate run)
docs/matrix_results_3000.csv     ← N=3000
docs/matrix_results_3250.csv     ← N=3250 (crossover point)
docs/matrix_results_3500.csv     ← N=3500 (sweet spot ⭐)
docs/matrix_results_3750.csv     ← N=3750
docs/matrix_results_4000.csv     ← N=4000 (best scaling)
```

---

## Step 5 — Update Results (when rerunning benchmarks)

```bash
# 1. Run sweep for specific N on Pi5
ssh admin@<PI5_IP> "bash /home/admin/run_matrix_3500.sh"

# 2. Copy updated CSVs to Mac
scp admin@<PI5_IP>:/nfs/shared/matrix_results_3500.csv ~/edgeguard/docs/

# 3. Push to GitHub
cd ~/edgeguard
git add docs/matrix_results_*.csv
git commit -m "data: update matrix multiply results"
git push
```

---

## Step 6 — Results Page Renders Charts

**File:** `docs/results.html`
**URL:** https://nauman-iftikhar.github.io/Edgeguard/results.html

```
→ Click MPI Based → Example 2 — Matrix Multiply
→ JavaScript loads each CSV file separately
→ Renders:
    - Runtime bar charts per N tab
    - Speedup bar charts vs ideal line
    - Stats table with color coded efficiency
    - Gustafson's Law chart (32-core speedup vs N)
    - Key findings and memory analysis
```

---

## Complete Chain

```
scripts/mpi_tests/matrix_multiply/matrix_multiply.c
  → mpicc compile on Pi5
    → ~/matrix_multiply (binary)
      → run_matrix_sweep.sh / run_matrix_3000.sh / etc.
        → runs binary across all core counts
          → captures stdout (time in seconds)
            → ✅ writes to /nfs/shared/matrix_results_N.csv
              → scp to ~/edgeguard/docs/
                → git push to GitHub
                  → docs/matrix_results_N.csv on GitHub Pages
                    → docs/results.html fetches ALL CSVs
                      → Interactive charts rendered in browser
```

---

## Test Configuration

| Parameter | Value |
|-----------|-------|
| Core counts | 1, 2, 4, 8, 16, 32 |
| Matrix sizes N | 1000, 1500, 2000, 3000, 3250, 3500, 3750, 4000 |
| Runs per config | 4–5 |
| Cooldown between runs | 30 seconds |
| Nodes used | Pi3-01 to Pi3-08 (8 nodes, 32 cores) |
| Available RAM per Pi3 | ~600MB (with k3s-agent stopped) |

---

## Key Results

| N | 32-core Speedup | 32-core Time | Notes |
|---|----------------|--------------|-------|
| 1000 | 2.34× | 4.1s | Poor scaling — communication dominates |
| 2000 | 4.42× | 17.8s | Moderate scaling |
| 3000 | 5.82× | 46.9s | Good scaling |
| 3500 | 6.44× | 68.1s | ⭐ Sweet spot — best time-to-result |
| 4000 | 6.60× | 100.1s | Best scaling but 50% slower than N=3500 |

## Memory Limits Found

| N | Status | Reason |
|---|--------|--------|
| N=5000 | ❌ Memory swap | 200MB per process × 4 = 800MB — exceeds 600MB available |
| N=4000 | ✅ Success | 128MB per process × 4 = 512MB — fits |
| N=3500 | ✅ Sweet spot | Best balance of scaling and runtime |
