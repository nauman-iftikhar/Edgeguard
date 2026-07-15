#!/bin/bash
# Task 3 — runs the two custom MPI examples (monte_carlo_pi, array_sum)
# across 1, 2, 4, 8 Pi3-only nodes, same node set/ordering as the
# HPL Sweep 4 dataset for a fair, consistent comparison.

NFS_DIR="/nfs/shared/hpl-tests"
BACKEND_URL="http://10.10.10.1:30800"
COOLDOWN_SECONDS=60
RESULTS_LOG="/home/admin/hpl-tests/mpi_examples_results.log"

# Same descending order used for the HPL Sweep 4 dataset: pi3-08 -> pi3-01
PI3_IPS=(10.10.10.28 10.10.10.27 10.10.10.26 10.10.10.25 10.10.10.24 10.10.10.23 10.10.10.22 10.10.10.21)
PI5_IP="10.10.10.1"

# Both programs use a constant workload PER RANK (not scaled down as
# node count increases), so total work grows with node count. This is
# weak scaling: we're asking "if I give each worker the same amount
# of work, does total throughput scale with more workers?" rather
# than strong scaling's "does a FIXED total problem finish faster
# with more workers?" (which is what the HPL tests measure, since N
# is held constant regardless of node count). Both are valid and
# worth contrasting in the write-up.
MONTECARLO_POINTS_PER_RANK=20000000   # 20M points per rank
ARRAYSUM_TOTAL_SIZE_PER_RANK=1000000   # 1M doubles per rank (8MB/rank)
# NOTE: array_sum's rank 0 allocates the FULL array (np * per-rank
# size) before scattering, all on one Pi3. Confirmed via `free -m`
# that available RAM on a Pi3 worker is ~495MB (close to, not above,
# our earlier ~512MB ceiling estimate) — so this is set conservatively
# lower. At np=32 (N=8 nodes): 1M/rank * 32 * 8 bytes = ~256MB on
# rank 0, comfortably under the ~495MB confirmed available. Do not
# increase without re-checking `free -m` on the rank-0 node first.

log() { echo "$1" | tee -a "$RESULTS_LOG"; }

build_hostfile() {
  local n=$1
  local hostfile="$NFS_DIR/mpi_examples_hosts_${n}.txt"
  > "$hostfile"
  if [ "$n" -eq 9 ]; then
    for ip in "${PI3_IPS[@]}"; do
      echo "$ip slots=4" >> "$hostfile"
    done
    echo "$PI5_IP slots=4" >> "$hostfile"
  else
    for ((i=0; i<n; i++)); do
      echo "${PI3_IPS[$i]} slots=4" >> "$hostfile"
    done
  fi
  echo "$hostfile"
}

run_monte_carlo() {
  local n=$1
  local np=$((n * 4))
  local hostfile=$(build_hostfile "$n")

  log "  [monte_carlo_pi] N=$n nodes, np=$np, points_per_rank=$MONTECARLO_POINTS_PER_RANK"
  local out=$(cd "$NFS_DIR" && timeout 120 mpirun --hostfile "$hostfile" -np "$np" \
    ./monte_carlo_pi "$MONTECARLO_POINTS_PER_RANK" 2>&1)
  log "  Output: $out"

  local elapsed=$(echo "$out" | grep -o 'elapsed_sec=[0-9.]*' | cut -d= -f2)
  if [ -n "$elapsed" ]; then
    curl -s -X POST "$BACKEND_URL/api/benchmarks/record" \
      -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
      -d "{\"type\":\"monte_carlo_pi\",\"nodes\":$n,\"value\":$elapsed,\"metric\":\"seconds\"}" \
      >> "$RESULTS_LOG"
    echo "" >> "$RESULTS_LOG"
  else
    log "  WARNING: could not parse elapsed time, not recorded"
  fi
}

run_array_sum() {
  local n=$1
  local np=$((n * 4))
  local hostfile=$(build_hostfile "$n")
  local total_size=$((ARRAYSUM_TOTAL_SIZE_PER_RANK * np))

  log "  [array_sum] N=$n nodes, np=$np, array_size=$total_size (${ARRAYSUM_TOTAL_SIZE_PER_RANK} per rank)"
  local out=$(cd "$NFS_DIR" && timeout 120 mpirun --hostfile "$hostfile" -np "$np" \
    ./array_sum "$total_size" 2>&1)
  log "  Output: $out"

  local elapsed=$(echo "$out" | grep -o 'elapsed_sec=[0-9.]*' | cut -d= -f2)
  if [ -n "$elapsed" ]; then
    curl -s -X POST "$BACKEND_URL/api/benchmarks/record" \
      -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
      -d "{\"type\":\"array_sum\",\"nodes\":$n,\"value\":$elapsed,\"metric\":\"seconds\"}" \
      >> "$RESULTS_LOG"
    echo "" >> "$RESULTS_LOG"
  else
    log "  WARNING: could not parse elapsed time, not recorded"
  fi
}

log "=== MPI Examples Sweep started at $(date) ==="

for n in 1 2 4 8 9; do
  log ""
  log "=== N=$n nodes ($(date)) ==="
  run_monte_carlo "$n"
  log "  Cooling down ${COOLDOWN_SECONDS}s..."
  sleep "$COOLDOWN_SECONDS"
  run_array_sum "$n"
  log "  Cooling down ${COOLDOWN_SECONDS}s..."
  sleep "$COOLDOWN_SECONDS"
done

log ""
log "=== MPI Examples Sweep finished at $(date) ==="
