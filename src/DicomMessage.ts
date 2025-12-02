import { DeflatedReadBufferStream, ReadBufferStream, WriteBufferStream } from "./BufferStream";
import {
    DEFLATED_EXPLICIT_LITTLE_ENDIAN,
    EXPLICIT_BIG_ENDIAN,
    EXPLICIT_LITTLE_ENDIAN,
    IMPLICIT_LITTLE_ENDIAN,
    VM_DELIMITER
} from "./constants/dicom";
import { DicomDict } from "./DicomDict";
import { DicomMetaDictionary, type DictionaryEntry } from "./DicomMetaDictionary";
import { Tag } from "./Tag";
import { log } from "./log";
import { deepEqual } from "./utilities/deepEqual";
import {
    ValueRepresentation,
    type VRType,
    type TransferSyntax,
    type WriteOptions,
    type DicomDataset,
    type DicomValue,
    type ReadOptions
} from "./ValueRepresentation";
import {
    DictCreator,
    type DictCreatorOptions,
    type ReadInfo,
    type VRObject,
    type DicomValue as DictCreatorDicomValue
} from "./DictCreator";

/** VR types that should be treated as single values (not split by delimiter) */
const singleVRs: readonly string[] = ["SQ", "OF", "OW", "OB", "UN", "LT"];

/** Mapping from DICOM character set names to JavaScript TextDecoder encoding names */
const encodingMapping: Readonly<Record<string, string>> = {
    "": "iso-8859-1",
    "iso-ir-6": "iso-8859-1",
    "iso-ir-13": "shift-jis",
    "iso-ir-100": "latin1",
    "iso-ir-101": "iso-8859-2",
    "iso-ir-109": "iso-8859-3",
    "iso-ir-110": "iso-8859-4",
    "iso-ir-126": "iso-ir-126",
    "iso-ir-127": "iso-ir-127",
    "iso-ir-138": "iso-ir-138",
    "iso-ir-144": "iso-ir-144",
    "iso-ir-148": "iso-ir-148",
    "iso-ir-166": "tis-620",
    "iso-2022-ir-6": "iso-8859-1",
    "iso-2022-ir-13": "shift-jis",
    "iso-2022-ir-87": "iso-2022-jp",
    "iso-2022-ir-100": "latin1",
    "iso-2022-ir-101": "iso-8859-2",
    "iso-2022-ir-109": "iso-8859-3",
    "iso-2022-ir-110": "iso-8859-4",
    "iso-2022-ir-126": "iso-ir-126",
    "iso-2022-ir-127": "iso-ir-127",
    "iso-2022-ir-138": "iso-ir-138",
    "iso-2022-ir-144": "iso-ir-144",
    "iso-2022-ir-148": "iso-ir-148",
    "iso-2022-ir-149": "euc-kr",
    "iso-2022-ir-159": "iso-2022-jp",
    "iso-2022-ir-166": "tis-620",
    "iso-2022-ir-58": "iso-ir-58",
    "iso-ir-192": "utf-8",
    gb18030: "gb18030",
    "iso-2022-gbk": "gbk",
    "iso-2022-58": "gb2312",
    gbk: "gbk"
};

/** Transfer syntax UIDs that use encapsulated pixel data */
const encapsulatedSyntaxes: readonly string[] = [
    "1.2.840.10008.1.2.4.50",
    "1.2.840.10008.1.2.4.51",
    "1.2.840.10008.1.2.4.57",
    "1.2.840.10008.1.2.4.70",
    "1.2.840.10008.1.2.4.80",
    "1.2.840.10008.1.2.4.81",
    "1.2.840.10008.1.2.4.90",
    "1.2.840.10008.1.2.4.91",
    "1.2.840.10008.1.2.4.92",
    "1.2.840.10008.1.2.4.93",
    "1.2.840.10008.1.2.4.94",
    "1.2.840.10008.1.2.4.95",
    "1.2.840.10008.1.2.5",
    "1.2.840.10008.1.2.6.1",
    "1.2.840.10008.1.2.4.100",
    "1.2.840.10008.1.2.4.102",
    "1.2.840.10008.1.2.4.103",
    "1.2.840.10008.1.2.4.201",
    "1.2.840.10008.1.2.4.202",
    "1.2.840.10008.1.2.4.203"
];

/** Options for reading DICOM data */
interface DicomReadOptions extends DictCreatorOptions {
    ignoreErrors?: boolean;
    untilTag?: string | null;
    includeUntilTagValue?: boolean;
    stopOnGreaterTag?: boolean;
    dictCreator?: DictCreator;
}

/** Options for reading DICOM files */
interface DicomFileReadOptions extends DicomReadOptions {
    noCopy?: boolean;
}

/** Tag header information from reading */
interface TagHeader {
    tag: Tag;
    vr: ValueRepresentation;
    length: number;
    oldEndian: boolean;
    retObj: TagReadResult;
    untilTag?: boolean;
    values?: number;
}

/** Result from reading a tag */
interface TagReadResult {
    tag: Tag;
    vr: ValueRepresentation;
    values?: DicomValue[];
    rawValues?: DicomValue[];
}

/** DICOM tag object with vr and Value */
interface DicomTagObject {
    vr: VRType;
    Value?: DicomValue;
    _rawValue?: DicomValue;
}

/** DICOM dictionary type mapping tag strings to tag objects */
type DicomDictionary = Record<string, DicomTagObject>;

class DicomMessage {
    /**
     * @deprecated DicomMessage.read to be deprecated after dcmjs 0.24.x
     */
    static read(
        bufferStream: ReadBufferStream,
        syntax: TransferSyntax,
        ignoreErrors: boolean,
        untilTag: string | null = null,
        includeUntilTagValue: boolean = false
    ): DicomDataset {
        log.warn("DicomMessage.read to be deprecated after dcmjs 0.24.x");
        return this._read(bufferStream, syntax, {
            ignoreErrors: ignoreErrors,
            untilTag: untilTag,
            includeUntilTagValue: includeUntilTagValue
        });
    }

    /**
     * @deprecated DicomMessage.readTag to be deprecated after dcmjs 0.24.x
     */
    static readTag(
        bufferStream: ReadBufferStream,
        syntax: TransferSyntax,
        untilTag: string | null = null,
        includeUntilTagValue: boolean = false
    ): TagReadResult | TagHeader | null | undefined {
        log.warn("DicomMessage.readTag to be deprecated after dcmjs 0.24.x");
        return this._readTag(bufferStream, syntax, {
            untilTag: untilTag,
            includeUntilTagValue: includeUntilTagValue
        });
    }

    static _read(
        bufferStream: ReadBufferStream,
        syntax: TransferSyntax,
        options: DicomReadOptions = {
            ignoreErrors: false,
            untilTag: null,
            includeUntilTagValue: false,
            stopOnGreaterTag: false
        }
    ): DicomDataset {
        let optionsWithCreator = options;
        if (!options.dictCreator) {
            optionsWithCreator = {
                ...options,
                dictCreator: new DictCreator(this, options)
            };
        }
        const { ignoreErrors, untilTag, stopOnGreaterTag, dictCreator } = optionsWithCreator;
        try {
            let previousTagOffset: number;
            while (!bufferStream.end()) {
                if (dictCreator!.continueParse(bufferStream)) {
                    continue;
                }
                previousTagOffset = bufferStream.offset;
                const header = this._readTagHeader(bufferStream, syntax, optionsWithCreator);
                if (!header) {
                    continue;
                }
                const handledByCreator =
                    !header.untilTag &&
                    dictCreator!.handleTagBody(
                        header as unknown as import("./DictCreator").TagHeader,
                        bufferStream,
                        syntax,
                        optionsWithCreator
                    );
                if (handledByCreator) {
                    continue;
                }
                const readInfo = header.untilTag
                    ? header
                    : this._readTagBody(header, bufferStream, syntax, optionsWithCreator);

                const cleanTagString = readInfo.tag.toCleanString();
                if (untilTag && stopOnGreaterTag && cleanTagString > untilTag) {
                    bufferStream.offset = previousTagOffset;
                    break;
                }
                // TODO - move this into DictCreator as a special handler
                if (cleanTagString === "00080005") {
                    const readResult = readInfo as TagReadResult;
                    if (readResult.values && readResult.values.length > 0) {
                        let coding = readResult.values[0] as string;
                        coding = coding.replace(/[_ ]/g, "-").toLowerCase();
                        if (coding in encodingMapping) {
                            coding = encodingMapping[coding];
                            bufferStream.setDecoder(new TextDecoder(coding));
                        } else if (ignoreErrors) {
                            log.warn(`Unsupported character set: ${coding}, using default character set`);
                        } else {
                            throw Error(`Unsupported character set: ${coding}`);
                        }
                    }
                    if (readResult.values && readResult.values.length > 1) {
                        if (ignoreErrors) {
                            log.warn(
                                "Using multiple character sets is not supported, proceeding with just the first character set",
                                readResult.values
                            );
                        } else {
                            throw Error(
                                `Using multiple character sets is not supported: ${(readResult.values as string[]).join(",")}`
                            );
                        }
                    }
                    readResult.values = ["ISO_IR 192"]; // change SpecificCharacterSet to UTF-8
                }

                if (header.untilTag) {
                    // For untilTag exit without value, set values to 0 as expected by original behavior
                    const untilTagInfo: ReadInfo = {
                        vr: { type: "UN" } as VRObject,
                        tag: readInfo.tag,
                        values: [0] as DictCreatorDicomValue[]
                    };
                    dictCreator!.setValue(cleanTagString, untilTagInfo);
                } else {
                    const readInfoForCreator: ReadInfo = {
                        vr: (readInfo as TagReadResult).vr as unknown as VRObject,
                        tag: readInfo.tag,
                        values: (readInfo as TagReadResult).values as DictCreatorDicomValue[],
                        rawValues: (readInfo as TagReadResult).rawValues as DictCreatorDicomValue[]
                    };
                    dictCreator!.setValue(cleanTagString, readInfoForCreator);
                }
                if (untilTag && untilTag === cleanTagString) {
                    break;
                }
            }
            return dictCreator!.dict as DicomDataset;
        } catch (err) {
            if (ignoreErrors) {
                log.warn("WARN:", err);
                return dictCreator!.dict as DicomDataset;
            }
            throw err;
        }
    }

    static _normalizeSyntax(syntax: TransferSyntax): TransferSyntax {
        if (syntax == IMPLICIT_LITTLE_ENDIAN || syntax == EXPLICIT_LITTLE_ENDIAN || syntax == EXPLICIT_BIG_ENDIAN) {
            return syntax;
        } else {
            return EXPLICIT_LITTLE_ENDIAN;
        }
    }

    static isEncapsulated(syntax: TransferSyntax): boolean {
        return encapsulatedSyntaxes.indexOf(syntax) != -1;
    }

    /**
     * Reads a DICOM input stream from an array buffer.
     *
     * The options includes the specified options, but also creates
     * a DictCreator from the options.  See DictCreator.constructor
     */
    static readFile(
        buffer: ArrayBufferLike,
        options: DicomFileReadOptions = {
            ignoreErrors: false,
            untilTag: null,
            includeUntilTagValue: false,
            noCopy: false,
            forceStoreRaw: false
        }
    ): DicomDict {
        let stream: ReadBufferStream | DeflatedReadBufferStream = new ReadBufferStream(buffer, undefined, {
            noCopy: options.noCopy
        });
        const useSyntax: TransferSyntax = EXPLICIT_LITTLE_ENDIAN;
        stream.reset();
        stream.increment(128);
        if (stream.readAsciiString(4) !== "DICM") {
            throw new Error("Invalid DICOM file, expected header is missing");
        }

        // save position before reading first tag
        const metaStartPos = stream.offset;

        // read the first tag to check if it's the meta length tag
        const el = DicomMessage._readTag(stream, useSyntax);

        let metaHeader: DicomDataset;
        if (!el || el.tag.toCleanString() !== "00020000") {
            // meta length tag is missing
            if (!options.ignoreErrors) {
                throw new Error("Invalid DICOM file, meta length tag is malformed or not present.");
            }

            // reset stream to the position where we started reading tags
            stream.offset = metaStartPos;

            // read meta header elements sequentially
            metaHeader = DicomMessage._read(stream, useSyntax, {
                untilTag: "00030000",
                stopOnGreaterTag: true,
                ignoreErrors: true
            });
        } else {
            // meta length tag is present
            const elWithValues = el as TagReadResult;
            const metaLength = elWithValues.values![0] as number;

            // read header buffer using the specified meta length
            const metaStream = stream.more(metaLength);
            metaHeader = DicomMessage._read(metaStream, useSyntax, options);
        }

        //get the syntax
        const transferSyntaxElement = metaHeader["00020010"] as DicomTagObject | undefined;
        const transferSyntaxValue = transferSyntaxElement?.Value;
        let mainSyntax: TransferSyntax = (
            Array.isArray(transferSyntaxValue) ? transferSyntaxValue[0] : transferSyntaxValue
        ) as TransferSyntax;

        //in case of deflated dataset, decompress and continue
        if (mainSyntax === DEFLATED_EXPLICIT_LITTLE_ENDIAN) {
            stream = new DeflatedReadBufferStream(stream, {
                noCopy: options.noCopy
            });
        }

        mainSyntax = DicomMessage._normalizeSyntax(mainSyntax);
        const objects = DicomMessage._read(stream, mainSyntax, options);

        const dicomDict = new DicomDict(metaHeader);
        dicomDict.dict = objects;

        return dicomDict;
    }

    static writeTagObject(
        stream: WriteBufferStream,
        tagString: string,
        vr: VRType,
        values: DicomValue,
        syntax: TransferSyntax,
        writeOptions?: WriteOptions
    ): number {
        const tag = Tag.fromString(tagString);

        return tag.write(stream, vr, values, syntax, writeOptions);
    }

    static write(
        jsonObjects: DicomDictionary,
        useStream: WriteBufferStream,
        syntax: TransferSyntax,
        writeOptions?: WriteOptions
    ): number {
        let written = 0;

        const sortedTags = Object.keys(jsonObjects).sort();
        sortedTags.forEach(function (tagString: string) {
            const tag = Tag.fromString(tagString);
            const tagObject = jsonObjects[tagString];
            const vrType = tagObject.vr;

            const values = DicomMessage._getTagWriteValues(vrType, tagObject);

            written += tag.write(useStream, vrType, values, syntax, writeOptions);
        });

        return written;
    }

    static _getTagWriteValues(vrType: VRType, tagObject: DicomTagObject): DicomValue {
        if (tagObject._rawValue === undefined || tagObject._rawValue === null) {
            return tagObject.Value;
        }

        // apply VR specific formatting to the original _rawValue and compare to the Value
        const vr = ValueRepresentation.createByTypeString(vrType);

        let originalValue: DicomValue;
        if (Array.isArray(tagObject._rawValue)) {
            originalValue = (tagObject._rawValue as DicomValue[]).map((val) => vr.applyFormatting(val)) as DicomValue;
        } else {
            originalValue = vr.applyFormatting(tagObject._rawValue);
        }

        // if Value has not changed, write _rawValue unformatted back into the file
        if (deepEqual(tagObject.Value, originalValue)) {
            return tagObject._rawValue;
        } else {
            return tagObject.Value;
        }
    }

    /**
     * Reads the next tag instance and the tag instance body.  This is
     * equivalent to _readTagHeader and _readTagBody.
     */
    static _readTag(
        stream: ReadBufferStream,
        syntax: TransferSyntax,
        options: DicomReadOptions = {
            untilTag: null,
            includeUntilTagValue: false
        }
    ): TagReadResult | TagHeader | null | undefined {
        const header = this._readTagHeader(stream, syntax, options);
        if (!header || header.values === 0) {
            return header;
        }
        return this._readTagBody(header, stream, syntax, options);
    }

    /**
     * Reads the tag header information, leaving the stream at the start
     * of the data stream.  This allows a dict creator to take control
     * of the stream reading and split the handling off for specific tags
     * such as pixel data tags.
     */
    static _readTagHeader(
        stream: ReadBufferStream,
        syntax: TransferSyntax,
        options: DicomReadOptions = {
            untilTag: null,
            includeUntilTagValue: false
        }
    ): TagHeader | null {
        const { untilTag, includeUntilTagValue } = options;
        const implicit = syntax == IMPLICIT_LITTLE_ENDIAN ? true : false;
        const isLittleEndian = syntax == IMPLICIT_LITTLE_ENDIAN || syntax == EXPLICIT_LITTLE_ENDIAN ? true : false;

        const oldEndian = stream.isLittleEndian;
        stream.setEndian(isLittleEndian);
        const tag = Tag.readTag(stream);

        if (untilTag && untilTag === tag.toCleanString()) {
            if (!includeUntilTagValue) {
                return {
                    tag: tag,
                    vr: null as unknown as ValueRepresentation,
                    length: 0,
                    oldEndian,
                    retObj: null as unknown as TagReadResult,
                    values: 0,
                    untilTag: true
                };
            }
        }

        let length: number;
        let vr: ValueRepresentation;
        let vrType: VRType | undefined;

        if (tag.isInstruction()) {
            length = stream.readUint32();
            vr = ValueRepresentation.createByTypeString("UN");
        } else if (implicit) {
            length = stream.readUint32();
            const elementData = DicomMessage.lookupTag(tag);
            if (elementData) {
                vrType = elementData.vr;
            } else {
                //unknown tag
                if (length == 0xffffffff) {
                    vrType = "SQ";
                } else if (tag.isPixelDataTag()) {
                    vrType = "OW";
                } else if (vrType == "xs") {
                    vrType = "US";
                } else if (tag.isPrivateCreator()) {
                    vrType = "LO";
                } else {
                    vrType = "UN";
                }
            }
            vr = ValueRepresentation.createByTypeString(vrType!);
        } else {
            vrType = stream.readVR();

            if (vrType === "UN" && DicomMessage.lookupTag(tag) && DicomMessage.lookupTag(tag)!.vr) {
                vrType = DicomMessage.lookupTag(tag)!.vr;

                vr = ValueRepresentation.parseUnknownVr(vrType!);
            } else {
                vr = ValueRepresentation.createByTypeString(vrType);
            }

            if (vr.isLength32()) {
                stream.increment(2);
                length = stream.readUint32();
            } else {
                length = stream.readUint16();
            }
        }

        const header: TagHeader = {
            retObj: ValueRepresentation.addTagAccessors({
                tag,
                vr
            }) as TagReadResult,
            vr,
            tag,
            length,
            oldEndian
        };
        return header;
    }

    /**
     * Default tag body reading.
     */
    static _readTagBody(
        header: TagHeader,
        stream: ReadBufferStream,
        syntax: TransferSyntax,
        options: DicomReadOptions
    ): TagReadResult {
        let values: DicomValue[] = [];
        let rawValues: DicomValue[] = [];

        // This is an exit by header tag reading.
        if (header.values === 0) {
            return header.retObj;
        }
        const { length, vr, retObj, oldEndian } = header;

        const readOptions: ReadOptions = { forceStoreRaw: options.forceStoreRaw };

        if (vr.isBinary() && vr.maxLength && length > vr.maxLength && !vr.noMultiple) {
            const times = length / vr.maxLength;
            let i = 0;
            while (i++ < times) {
                const { rawValue, value } = vr.read(stream, vr.maxLength, syntax, readOptions);
                rawValues.push(rawValue);
                values.push(value);
            }
        } else {
            const readResult = vr.read(stream, length, syntax, readOptions) || {
                rawValue: undefined,
                value: undefined
            };
            const { rawValue, value } = readResult;
            if (!vr.isBinary() && singleVRs.indexOf(vr.type) == -1) {
                rawValues = rawValue as DicomValue[];
                values = value as DicomValue[];
                if (typeof value === "string") {
                    const delimiterChar = String.fromCharCode(VM_DELIMITER);
                    rawValues = vr.dropPadByte((rawValue as string).split(delimiterChar));
                    values = vr.dropPadByte(value.split(delimiterChar));
                }
            } else if (vr.type == "SQ") {
                rawValues = rawValue as DicomValue[];
                values = value as DicomValue[];
            } else if (vr.type == "OW" || vr.type == "OB") {
                rawValues = rawValue as DicomValue[];
                values = value as DicomValue[];
            } else {
                if (Array.isArray(value)) {
                    values = value as DicomValue[];
                } else {
                    values.push(value);
                }
                if (Array.isArray(rawValue)) {
                    rawValues = rawValue as DicomValue[];
                } else {
                    rawValues.push(rawValue);
                }
            }
        }
        stream.setEndian(oldEndian);

        retObj.values = values;
        retObj.rawValues = rawValues;
        return retObj;
    }

    static lookupTag(tag: Tag): DictionaryEntry | undefined {
        return DicomMetaDictionary.dictionary[tag.toString()];
    }
}

export { DicomMessage };
export type { DicomReadOptions, DicomFileReadOptions, TagHeader, TagReadResult, DicomTagObject, DicomDictionary };
