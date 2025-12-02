type Vector3D = [number, number, number];

/**
 * crossProduct3D - Returns the cross product of a and b.
 *
 * @param a - Vector a.
 * @param b - Vector b.
 * @returns The cross product.
 */
export default function (a: Vector3D, b: Vector3D): Vector3D {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
