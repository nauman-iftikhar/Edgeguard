#!/bin/bash
BINARY=/home/admin/monte_carlo_pi
RESULTS=/nfs/shared/monte_carlo_results_final.csv
RUNS=3
COOLDOWN=30
CORES=(1 2 4 8 16 32)
SIZES=(1000000 10000000 100000000 1000000000 10000000000)
SNAMES=("1M" "10M" "100M" "1B" "10B")

echo "cores,problem_size,run,time_seconds,pi_estimate" > $RESULTS

for RUN in $(seq 1 $RUNS); do
    echo "========== SWEEP $RUN of $RUNS =========="
    
    for i in "${!SIZES[@]}"; do
        SIZE=${SIZES[$i]}
        SNAME=${SNAMES[$i]}
        
        for CORE in "${CORES[@]}"; do
            echo "Running: $CORE cores, $SNAME, sweep $RUN..."

            # Kill zombies
            for ip in 10.10.10.21 10.10.10.22 10.10.10.23 10.10.10.24 10.10.10.25 10.10.10.26 10.10.10.27 10.10.10.28; do
                ssh admin@$ip "pkill -f monte_carlo_pi" 2>/dev/null
            done
            sleep 3

            # Temperature check
            TEMP=$(ssh admin@10.10.10.21 "vcgencmd measure_temp" 2>/dev/null | grep -o '[0-9.]*')
            while (( $(echo "$TEMP > 65" | bc -l) )); do
                echo "Cooling... pi3-01: ${TEMP}°C"
                sleep 30
                TEMP=$(ssh admin@10.10.10.21 "vcgencmd measure_temp" 2>/dev/null | grep -o '[0-9.]*')
            done

            # Build hostfile
            TMPHOST=/tmp/hostfile_${CORE}
            python3 -c "
cores = $CORE
nodes = ['pi3-01','pi3-02','pi3-03','pi3-04','pi3-05','pi3-06','pi3-07','pi3-08']
remaining = cores
for n in nodes:
    if remaining <= 0:
        break
    slots = min(4, remaining)
    print(f'{n} slots={slots}')
    remaining -= slots
" > $TMPHOST

            RESULT=$(mpirun -np $CORE --hostfile $TMPHOST $BINARY $SIZE 2>/dev/null)
            TIME=$(echo $RESULT | awk '{print $1}')
            PI=$(echo $RESULT | awk '{print $2}')

            echo "$CORE,$SNAME,$RUN,$TIME,$PI"
            echo "$CORE,$SNAME,$RUN,$TIME,$PI" >> $RESULTS

            echo "Cooling ${COOLDOWN}s..."
            sleep $COOLDOWN
        done
    done
    echo "========== SWEEP $RUN COMPLETE =========="
done
echo "Full sweep complete!"
