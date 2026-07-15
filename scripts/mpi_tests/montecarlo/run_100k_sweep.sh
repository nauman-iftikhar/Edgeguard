#!/bin/bash
BINARY=/home/admin/monte_carlo_pi
RESULTS=/nfs/shared/monte_carlo_results_final.csv
RUNS=5
SIZE=100000
SNAME="0.1M"
CORES=(1 2 4 8 16 32)
COOLDOWN=5

for RUN in $(seq 1 $RUNS); do
    for CORE in "${CORES[@]}"; do
        for ip in 10.10.10.21 10.10.10.22 10.10.10.23 10.10.10.24 10.10.10.25 10.10.10.26 10.10.10.27 10.10.10.28; do
            ssh admin@$ip "pkill -f monte_carlo_pi" 2>/dev/null
        done
        sleep 2

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

        RESULT=$(mpirun -np $CORE --hostfile $TMPHOST $BINARY $SIZE 2>/dev/null)
        TIME=$(echo $RESULT | awk '{print $1}')
        PI=$(echo $RESULT | awk '{print $2}')

        if [ -n "$TIME" ]; then
            echo "$CORE,$SNAME,$RUN,$TIME,$PI"
            echo "$CORE,$SNAME,$RUN,$TIME,$PI" >> $RESULTS
        else
            echo "WARNING: $CORE cores run $RUN failed"
        fi
        sleep $COOLDOWN
    done
done
echo "0.1M sweep complete!"
