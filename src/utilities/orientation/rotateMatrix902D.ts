import ndarray, { type NdArray } from "ndarray";

/**
 * Rotates a matrix by 90 degrees.
 *
 * @param matrix - The matrix to rotate.
 * @returns The rotated matrix.
 */
export default function (matrix: NdArray<Uint8Array>): NdArray<Uint8Array> {
    const [rows, cols] = matrix.shape;

    const result = ndarray(new Uint8Array(rows * cols), [cols, rows]);

    const resultColsMinus1 = result.shape[1] - 1;

    for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) {
            result.set(j, resultColsMinus1 - i, matrix.get(i, j));
        }
    }

    return result;
}
