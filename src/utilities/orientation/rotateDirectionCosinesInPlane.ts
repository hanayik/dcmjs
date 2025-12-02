import crossProduct3D from "./crossProduct3D.js";
import rotateVectorAroundUnitVector from "./rotateVectorAroundUnitVector.js";

type Vector3D = [number, number, number];
type ImageOrientationPatient = [number, number, number, number, number, number];

/**
 * rotateDirectionCosinesInPlane - rotates the row and column cosines around
 * their normal by angle theta.
 *
 * @param iop - The row (0..2) and column (3..5) direction cosines.
 * @param theta - The rotation magnitude in radians.
 * @returns The rotated row (0..2) and column (3..5) direction cosines.
 */
export default function (iop: ImageOrientationPatient, theta: number): ImageOrientationPatient {
    const r: Vector3D = [iop[0], iop[1], iop[2]];
    const c: Vector3D = [iop[3], iop[4], iop[5]];
    const rxc = crossProduct3D(r, c);

    const rRot = rotateVectorAroundUnitVector(r, rxc, theta);
    const cRot = rotateVectorAroundUnitVector(c, rxc, theta);

    return [rRot[0], rRot[1], rRot[2], cRot[0], cRot[1], cRot[2]];
}
