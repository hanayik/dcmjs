import pako from "pako";
import SplitDataView from "./SplitDataView";

/**
 * Options for BufferStream constructor
 */
interface BufferStreamOptions {
    littleEndian?: boolean;
    defaultSize?: number;
}

/**
 * Options for ReadBufferStream constructor
 */
interface ReadBufferStreamOptions {
    start?: number | null;
    stop?: number | null;
    noCopy?: boolean;
}

/**
 * Type for values that can be converted to int
 */
type IntConvertible = number | string;

/**
 * Type for values that can be converted to float
 */
type FloatConvertible = number | string;

/**
 * Type for buffer inputs
 */
type BufferInput = ArrayBufferLike | ArrayBufferView | BufferStream | null | undefined;

function toInt(val: IntConvertible): number {
    if (Number.isNaN(val)) {
        throw new Error(`Not a number: ${val}`);
    } else if (typeof val === "string") {
        return parseInt(val, 10);
    } else return val;
}

function toFloat(val: FloatConvertible): number {
    if (typeof val === "string") {
        return parseFloat(val);
    } else return val;
}

class BufferStream {
    offset: number = 0;
    startOffset: number = 0;
    isLittleEndian: boolean = false;
    size: number = 0;
    view: SplitDataView = new SplitDataView();
    encoder: TextEncoder = new TextEncoder();

    // These are defined in subclasses but accessed in base class methods
    noCopy?: boolean;
    decoder?: TextDecoder;
    endOffset?: number;

    constructor(options: BufferStreamOptions | null = null) {
        this.isLittleEndian = options?.littleEndian || this.isLittleEndian;
        this.view.defaultSize = options?.defaultSize ?? this.view.defaultSize;
    }

    setEndian(isLittle: boolean): void {
        this.isLittleEndian = isLittle;
    }

    slice(start: number = this.startOffset, end: number = this.endOffset ?? this.size): ArrayBufferLike | undefined {
        return this.view.slice(start, end);
    }

    getBuffer(start: number = 0, end: number = this.size): Uint8Array | ArrayBufferLike | undefined {
        if (this.noCopy) {
            const sliced = this.slice(start, end);
            return sliced ? new Uint8Array(sliced) : undefined;
        }

        return this.slice(start, end);
    }

    get buffer(): Uint8Array | ArrayBufferLike | undefined {
        // console.warn("Deprecated buffer get");
        return this.getBuffer();
    }

    get available(): number {
        return (this.endOffset ?? this.size) - this.offset;
    }

    writeUint8(value: IntConvertible): number {
        this.checkSize(1);
        this.view.setUint8(this.offset, toInt(value));
        return this.increment(1);
    }

    writeUint8Repeat(value: IntConvertible, count: number): number {
        const v = toInt(value);
        this.checkSize(count);
        for (let i = 0; i < count; i++) {
            this.view.setUint8(this.offset + i, v);
        }
        return this.increment(count);
    }

    writeInt8(value: IntConvertible): number {
        this.checkSize(1);
        this.view.setInt8(this.offset, toInt(value));
        return this.increment(1);
    }

    writeUint16(value: IntConvertible): number {
        this.checkSize(2);
        this.view.setUint16(this.offset, toInt(value), this.isLittleEndian);
        return this.increment(2);
    }

    writeTwoUint16s(value: number): number {
        this.checkSize(4);
        const first = value >> 16;
        const second = value & 0xffff;
        this.view.setUint16(this.offset, toInt(first), this.isLittleEndian);
        this.view.setUint16(this.offset + 2, toInt(second), this.isLittleEndian);
        return this.increment(4);
    }

    writeInt16(value: IntConvertible): number {
        this.checkSize(2);
        this.view.setInt16(this.offset, toInt(value), this.isLittleEndian);
        return this.increment(2);
    }

    writeUint32(value: IntConvertible): number {
        this.checkSize(4);
        this.view.setUint32(this.offset, toInt(value), this.isLittleEndian);
        return this.increment(4);
    }

    writeInt32(value: IntConvertible): number {
        this.checkSize(4);
        this.view.setInt32(this.offset, toInt(value), this.isLittleEndian);
        return this.increment(4);
    }

    writeFloat(value: FloatConvertible): number {
        this.checkSize(4);
        this.view.setFloat32(this.offset, toFloat(value), this.isLittleEndian);
        return this.increment(4);
    }

    writeDouble(value: FloatConvertible): number {
        this.checkSize(8);
        this.view.setFloat64(this.offset, toFloat(value), this.isLittleEndian);
        return this.increment(8);
    }

    writeUTF8String(value: string): number {
        const encodedString = this.encoder.encode(value);
        this.checkSize(encodedString.byteLength);
        this.view.writeBuffer(encodedString, this.offset);
        return this.increment(encodedString.byteLength);
    }

    writeAsciiString(value: string | null | undefined): number {
        const str = value || "";
        const len = str.length;
        this.checkSize(len);
        const startOffset = this.offset;
        for (let i = 0; i < len; i++) {
            const charCode = str.charCodeAt(i);
            this.view.setUint8(startOffset + i, charCode);
        }
        return this.increment(len);
    }

    readUint32(): number {
        const val = this.view.getUint32(this.offset, this.isLittleEndian);
        this.increment(4);
        return val;
    }

    readUint16(): number {
        const val = this.view.getUint16(this.offset, this.isLittleEndian);
        this.increment(2);
        return val;
    }

    readUint8(): number {
        const val = this.view.getUint8(this.offset);
        this.increment(1);
        return val;
    }

    peekUint8(offset: number): number {
        return this.view.getUint8(this.offset + offset);
    }

    readUint8Array(length: number): Uint8Array {
        const sliced = this.view.slice(this.offset, this.offset + length);
        const arr = new Uint8Array(sliced!);
        this.increment(length);
        return arr;
    }

    readUint16Array(length: number): Uint16Array {
        const sixlen = length / 2;
        const arr = new Uint16Array(sixlen);
        let i = 0;
        while (i++ < sixlen) {
            arr[i] = this.view.getUint16(this.offset, this.isLittleEndian);
            this.offset += 2;
        }
        return arr;
    }

    readInt8(): number {
        const val = this.view.getInt8(this.offset);
        this.increment(1);
        return val;
    }

    readInt16(): number {
        const val = this.view.getInt16(this.offset, this.isLittleEndian);
        this.increment(2);
        return val;
    }

    readInt32(): number {
        const val = this.view.getInt32(this.offset, this.isLittleEndian);
        this.increment(4);
        return val;
    }

    readFloat(): number {
        const val = this.view.getFloat32(this.offset, this.isLittleEndian);
        this.increment(4);
        return val;
    }

    readDouble(): number {
        const val = this.view.getFloat64(this.offset, this.isLittleEndian);
        this.increment(8);
        return val;
    }

    readAsciiString(length: number): string {
        let result = "";
        const start = this.offset;
        let end = this.offset + length;
        if (end >= this.view.byteLength) {
            end = this.view.byteLength;
        }
        for (let i = start; i < end; ++i) {
            result += String.fromCharCode(this.view.getUint8(i));
        }
        this.increment(end - start);
        return result;
    }

    readVR(): string {
        const vr =
            String.fromCharCode(this.view.getUint8(this.offset)) +
            String.fromCharCode(this.view.getUint8(this.offset + 1));
        this.increment(2);
        return vr;
    }

    readEncodedString(length: number): string {
        let len = length;
        if (this.offset + len >= this.view.byteLength) {
            len = this.view.byteLength - this.offset;
        }
        const sliced = this.slice(this.offset, this.offset + len);
        const view = new DataView(sliced!);
        const result = this.decoder!.decode(view);
        this.increment(len);
        return result;
    }

    readHex(length: number): string {
        let hexString = "";
        for (let i = 0; i < length; i++) {
            hexString += this.readUint8().toString(16);
        }
        return hexString;
    }

    checkSize(step: number): void {
        this.view.checkSize(this.offset + step);
    }

    /**
     * Concatenates the stream, starting from the startOffset (to allow concat
     * on an existing output from the beginning)
     */
    concat(stream: BufferStream): number | undefined {
        this.view.checkSize(this.size + stream.size - stream.startOffset);
        const sliced = stream.slice(stream.startOffset, stream.size);
        this.view.writeBuffer(new Uint8Array(sliced!), this.offset);
        this.offset += stream.size;
        this.size = this.offset;
        return (this.view as { availableSize?: number }).availableSize;
    }

    increment(step: number): number {
        this.offset += step;
        if (this.offset > this.size) {
            this.size = this.offset;
        }
        return step;
    }

    /**
     * Adds the buffer to the end of the current buffers list,
     * updating the size etc.
     *
     * @param buffer - The buffer to add
     * @param options - Options for adding the buffer
     */
    addBuffer(
        buffer: ArrayBufferLike | ArrayBufferView,
        options: { start?: number; end?: number; transfer?: boolean } | null = null
    ): number {
        this.view.addBuffer(buffer, options);
        this.size = this.view.size;
        return this.size;
    }

    more(length: number): ReadBufferStream {
        const endOff = this.endOffset ?? this.size;
        if (this.offset + length > endOff) {
            throw new Error("Request more than currently allocated buffer");
        }

        // Optimize the more implementation to choose between a slice and
        // a sub-string reference to the original set of views.
        // const newBuf = new ReadBufferStream(this.buffer, null, {
        //   start: this.offset,
        //   stop: this.offset + length
        // });
        const sliced = this.slice(this.offset, this.offset + length);
        const newBuf = new ReadBufferStream(sliced, undefined);
        this.increment(length);

        return newBuf;
    }

    reset(): this {
        this.offset = 0;
        return this;
    }

    end(): boolean {
        return this.offset >= this.view.byteLength;
    }

    toEnd(): void {
        this.offset = this.view.byteLength;
    }
}

class ReadBufferStream extends BufferStream {
    declare noCopy: boolean;
    declare decoder: TextDecoder;
    declare endOffset: number;

    constructor(
        buffer: BufferInput,
        littleEndian?: boolean,
        options: ReadBufferStreamOptions = {
            start: null,
            stop: null,
            noCopy: false
        }
    ) {
        super({ littleEndian });
        this.noCopy = options.noCopy ?? false;
        this.decoder = new TextDecoder("latin1");

        if (buffer instanceof BufferStream) {
            this.view.from(buffer.view, options);
        } else if (buffer) {
            this.view.addBuffer(buffer);
        }

        const bufferWithOffset = buffer as { offset?: number; size?: number; byteLength?: number } | null;
        this.offset = options.start ?? bufferWithOffset?.offset ?? 0;
        this.size = options.stop || bufferWithOffset?.size || bufferWithOffset?.byteLength || 0;

        this.startOffset = this.offset;
        this.endOffset = this.size;
    }

    setDecoder(decoder: TextDecoder): void {
        this.decoder = decoder;
    }

    override reset(): this {
        this.offset = this.startOffset;
        return this;
    }

    override end(): boolean {
        return this.offset >= this.endOffset;
    }

    override toEnd(): void {
        this.offset = this.endOffset;
    }

    override writeUint8(_value: IntConvertible): never {
        throw new Error("writeUint8 not implemented");
    }

    override writeUint8Repeat(_value: IntConvertible, _count: number): never {
        throw new Error("writeUint8Repeat not implemented");
    }

    override writeInt8(_value: IntConvertible): never {
        throw new Error("writeInt8 not implemented");
    }

    override writeUint16(_value: IntConvertible): never {
        throw new Error("writeUint16 not implemented");
    }

    override writeTwoUint16s(_value: number): never {
        throw new Error("writeTwoUint16s not implemented");
    }

    override writeInt16(_value: IntConvertible): never {
        throw new Error("writeInt16 not implemented");
    }

    override writeUint32(_value: IntConvertible): never {
        throw new Error("writeUint32 not implemented");
    }

    override writeInt32(_value: IntConvertible): never {
        throw new Error("writeInt32 not implemented");
    }

    override writeFloat(_value: FloatConvertible): never {
        throw new Error("writeFloat not implemented");
    }

    override writeDouble(_value: FloatConvertible): never {
        throw new Error("writeDouble not implemented");
    }

    override writeAsciiString(_value: string | null | undefined): never {
        throw new Error("writeAsciiString not implemented");
    }

    override writeUTF8String(_value: string): never {
        throw new Error("writeUTF8String not implemented");
    }

    override checkSize(_step: number): never {
        throw new Error("checkSize not implemented");
    }

    override concat(_stream: BufferStream): never {
        throw new Error("concat not implemented");
    }
}

interface DeflatedStreamInput {
    getBuffer(start: number, end: number): Uint8Array | ArrayBufferLike | undefined;
    offset: number;
    size: number;
    littleEndian?: boolean;
    isLittleEndian?: boolean;
}

class DeflatedReadBufferStream extends ReadBufferStream {
    constructor(stream: DeflatedStreamInput, options?: ReadBufferStreamOptions) {
        const buffer = stream.getBuffer(stream.offset, stream.size);
        const inflatedBuffer = pako.inflateRaw(buffer as Uint8Array);
        super(inflatedBuffer.buffer, stream.littleEndian ?? stream.isLittleEndian, options);
    }
}

class WriteBufferStream extends BufferStream {
    constructor(defaultSize?: number, littleEndian?: boolean) {
        super({ defaultSize, littleEndian });
        this.size = 0;
    }
}

export { ReadBufferStream };
export { DeflatedReadBufferStream };
export { WriteBufferStream };
export { BufferStream };
export type { BufferStreamOptions, ReadBufferStreamOptions, BufferInput };
