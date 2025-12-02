import { ReadBufferStream, WriteBufferStream } from "./BufferStream";
import {
    EXPLICIT_LITTLE_ENDIAN,
    IMPLICIT_LITTLE_ENDIAN,
    SEQUENCE_DELIMITER_TAG,
    SEQUENCE_ITEM_TAG
} from "./constants/dicom";
import {
    ValueRepresentation,
    type DicomValue,
    type TransferSyntax,
    type VRType,
    type WriteOptions
} from "./ValueRepresentation";

function paddingLeft(paddingValue: string, string: string): string {
    return String(paddingValue + string).slice(-paddingValue.length);
}

/** Interface for DicomMessage class methods used by Tag */
interface DicomMessageClass {
    _normalizeSyntax(syntax: TransferSyntax): TransferSyntax;
    isEncapsulated(syntax: TransferSyntax): boolean;
}

let DicomMessage: DicomMessageClass | undefined;

class Tag {
    value: number;

    constructor(value: number) {
        this.value = value;
    }

    /** Helper method to avoid circular dependencies */
    static setDicomMessageClass(dicomMessageClass: DicomMessageClass): void {
        DicomMessage = dicomMessageClass;
    }

    toString(): string {
        return (
            "(" +
            paddingLeft("0000", this.group().toString(16).toUpperCase()) +
            "," +
            paddingLeft("0000", this.element().toString(16).toUpperCase()) +
            ")"
        );
    }

    toCleanString(): string {
        return (
            paddingLeft("0000", this.group().toString(16).toUpperCase()) +
            paddingLeft("0000", this.element().toString(16).toUpperCase())
        );
    }

    is(t: number): boolean {
        return this.value === t;
    }

    /**
     * @returns true if the tag is an Item or Delimiter instruction
     */
    isInstruction(): boolean {
        return this.group() === 0xfffe;
    }

    group(): number {
        return this.value >>> 16;
    }

    element(): number {
        return this.value & 0xffff;
    }

    isPixelDataTag(): boolean {
        return this.is(0x7fe00010);
    }

    isPrivateCreator(): boolean {
        const group = this.group();
        const element = this.element();
        return group % 2 === 1 && element < 0x100 && element > 0x00;
    }

    isMetaInformation(): boolean {
        return this.group() < 0x0008;
    }

    isPrivateValue(): boolean {
        const group = this.group();
        const element = this.element();
        return group % 2 === 1 && element > 0x100;
    }

    static fromString(str: string): Tag {
        const group = parseInt(str.substring(0, 4), 16);
        const element = parseInt(str.substring(4), 16);
        return Tag.fromNumbers(group, element);
    }

    static fromPString(str: string): Tag {
        const group = parseInt(str.substring(1, 5), 16);
        const element = parseInt(str.substring(6, 10), 16);
        return Tag.fromNumbers(group, element);
    }

    static fromNumbers(group: number, element: number): Tag {
        return new Tag(((group << 16) | element) >>> 0);
    }

    static readTag(stream: ReadBufferStream): Tag {
        const group = stream.readUint16();
        const element = stream.readUint16();
        return Tag.fromNumbers(group, element);
    }

    /**
     * Reads the stream looking for the sequence item tags, returning them
     * as a buffer, and returning null on sequence delimiter tag.
     */
    static getNextSequenceItemData(stream: ReadBufferStream): Uint8Array | ArrayBufferLike | null | undefined {
        const nextTag = Tag.readTag(stream);
        if (nextTag.is(SEQUENCE_ITEM_TAG)) {
            const itemLength = stream.readUint32();
            const buffer = stream.getBuffer(stream.offset, stream.offset + itemLength);
            stream.increment(itemLength);
            return buffer;
        } else if (nextTag.is(SEQUENCE_DELIMITER_TAG)) {
            // Read SequenceDelimiterItem value for the SequenceDelimiterTag
            if (stream.readUint32() !== 0) {
                throw Error("SequenceDelimiterItem tag value was not zero");
            }
            return null;
        }

        throw Error("Invalid tag in sequence");
    }

    write(
        stream: WriteBufferStream,
        vrType: VRType,
        values: DicomValue,
        syntax: TransferSyntax,
        writeOptions?: WriteOptions
    ): number {
        const vr = ValueRepresentation.createByTypeString(vrType);
        const useSyntax = DicomMessage!._normalizeSyntax(syntax);

        const implicit = useSyntax === IMPLICIT_LITTLE_ENDIAN;
        const isLittleEndian = useSyntax === IMPLICIT_LITTLE_ENDIAN || useSyntax === EXPLICIT_LITTLE_ENDIAN;
        const isEncapsulated = this.isPixelDataTag() && DicomMessage!.isEncapsulated(syntax);

        const oldEndian = stream.isLittleEndian;
        stream.setEndian(isLittleEndian);

        stream.writeUint16(this.group());
        stream.writeUint16(this.element());

        const tagStream = new WriteBufferStream(256);
        let valueLength: number;
        tagStream.setEndian(isLittleEndian);

        // VR subclasses have different writeBytes signatures - use polymorphic call
        const vrWithWriteBytes = vr as unknown as {
            writeBytes(stream: WriteBufferStream, value: DicomValue, ...args: (TransferSyntax | boolean | WriteOptions | undefined)[]): number;
        };

        if (vrType === "OW" || vrType === "OB" || vrType === "UN") {
            valueLength = vrWithWriteBytes.writeBytes(tagStream, values, useSyntax, isEncapsulated, writeOptions);
        } else if (vrType === "SQ") {
            valueLength = vrWithWriteBytes.writeBytes(tagStream, values, useSyntax, writeOptions);
        } else {
            valueLength = vrWithWriteBytes.writeBytes(tagStream, values, writeOptions);
        }

        if (vrType === "SQ") {
            valueLength = 0xffffffff;
        }
        let written = tagStream.size + 4;

        if (implicit) {
            stream.writeUint32(valueLength);
            written += 4;
        } else {
            // Big 16 length objects are encodings for values larger than
            // 16 bit lengths which would normally use a 16 bit length field.
            // This uses a VR=UN instead of the original VR, and a 32 bit length
            const isBig16Length = !vr.isLength32() && valueLength >= 0x10000 && valueLength !== 0xffffffff;
            if (vr.isLength32() || isBig16Length) {
                // Write as vr UN for big values
                stream.writeAsciiString(isBig16Length ? "UN" : vr.type);
                stream.writeUint16(0);
                stream.writeUint32(valueLength);
                written += 8;
            } else {
                stream.writeAsciiString(vr.type);
                stream.writeUint16(valueLength);
                written += 4;
            }
        }

        stream.concat(tagStream);

        stream.setEndian(oldEndian);

        return written;
    }
}

export { Tag };
