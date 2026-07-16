#!/bin/bash
BINARY=/home/admin/matrix_multiply
RESULTS=/nfs/shared/matrix_results.csv
RUNS=4
N=2000
COOLDOWN=30
CORES=(1 2 4 8 16 32)

echo "cores,N,run,time_seconds" > $RESULTS

for RUN in $(seq 1 $RUNS); do
    echo "========== SWEEP $RUN of $RUNS =========="
    for CORE in "${CORES[@]}"; do
        echo "Running: $CORE cores, N=$N, sweep $RUN..."

        for ip in 10.10.10.21 10.10.10.22 10.10.10.23 10.10.10.24 10.10.10.25 10.10.10.26 10.10.10.27 10.10.10.28; do
            ssh admin@$ip "pkill -f matrix_multiply" 2>/dev/null
        done
        sleep 3

        TEMP=$(ssh admin@10.10.10.21 "vcgencmd measure_temp" 2>/dev/null | grep -o '[0-9.]*')
        while (( $(echo "$TEMP > 65" | bc -l) )); do
            echo "Cooling... ${TEMP}°C"
            sleep 30
            TEMP=$(ssh admin@10.10.10.21 "vcgencmd measure_temp" 2>/dev/null | grep -o '[0-9.]*')
        done

        TMPHOST=/tmp/hostfile_${CORE}
        python3 -c "
cores = $CORE
nodes = ['pi3-01','pi3-02','pi3-03','pi3-04','pi3-05','pi3-06','pi3-07','pi3-08']
remaining = cores
for n in nodes:
    if remaining <= 0: break
    slots = min(4, remaining)
    print(f'{n} slots={slots}')
    remaining -= slots
" > $TMPHOST

        RESULT=$(mpirun -np $CORE --hostfile $TMPHOST $BINARY $N 2>/dev/null)
        TIME=$(echo $RESULT | awk '{print $1}')

        echo "$CORE,$N,$RUN,$TIME"
        echo "$CORE,$N,$RUN,$TIME" >> $RESULTS

        sleep $COOLDOWN
    done
    echo "--- Sweep $RUN complete ---"
done
echo "Matrix sweep complete!"
