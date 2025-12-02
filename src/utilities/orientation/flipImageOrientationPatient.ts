type ImageOrientationPatient = [number, number, number, number, number, number];

const flipImageOrientationPatient = {
    /**
     * h: Flips ImageOrientationPatient in the horizontal direction.
     * @param iop - ImageOrientationPatient
     * @returns The transformed ImageOrientationPatient
     */
    h: (iop: ImageOrientationPatient): ImageOrientationPatient => {
        return [iop[0], iop[1], iop[2], -iop[3], -iop[4], -iop[5]];
    },
    /**
     * v: Flips ImageOrientationPatient in the vertical direction.
     * @param iop - ImageOrientationPatient
     * @returns The transformed ImageOrientationPatient
     */
    v: (iop: ImageOrientationPatient): ImageOrientationPatient => {
        return [-iop[0], -iop[1], -iop[2], iop[3], iop[4], iop[5]];
    },
    /**
     * hv: Flips ImageOrientationPatient in the horizontal and vertical directions.
     * @param iop - ImageOrientationPatient
     * @returns The transformed ImageOrientationPatient
     */
    hv: (iop: ImageOrientationPatient): ImageOrientationPatient => {
        return [-iop[0], -iop[1], -iop[2], -iop[3], -iop[4], -iop[5]];
    }
};

export { flipImageOrientationPatient };
