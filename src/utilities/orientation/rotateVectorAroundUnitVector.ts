import crossProduct3D from "./crossProduct3D.js";

type Vector3D = [number, number, number];

/**
 * rotateVectorAroundUnitVector - Rotates vector v around unit vector k using
 *                                Rodrigues' rotation formula.
 *
 * @param v - The vector to rotate.
 * @param k - The unit vector of the axis of rotation.
 * @param theta - The rotation magnitude in radians.
 * @returns The rotated v vector.
 */
export default function (v: Vector3D, k: Vector3D, theta: number): Vector3D {
    const cosTheta = Math.cos(theta);
    const sinTheta = Math.sin(theta);
    const oneMinusCosTheta = 1.0 - cosTheta;
    const kdotv = k[0] * v[0] + k[1] * v[1] + k[2] * v[2];
    const kxv = crossProduct3D(k, v);

    const vRot: Vector3D = [
        -(v[0] * cosTheta + kxv[0] * sinTheta + k[0] * kdotv * oneMinusCosTheta),
        -(v[1] * cosTheta + kxv[1] * sinTheta + k[1] * kdotv * oneMinusCosTheta),
        -(v[2] * cosTheta + kxv[2] * sinTheta + k[2] * kdotv * oneMinusCosTheta)
    ];

    return vRot;
}
