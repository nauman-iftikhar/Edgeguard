#!/bin/bash
# ══════════════════════════════════════════════════════════════
# SS2026 Auto Scaler — Two Stage Scaling
#
# Stage 1 — Prepare (CPU > 30%):
#   Pre-warm Pi4 k3s agent silently
#   Pi4 registers with cluster
#   Ready to activate instantly
#
# Stage 2 — Activate (CPU > 80%):
#   Pi4 already registered
#   Just add to MPI hosts
#   Instantly takes load
# ══════════════════════════════════════════════════════════════

PI4_IP="10.10.10.40"
PI4_USER="admin"
K3S_TOKEN=$(cat ~/k3s_token.txt)
PROMETHEUS="http://10.10.10.1:9090"

CPU_PREPARE=30    # Pre-warm Pi4 at this threshold
CPU_HIGH=80       # Activate Pi4 at this threshold
CPU_LOW=50        # Remove Pi4 below this threshold
CHECK_INTERVAL=10

LOG_FILE="/home/admin/autoscale.log"
BACKEND_URL="http://10.10.10.1:30800"

HOSTS_WITHOUT_PI4="/home/admin/mpi_hosts_without_pi4"
HOSTS_WITH_PI4="/home/admin/mpi_hosts_with_pi4"
HOSTS_CURRENT="/home/admin/mpi_hosts_8nodes"

PI4_IN_CLUSTER=false
PI4_PREPARED=false

# ── Create hosts files ────────────────────────────────────────
cat > $HOSTS_WITHOUT_PI4 << 'HOSTS'
10.10.10.1 slots=4
10.10.10.21 slots=4
10.10.10.22 slots=4
10.10.10.23 slots=4
10.10.10.24 slots=4
10.10.10.25 slots=4
10.10.10.26 slots=4
10.10.10.27 slots=4
10.10.10.28 slots=4
HOSTS

cat > $HOSTS_WITH_PI4 << 'HOSTS'
10.10.10.1 slots=4
10.10.10.21 slots=4
10.10.10.22 slots=4
10.10.10.23 slots=4
10.10.10.24 slots=4
10.10.10.25 slots=4
10.10.10.26 slots=4
10.10.10.27 slots=4
10.10.10.28 slots=4
10.10.10.40 slots=4
HOSTS

cp $HOSTS_WITHOUT_PI4 $HOSTS_CURRENT

# ── Helpers ───────────────────────────────────────────────────
log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') $1" | tee -a $LOG_FILE
}

get_cluster_cpu() {
    CPU=$(curl -s "${PROMETHEUS}/api/v1/query" \
        --data-urlencode \
        'query=100 - (avg(rate(node_cpu_seconds_total{mode="idle",job="pi3-workers"}[1m])) * 100)' \
        | python3 -c "
import sys, json
d = json.load(sys.stdin)
results = d['data']['result']
if results:
    print(round(float(results[0]['value'][1]), 1))
else:
    print(0)
" 2>/dev/null)
    echo ${CPU:-0}
}

post_event() {
    curl -s -X POST "${BACKEND_URL}/api/autoscaler/event" \
        -H "Content-Type: application/json" \
        -d "{\"message\": \"$1\", \"pi4_status\": \"$2\", \"cpu\": $3}" \
        > /dev/null 2>&1
}

get_pi4_node() {
    kubectl get nodes --no-headers 2>/dev/null \
        | grep -v "master\|pi3" | awk '{print $1}'
}

# ── Stage 1 — Prepare Pi4 ────────────────────────────────────
prepare_pi4() {
    local cpu=$1
    log "🟡 CPU ${cpu}% rising — pre-warming Pi4..."
    post_event "CPU ${cpu}% rising — pre-warming Pi4 silently" "preparing" $cpu

    # Clean up any stale node entry first
    kubectl delete node sensor-node 2>/dev/null || true
    sleep 2

    # Start k3s agent on Pi4
    ssh ${PI4_USER}@${PI4_IP} "
        sudo systemctl restart k3s-agent
    " 2>/dev/null

    # Wait for Pi4 to register — retry 6 times x 10s = 60s max
    log "   Waiting for Pi4 to register..."
    for i in 1 2 3 4 5 6; do
        sleep 10
        PI4_NODE=$(get_pi4_node)
        if [ ! -z "$PI4_NODE" ]; then
            PI4_PREPARED=true
            log "✅ Pi4 pre-warmed as $PI4_NODE — ready to activate"
            post_event "Pi4 pre-warmed and registered — ready to assist" "prepared" $cpu
            return 0
        fi
        log "   Attempt $i/6 — waiting for registration..."
    done

    log "⚠️  Pi4 pre-warm timed out — will retry"
    post_event "Pi4 pre-warm timed out" "standby" $cpu
    PI4_PREPARED=false
}

# ── Stage 2 — Activate Pi4 ───────────────────────────────────
activate_pi4() {
    local cpu=$1
    log "🔴 CPU ${cpu}% critical — activating Pi4 instantly!"
    post_event "CPU ${cpu}% critical — Pi4 activating" "joining" $cpu

    # Pi4 already registered — just add to MPI hosts
    cp $HOSTS_WITH_PI4 $HOSTS_CURRENT
    PI4_IN_CLUSTER=true

    log "✅ Pi4 activated — added to MPI workload"
    post_event "Pi4 activated — load redistributing across 10 nodes" "active" $cpu

    # Restart benchmark with Pi4 included
    if pgrep -f "hpcc\|mpirun" > /dev/null; then
        log "🔄 Restarting benchmark with Pi4 (40 processes)..."
        pkill -f "hpcc"  2>/dev/null
        pkill -f "mpirun" 2>/dev/null
        sleep 3
        cd /home/admin/hpl
        nohup mpirun --hostfile $HOSTS_CURRENT \
            --mca btl_tcp_if_include eth0 \
            -np 40 hpcc > /tmp/stress_with_pi4.log 2>&1 &
        log "✅ Benchmark restarted with 40 processes including Pi4"
        post_event "Benchmark restarted with Pi4 — 40 processes total" "active" $cpu
    fi
}

# ── Stage 3 — Leave cluster ───────────────────────────────────
leave_cluster() {
    local cpu=$1
    log "✅ CPU ${cpu}% — Pi4 leaving cluster..."
    post_event "CPU normal ${cpu}% — Pi4 leaving cluster" "leaving" $cpu

    # Remove from MPI hosts first
    cp $HOSTS_WITHOUT_PI4 $HOSTS_CURRENT
    log "   Pi4 removed from MPI hosts"

    # Stop benchmark
    pkill -f "hpcc"  2>/dev/null
    pkill -f "mpirun" 2>/dev/null
    sleep 5

    # Drain and delete node
    PI4_NODE=$(get_pi4_node)
    if [ ! -z "$PI4_NODE" ]; then
        log "   Draining $PI4_NODE..."
        kubectl drain $PI4_NODE \
            --ignore-daemonsets \
            --delete-emulated-pods \
            --force 2>/dev/null
        sleep 5
        kubectl delete node $PI4_NODE 2>/dev/null
        log "   $PI4_NODE deleted from cluster"
    fi

    # Stop k3s agent on Pi4
    ssh ${PI4_USER}@${PI4_IP} \
        "sudo systemctl stop k3s-agent" 2>/dev/null

    PI4_IN_CLUSTER=false
    PI4_PREPARED=false
    log "✅ Pi4 removed — back to camera duty only"
    post_event "Pi4 removed from cluster — system stable" "standby" $cpu
}

# ── Standdown Pi4 preparation ────────────────────────────────
standdown_pi4() {
    local cpu=$1
    log "🟢 CPU ${cpu}% — standing down Pi4 pre-warm"
    post_event "CPU dropped — Pi4 standing down" "standby" $cpu

    kubectl delete node sensor-node 2>/dev/null || true
    ssh ${PI4_USER}@${PI4_IP} \
        "sudo systemctl stop k3s-agent" 2>/dev/null

    PI4_PREPARED=false
    log "✅ Pi4 standing down — camera duty only"
}

# ── Main loop ─────────────────────────────────────────────────
log "🚀 Auto scaler started — Two Stage Scaling"
log "   Prepare threshold:  ${CPU_PREPARE}%"
log "   Activate threshold: ${CPU_HIGH}%"
log "   Remove threshold:   ${CPU_LOW}%"
log "   Check interval:     ${CHECK_INTERVAL}s"

while true; do
    CPU=$(get_cluster_cpu)
    log "📊 CPU: ${CPU}%  Prepared: ${PI4_PREPARED}  Active: ${PI4_IN_CLUSTER}"

    # ── Active: check if should leave ────────────────────────
    if [ "$PI4_IN_CLUSTER" = true ]; then
        if (( $(echo "$CPU < $CPU_LOW" | bc -l) )); then
            sleep 15
            CPU=$(get_cluster_cpu)
            if (( $(echo "$CPU < $CPU_LOW" | bc -l) )); then
                leave_cluster $CPU
            else
                log "⚠️  CPU rose to ${CPU}% — keeping Pi4 active"
            fi
        fi

    # ── Prepared: check if should activate or stand down ─────
    elif [ "$PI4_PREPARED" = true ]; then
        if (( $(echo "$CPU > $CPU_HIGH" | bc -l) )); then
            activate_pi4 $CPU

        elif (( $(echo "$CPU < $CPU_PREPARE" | bc -l) )); then
            standdown_pi4 $CPU
        fi

    # ── Standby: check if should prepare ─────────────────────
    else
        if (( $(echo "$CPU > $CPU_PREPARE" | bc -l) )); then
            prepare_pi4 $CPU
        fi
    fi

    sleep $CHECK_INTERVAL
done
