import log from "./log.js";

/**
 * Calculates the number of bytes required to store a given number of 1-bit pixels.
 * @param numPixels - The number of pixels to store
 * @returns The number of bytes required
 */
function getBytesForBinaryFrame(numPixels: number): number {
    // Check whether the 1-bit pixels exactly fit into bytes
    const remainder = numPixels % 8;

    // Number of bytes that work on an exact fit
    let bytesRequired = Math.floor(numPixels / 8);

    // Add one byte if we have a remainder
    if (remainder > 0) {
        bytesRequired++;
    }

    return bytesRequired;
}

/**
 * Packs pixel data into a bit array (1 bit per pixel).
 * @param pixelData - Array-like structure containing pixel values (non-zero values become 1)
 * @returns Packed bit array as Uint8Array
 */
function pack(pixelData: ArrayLike<number>): Uint8Array {
    const numPixels = pixelData.length;

    log.debug("numPixels: " + numPixels);

    const length = getBytesForBinaryFrame(numPixels);
    //log.info('getBytesForBinaryFrame: ' + length);

    const bitPixelData = new Uint8Array(length);

    let bytePos = 0;

    for (let i = 0; i < numPixels; i++) {
        // Compute byte position
        bytePos = Math.floor(i / 8);

        const pixValue = pixelData[i] !== 0;

        //log.info('i: ' + i);
        //log.info('pixValue: ' + pixValue);
        //log.info('bytePos: ' + bytePos);

        const bitPixelValue = (pixValue ? 1 : 0) << (i % 8);
        //log.info('current bitPixelData: ' + bitPixelData[bytePos]);
        //log.info('this bitPixelValue: ' + bitPixelValue);

        bitPixelData[bytePos] |= bitPixelValue;

        //log.info('new bitPixelValue: ' + bitPixelData[bytePos]);
    }

    return bitPixelData;
}

/**
 * Converts a packed bitwise pixel array into a byte-per-pixel
 * array with 255 corresponding to each set bit in the bit array.
 * @param bitPixelArray - Packed bit array
 * @returns Unpacked byte array with 255 for set bits, 0 for unset bits
 */
function unpack(bitPixelArray: ArrayLike<number>): Uint8Array {
    const bitArray = new Uint8Array(bitPixelArray);
    const byteArray = new Uint8Array(8 * bitArray.length);

    for (let byteIndex = 0; byteIndex < byteArray.length; byteIndex++) {
        const bitIndex = byteIndex % 8;
        const bitByteIndex = Math.floor(byteIndex / 8);
        byteArray[byteIndex] = 255 * ((bitArray[bitByteIndex] & (1 << bitIndex)) >> bitIndex);
    }

    return byteArray;
}

interface BitArrayInterface {
    getBytesForBinaryFrame: typeof getBytesForBinaryFrame;
    pack: typeof pack;
    unpack: typeof unpack;
}

const BitArray: BitArrayInterface = {
    getBytesForBinaryFrame,
    pack,
    unpack
};

export { BitArray };
export default BitArray;
