/**
 * Options for constructing a SplitDataView
 */
interface SplitDataViewOptions {
    defaultSize?: number;
}

/**
 * Options for adding a buffer
 */
interface AddBufferOptions {
    /** The start offset of the new buffer to use */
    start?: number;
    /** The end offset of the buffer to use */
    end?: number;
    /** Whether to transfer the buffer to be owned */
    transfer?: boolean;
}

/**
 * Result from findView when the view is within a single buffer
 */
interface FindViewResultSingle {
    view: DataView;
    viewOffset: number;
    index: number;
    writeCommit?: undefined;
}

/**
 * Result from findView when a new temporary view is created
 */
interface FindViewResultCommit {
    view: DataView;
    viewOffset: number;
    index?: undefined;
    writeCommit: true;
}

type FindViewResult = FindViewResultSingle | FindViewResultCommit;

/**
 * This is a data view which is split across multiple pieces, and maintains
 * a running size, with nullable chunks.
 */
export default class SplitDataView {
    buffers: ArrayBufferLike[] = [];
    views: DataView[] = [];
    offsets: number[] = [];
    size: number = 0;
    byteLength: number = 0;

    /** The default size is 256k */
    defaultSize: number = 256 * 1024;

    constructor(options: SplitDataViewOptions = { defaultSize: 256 * 1024 }) {
        this.defaultSize = options.defaultSize || this.defaultSize;
    }

    checkSize(end: number): void {
        while (end > this.byteLength) {
            const buffer = new ArrayBuffer(this.defaultSize);
            this.buffers.push(buffer);
            this.views.push(new DataView(buffer));
            this.offsets.push(this.byteLength);

            this.byteLength += buffer.byteLength;
        }
    }

    /**
     * Adds the buffer to the end of the current buffers list,
     * updating the size etc.
     *
     * @param buffer - The buffer or typed array to add
     * @param options - Options for adding the buffer
     */
    addBuffer(buffer: ArrayBufferLike | ArrayBufferView, options: AddBufferOptions | null = null): void {
        const arrayBuffer: ArrayBufferLike =
            buffer instanceof ArrayBuffer || buffer instanceof SharedArrayBuffer ? buffer : buffer.buffer;
        const start = options?.start || 0;
        const end = options?.end || arrayBuffer.byteLength;
        const transfer = options?.transfer;
        if (start === end) {
            return;
        }
        const addBuffer = transfer ? arrayBuffer : arrayBuffer.slice(start, end);
        const lastOffset = this.offsets.length ? this.offsets[this.offsets.length - 1] : 0;
        const lastLength = this.buffers.length ? (this.buffers[this.buffers.length - 1]?.byteLength ?? 0) : 0;
        this.buffers.push(addBuffer);
        this.views.push(new DataView(addBuffer));
        this.offsets.push(lastOffset + lastLength);
        this.size += addBuffer.byteLength;
        this.byteLength += addBuffer.byteLength;
    }

    /** Copies one view contents into this one as a mirror */
    from(view: SplitDataView, _options?: unknown): void {
        this.size = view.size;
        this.byteLength = view.byteLength;
        this.offsets.push(...view.offsets);
        this.buffers.push(...view.buffers);
        this.views.push(...view.views);
        // TODO - use the options to skip copying irrelevant data
    }

    slice(start: number = 0, end: number = this.size): ArrayBufferLike | undefined {
        if (start === end) {
            return new Uint8Array(0).buffer;
        }
        let index = this.findStart(start);
        if (index === undefined) {
            throw new Error(`Start ${start} out of range of 0...${this.byteLength}`);
        }
        let buffer = this.buffers[index];
        if (!buffer) {
            console.error("Buffer should be defined here");
            return;
        }
        let offset = this.offsets[index];
        let length = buffer.byteLength;
        if (end < offset + length) {
            return buffer.slice(start - offset, end - offset);
        }
        const createBuffer = new Uint8Array(end - start);
        let offsetStart = 0;
        while (start + offsetStart < end && index < this.buffers.length) {
            buffer = this.buffers[index];
            length = buffer.byteLength;
            offset = this.offsets[index];

            const bufStart = start + offsetStart - offset;
            const addLength = Math.min(end - start - offsetStart, length - bufStart);
            createBuffer.set(new Uint8Array(buffer, bufStart, addLength), offsetStart);
            offsetStart += addLength;
            index++;
        }
        return createBuffer.buffer;
    }

    findStart(start: number = 0): number | undefined {
        for (let index = 0; index < this.buffers.length; index++) {
            if (start >= this.offsets[index] && start < this.offsets[index] + this.buffers[index].byteLength) {
                return index;
            }
        }
    }

    findView(start: number, length: number = 1): FindViewResult {
        const index = this.findStart(start);
        if (index === undefined) {
            // Handle edge case - create a new view for the requested range
            const newBuffer = this.slice(start, start + length);
            return {
                view: new DataView(newBuffer!),
                viewOffset: start,
                writeCommit: true
            };
        }
        const buffer = this.buffers[index];
        const viewOffset = this.offsets[index];
        const viewLength = buffer.byteLength;
        if (start + length - viewOffset <= viewLength) {
            return { view: this.views[index], viewOffset, index };
        }
        const newBuffer = this.slice(start, start + length);
        return {
            view: new DataView(newBuffer!),
            viewOffset: start,
            writeCommit: true
        };
    }

    writeCommit(view: DataView, start: number): void {
        this.writeBuffer(view.buffer, start);
    }

    writeBuffer(data: ArrayBufferLike | ArrayBufferView, start: number): void {
        let index = this.findStart(start);
        let offset = 0;
        const dataBuffer: ArrayBufferLike =
            data instanceof ArrayBuffer || data instanceof SharedArrayBuffer ? data : data.buffer;
        while (offset < dataBuffer.byteLength) {
            const buffer = this.buffers[index!];
            if (!buffer) {
                throw new Error(`Not enough space to write ${dataBuffer.byteLength}`);
            }
            const bufferOffset = this.offsets[index!];
            const startWrite = start + offset - bufferOffset;
            const writeLen = Math.min(buffer.byteLength - startWrite, dataBuffer.byteLength - offset);
            const byteBuffer = new Uint8Array(buffer, startWrite, writeLen);
            const setData = new Uint8Array(dataBuffer, offset, writeLen);
            byteBuffer.set(setData);
            offset += writeLen;
            index!++;
        }
    }

    getUint8(offset: number): number {
        const { view, viewOffset } = this.findView(offset, 1);
        return view.getUint8(offset - viewOffset);
    }

    getUint16(offset: number, isLittleEndian?: boolean): number {
        const { view, viewOffset } = this.findView(offset, 2);
        return view.getUint16(offset - viewOffset, isLittleEndian);
    }

    getUint32(offset: number, isLittleEndian?: boolean): number {
        const { view, viewOffset } = this.findView(offset, 4);
        return view.getUint32(offset - viewOffset, isLittleEndian);
    }

    getFloat32(offset: number, isLittleEndian?: boolean): number {
        const { view, viewOffset } = this.findView(offset, 4);
        return view.getFloat32(offset - viewOffset, isLittleEndian);
    }

    getFloat64(offset: number, isLittleEndian?: boolean): number {
        const { view, viewOffset } = this.findView(offset, 8);
        return view.getFloat64(offset - viewOffset, isLittleEndian);
    }

    getInt8(offset: number): number {
        const { view, viewOffset } = this.findView(offset, 1);
        return view.getInt8(offset - viewOffset);
    }

    getInt16(offset: number, isLittleEndian?: boolean): number {
        const { view, viewOffset } = this.findView(offset, 2);
        return view.getInt16(offset - viewOffset, isLittleEndian);
    }

    getInt32(offset: number, isLittleEndian?: boolean): number {
        const { view, viewOffset } = this.findView(offset, 4);
        return view.getInt32(offset - viewOffset, isLittleEndian);
    }

    setUint8(offset: number, value: number): void {
        const { view, viewOffset } = this.findView(offset, 1);
        view.setUint8(offset - viewOffset, value);
        // Commit is unneeded since 1 byte will always be available
    }

    setUint16(offset: number, value: number, isLittleEndian?: boolean): void {
        const { view, viewOffset, writeCommit } = this.findView(offset, 2);
        view.setUint16(offset - viewOffset, value, isLittleEndian);
        if (writeCommit) {
            this.writeCommit(view, offset);
        }
    }

    setUint32(offset: number, value: number, isLittleEndian?: boolean): void {
        const { view, viewOffset, writeCommit } = this.findView(offset, 4);
        view.setUint32(offset - viewOffset, value, isLittleEndian);
        if (writeCommit) {
            this.writeCommit(view, offset);
        }
    }

    setFloat32(offset: number, value: number, isLittleEndian?: boolean): void {
        const { view, viewOffset, writeCommit } = this.findView(offset, 4);
        view.setFloat32(offset - viewOffset, value, isLittleEndian);
        if (writeCommit) {
            this.writeCommit(view, offset);
        }
    }

    setFloat64(offset: number, value: number, isLittleEndian?: boolean): void {
        const { view, viewOffset, writeCommit } = this.findView(offset, 8);
        view.setFloat64(offset - viewOffset, value, isLittleEndian);
        if (writeCommit) {
            this.writeCommit(view, offset);
        }
    }

    setInt8(offset: number, value: number): void {
        const { view, viewOffset } = this.findView(offset, 1);
        view.setInt8(offset - viewOffset, value);
        // Commit is unneeded since 1 byte will always be available
    }

    setInt16(offset: number, value: number, isLittleEndian?: boolean): void {
        const { view, viewOffset, writeCommit } = this.findView(offset, 2);
        view.setInt16(offset - viewOffset, value, isLittleEndian);
        if (writeCommit) {
            this.writeCommit(view, offset);
        }
    }

    setInt32(offset: number, value: number, isLittleEndian?: boolean): void {
        const { view, viewOffset, writeCommit } = this.findView(offset, 4);
        view.setInt32(offset - viewOffset, value, isLittleEndian);
        if (writeCommit) {
            this.writeCommit(view, offset);
        }
    }
}
