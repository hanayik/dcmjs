import { BufferStream, ReadBufferStream, WriteBufferStream } from "./BufferStream";
import { PADDING_NULL, PADDING_SPACE, PN_COMPONENT_DELIMITER, UNDEFINED_LENGTH, VM_DELIMITER } from "./constants/dicom";
import { DicomMetaDictionary } from "./DicomMetaDictionary.js";
import { log, validationLog } from "./log";
import dicomJson, { type PersonNameComponents } from "./utilities/dicomJson";

// Type definitions

/** VR type string like "AE", "CS", "PN", etc. */
type VRType = string;

/** Transfer syntax UID */
type TransferSyntax = string;

/** Options passed to read operations */
interface ReadOptions {
    forceStoreRaw?: boolean;
}

/** Options passed to write operations */
interface WriteOptions {
    allowInvalidVRLength?: boolean;
    fragmentMultiframe?: boolean;
}

/** Result of a read operation */
interface ReadResult<T> {
    rawValue: T | undefined;
    value: T;
}

/** Represents a DICOM tag with vr information */
interface DicomTag {
    vr?: VRType | { type?: VRType };
    values?: unknown;
    Value?: unknown;
    __hasTagAccessors?: boolean;
    [key: string]: unknown;
}

/** Interface for Tag class (to avoid circular imports) */
interface TagInterface {
    value: number;
    is(t: number): boolean;
    readTag(stream: BufferStream): TagInterface;
    getNextSequenceItemData(stream: ReadBufferStream): ArrayBuffer | Uint8Array | ArrayBufferLike | null | undefined;
}

/** Static methods on Tag class */
interface TagConstructor {
    readTag(stream: BufferStream): TagInterface;
    getNextSequenceItemData(stream: ReadBufferStream): ArrayBuffer | Uint8Array | ArrayBufferLike | null | undefined;
}

/** Interface for DicomMessage class (to avoid circular imports) */
interface DicomMessageInterface {
    _read(stream: ReadBufferStream, syntax: TransferSyntax): DicomDataset;
    write(
        dataset: DicomDataset,
        stream: WriteBufferStream,
        syntax: TransferSyntax,
        writeOptions?: WriteOptions
    ): number;
    isEncapsulated(syntax: TransferSyntax): boolean;
}

/** DICOM dataset - a map of tag strings to their data */
interface DicomDataset {
    [tag: string]: unknown;
}

/** Name map entry from DicomMetaDictionary */
interface NameMapEntry {
    vr: VRType;
    tag: string;
    name: string;
}

/** DicomMetaDictionary nameMap interface */
interface NameMap {
    [name: string]: NameMapEntry;
}

/** PersonName value type - can be string, object, or array (includes boxed String for accessor compatibility) */
// eslint-disable-next-line @typescript-eslint/no-wrapper-object-types
type PersonNameValue = string | String | string[] | PersonNameComponents | PersonNameComponents[] | null | undefined;

/** Binary data type */
type BinaryData = ArrayBuffer | ArrayBufferLike | Uint8Array;

/** Value types that can be stored in DICOM elements */
type DicomValue =
    | string
    | string[]
    | number
    | (number | null)[]
    | BinaryData
    | BinaryData[]
    | (BinaryData | BinaryData[])[]
    | PersonNameComponents
    | PersonNameComponents[]
    | DicomDataset[]
    | null
    | undefined;

// We replace the tag with a Proxy which intercepts assignments to obj[valueProp]
// and adds additional overrides/accessors to the value if need be. If valueProp
// is falsy, we check target.vr and add accessors via a ValueRepresentation lookup.
// Specifically, this helps address the incorrect (though common) use of the library:
//   dicomDict.dict.upsertTag('00101001', 'PN', 'Doe^John'); /* direct string assignment */
//   dicomDict.dict['00081070'].Value = 'Doe^John\Doe^Jane'; /* overwrite with multiplicity */
//   ...
//   jsonOutput = JSON.serialize(dicomDict);
// or:
//   naturalizedDataset.OperatorsName = 'Doe^John';
//   jsonOutput = JSON.serialize(naturalizedDataset);
// Whereas the correct usage of the dicom+json model would be:
//   dicomDict.dict.upsertTag('00101001', 'PN', [{Alphabetic:'Doe^John'}]);
//   naturalizedDataset.OperatorsName = [{Alphabetic:'Doe^John'},{Alphabetic:'Doe^Jane'}];
// TODO: refactor with addAccessors.js in mind
const tagProxyHandler: ProxyHandler<DicomTag> = {
    set(target: DicomTag, prop: string | symbol, value: unknown): boolean {
        let vrType: ValueRepresentation | undefined;
        const propStr = String(prop);

        if (
            ["values", "Value"].includes(propStr) &&
            target.vr &&
            ValueRepresentation.hasValueAccessors(target.vr as VRType)
        ) {
            vrType = ValueRepresentation.createByTypeString(target.vr as VRType);
        } else if (
            propStr in (DicomMetaDictionary as unknown as { nameMap: NameMap }).nameMap &&
            ValueRepresentation.hasValueAccessors(
                (DicomMetaDictionary as unknown as { nameMap: NameMap }).nameMap[propStr].vr
            )
        ) {
            vrType = ValueRepresentation.createByTypeString(
                (DicomMetaDictionary as unknown as { nameMap: NameMap }).nameMap[propStr].vr
            );
        } else {
            (target as Record<string | symbol, unknown>)[prop] = value;
            return true;
        }

        (target as Record<string | symbol, unknown>)[prop] = vrType.addValueAccessors(value);

        return true;
    }
};

function rtrim(str: string): string {
    return str.replace(/\s*$/g, "");
}

function toWindows<T>(inputArray: T[], size: number): T[][] {
    return Array.from(
        { length: inputArray.length - (size - 1) }, //get the appropriate length
        (_, index) => inputArray.slice(index, index + size) //create the windows
    );
}

let DicomMessage: DicomMessageInterface | undefined;
let Tag: TagConstructor | undefined;

const binaryVRs = ["FL", "FD", "SL", "SS", "UL", "US", "AT"];
const length32VRs = ["OB", "OW", "OF", "SQ", "UC", "UR", "UT", "UN", "OD"];
const singleVRs = ["SQ", "OF", "OW", "OB", "UN"];

class ValueRepresentation {
    type: VRType;
    multi: boolean;
    maxLength: number | null = null;
    maxCharLength?: number;
    padByte: number = PADDING_NULL;
    fixed?: boolean;
    defaultValue?: string | number;
    noMultiple?: boolean;
    valueLength?: number;
    rangeMatchingMaxLength?: number;

    protected _isBinary: boolean;
    protected _allowMultiple: boolean;
    protected _isLength32: boolean;
    protected _storeRaw: boolean;

    constructor(type: VRType) {
        this.type = type;
        this.multi = false;
        this._isBinary = binaryVRs.indexOf(this.type) != -1;
        this._allowMultiple = !this._isBinary && singleVRs.indexOf(this.type) == -1;
        this._isLength32 = length32VRs.indexOf(this.type) != -1;
        this._storeRaw = true;
    }

    static setDicomMessageClass(dicomMessageClass: DicomMessageInterface): void {
        DicomMessage = dicomMessageClass;
    }

    static setTagClass(tagClass: TagConstructor): void {
        Tag = tagClass;
    }

    isBinary(): boolean {
        return this._isBinary;
    }

    allowMultiple(): boolean {
        return this._allowMultiple;
    }

    /**
     * Returns if the length is 32 bits.  This has nothing to do with being
     * explicit or not, it only has to do with encoding.
     * @deprecated  Replaced by isLength32
     */
    isExplicit(): boolean {
        return this._isLength32;
    }

    /**
     * Returns if the length is 32 bits.  This has nothing to do with being
     * explicit or not, it only has to do with encoding.
     *
     * This used to be isExplicit, which was wrong as both encodings are explicit,
     * just one uses a single 4 byte word to encode both VR and length, and
     * the isLength32 always use a separate 32 bit length.
     */
    isLength32(): boolean {
        return this._isLength32;
    }

    /**
     * Flag that specifies whether to store the original unformatted value that is read from the dicom input buffer.
     * The `_rawValue` is used for lossless round trip processing, which preserves data (whitespace, special chars) on write
     * that may be lost after casting to other data structures like Number, or applying formatting for readability.
     *
     * Example DecimalString: _rawValue: ["-0.000"], Value: [0]
     */
    storeRaw(): boolean {
        return this._storeRaw;
    }

    addValueAccessors(value: unknown): unknown {
        return value;
    }

    /**
     * Replaces a tag with a Proxy which assigns value accessors based on the vr field
     * of the tag being given to it. If the tag object does not have a vr or vr.type
     * property, the proxy will look for the prop name in the natural name map.
     * @param tag object to add accessors to
     * @returns either the same object if no accessor needed, or a Proxy
     */
    static addTagAccessors<T extends DicomTag>(tag: T): T {
        const vrValue = tag.vr;
        let vrType: VRType | undefined;
        if (typeof vrValue === "object" && vrValue !== null) {
            vrType = (vrValue as { type?: VRType }).type;
        } else {
            vrType = vrValue;
        }

        if (!tag.__hasTagAccessors && ValueRepresentation.hasValueAccessors(vrType)) {
            Object.defineProperty(tag, "__hasTagAccessors", { value: true });
            // See note in declaration of tagProxyHandler
            return new Proxy(tag, tagProxyHandler) as T;
        }
        return tag;
    }

    /**
     * Removes padding byte, if it exists, from the last value in a multiple-value data element.
     *
     * This function ensures that data elements with multiple values maintain their integrity for lossless
     * read/write operations. In cases where the last value of a multi-valued data element is at the maximum allowed length,
     * an odd-length total can result in a padding byte being added. This padding byte, can cause a length violation
     * when writing back to the file. To prevent this, we remove the padding byte if it is the only additional character
     * in the last element. Otherwise, it leaves the values as-is to minimize changes to the original data.
     *
     * @param values - An array of strings representing the values of a DICOM data element.
     * @returns The modified array, with the padding byte potentially removed from the last value.
     */
    dropPadByte(values: string[]): string[] {
        const maxLength = this.maxLength ?? this.maxCharLength;
        if (!Array.isArray(values) || !maxLength || !this.padByte) {
            return values;
        }

        // Only consider multiple-value data elements, as max length issues arise from a delimiter
        // making the total length odd and necessitating a padding byte.
        if (values.length > 1) {
            const padChar = String.fromCharCode(this.padByte);
            const lastIdx = values.length - 1;
            const lastValue = values[lastIdx];

            // If the last element is odd and ends with the padding byte trim to avoid potential max length violations during write
            if (lastValue.length % 2 !== 0 && lastValue.endsWith(padChar)) {
                values[lastIdx] = lastValue.substring(0, lastValue.length - 1); // Trim the padding byte
            }
        }

        return values;
    }

    read(
        stream: ReadBufferStream,
        length: number,
        syntax: TransferSyntax,
        readOptions: ReadOptions = { forceStoreRaw: false }
    ): ReadResult<DicomValue> {
        if (this.fixed && this.maxLength) {
            if (!length)
                return {
                    rawValue: this.defaultValue as DicomValue,
                    value: this.defaultValue as DicomValue
                };
            if (this.maxLength != length)
                log.error(
                    "Invalid length for fixed length tag, vr " +
                        this.type +
                        ", length " +
                        this.maxLength +
                        " != " +
                        length
                );
        }
        let rawValue = this.readBytes(stream, length, syntax);
        const value = this.applyFormatting(rawValue);

        // avoid duplicating large binary data structures like pixel data which are unlikely to be formatted or directly manipulated
        if (!this.storeRaw() && !readOptions.forceStoreRaw) {
            rawValue = undefined;
        }

        return { rawValue, value };
    }

    applyFormatting(value: DicomValue): DicomValue {
        return value;
    }

    readBytes(stream: ReadBufferStream, length: number, _syntax?: TransferSyntax): DicomValue {
        return stream.readAsciiString(length);
    }

    readPaddedAsciiString(stream: ReadBufferStream, length: number): string {
        if (!length) return "";
        if (stream.peekUint8(length - 1) !== this.padByte) {
            return stream.readAsciiString(length);
        } else {
            const val = stream.readAsciiString(length - 1);
            stream.increment(1);
            return val;
        }
    }

    readPaddedEncodedString(stream: ReadBufferStream, length: number): string {
        if (!length) return "";
        const val = stream.readEncodedString(length);
        if (val.length && val[val.length - 1] !== String.fromCharCode(this.padByte)) {
            return val;
        } else {
            return val.slice(0, -1);
        }
    }

    write(stream: WriteBufferStream, type: string, ...values: (DicomValue | number)[]): number[] {
        if (values[0] === null || values[0] === "" || values[0] === undefined) {
            return [stream.writeAsciiString("")];
        } else {
            const written: number[] = [];
            const valueArgs = values;
            const func = (stream as unknown as Record<string, (...args: (string | number | null)[]) => number>)[
                "write" + type
            ];
            if (Array.isArray(valueArgs[0])) {
                if ((valueArgs[0] as unknown[]).length < 1) {
                    written.push(0);
                } else {
                    (valueArgs[0] as unknown[]).forEach((v: unknown, k: number) => {
                        if (this.allowMultiple() && k > 0) {
                            stream.writeUint8(VM_DELIMITER);
                        }
                        const singularArgs = [v as string | number | null].concat(
                            valueArgs.slice(1) as (string | number | null)[]
                        );
                        const byteCount = func.apply(stream, singularArgs);
                        written.push(byteCount);
                    });
                }
            } else {
                written.push(func.apply(stream, valueArgs as (string | number | null)[]));
            }
            return written;
        }
    }

    protected _writeBytes(
        stream: WriteBufferStream,
        value: DicomValue,
        lengths: number[],
        writeOptions: WriteOptions = { allowInvalidVRLength: false }
    ): number {
        const { allowInvalidVRLength } = writeOptions;
        let valid = true;
        const valarr = Array.isArray(value) ? value : [value];
        let total = 0;

        for (let i = 0; i < valarr.length; i++) {
            const checkValue = valarr[i];
            const checklen = lengths[i];
            let isString = false;
            let displaylen = checklen;
            if (checkValue === null || allowInvalidVRLength) {
                valid = true;
            } else if (this.checkLength) {
                valid = this.checkLength(checkValue as string);
            } else if (this.maxCharLength) {
                const check = this.maxCharLength;
                valid = (checkValue as string).length <= check;
                displaylen = (checkValue as string).length;
                isString = true;
            } else if (this.maxLength) {
                valid = checklen <= this.maxLength;
            }

            if (!valid) {
                const valueStr =
                    typeof checkValue === "object" && checkValue !== null
                        ? JSON.stringify(checkValue)
                        : String(checkValue);
                const errmsg = `Value exceeds max length, vr: ${this.type}, value: ${valueStr}, length: ${displaylen}`;
                if (isString) log.info(errmsg);
                else throw new Error(errmsg);
            }
            total += checklen;
        }
        if (this.allowMultiple()) {
            total += valarr.length ? valarr.length - 1 : 0;
        }

        //check for odd
        let written = total;
        if (total & 1) {
            stream.writeUint8(this.padByte);
            written++;
        }
        return written;
    }

    // writeBytes is intentionally not defined here as subclasses have different signatures
    // This matches the original JavaScript pattern where polymorphism allows different signatures

    checkLength?(value: string): boolean;

    static hasValueAccessors(type: VRType | undefined): boolean {
        if (type !== undefined && type in VRinstances) {
            return VRinstances[type].addValueAccessors !== ValueRepresentation.prototype.addValueAccessors;
        }
        // Given undefined, assume the representation need to add value accessors
        return type === undefined;
    }

    static createByTypeString(type: VRType): ValueRepresentation {
        let vr = VRinstances[type];
        if (vr === undefined) {
            if (type == "ox") {
                // TODO: determine VR based on context (could be 1 byte pixel data)
                // https://github.com/dgobbi/vtk-dicom/issues/38
                validationLog.error("Invalid vr type", type, "- using OW");
                vr = VRinstances["OW"];
            } else if (type == "xs") {
                validationLog.error("Invalid vr type", type, "- using US");
                vr = VRinstances["US"];
            } else {
                validationLog.error("Invalid vr type", type, "- using UN");
                vr = VRinstances["UN"];
            }
        }
        return vr;
    }

    static parseUnknownVr(type: VRType): ParsedUnknownValue {
        return new ParsedUnknownValue(type);
    }
}

class AsciiStringRepresentation extends ValueRepresentation {
    constructor(type: VRType) {
        super(type);
    }

    override readBytes(stream: ReadBufferStream, length: number): string | string[] {
        return stream.readAsciiString(length);
    }

    writeBytes(stream: WriteBufferStream, value: string | string[] | null, writeOptions?: WriteOptions): number {
        const written = this.write(stream, "AsciiString", value);

        return this._writeBytes(stream, value, written, writeOptions);
    }
}

class EncodedStringRepresentation extends ValueRepresentation {
    constructor(type: VRType) {
        super(type);
    }

    override readBytes(stream: ReadBufferStream, length: number): string {
        return stream.readEncodedString(length);
    }

    writeBytes(stream: WriteBufferStream, value: string | string[] | null, writeOptions?: WriteOptions): number {
        const written = this.write(stream, "UTF8String", value);

        return this._writeBytes(stream, value, written, writeOptions);
    }
}

class BinaryRepresentation extends ValueRepresentation {
    constructor(type: VRType) {
        super(type);
        this._storeRaw = false;
    }

    writeBytes(
        stream: WriteBufferStream,
        value: BinaryData[] | null | undefined,
        _syntax: TransferSyntax,
        isEncapsulated: boolean,
        writeOptions: WriteOptions = {}
    ): number {
        let i: number;
        let binaryStream: WriteBufferStream;
        const { fragmentMultiframe = true } = writeOptions;
        const valueArray: BinaryData[] = value === null || value === undefined ? [] : value;
        if (isEncapsulated) {
            const fragmentSize = 1024 * 20;
            const frames = valueArray.length;
            const startOffset: number[] = [];

            // Calculate a total length for storing binary stream
            let bufferLength = 0;
            for (i = 0; i < frames; i++) {
                const needsPadding = Boolean(valueArray[i].byteLength & 1);
                bufferLength += valueArray[i].byteLength + (needsPadding ? 1 : 0);
                let fragmentsLength = 1;
                if (fragmentMultiframe) {
                    fragmentsLength = Math.ceil(valueArray[i].byteLength / fragmentSize);
                }
                // 8 bytes per fragment are needed to store 0xffff (2 bytes), 0xe000 (2 bytes), and frageStream size (4 bytes)
                bufferLength += fragmentsLength * 8;
            }

            binaryStream = new WriteBufferStream(bufferLength, stream.isLittleEndian);

            for (i = 0; i < frames; i++) {
                const needsPadding = Boolean(valueArray[i].byteLength & 1);

                startOffset.push(binaryStream.size);
                const frameBuffer = valueArray[i];
                const frameStream = new ReadBufferStream(frameBuffer);

                let fragmentsLength = 1;
                if (fragmentMultiframe) {
                    fragmentsLength = Math.ceil(frameStream.size / fragmentSize);
                }

                for (let j = 0, fragmentStart = 0; j < fragmentsLength; j++) {
                    const isFinalFragment = j === fragmentsLength - 1;

                    let fragmentEnd = fragmentStart + frameStream.size;
                    if (fragmentMultiframe) {
                        fragmentEnd = fragmentStart + fragmentSize;
                    }
                    if (isFinalFragment) {
                        fragmentEnd = frameStream.size;
                    }
                    const fragStream = new ReadBufferStream(frameStream.getBuffer(fragmentStart, fragmentEnd));
                    fragmentStart = fragmentEnd;
                    binaryStream.writeUint16(0xfffe);
                    binaryStream.writeUint16(0xe000);

                    const addPaddingByte = isFinalFragment && needsPadding;

                    binaryStream.writeUint32(fragStream.size + (addPaddingByte ? 1 : 0));
                    binaryStream.concat(fragStream);

                    if (addPaddingByte) {
                        binaryStream.writeInt8(this.padByte);
                    }
                }
            }

            stream.writeUint16(0xfffe);
            stream.writeUint16(0xe000);
            stream.writeUint32(startOffset.length * 4);
            for (i = 0; i < startOffset.length; i++) {
                stream.writeUint32(startOffset[i]);
            }
            stream.concat(binaryStream);
            stream.writeUint16(0xfffe);
            stream.writeUint16(0xe0dd);
            stream.writeUint32(0x0);

            return UNDEFINED_LENGTH;
        } else {
            for (const data of valueArray) {
                const dataStream = new ReadBufferStream(data);
                stream.concat(dataStream);
            }
            return this._writeBytes(
                stream,
                valueArray,
                valueArray.map((it) => it.byteLength),
                writeOptions
            );
        }
    }

    /**
     * Reads a binary representation of bytes, handling defined and
     * undefined lengths by iterating over the items and tag delimeters to
     * split the binary data up into the values.
     *
     * @returns  For defined length, returns an array containing the byte buffer.
     *      For undefined length, returns an array of ArrayBuffers, one per content item.
     */
    override readBytes(stream: ReadBufferStream, length: number): BinaryData[] | (BinaryData | BinaryData[])[] {
        if (length == UNDEFINED_LENGTH) {
            const itemTagValue = Tag!.readTag(stream);
            let frames: (BinaryData | BinaryData[])[] = [];

            if (itemTagValue.is(0xfffee000)) {
                const itemLength = stream.readUint32();
                let numOfFrames = 1;
                let offsets: number[] = [];
                if (itemLength > 0x0) {
                    //has frames
                    numOfFrames = itemLength / 4;
                    let i = 0;
                    while (i++ < numOfFrames) {
                        offsets.push(stream.readUint32());
                    }
                } else {
                    offsets = [];
                }

                // If there is an offset table, use that to loop through pixel data sequence
                if (offsets.length > 0) {
                    // make offsets relative to the stream, not tag
                    offsets = offsets.map((e) => e + stream.offset);
                    offsets.push(stream.size);

                    // window offsets to an array of [start,stop] locations
                    frames = toWindows(offsets, 2).map((range) => {
                        const fragments: BinaryData[] = [];
                        const [start, stop] = range;
                        // create a new readable stream based on the range
                        const rangeStream = new ReadBufferStream(stream.buffer, stream.isLittleEndian, {
                            start: start,
                            stop: stop,
                            noCopy: stream.noCopy
                        });

                        let frameSize = 0;
                        while (!rangeStream.end()) {
                            const buf = Tag!.getNextSequenceItemData(rangeStream);
                            if (buf === null) {
                                break;
                            }
                            fragments.push(buf as BinaryData);
                            frameSize += (buf as BinaryData).byteLength;
                        }

                        // Ensure the parent stream's offset is kept up to date
                        stream.offset = rangeStream.offset;

                        // If there's only one buffer then just return it directly
                        if (fragments.length === 1) {
                            return fragments[0];
                        }

                        if (rangeStream.noCopy) {
                            // return the fragments for downstream application to process
                            return fragments;
                        } else {
                            // Allocate a final ArrayBuffer and concat all buffers into it
                            const mergedFrame = new ArrayBuffer(frameSize);
                            const u8Data = new Uint8Array(mergedFrame);
                            fragments.reduce((offset: number, buffer: BinaryData) => {
                                u8Data.set(new Uint8Array(buffer as ArrayBuffer), offset);
                                return offset + buffer.byteLength;
                            }, 0);

                            return mergedFrame;
                        }
                    });
                }
                // If no offset table, loop through remainder of stream looking for termination tag
                else {
                    while (!stream.end()) {
                        const buffer = Tag!.getNextSequenceItemData(stream);
                        if (buffer === null) {
                            break;
                        }
                        frames.push(buffer as BinaryData);
                    }
                }
            } else {
                throw new Error("Item tag not found after undefined binary length");
            }
            return frames;
        } else {
            const bytes = stream.getBuffer(stream.offset, stream.offset + length);
            stream.increment(length);
            // Any conversion to specific vr types will be handled by the "formatting"
            return [bytes as BinaryData];
        }
    }
}

class ApplicationEntity extends AsciiStringRepresentation {
    constructor() {
        super("AE");
        this.maxLength = 16;
        this.padByte = PADDING_SPACE;
    }

    override readBytes(stream: ReadBufferStream, length: number): string {
        return stream.readAsciiString(length);
    }

    override applyFormatting(value: DicomValue): string {
        return (value as string).trim();
    }
}

class CodeString extends AsciiStringRepresentation {
    constructor() {
        super("CS");
        this.maxLength = 16;
        this.padByte = PADDING_SPACE;
    }

    override readBytes(stream: ReadBufferStream, length: number): string[] {
        const BACKSLASH = String.fromCharCode(VM_DELIMITER);
        return this.dropPadByte(stream.readAsciiString(length).split(BACKSLASH));
    }

    override applyFormatting(value: DicomValue): string | string[] {
        const trim = (str: string): string => str.trim();

        if (Array.isArray(value)) {
            return (value as string[]).map((str) => trim(str));
        }

        return trim(value as string);
    }
}

class AgeString extends AsciiStringRepresentation {
    constructor() {
        super("AS");
        this.maxLength = 4;
        this.padByte = PADDING_SPACE;
        this.fixed = true;
        this.defaultValue = "";
    }
}

class AttributeTag extends ValueRepresentation {
    constructor() {
        super("AT");
        this.maxLength = 4;
        this.valueLength = 4;
        this.padByte = PADDING_NULL;
        this.fixed = true;
    }

    override readBytes(stream: ReadBufferStream): number {
        return Tag!.readTag(stream).value;
    }

    writeBytes(stream: WriteBufferStream, value: number | number[] | null, writeOptions?: WriteOptions): number {
        return this._writeBytes(stream, value, this.write(stream, "TwoUint16s", value), writeOptions);
    }
}

class DateValue extends AsciiStringRepresentation {
    override rangeMatchingMaxLength: number;

    constructor() {
        super("DA");
        this.maxLength = 8;
        this.rangeMatchingMaxLength = 18;
        this.padByte = PADDING_SPACE;
        //this.fixed = true;
        this.defaultValue = "";
    }

    override checkLength(value: string): boolean {
        if (typeof value === "string" || Object.prototype.toString.call(value) === "[object String]") {
            const isRangeQuery = value.includes("-");
            return value.length <= (isRangeQuery ? this.rangeMatchingMaxLength : this.maxLength!);
        }
        return true;
    }
}

class NumericStringRepresentation extends AsciiStringRepresentation {
    override readBytes(stream: ReadBufferStream, length: number): string[] {
        const BACKSLASH = String.fromCharCode(VM_DELIMITER);
        const numStr = stream.readAsciiString(length);

        return this.dropPadByte(numStr.split(BACKSLASH));
    }
}

class DecimalString extends NumericStringRepresentation {
    constructor() {
        super("DS");
        this.maxLength = 16;
        this.padByte = PADDING_SPACE;
    }

    override applyFormatting(value: DicomValue): number | null | (number | null)[] {
        const formatNumber = (numberStr: string): number | null => {
            const returnVal = numberStr.trim().replace(/[^0-9.\\\-+e]/gi, "");
            return returnVal === "" ? null : Number(returnVal);
        };

        if (Array.isArray(value)) {
            return (value as string[]).map(formatNumber);
        }

        return formatNumber(value as string);
    }

    convertToString(value: number | string | null): string {
        if (value === null) return "";
        if (typeof value === "string") return value;

        const str = String(value);
        if (str.length > this.maxLength!) {
            // Characters needed for '-' at start.
            const sign_chars = value < 0 ? 1 : 0;

            // Decide whether to use scientific notation.
            const logval = Math.log10(Math.abs(value));

            // Numbers larger than 1e14 cannot be correctly represented by truncating
            // their string representations to 16 chars, e.g pi * 10^13 would become
            // '314159265358979.', which may not be universally understood. This limit
            // is 1e13 for negative numbers because of the minus sign.
            // For negative exponents, the point of equal precision between scientific
            // and standard notation is 1e-4 e.g. '0.00031415926535' and
            // '3.1415926535e-04' are both 16 chars.
            const use_scientific = logval < -4 || logval >= 14 - sign_chars;
            if (use_scientific) {
                const trunc_str = value.toExponential(16 - sign_chars);
                if (trunc_str.length <= 16) return trunc_str;
                // If string is too long, correct the length.
                return value.toExponential(16 - (trunc_str.length - 16) - sign_chars);
            } else {
                const trunc_str = value.toFixed(16 - sign_chars);
                if (trunc_str.length <= 16) return trunc_str;
                // If string is too long, correct the length.
                return value.toFixed(16 - sign_chars - (trunc_str.length - 16));
            }
        }
        return str;
    }

    override writeBytes(
        stream: WriteBufferStream,
        value: number | string | (number | string)[] | null,
        writeOptions?: WriteOptions
    ): number {
        const val = Array.isArray(value)
            ? value.map((ds) => this.convertToString(ds as number | string | null))
            : [this.convertToString(value)];
        // Call parent class writeBytes (AsciiStringRepresentation)
        return AsciiStringRepresentation.prototype.writeBytes.call(this, stream, val, writeOptions);
    }
}

class DateTime extends AsciiStringRepresentation {
    override rangeMatchingMaxLength: number;

    constructor() {
        super("DT");
        this.maxLength = 26;
        this.rangeMatchingMaxLength = 54;
        this.padByte = PADDING_SPACE;
    }

    override checkLength(value: string): boolean {
        if (typeof value === "string" || Object.prototype.toString.call(value) === "[object String]") {
            const isRangeQuery = value.includes("-");
            return value.length <= (isRangeQuery ? this.rangeMatchingMaxLength : this.maxLength!);
        }
        return true;
    }
}

class FloatingPointSingle extends ValueRepresentation {
    constructor() {
        super("FL");
        this.maxLength = 4;
        this.padByte = PADDING_NULL;
        this.fixed = true;
        this.defaultValue = 0.0;
    }

    override readBytes(stream: ReadBufferStream): number {
        return stream.readFloat();
    }

    override applyFormatting(value: DicomValue): number {
        return Number(value);
    }

    writeBytes(stream: WriteBufferStream, value: number | number[] | null, writeOptions?: WriteOptions): number {
        return this._writeBytes(stream, value, this.write(stream, "Float", value), writeOptions);
    }
}

class FloatingPointDouble extends ValueRepresentation {
    constructor() {
        super("FD");
        this.maxLength = 8;
        this.padByte = PADDING_NULL;
        this.fixed = true;
        this.defaultValue = 0.0;
    }

    override readBytes(stream: ReadBufferStream): number {
        return stream.readDouble();
    }

    override applyFormatting(value: DicomValue): number {
        return Number(value);
    }

    writeBytes(stream: WriteBufferStream, value: number | number[] | null, writeOptions?: WriteOptions): number {
        return this._writeBytes(stream, value, this.write(stream, "Double", value), writeOptions);
    }
}

class IntegerString extends NumericStringRepresentation {
    constructor() {
        super("IS");
        this.maxLength = 12;
        this.padByte = PADDING_SPACE;
    }

    override applyFormatting(value: DicomValue): number | null | (number | null)[] {
        const formatNumber = (numberStr: string): number | null => {
            const returnVal = numberStr.trim().replace(/[^0-9.\\\-+e]/gi, "");
            return returnVal === "" ? null : Number(returnVal);
        };

        if (Array.isArray(value)) {
            return (value as string[]).map(formatNumber);
        }

        return formatNumber(value as string);
    }

    convertToString(value: number | string | null): string {
        if (typeof value === "string") return value;
        return value === null ? "" : String(value);
    }

    override writeBytes(
        stream: WriteBufferStream,
        value: number | string | (number | string)[] | null,
        writeOptions?: WriteOptions
    ): number {
        const val = Array.isArray(value)
            ? value.map((is) => this.convertToString(is as number | string | null))
            : [this.convertToString(value)];
        // Call parent class writeBytes (AsciiStringRepresentation)
        return AsciiStringRepresentation.prototype.writeBytes.call(this, stream, val, writeOptions);
    }
}

class LongString extends EncodedStringRepresentation {
    constructor() {
        super("LO");
        this.maxCharLength = 64;
        this.padByte = PADDING_SPACE;
    }

    override readBytes(stream: ReadBufferStream, length: number): string {
        return stream.readEncodedString(length);
    }

    override applyFormatting(value: DicomValue): string {
        return (value as string).trim();
    }
}

class LongText extends EncodedStringRepresentation {
    constructor() {
        super("LT");
        this.maxCharLength = 10240;
        this.padByte = PADDING_SPACE;
    }

    override readBytes(stream: ReadBufferStream, length: number): string {
        return stream.readEncodedString(length);
    }

    override applyFormatting(value: DicomValue): string {
        return rtrim(value as string);
    }
}

class PersonName extends EncodedStringRepresentation {
    constructor() {
        super("PN");
        this.maxLength = null;
        this.padByte = PADDING_SPACE;
    }

    static checkComponentLengths(components: (string | undefined)[]): boolean {
        for (const cmp of components) {
            // As per table 6.2-1 in the spec
            if (cmp && cmp.length > 64) return false;
        }
        return true;
    }

    // Adds toJSON and toString accessors to normalize PersonName output; ie toJSON
    // always returns a dicom+json object, and toString always returns a part10
    // style string, regardless of typeof value
    override addValueAccessors(value: unknown): unknown {
        if (typeof value === "string") {
            value = new String(value);
        }
        if (value != undefined) {
            if (typeof value === "object") {
                return dicomJson.pnAddValueAccessors(value);
            } else {
                throw new Error("Cannot add accessors to non-string primitives");
            }
        }
        return value;
    }

    // Only checked on write, not on read nor creation
    override checkLength(value: string | PersonNameComponents[] | PersonNameComponents): boolean {
        if (Array.isArray(value)) {
            // In DICOM JSON, components are encoded as a mapping (object),
            // where the keys are one or more of the following: "Alphabetic",
            // "Ideographic", "Phonetic".
            // http://dicom.nema.org/medical/dicom/current/output/chtml/part18/sect_F.2.2.html
            for (const pnValue of value) {
                const components = Object.keys(pnValue).map(
                    (key) => (pnValue as Record<string, string | undefined>)[key]
                );
                if (!PersonName.checkComponentLengths(components)) return false;
            }
        } else if (typeof value === "string" || Object.prototype.toString.call(value) === "[object String]") {
            // In DICOM Part10, components are encoded as a string,
            // where components ("Alphabetic", "Ideographic", "Phonetic")
            // are separated by the "=" delimeter.
            // http://dicom.nema.org/medical/dicom/current/output/chtml/part05/sect_6.2.html
            // PN may also have multiplicity, with each item separated by
            // 0x5C (backslash).
            // https://dicom.nema.org/dicom/2013/output/chtml/part05/sect_6.4.html
            const values = (value as string).split(String.fromCharCode(VM_DELIMITER));

            for (const pnString of values) {
                const components = pnString.split(String.fromCharCode(PN_COMPONENT_DELIMITER));
                if (!PersonName.checkComponentLengths(components)) return false;
            }
        }
        return true;
    }

    override readBytes(stream: ReadBufferStream, length: number): string {
        return this.readPaddedEncodedString(stream, length);
    }

    override applyFormatting(value: DicomValue): PersonNameComponents | PersonNameComponents[] {
        const parsePersonName = (valueStr: string): PersonNameComponents | PersonNameComponents[] =>
            dicomJson.pnConvertToJsonObject(valueStr);

        if (Array.isArray(value)) {
            return (value as string[]).map((valueStr) => parsePersonName(valueStr) as PersonNameComponents);
        }

        return parsePersonName(value as string);
    }

    override writeBytes(stream: WriteBufferStream, value: PersonNameValue, writeOptions?: WriteOptions): number {
        // Convert PersonName to string before writing
        const stringValue = dicomJson.pnObjectToString(
            value as string | PersonNameComponents | PersonNameComponents[] | undefined
        );
        // Call parent class writeBytes (EncodedStringRepresentation)
        return EncodedStringRepresentation.prototype.writeBytes.call(this, stream, stringValue, writeOptions);
    }
}

class ShortString extends EncodedStringRepresentation {
    constructor() {
        super("SH");
        this.maxCharLength = 16;
        this.padByte = PADDING_SPACE;
    }

    override readBytes(stream: ReadBufferStream, length: number): string {
        return stream.readEncodedString(length);
    }

    override applyFormatting(value: DicomValue): string {
        return (value as string).trim();
    }
}

class SignedLong extends ValueRepresentation {
    constructor() {
        super("SL");
        this.maxLength = 4;
        this.padByte = PADDING_NULL;
        this.fixed = true;
        this.defaultValue = 0;
    }

    override readBytes(stream: ReadBufferStream): number {
        return stream.readInt32();
    }

    writeBytes(stream: WriteBufferStream, value: number | number[] | null, writeOptions?: WriteOptions): number {
        return this._writeBytes(stream, value, this.write(stream, "Int32", value), writeOptions);
    }
}

class SequenceOfItems extends ValueRepresentation {
    constructor() {
        super("SQ");
        this.maxLength = null;
        this.padByte = PADDING_NULL;
        this.noMultiple = true;
        this._storeRaw = false;
    }

    override readBytes(stream: ReadBufferStream, sqlength: number, syntax: TransferSyntax): DicomDataset[] {
        if (sqlength == 0x0) {
            return []; //contains no dataset
        } else {
            const undefLength = sqlength == UNDEFINED_LENGTH;
            const elements: DicomDataset[] = [];
            let read = 0;

            while (true) {
                const tag = Tag!.readTag(stream);
                let length: number | null = null;
                read += 4;

                if (tag.is(0xfffee0dd)) {
                    // Sequence delimitation item
                    stream.readUint32();
                    break;
                } else if (!undefLength && read == sqlength) {
                    break;
                } else if (tag.is(0xfffee000)) {
                    // Straight item
                    length = stream.readUint32();
                    read += 4;
                    let itemStream: ReadBufferStream | null = null;
                    let toRead = 0;
                    const undef = length == UNDEFINED_LENGTH;

                    if (undef) {
                        let stack = 0;

                        while (true) {
                            const g = stream.readUint16();
                            if (g == 0xfffe) {
                                // some control tag is about to be read
                                const ge = stream.readUint16();

                                const itemLength = stream.readUint32();
                                stream.increment(-4);

                                if (ge == 0xe00d) {
                                    // Item delimitation item
                                    if (itemLength === 0) {
                                        // item delimitation tag (0xfffee00d) + item length (0x00000000) has been read
                                        stack--;
                                        if (stack < 0) {
                                            // if we are outside every stack, then we are finished reading the sequence of items
                                            stream.increment(4);
                                            read += 8;
                                            break;
                                        } else {
                                            // otherwise, we were in a nested sequence of items
                                            toRead += 4;
                                        }
                                    } else {
                                        // anything else has been read
                                        toRead += 2;
                                    }
                                } else if (ge == 0xe000) {
                                    // a new item has been found
                                    toRead += 4;

                                    if (itemLength == UNDEFINED_LENGTH) {
                                        // a new item with undefined length has been found
                                        stack++;
                                    }
                                } else {
                                    // some control tag that does not concern sequence of items has been read
                                    toRead += 2;
                                    stream.increment(-2);
                                }
                            } else {
                                // anything else has been read
                                toRead += 2;
                            }
                        }
                    } else {
                        toRead = length;
                    }

                    if (toRead) {
                        stream.increment(undef ? -toRead - 8 : 0);
                        itemStream = stream.more(toRead); //parseElements
                        read += toRead;
                        if (undef) stream.increment(8);

                        const items = DicomMessage!._read(itemStream, syntax);
                        elements.push(items);
                    }
                    if (!undefLength && read == sqlength) {
                        break;
                    }
                }
            }
            return elements;
        }
    }

    writeBytes(
        stream: WriteBufferStream,
        value: DicomDataset[] | null | undefined,
        syntax: TransferSyntax,
        writeOptions?: WriteOptions
    ): number {
        let written = 0;

        if (value) {
            for (let i = 0; i < value.length; i++) {
                const item = value[i];
                this.write(stream, "Uint16", 0xfffe);
                this.write(stream, "Uint16", 0xe000);
                this.write(stream, "Uint32", UNDEFINED_LENGTH);

                written += DicomMessage!.write(item, stream, syntax, writeOptions);

                this.write(stream, "Uint16", 0xfffe);
                this.write(stream, "Uint16", 0xe00d);
                this.write(stream, "Uint32", 0x00000000);
                written += 16;
            }
        }
        this.write(stream, "Uint16", 0xfffe);
        this.write(stream, "Uint16", 0xe0dd);
        this.write(stream, "Uint32", 0x00000000);
        written += 8;

        return this._writeBytes(stream, value, [written], writeOptions);
    }
}

class SignedShort extends ValueRepresentation {
    constructor() {
        super("SS");
        this.maxLength = 2;
        this.valueLength = 2;
        this.padByte = PADDING_NULL;
        this.fixed = true;
        this.defaultValue = 0;
    }

    override readBytes(stream: ReadBufferStream): number {
        return stream.readInt16();
    }

    writeBytes(stream: WriteBufferStream, value: number | number[] | null, writeOptions?: WriteOptions): number {
        return this._writeBytes(stream, value, this.write(stream, "Int16", value), writeOptions);
    }
}

class ShortText extends EncodedStringRepresentation {
    constructor() {
        super("ST");
        this.maxCharLength = 1024;
        this.padByte = PADDING_SPACE;
    }

    override readBytes(stream: ReadBufferStream, length: number): string {
        return stream.readEncodedString(length);
    }

    override applyFormatting(value: DicomValue): string {
        return rtrim(value as string);
    }
}

class TimeValue extends AsciiStringRepresentation {
    override rangeMatchingMaxLength: number;

    constructor() {
        super("TM");
        this.maxLength = 16;
        this.rangeMatchingMaxLength = 28;
        this.padByte = PADDING_SPACE;
    }

    override readBytes(stream: ReadBufferStream, length: number): string {
        return stream.readAsciiString(length);
    }

    override applyFormatting(value: DicomValue): string {
        return rtrim(value as string);
    }

    override checkLength(value: string): boolean {
        if (typeof value === "string" || Object.prototype.toString.call(value) === "[object String]") {
            const isRangeQuery = value.includes("-");
            return value.length <= (isRangeQuery ? this.rangeMatchingMaxLength : this.maxLength!);
        }
        return true;
    }
}

class UnlimitedCharacters extends EncodedStringRepresentation {
    constructor() {
        super("UC");
        this.maxLength = null;
        this.multi = true;
        this.padByte = PADDING_SPACE;
    }

    override readBytes(stream: ReadBufferStream, length: number): string {
        return stream.readEncodedString(length);
    }

    override applyFormatting(value: DicomValue): string {
        return rtrim(value as string);
    }
}

class UnlimitedText extends EncodedStringRepresentation {
    constructor() {
        super("UT");
        this.maxLength = null;
        this.padByte = PADDING_SPACE;
    }

    override readBytes(stream: ReadBufferStream, length: number): string {
        return stream.readEncodedString(length);
    }

    override applyFormatting(value: DicomValue): string {
        return rtrim(value as string);
    }
}

class UnsignedShort extends ValueRepresentation {
    constructor() {
        super("US");
        this.maxLength = 2;
        this.padByte = PADDING_NULL;
        this.fixed = true;
        this.defaultValue = 0;
    }

    override readBytes(stream: ReadBufferStream): number {
        return stream.readUint16();
    }

    writeBytes(stream: WriteBufferStream, value: number | number[] | null, writeOptions?: WriteOptions): number {
        return this._writeBytes(stream, value, this.write(stream, "Uint16", value), writeOptions);
    }
}

class UnsignedLong extends ValueRepresentation {
    constructor() {
        super("UL");
        this.maxLength = 4;
        this.padByte = PADDING_NULL;
        this.fixed = true;
        this.defaultValue = 0;
    }

    override readBytes(stream: ReadBufferStream): number {
        return stream.readUint32();
    }

    writeBytes(stream: WriteBufferStream, value: number | number[] | null, writeOptions?: WriteOptions): number {
        return this._writeBytes(stream, value, this.write(stream, "Uint32", value), writeOptions);
    }
}

class UniqueIdentifier extends AsciiStringRepresentation {
    constructor() {
        super("UI");
        this.maxLength = 64;
        this.padByte = PADDING_NULL;
    }

    override readBytes(stream: ReadBufferStream, length: number): string | string[] {
        const result = this.readPaddedAsciiString(stream, length);

        const BACKSLASH = String.fromCharCode(VM_DELIMITER);

        // Treat backslashes as a delimiter for multiple UIDs, in which case an
        // array of UIDs is returned. This is used by DICOM Q&R to support
        // querying and matching multiple items on a UID field in a single
        // query. For more details see:
        //
        // https://dicom.nema.org/medical/dicom/current/output/chtml/part04/sect_C.2.2.2.2.html
        // https://dicom.nema.org/medical/dicom/current/output/chtml/part05/sect_6.4.html

        if (result.indexOf(BACKSLASH) === -1) {
            return result;
        } else {
            return this.dropPadByte(result.split(BACKSLASH));
        }
    }

    override applyFormatting(value: DicomValue): string | string[] {
        const removeInvalidUidChars = (uidStr: string): string => {
            return uidStr.replace(/[^0-9.]/g, "");
        };

        if (Array.isArray(value)) {
            return (value as string[]).map(removeInvalidUidChars);
        }

        return removeInvalidUidChars(value as string);
    }
}

class UniversalResource extends AsciiStringRepresentation {
    constructor() {
        super("UR");
        this.maxLength = null;
        this.padByte = PADDING_SPACE;
    }

    override readBytes(stream: ReadBufferStream, length: number): string {
        return stream.readAsciiString(length);
    }
}

class UnknownValue extends BinaryRepresentation {
    constructor() {
        super("UN");
        this.maxLength = null;
        this.padByte = PADDING_NULL;
        this.noMultiple = true;
    }
}

class ParsedUnknownValue extends BinaryRepresentation {
    constructor(vr: VRType) {
        super(vr);
        this.maxLength = null;
        this.padByte = 0;
        this.noMultiple = true;
        this._isBinary = true;
        this._allowMultiple = false;
        this._isLength32 = true;
        this._storeRaw = true;
    }

    override read(
        stream: ReadBufferStream,
        length: number,
        syntax: TransferSyntax,
        readOptions?: ReadOptions
    ): ReadResult<DicomValue> {
        const arrayBuffer = this.readBytes(stream, length)[0] as ArrayBuffer;
        const streamFromBuffer = new ReadBufferStream(arrayBuffer, true);
        const vr = ValueRepresentation.createByTypeString(this.type);

        if (vr.isBinary() && vr.maxLength && length > vr.maxLength && !vr.noMultiple) {
            const values: DicomValue[] = [];
            const rawValues: DicomValue[] = [];
            const times = length / vr.maxLength;
            let i = 0;

            while (i++ < times) {
                const { rawValue, value } = vr.read(streamFromBuffer, vr.maxLength, syntax, readOptions);
                rawValues.push(rawValue);
                values.push(value);
            }
            return { rawValue: rawValues as DicomValue, value: values as DicomValue };
        } else {
            return vr.read(streamFromBuffer, length, syntax, readOptions);
        }
    }
}

class OtherWordString extends BinaryRepresentation {
    constructor() {
        super("OW");
        this.maxLength = null;
        this.padByte = PADDING_NULL;
        this.noMultiple = true;
    }
}

class OtherByteString extends BinaryRepresentation {
    constructor() {
        super("OB");
        this.maxLength = null;
        this.padByte = PADDING_NULL;
        this.noMultiple = true;
    }
}

class OtherDoubleString extends BinaryRepresentation {
    constructor() {
        super("OD");
        this.maxLength = null;
        this.padByte = PADDING_NULL;
        this.noMultiple = true;
    }
}

class OtherFloatString extends BinaryRepresentation {
    constructor() {
        super("OF");
        this.maxLength = null;
        this.padByte = PADDING_NULL;
        this.noMultiple = true;
    }
}

// Interface for VR instances with flexible writeBytes signature
interface VRInstance extends ValueRepresentation {
    writeBytes(stream: WriteBufferStream, ...args: unknown[]): number;
}

// these VR instances are precreate and are reused for each requested vr/tag
const VRinstances: Record<string, VRInstance> = {
    AE: new ApplicationEntity(),
    AS: new AgeString(),
    AT: new AttributeTag(),
    CS: new CodeString(),
    DA: new DateValue(),
    DS: new DecimalString(),
    DT: new DateTime(),
    FL: new FloatingPointSingle(),
    FD: new FloatingPointDouble(),
    IS: new IntegerString(),
    LO: new LongString(),
    LT: new LongText(),
    OB: new OtherByteString(),
    OD: new OtherDoubleString(),
    OF: new OtherFloatString(),
    OW: new OtherWordString(),
    PN: new PersonName(),
    SH: new ShortString(),
    SL: new SignedLong(),
    SQ: new SequenceOfItems(),
    SS: new SignedShort(),
    ST: new ShortText(),
    TM: new TimeValue(),
    UC: new UnlimitedCharacters(),
    UI: new UniqueIdentifier(),
    UL: new UnsignedLong(),
    UN: new UnknownValue(),
    UR: new UniversalResource(),
    US: new UnsignedShort(),
    UT: new UnlimitedText()
};

export { ValueRepresentation };
export type {
    VRType,
    TransferSyntax,
    ReadOptions,
    WriteOptions,
    ReadResult,
    DicomTag,
    DicomDataset,
    DicomValue,
    BinaryData,
    PersonNameValue,
    TagInterface,
    TagConstructor,
    DicomMessageInterface
};
