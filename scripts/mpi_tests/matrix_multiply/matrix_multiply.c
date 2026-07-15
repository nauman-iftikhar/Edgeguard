#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <mpi.h>

int main(int argc, char *argv[]) {
    int rank, size, N;
    double *A = NULL, *B, *C = NULL, *local_A, *local_C;
    double start_time, end_time;

    MPI_Init(&argc, &argv);
    MPI_Comm_rank(MPI_COMM_WORLD, &rank);
    MPI_Comm_size(MPI_COMM_WORLD, &size);

    if (argc < 2) {
        if (rank == 0) fprintf(stderr, "Usage: %s <N>\n", argv[0]);
        MPI_Finalize();
        return 1;
    }

    N = atoi(argv[1]);
    int rows = N / size;

    local_A = (double*)malloc(rows * N * sizeof(double));
    local_C = (double*)calloc(rows * N, sizeof(double));
    B       = (double*)malloc(N * N * sizeof(double));

    if (rank == 0) {
        A = (double*)malloc(N * N * sizeof(double));
        C = (double*)malloc(N * N * sizeof(double));
        srand(42);
        for (int i = 0; i < N * N; i++) {
            A[i] = (double)(rand() % 10) / 10.0;
            B[i] = (double)(rand() % 10) / 10.0;
        }
    }

    MPI_Barrier(MPI_COMM_WORLD);
    start_time = MPI_Wtime();

    MPI_Bcast(B, N * N, MPI_DOUBLE, 0, MPI_COMM_WORLD);
    MPI_Scatter(A, rows * N, MPI_DOUBLE, local_A, rows * N, MPI_DOUBLE, 0, MPI_COMM_WORLD);

    for (int i = 0; i < rows; i++)
        for (int k = 0; k < N; k++) {
            double a_ik = local_A[i * N + k];
            if (a_ik == 0.0) continue;
            for (int j = 0; j < N; j++)
                local_C[i * N + j] += a_ik * B[k * N + j];
        }

    MPI_Gather(local_C, rows * N, MPI_DOUBLE, C, rows * N, MPI_DOUBLE, 0, MPI_COMM_WORLD);

    MPI_Barrier(MPI_COMM_WORLD);
    end_time = MPI_Wtime();

    if (rank == 0) {
        printf("%.6f %d %d OK\n", end_time - start_time, N, size);
        free(A); free(C);
    }

    free(local_A); free(local_C); free(B);
    MPI_Finalize();
    return 0;
}
