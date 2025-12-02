import { WriteBufferStream } from "./BufferStream";
import {
    ValueRepresentation,
    type VRType,
    type WriteOptions,
    type DicomValue,
    type DicomDataset
} from "./ValueRepresentation";

const EXPLICIT_LITTLE_ENDIAN = "1.2.840.10008.1.2.1";

/** DICOM tag object with vr and Value properties */
interface DicomTagEntry {
    vr: VRType;
    Value?: DicomValue;
    _rawValue?: DicomValue;
}

/** Interface for DicomMessage class methods needed by DicomDict */
interface DicomMessageClass {
    write(
        dataset: DicomDataset,
        stream: WriteBufferStream,
        syntax: string,
        writeOptions?: WriteOptions
    ): number;
    writeTagObject(
        stream: WriteBufferStream,
        tagString: string,
        vr: VRType,
        values: DicomValue,
        syntax: string,
        writeOptions?: WriteOptions
    ): number;
}

let DicomMessage: DicomMessageClass | undefined;

class DicomDict {
    meta: DicomDataset;
    dict: DicomDataset;

    constructor(meta: DicomDataset) {
        this.meta = meta;
        this.dict = {};
    }

    upsertTag(tag: string, vr: VRType, values: DicomValue): void {
        const dictEntry = this.dict[tag] as DicomTagEntry | undefined;
        if (dictEntry) {
            // Should already have tag accessors.
            dictEntry.Value = values;
        } else {
            const newEntry = ValueRepresentation.addTagAccessors({ vr: vr }) as DicomTagEntry;
            newEntry.Value = values;
            this.dict[tag] = newEntry;
        }
    }

    write(writeOptions: WriteOptions = { allowInvalidVRLength: false }): ArrayBufferLike | Uint8Array | undefined {
        const metaSyntax = EXPLICIT_LITTLE_ENDIAN;
        const fileStream = new WriteBufferStream(4096, true);
        fileStream.writeUint8Repeat(0, 128);
        fileStream.writeAsciiString("DICM");

        const metaStream = new WriteBufferStream(1024);
        const transferSyntaxTag = this.meta["00020010"] as DicomTagEntry | undefined;
        if (!transferSyntaxTag) {
            this.meta["00020010"] = {
                vr: "UI",
                Value: [EXPLICIT_LITTLE_ENDIAN]
            };
        }
        DicomMessage!.write(this.meta, metaStream, metaSyntax, writeOptions);
        DicomMessage!.writeTagObject(fileStream, "00020000", "UL", metaStream.size, metaSyntax, writeOptions);
        fileStream.concat(metaStream);

        const transferSyntaxEntry = this.meta["00020010"] as DicomTagEntry;
        const useSyntax = (transferSyntaxEntry.Value as string[])[0];
        DicomMessage!.write(this.dict, fileStream, useSyntax, writeOptions);
        return fileStream.getBuffer();
    }

    /** Helper method to avoid circular dependencies */
    static setDicomMessageClass(dicomMessageClass: DicomMessageClass): void {
        DicomMessage = dicomMessageClass;
    }
}

export { DicomDict };
export type { DicomDataset, DicomTagEntry, DicomMessageClass };
