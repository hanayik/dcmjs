import dictionary from "./dictionary";
import log from "./log";
import addAccessors from "./utilities/addAccessors";
import { ValueRepresentation, type VRType } from "./ValueRepresentation";

/** Structure of a dictionary entry */
interface DictionaryEntry {
    tag: string;
    vr?: VRType;
    name?: string;
    vm?: string;
    version?: string;
}

/** Dictionary mapping tag strings to their entries */
interface Dictionary {
    [tag: string]: DictionaryEntry;
}

/** Name map mapping natural names to their dictionary entries */
interface NameMap {
    [name: string]: DictionaryEntry;
}

/** SOP Class name/UID mappings */
interface SopClassNamesByUID {
    [uid: string]: string;
}

interface SopClassUIDsByName {
    [name: string]: string;
}

/** VR map for tracking original value representations */
interface VRMap {
    [name: string]: VRType;
}

/** DICOM JSON model data item (denaturalized format) */
interface DicomJsonDataItem {
    vr: VRType;
    Value?: DicomJsonValue[];
    InlineBinary?: string;
    BulkDataURI?: string;
}

/** DICOM JSON model dataset (denaturalized format) - maps unpunctuated tags to data items */
interface DicomJsonDataset {
    [tag: string]: DicomJsonDataItem;
}

/** Possible value types in a naturalized dataset */
type NaturalizedValue =
    | string
    | number
    | null
    | NaturalizedDataset
    | NaturalizedDataset[]
    | string[]
    | (number | null)[]
    | ArrayBuffer
    | ArrayBuffer[]
    | InlineBinaryValue
    | BulkDataURIValue
    | Record<string, string | undefined>[];

/** Inline binary representation in naturalized form */
interface InlineBinaryValue {
    InlineBinary: string;
}

/** Bulk data URI representation in naturalized form */
interface BulkDataURIValue {
    BulkDataURI: string;
}

/** Naturalized dataset with natural property names */
interface NaturalizedDataset {
    _vrMap: VRMap;
    _meta?: NaturalizedDataset;
    [name: string]: NaturalizedValue | VRMap | NaturalizedDataset | undefined;
}

/** Value types in DICOM JSON model */
type DicomJsonValue =
    | string
    | number
    | DicomJsonDataset
    | Record<string, string | undefined>
    | ArrayBuffer
    | null;

/** Input value for denaturalization */
type DenaturalizeInputValue =
    | string
    | number
    | null
    | undefined
    | NaturalizedDataset
    | (string | number | null | NaturalizedDataset | undefined)[];

class DicomMetaDictionary {
    customDictionary: Dictionary;
    customNameMap: NameMap;

    // Static properties (initialized after class definition)
    static dictionary: Dictionary;
    static nameMap: NameMap;
    static sopClassNamesByUID: SopClassNamesByUID;
    static sopClassUIDsByName: SopClassUIDsByName;

    // intakes a custom dictionary that will be used to parse/denaturalize the dataset
    constructor(customDictionary: Dictionary) {
        this.customDictionary = customDictionary;
        this.customNameMap = DicomMetaDictionary._generateCustomNameMap(customDictionary);
    }

    static punctuateTag(rawTag: string): string | undefined {
        if (rawTag.indexOf(",") !== -1) {
            return rawTag;
        }
        const matchResult = rawTag.match(/[0-9a-fA-F]*/);
        if (rawTag.length === 8 && matchResult && rawTag === matchResult[0]) {
            const tag = rawTag.toUpperCase();
            return `(${tag.substring(0, 4)},${tag.substring(4, 8)})`;
        }
        return undefined;
    }

    static unpunctuateTag(tag: string): string {
        if (tag.indexOf(",") === -1) {
            return tag;
        }
        return tag.substring(1, 10).replace(",", "");
    }

    static parseIntFromTag(tag: string): number {
        const integerValue = parseInt(DicomMetaDictionary.unpunctuateTag(tag), 16);
        return integerValue;
    }

    static tagAsIntegerFromName(name: string): number | undefined {
        const item = DicomMetaDictionary.nameMap[name];
        if (item !== undefined) {
            return DicomMetaDictionary.parseIntFromTag(item.tag);
        } else {
            return undefined;
        }
    }

    // fixes some common errors in VRs
    // TODO: if this gets longer it could go in ValueRepresentation.js
    // or in a dedicated class
    static cleanDataset(dataset: DicomJsonDataset): DicomJsonDataset {
        const cleanedDataset: DicomJsonDataset = {};
        Object.keys(dataset).forEach((tag) => {
            const data: DicomJsonDataItem = Object.assign({}, dataset[tag]);
            if (data.vr === "SQ") {
                const cleanedValues: DicomJsonDataset[] = [];
                if (data.Value) {
                    Object.keys(data.Value).forEach((index) => {
                        cleanedValues.push(
                            DicomMetaDictionary.cleanDataset(data.Value![Number(index)] as DicomJsonDataset)
                        );
                    });
                }
                data.Value = cleanedValues;
            } else {
                // remove null characters from strings
                if (data.Value) {
                    data.Value = Object.keys(data.Value).map((index) => {
                        const item = data.Value![Number(index)];
                        if (item !== null && typeof item === "object" && item.constructor.name === "String") {
                            return (item as unknown as string).replace(/\0/, "");
                        }
                        if (typeof item === "string") {
                            return item.replace(/\0/, "");
                        }
                        return item;
                    });
                }
            }
            cleanedDataset[tag] = data;
        });
        return cleanedDataset;
    }

    // unlike naturalizeDataset, this only
    // changes the names of the member variables
    // but leaves the values intact
    static namifyDataset(dataset: DicomJsonDataset): Record<string, DicomJsonDataItem> {
        const namedDataset: Record<string, DicomJsonDataItem> = {};
        Object.keys(dataset).forEach((tag) => {
            const data: DicomJsonDataItem = Object.assign({}, dataset[tag]);
            if (data.vr === "SQ") {
                const namedValues: Record<string, DicomJsonDataItem>[] = [];
                if (data.Value) {
                    Object.keys(data.Value).forEach((index) => {
                        namedValues.push(
                            DicomMetaDictionary.namifyDataset(data.Value![Number(index)] as DicomJsonDataset)
                        );
                    });
                }
                data.Value = namedValues as unknown as DicomJsonValue[];
            }
            const punctuatedTag = DicomMetaDictionary.punctuateTag(tag);
            const entry = punctuatedTag ? DicomMetaDictionary.dictionary[punctuatedTag] : undefined;
            let name = tag;
            if (entry && entry.name) {
                name = entry.name;
            }
            namedDataset[name] = data;
        });
        return namedDataset;
    }

    /** converts from DICOM JSON Model dataset to a natural dataset
     * - sequences become lists
     * - single element lists are replaced by their first element,
     *     with single element lists remaining lists, but being a
     *     proxy for the child values, see addAccessors for examples
     * - object member names are dictionary, not group/element tag
     */
    static naturalizeDataset(dataset: DicomJsonDataset): NaturalizedDataset {
        const naturalDataset = ValueRepresentation.addTagAccessors({
            _vrMap: {} as VRMap
        }) as NaturalizedDataset;

        Object.keys(dataset).forEach((tag) => {
            const data = dataset[tag];
            const punctuatedTag = DicomMetaDictionary.punctuateTag(tag);
            const entry = punctuatedTag ? DicomMetaDictionary.dictionary[punctuatedTag] : undefined;
            let naturalName = tag;

            if (entry && entry.name) {
                naturalName = entry.name;

                if (entry.vr === "ox") {
                    // when the vr is data-dependent, keep track of the original type
                    naturalDataset._vrMap[naturalName] = data.vr;
                }
                if (data.vr !== entry.vr) {
                    // save origin vr if it different that in dictionary
                    naturalDataset._vrMap[naturalName] = data.vr;
                }
            }

            if (data.Value === undefined) {
                // In the case of type 2, add this tag but explictly set it null to indicate its empty.
                naturalDataset[naturalName] = null;

                if (data.InlineBinary) {
                    naturalDataset[naturalName] = {
                        InlineBinary: data.InlineBinary
                    };
                } else if (data.BulkDataURI) {
                    naturalDataset[naturalName] = {
                        BulkDataURI: data.BulkDataURI
                    };
                }
            } else {
                if (data.vr === "SQ") {
                    // convert sequence to list of values
                    const naturalValues: NaturalizedDataset[] = [];

                    Object.keys(data.Value).forEach((index) => {
                        naturalValues.push(
                            DicomMetaDictionary.naturalizeDataset(data.Value![Number(index)] as DicomJsonDataset)
                        );
                    });

                    naturalDataset[naturalName] = naturalValues;
                } else {
                    naturalDataset[naturalName] = data.Value as unknown as NaturalizedValue;
                }

                const currentValue = naturalDataset[naturalName];
                if (Array.isArray(currentValue) && currentValue.length === 1) {
                    const sqZero = currentValue[0];
                    if (sqZero && typeof sqZero === "object" && !Array.isArray(sqZero) && !("length" in sqZero)) {
                        naturalDataset[naturalName] = addAccessors(
                            currentValue as object[],
                            sqZero as object
                        ) as unknown as NaturalizedValue;
                    } else {
                        naturalDataset[naturalName] = sqZero as NaturalizedValue;
                    }
                }
            }
        });

        return naturalDataset;
    }

    static denaturalizeValue(naturalValue: DenaturalizeInputValue): (string | number | DicomJsonDataset | null)[] {
        let value: (string | number | null | NaturalizedDataset | undefined)[];
        if (!Array.isArray(naturalValue)) {
            value = [naturalValue];
        } else {
            const thereIsUndefinedValues = naturalValue.some((item) => item === undefined);
            if (thereIsUndefinedValues) {
                throw new Error(
                    "There are undefined values at the array naturalValue in DicomMetaDictionary.denaturalizeValue"
                );
            }
            value = naturalValue;
        }

        const result = value.map((entry) => {
            if (entry !== null && entry !== undefined && typeof entry === "object" && "constructor" in entry && entry.constructor.name === "Number") {
                // Handle boxed Number objects - get primitive value first
                return String((entry as unknown as { valueOf(): number }).valueOf());
            }
            if (typeof entry === "number") {
                return String(entry);
            }
            return entry as string | DicomJsonDataset | null;
        });

        return result;
    }

    // denaturalizes dataset using custom dictionary and nameMap
    denaturalizeDataset(dataset: NaturalizedDataset): DicomJsonDataset {
        return DicomMetaDictionary.denaturalizeDataset(dataset, this.customNameMap);
    }

    // keep the static function to support previous calls to the class
    static denaturalizeDataset(
        dataset: NaturalizedDataset,
        nameMap: NameMap = DicomMetaDictionary.nameMap
    ): DicomJsonDataset {
        const unnaturalDataset: DicomJsonDataset = {};
        Object.keys(dataset).forEach((naturalName) => {
            // check if it's a sequence
            const name = naturalName;
            const entry = nameMap[name];
            if (entry && entry.vr) {
                const dataValue = dataset[naturalName];

                if (dataValue === undefined) {
                    // handle the case where it was deleted from the object but is in keys
                    return;
                }
                // process this one entry
                const vrFromMap = dataset._vrMap?.[naturalName];
                const vr: VRType = vrFromMap ? vrFromMap : entry.vr;

                const dataItem = ValueRepresentation.addTagAccessors({ vr }) as DicomJsonDataItem;

                dataItem.Value = dataset[naturalName] as DicomJsonValue[];

                if (dataValue !== null) {
                    if (entry.vr === "ox") {
                        if (dataset._vrMap?.[naturalName]) {
                            dataItem.vr = dataset._vrMap[naturalName];
                        } else {
                            log.error("No value representation given for", naturalName);
                        }
                    }

                    const vrInstance = ValueRepresentation.createByTypeString(dataItem.vr);

                    dataItem.Value = DicomMetaDictionary.denaturalizeValue(
                        dataItem.Value as unknown as DenaturalizeInputValue
                    );

                    if (entry.vr === "SQ") {
                        const unnaturalValues: DicomJsonDataset[] = [];
                        for (let datasetIndex = 0; datasetIndex < dataItem.Value.length; datasetIndex++) {
                            const nestedDataset = dataItem.Value[datasetIndex] as unknown as NaturalizedDataset;
                            unnaturalValues.push(DicomMetaDictionary.denaturalizeDataset(nestedDataset, nameMap));
                        }
                        dataItem.Value = unnaturalValues;
                    }

                    if (!vrInstance.isBinary() && vrInstance.maxLength) {
                        dataItem.Value = dataItem.Value.map((value) => {
                            let maxLength = vrInstance.maxLength!;
                            if (vrInstance.rangeMatchingMaxLength) {
                                maxLength = vrInstance.rangeMatchingMaxLength;
                            }

                            if (typeof value === "string" && value.length > maxLength) {
                                log.warn(
                                    `Truncating value ${value} of ${naturalName} because it is longer than ${maxLength}`
                                );
                                return value.slice(0, maxLength);
                            } else {
                                return value;
                            }
                        });
                    }
                }

                const tag = DicomMetaDictionary.unpunctuateTag(entry.tag);
                unnaturalDataset[tag] = dataItem;
            } else {
                const validMetaNames = ["_vrMap", "_meta"];
                if (validMetaNames.indexOf(name) === -1) {
                    log.warn("Unknown name in dataset", name, ":", dataset[name]);
                }
            }
        });
        return unnaturalDataset;
    }

    static uid(): string {
        let uid = "2.25." + Math.floor(1 + Math.random() * 9);
        for (let index = 0; index < 38; index++) {
            uid = uid + Math.floor(Math.random() * 10);
        }
        return uid;
    }

    // date and time in UTC
    static date(): string {
        const now = new Date();
        return now.toISOString().replace(/-/g, "").slice(0, 8);
    }

    static time(): string {
        const now = new Date();
        return now.toISOString().replace(/:/g, "").slice(11, 17);
    }

    static dateTime(): string {
        // "2017-07-07T16:09:18.079Z" -> "20170707160918.079"
        const now = new Date();
        return now.toISOString().replace(/[:\-TZ]/g, "");
    }

    static _generateNameMap(): void {
        DicomMetaDictionary.nameMap = {};
        Object.keys(DicomMetaDictionary.dictionary).forEach((tag) => {
            const dict = DicomMetaDictionary.dictionary[tag];
            if (dict.version !== "PrivateTag" && dict.name) {
                DicomMetaDictionary.nameMap[dict.name] = dict;
            }
        });
    }

    static _generateCustomNameMap(dictionary: Dictionary): NameMap {
        const nameMap: NameMap = {};
        Object.keys(dictionary).forEach((tag) => {
            const dict = dictionary[tag];
            if (dict.version !== "PrivateTag" && dict.name) {
                nameMap[dict.name] = dict;
            }
        });
        return nameMap;
    }

    static _generateUIDMap(): void {
        DicomMetaDictionary.sopClassUIDsByName = {};
        Object.keys(DicomMetaDictionary.sopClassNamesByUID).forEach((uid) => {
            const name = DicomMetaDictionary.sopClassNamesByUID[uid];
            DicomMetaDictionary.sopClassUIDsByName[name] = uid;
        });
    }
}

// Subset of those listed at:
// http://dicom.nema.org/medical/dicom/current/output/html/part04.html#sect_B.5
DicomMetaDictionary.sopClassNamesByUID = {
    "1.2.840.10008.5.1.4.1.1.20": "NMImage",
    "1.2.840.10008.5.1.4.1.1.2": "CTImage",
    "1.2.840.10008.5.1.4.1.1.2.1": "EnhancedCTImage",
    "1.2.840.10008.5.1.4.1.1.2.2": "LegacyConvertedEnhancedCTImage",
    "1.2.840.10008.5.1.4.1.1.3.1": "USMultiframeImage",
    "1.2.840.10008.5.1.4.1.1.4": "MRImage",
    "1.2.840.10008.5.1.4.1.1.4.1": "EnhancedMRImage",
    "1.2.840.10008.5.1.4.1.1.4.2": "MRSpectroscopy",
    "1.2.840.10008.5.1.4.1.1.4.3": "EnhancedMRColorImage",
    "1.2.840.10008.5.1.4.1.1.4.4": "LegacyConvertedEnhancedMRImage",
    "1.2.840.10008.5.1.4.1.1.6.1": "USImage",
    "1.2.840.10008.5.1.4.1.1.6.2": "EnhancedUSVolume",
    "1.2.840.10008.5.1.4.1.1.7": "SecondaryCaptureImage",
    "1.2.840.10008.5.1.4.1.1.30": "ParametricMapStorage",
    "1.2.840.10008.5.1.4.1.1.66": "RawData",
    "1.2.840.10008.5.1.4.1.1.66.1": "SpatialRegistration",
    "1.2.840.10008.5.1.4.1.1.66.2": "SpatialFiducials",
    "1.2.840.10008.5.1.4.1.1.66.3": "DeformableSpatialRegistration",
    "1.2.840.10008.5.1.4.1.1.66.4": "Segmentation",
    "1.2.840.10008.5.1.4.1.1.66.7": "LabelmapSegmentation", // Labelmap Segmentation SOP Class UID
    "1.2.840.10008.5.1.4.1.1.67": "RealWorldValueMapping",
    "1.2.840.10008.5.1.4.1.1.88.11": "BasicTextSR",
    "1.2.840.10008.5.1.4.1.1.88.22": "EnhancedSR",
    "1.2.840.10008.5.1.4.1.1.88.33": "ComprehensiveSR",
    "1.2.840.10008.5.1.4.1.1.88.34": "Comprehensive3DSR",
    "1.2.840.10008.5.1.4.1.1.128": "PETImage",
    "1.2.840.10008.5.1.4.1.1.130": "EnhancedPETImage",
    "1.2.840.10008.5.1.4.1.1.128.1": "LegacyConvertedEnhancedPETImage",
    "1.2.840.10008.5.1.4.1.1.77.1.5.1": "OphthalmicPhotography8BitImage",
    "1.2.840.10008.5.1.4.1.1.77.1.5.4": "OphthalmicTomographyImage"
};

DicomMetaDictionary.dictionary = dictionary as Dictionary;

DicomMetaDictionary._generateNameMap();
DicomMetaDictionary._generateUIDMap();

export { DicomMetaDictionary };
export type {
    DictionaryEntry,
    Dictionary,
    NameMap,
    VRMap,
    DicomJsonDataItem,
    DicomJsonDataset,
    NaturalizedDataset,
    NaturalizedValue,
    InlineBinaryValue,
    BulkDataURIValue,
    SopClassNamesByUID,
    SopClassUIDsByName
};
