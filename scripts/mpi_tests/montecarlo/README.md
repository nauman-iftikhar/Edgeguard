# Monte Carlo Pi — MPI Benchmark

> **Task 3 — MPI Parallel Computing Example 1**
> Frankfurt University of Applied Sciences · Cloud Computing SS2026 · Prof. Dr. Christian Baun

---

## 📁 Folder Structure

> **Note:** Folder structure has been reorganized. All MPI benchmark files are now under `scripts/mpi_tests/`

```
scripts/mpi_tests/montecarlo/
├── monte_carlo_pi.c      ← MPI C program (the algorithm)
├── run_full_sweep.sh     ← Runs benchmark + writes CSV automatically
└── run_100k_sweep.sh     ← Same but for 0.1M problem size only
```

---

## 🔬 Algorithm Overview

Monte Carlo Pi estimates π by throwing random "darts" at a unit square and counting how many land inside the inscribed quarter circle. The ratio (points inside / total points) ≈ π/4.

This is an **embarrassingly parallel** workload — ranks do not communicate AT ALL during computation. The only communication happens ONCE at the very end when `MPI_Reduce` sums all ranks' counts.

---

## Step 1 — C Program

**File:** `scripts/mpi_tests/montecarlo/monte_carlo_pi.c`
**Also on Pi5:** `/nfs/shared/monte_carlo_pi.c`

```
Contains:
  - MPI initialization (MPI_Init)
  - Each rank generates random points independently
  - Checks if point falls inside unit circle (x²+y² ≤ 1)
  - MPI_Reduce sums all ranks' counts to rank 0
  - Rank 0 calculates π = 4 × (inside/total)
  - Rank 0 prints ONE line to stdout:
    "12.566 3.14159"
    (time_seconds pi_estimate)

⚠️ Does NOT write to CSV
⚠️ Only prints result to terminal (stdout)
```

---

## Step 2 — Compile on Pi5

```bash
mpicc -O2 -o monte_carlo_pi monte_carlo_pi.c -lm
```

**Output binary:** `~/monte_carlo_pi` on Pi5

---

## Step 3 — Shell Script Runs Binary AND Writes CSV

**File:** `scripts/mpi_tests/montecarlo/run_full_sweep.sh`
**Also on Pi5:** `/home/admin/run_full_sweep.sh`

```
Script loops over:
  cores = [1, 2, 4, 8, 16, 32]
  sizes = [1M, 10M, 100M, 1B, 10B]
  runs  = 3 each = 90 total executions

For each combination:
  1. Kill zombie processes on all Pi3 nodes
  2. Check temperature — wait if > 65°C
  3. Build hostfile dynamically based on core count
  4. Run binary:
       RESULT=$(mpirun -np $CORE --hostfile $TMPHOST ~/monte_carlo_pi $SIZE)
  5. Parse stdout:
       TIME=$(echo $RESULT | awk '{print $1}')
       PI=$(echo $RESULT | awk '{print $2}')
  6. ✅ WRITE TO CSV:
       echo "$CORE,$SNAME,$RUN,$TIME,$PI" >> $RESULTS
  7. Sleep 30s cooldown between runs
```

---

## Step 4 — CSV File

**On Pi5:** `/nfs/shared/monte_carlo_results_final.csv`
**On GitHub:** `docs/monte_carlo_results_final.csv`

```
Format:
  cores,problem_size,run,time_seconds,pi_estimate
  1,1M,1,0.200334,3.1409
  1,1M,2,0.200281,3.1416
  1,1M,3,0.200312,3.1398
  2,1M,1,0.100343,3.1416
  ...
  32,10B,3,123.399,3.14159

Total: 118 rows
  - 6 core counts × 5 problem sizes × 3 runs = 90 main runs
  - 28 additional rows for 0.1M problem size
```

---

## Step 5 — Update Results (when rerunning benchmarks)

```bash
# 1. Run sweep on Pi5
ssh admin@<PI5_IP> "bash /home/admin/run_full_sweep.sh"

# 2. Copy updated CSV to Mac
scp admin@<PI5_IP>:/nfs/shared/monte_carlo_results_final.csv ~/edgeguard/docs/

# 3. Push to GitHub
cd ~/edgeguard
git add docs/monte_carlo_results_final.csv
git commit -m "data: update Monte Carlo results"
git push
```

---

## Step 6 — Results Page Renders Charts

**File:** `docs/results.html`
**URL:** https://nauman-iftikhar.github.io/Edgeguard/results.html

```
JavaScript loadCSV() function:
  → fetches docs/monte_carlo_results_final.csv
  → groups by problem_size and cores
  → calculates mean, std, speedup, efficiency
  → renders:
      - Runtime bar charts (per problem size tab)
      - Speedup bar charts vs ideal line
      - Stats table with color coded efficiency
      - All sizes overview line chart
      - Parallelization limit analysis table
      - Prof. Baun format summary charts
```

---

## Complete Chain

```
scripts/mpi_tests/montecarlo/monte_carlo_pi.c
  → mpicc compile on Pi5
    → ~/monte_carlo_pi (binary)
      → scripts/mpi_tests/montecarlo/run_full_sweep.sh
        → runs binary 90 times across all combinations
          → captures stdout output
            → ✅ writes to /nfs/shared/monte_carlo_results_final.csv
              → scp to ~/edgeguard/docs/
                → git push to GitHub
                  → docs/monte_carlo_results_final.csv on GitHub Pages
                    → docs/results.html fetches CSV automatically
                      → Interactive charts rendered in browser
```

---

## Test Configuration

| Parameter | Value |
|-----------|-------|
| Core counts | 1, 2, 4, 8, 16, 32 |
| Problem sizes | 0.1M, 1M, 10M, 100M, 1B, 10B points |
| Runs per config | 3–5 |
| Cooldown between runs | 30 seconds |
| Temperature limit | 65°C |
| Nodes used | Pi3-01 to Pi3-08 (8 nodes, 32 cores) |
| Pi5 role | Coordinator only — excluded from compute |

---

## Key Results

| Cores | Problem Size | Speedup | Efficiency |
|-------|-------------|---------|------------|
| 2 | 1B points | 2.00× | 100% |
| 4 | 1B points | 3.96× | 99% |
| 8 | 1B points | 7.87× | 98.4% |
| 16 | 1B points | 7.99× | 49.9% ← plateau |
| 32 | 10B points | 16.22× | 50.7% |

**Parallelization limit found at 8 cores (2 nodes)** — crossing from 2 to 4 physical nodes introduces MPI communication overhead at the network switch boundary.
