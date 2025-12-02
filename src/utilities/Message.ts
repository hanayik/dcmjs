/**
 * Converts a Uint8Array to a String.
 * @param arr - array that should be converted
 * @param offset - array offset in case only subset of array items should be extracted (default: 0)
 * @param limit - maximum number of array items that should be extracted (defaults to length of array)
 * @returns converted string
 */
function uint8ArrayToString(
    arr: Uint8Array,
    offset?: number,
    limit?: number
): string {
    const effectiveOffset = offset || 0;
    const effectiveLimit = limit || arr.length - effectiveOffset;
    let str = "";
    for (let i = effectiveOffset; i < effectiveOffset + effectiveLimit; i++) {
        str += String.fromCharCode(arr[i]);
    }
    return str;
}

/**
 * Converts a String to a Uint8Array.
 * @param str - string that should be converted
 * @returns converted Uint8Array
 */
function stringToUint8Array(str: string): Uint8Array {
    const arr = new Uint8Array(str.length);
    for (let i = 0, j = str.length; i < j; i++) {
        arr[i] = str.charCodeAt(i);
    }
    return arr;
}

/**
 * Identifies the boundary in a multipart/related message header.
 * @param header - message header
 * @returns boundary string or undefined if not found
 */
function identifyBoundary(header: string): string | undefined {
    const parts = header.split("\r\n");

    for (let i = 0; i < parts.length; i++) {
        if (parts[i].substr(0, 2) === "--") {
            return parts[i];
        }
    }
    return undefined;
}

/**
 * Checks whether a given token is contained by a message at a given offset.
 * @param message - message content
 * @param token - substring that should be present
 * @param offset - offset in message content from where search should start
 * @returns whether message contains token at offset
 */
function containsToken(
    message: Uint8Array,
    token: Uint8Array,
    offset: number = 0
): boolean {
    if (offset + token.length > message.length) {
        return false;
    }

    let index = offset;
    for (let i = 0; i < token.length; i++) {
        if (token[i] !== message[index++]) {
            return false;
        }
    }
    return true;
}

/**
 * Finds a given token in a message at a given offset.
 * @param message - message content
 * @param token - substring that should be found
 * @param offset - message body offset from where search should start
 * @param maxSearchLength - maximum length to search
 * @returns index of token if found, -1 otherwise
 */
function findToken(
    message: Uint8Array,
    token: Uint8Array,
    offset: number = 0,
    maxSearchLength?: number
): number {
    let searchLength = message.length;
    if (maxSearchLength) {
        searchLength = Math.min(offset + maxSearchLength, message.length);
    }

    for (let i = offset; i < searchLength; i++) {
        // If the first value of the message matches
        // the first value of the token, check if
        // this is the full token.
        if (message[i] === token[0]) {
            if (containsToken(message, token, i)) {
                return i;
            }
        }
    }

    return -1;
}

/**
 * Encoded multipart data with boundary
 */
interface MultipartEncodedData {
    /** The encoded Multipart Data */
    data: ArrayBuffer;
    /** The boundary used to divide pieces of the encoded data */
    boundary: string;
}

/**
 * Encode one or more DICOM datasets into a single body so it can be
 * sent using the Multipart Content-Type.
 *
 * @param datasets - Array containing each file to be encoded in the multipart body, passed as ArrayBuffers.
 * @param boundary - Optional string to define a boundary between each part of the multipart body. If this is not specified, a random GUID will be generated.
 * @param contentType - Content type for each part (default: "application/dicom")
 * @returns The Multipart encoded data returned as an Object. This contains both the data itself, and the boundary string used to divide it.
 */
function multipartEncode(
    datasets: ArrayBuffer[],
    boundary: string = guid(),
    contentType: string = "application/dicom"
): MultipartEncodedData {
    const contentTypeString = `Content-Type: ${contentType}`;
    const header = `\r\n--${boundary}\r\n${contentTypeString}\r\n\r\n`;
    const footer = `\r\n--${boundary}--`;
    const headerArray = stringToUint8Array(header);
    const footerArray = stringToUint8Array(footer);
    const headerLength = headerArray.length;
    const footerLength = footerArray.length;

    let length = 0;

    // Calculate the total length for the final array
    const contentArrays = datasets.map((datasetBuffer) => {
        const contentArray = new Uint8Array(datasetBuffer);
        const contentLength = contentArray.length;

        length += headerLength + contentLength + footerLength;

        return contentArray;
    });

    // Allocate the array
    const multipartArray = new Uint8Array(length);

    // Set the initial header
    multipartArray.set(headerArray, 0);

    // Write each dataset into the multipart array
    let position = 0;
    contentArrays.forEach((contentArray) => {
        multipartArray.set(headerArray, position);
        multipartArray.set(contentArray, position + headerLength);

        position += headerLength + contentArray.length;
    });

    multipartArray.set(footerArray, position);

    return {
        data: multipartArray.buffer,
        boundary
    };
}

/**
 * Decode a Multipart encoded ArrayBuffer and return the components as an Array.
 *
 * @param response - Data encoded as a 'multipart/related' message
 * @returns The content as an array of ArrayBuffers
 */
function multipartDecode(response: ArrayBuffer): ArrayBuffer[] {
    const message = new Uint8Array(response);

    /* Set a maximum length to search for the header boundaries, otherwise
       findToken can run for a long time
    */
    const maxSearchLength = 1000;

    // First look for the multipart mime header
    const separator = stringToUint8Array("\r\n\r\n");
    const headerIndex = findToken(message, separator, 0, maxSearchLength);
    if (headerIndex === -1) {
        throw new Error("Response message has no multipart mime header");
    }

    const header = uint8ArrayToString(message, 0, headerIndex);
    const boundaryString = identifyBoundary(header);
    if (!boundaryString) {
        throw new Error("Header of response message does not specify boundary");
    }

    const boundary = stringToUint8Array(boundaryString);
    const components: ArrayBuffer[] = [];

    let offset = headerIndex + separator.length;

    // Loop until we cannot find any more boundaries
    let boundaryIndex: number = 0;

    while (boundaryIndex !== -1) {
        // Search for the next boundary in the message, starting
        // from the current offset position
        boundaryIndex = findToken(message, boundary, offset);

        // If no further boundaries are found, stop here.
        if (boundaryIndex === -1) {
            break;
        }

        // Extract data from response message, excluding "\r\n"
        const spacingLength = 2;
        const length = boundaryIndex - offset - spacingLength;
        const data = response.slice(offset, offset + length);

        // Add the data to the array of results
        components.push(data);

        // find the end of the boundary
        const boundaryEnd = findToken(
            message,
            separator,
            boundaryIndex + 1,
            maxSearchLength
        );
        if (boundaryEnd === -1) break;
        // Move the offset to the end of the identified boundary
        offset = boundaryEnd + separator.length;
    }

    return components;
}

/**
 * Create a random GUID
 *
 * @returns generated GUID string
 */
function guid(): string {
    function s4(): string {
        return Math.floor((1 + Math.random()) * 0x10000)
            .toString(16)
            .substring(1);
    }
    return (
        s4() +
        s4() +
        "-" +
        s4() +
        "-" +
        s4() +
        "-" +
        s4() +
        "-" +
        s4() +
        s4() +
        s4()
    );
}

interface MessageUtilities {
    containsToken: typeof containsToken;
    findToken: typeof findToken;
    identifyBoundary: typeof identifyBoundary;
    uint8ArrayToString: typeof uint8ArrayToString;
    stringToUint8Array: typeof stringToUint8Array;
    multipartEncode: typeof multipartEncode;
    multipartDecode: typeof multipartDecode;
    guid: typeof guid;
}

const message: MessageUtilities = {
    containsToken: containsToken,
    findToken: findToken,
    identifyBoundary: identifyBoundary,
    uint8ArrayToString: uint8ArrayToString,
    stringToUint8Array: stringToUint8Array,
    multipartEncode: multipartEncode,
    multipartDecode: multipartDecode,
    guid: guid
};

export default message;
export type { MultipartEncodedData, MessageUtilities };
