#include <stdio.h>
#include <stdlib.h>
#include <math.h>
#include <time.h>
#include <mpi.h>

int main(int argc, char *argv[]) {
    int rank, size;
    long long total_points, local_points, local_inside = 0, global_inside = 0;
    double x, y, pi_estimate;
    double start_time, end_time;

    MPI_Init(&argc, &argv);
    MPI_Comm_rank(MPI_COMM_WORLD, &rank);
    MPI_Comm_size(MPI_COMM_WORLD, &size);

    if (argc < 2) {
        if (rank == 0) fprintf(stderr, "Usage: %s <total_points>\n", argv[0]);
        MPI_Finalize();
        return 1;
    }

    total_points = atoll(argv[1]);
    local_points = total_points / size;

    // Seed differently per rank
    unsigned int seed = time(NULL) + rank * 1000;
    srand(seed);

    MPI_Barrier(MPI_COMM_WORLD);
    start_time = MPI_Wtime();

    for (long long i = 0; i < local_points; i++) {
        x = (double)rand() / RAND_MAX;
        y = (double)rand() / RAND_MAX;
        if (x*x + y*y <= 1.0) local_inside++;
    }

    MPI_Reduce(&local_inside, &global_inside, 1, MPI_LONG_LONG, MPI_SUM, 0, MPI_COMM_WORLD);

    MPI_Barrier(MPI_COMM_WORLD);
    end_time = MPI_Wtime();

    if (rank == 0) {
        pi_estimate = 4.0 * global_inside / total_points;
        printf("%.6f %.4f %d %lld\n", end_time - start_time, pi_estimate, size, total_points);
    }

    MPI_Finalize();
    return 0;
}
