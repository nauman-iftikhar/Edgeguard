#!/bin/bash
# Re-run of Task-Distributor (Task 4, non-MPI comparison) with a
# corrected setup: N=1,2,4,8,9 (Pi5 added as 9th node, matching the
# HPL/MPI node pattern), and a larger 1800x1800 render job (vs the
# original 1280x960) for a more meaningful workload.

TD_DIR="/home/admin/task-distributor"
IMG_PARTS_PATH="/nfs/shared/povray"
BACKEND_URL="http://10.10.10.1:30800"
COOLDOWN_SECONDS=90
RESULTS_LOG="/home/admin/task-distributor/td_rerun_results.log"
WIDTH=1800
HEIGHT=1800

log() { echo "$1" | tee -a "$RESULTS_LOG"; }

run_test() {
  local n=$1
  log ""
  log "=== N=$n nodes ($(date)) — ${WIDTH}x${HEIGHT} ==="

  # Clean up any stale lockfile/parts from a previous run before starting
  rm -f "$IMG_PARTS_PATH/lockfile"
  rm -f "$IMG_PARTS_PATH"/*.png
  rm -f /tmp/output_*.png

  local start=$(date +%s.%N)
  "$TD_DIR/task-distributor-master.sh" -n "$n" -x "$WIDTH" -y "$HEIGHT" -p "$IMG_PARTS_PATH" -f \
    > "/tmp/td_n${n}.log" 2>&1
  local exit_code=$?
  local end=$(date +%s.%N)
  local elapsed=$(echo "scale=3; $end - $start" | bc)

  log "  Exit code: $exit_code"
  log "  Elapsed: ${elapsed}s"
  tail -10 "/tmp/td_n${n}.log" | sed 's/^/  /' | tee -a "$RESULTS_LOG"

  if [ "$exit_code" -eq 0 ]; then
    # Upload the individual row-band chunks (one per node) to MinIO so
    # the frontend can show how the image was actually split and
    # rendered in parallel.
    for part in "$IMG_PARTS_PATH"/*pi*.png "$IMG_PARTS_PATH"/*master-node*.png; do
      [ -f "$part" ] || continue
      local part_name=$(basename "$part")
      mc cp "$part" "local/povray-renders/n${n}/${part_name}" > /dev/null 2>&1
    done

    # Upload the final composed image
    local final_img=$(ls -t /tmp/output_*.png 2>/dev/null | head -1)
    if [ -n "$final_img" ]; then
      local final_name=$(basename "$final_img")
      mc cp "$final_img" "local/povray-renders/n${n}/final_${final_name}" > /dev/null 2>&1
      log "  Uploaded chunks + final image to MinIO: povray-renders/n${n}/"
    fi

    curl -s -X POST "$BACKEND_URL/api/benchmarks/record" \
      -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
      -d "{\"type\":\"task_distributor\",\"nodes\":$n,\"value\":$elapsed,\"metric\":\"seconds\"}" \
      >> "$RESULTS_LOG"
    echo "" >> "$RESULTS_LOG"

    # Clean up local copies now that they're safely in MinIO, so the
    # next test starts fresh
    rm -f "$IMG_PARTS_PATH"/*.png
    rm -f "$IMG_PARTS_PATH/lockfile"
  else
    log "  WARNING: non-zero exit code, not recording this result"
  fi
}

log "=== Task-Distributor RE-RUN started at $(date) ==="
log "Image size: ${WIDTH}x${HEIGHT}, node counts: 1,2,4,8,9 (Pi5 added 9th)"

for n in 1 2 4 8 9; do
  run_test "$n"
  log "  Cooling down ${COOLDOWN_SECONDS}s..."
  sleep "$COOLDOWN_SECONDS"
done

log ""
log "=== Task-Distributor RE-RUN finished at $(date) ==="
