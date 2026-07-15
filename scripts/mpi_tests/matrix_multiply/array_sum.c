/*
 * array_sum.c
 *
 * MPI Example 2 for Task 3: Parallel array sum using scatter + reduce.
 *
 * Rank 0 builds a large array of doubles. The array is split into
 * equal chunks and distributed to every rank using MPI_Scatter. Each
 * rank computes the sum of its own chunk independently, then
 * MPI_Reduce combines all the partial sums into a single total on
 * rank 0.
 *
 * Unlike the Monte Carlo example, this program demonstrates the
 * classic "scatter -> compute -> reduce" pattern: there IS real data
 * movement involved (the array itself has to be distributed across
 * the network before any computation can start), so this is a useful
 * contrast against Monte Carlo's "compute first, communicate once at
 * the very end" pattern. At small array sizes the scatter overhead
 * can dominate; at large array sizes the per-rank compute should
 * dominate and speedup should approach Monte Carlo's behavior.
 *
 * Build:
 *   mpicc -O2 -o array_sum array_sum.c
 *
 * Run:
 *   mpirun --hostfile hosts.txt -np <N> ./array_sum <array_size>
 *
 * Note: array_size must be evenly divisible by the number of ranks
 * (np) for MPI_Scatter to split it cleanly.
 *
 * Example:
 *   mpirun --hostfile hosts.txt -np 4 ./array_sum 400000000
 */

#include <mpi.h>
#include <stdio.h>
#include <stdlib.h>

int main(int argc, char *argv[]) {
    int rank, size;
    long long array_size = 100000000; // default 100M doubles (~800MB on rank 0)
    double *full_array = NULL;
    double *local_chunk = NULL;
    double local_sum = 0.0;
    double total_sum = 0.0;
    double start_time, end_time;

    MPI_Init(&argc, &argv);
    MPI_Comm_rank(MPI_COMM_WORLD, &rank);
    MPI_Comm_size(MPI_COMM_WORLD, &size);

    if (argc > 1) {
        array_size = atoll(argv[1]);
    }

    if (array_size % size != 0) {
        if (rank == 0) {
            fprintf(stderr,
                "ERROR: array_size (%lld) must be evenly divisible by "
                "number of ranks (%d)\n", array_size, size);
        }
        MPI_Finalize();
        return 1;
    }

    long long chunk_size = array_size / size;
    local_chunk = (double *)malloc(chunk_size * sizeof(double));

    // Only rank 0 allocates and fills the full array.
    if (rank == 0) {
        full_array = (double *)malloc(array_size * sizeof(double));
        for (long long i = 0; i < array_size; i++) {
            full_array[i] = 1.0; // simple known value: sum should equal array_size
        }
    }

    MPI_Barrier(MPI_COMM_WORLD); // sync all ranks before timing starts
    start_time = MPI_Wtime();

    // Distribute equal chunks of full_array from rank 0 to every rank
    // (including rank 0 itself) into each rank's local_chunk.
    MPI_Scatter(full_array, chunk_size, MPI_DOUBLE,
                local_chunk, chunk_size, MPI_DOUBLE,
                0, MPI_COMM_WORLD);

    for (long long i = 0; i < chunk_size; i++) {
        local_sum += local_chunk[i];
    }

    // Combine every rank's local_sum into total_sum on rank 0.
    MPI_Reduce(&local_sum, &total_sum, 1, MPI_DOUBLE,
               MPI_SUM, 0, MPI_COMM_WORLD);

    end_time = MPI_Wtime();

    if (rank == 0) {
        double elapsed = end_time - start_time;
        printf("ARRAYSUM_RESULT ranks=%d array_size=%lld total_sum=%.0f "
               "elapsed_sec=%.6f\n",
               size, array_size, total_sum, elapsed);
        free(full_array);
    }

    free(local_chunk);
    MPI_Finalize();
    return 0;
}
