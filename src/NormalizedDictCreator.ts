import { DicomMetaDictionary, type DictionaryEntry } from "./DicomMetaDictionary";
import { type DicomDict, type DicomValue, DictCreator, type ReadInfo } from "./DictCreator";
import { type DicomDataset } from "./ValueRepresentation";

/** Bulk data reference for private values */
interface BulkDataReference {
    BulkDataURI?: string;
    BulkDataUUID?: string;
}

/** Value types that can be stored in normalized entries */
type NormalizedValue =
    | string
    | number
    | DicomDataset
    | ArrayBuffer
    | Uint8Array
    | ArrayBufferLike
    | (ArrayBuffer | Uint8Array | ArrayBufferLike)[]
    | BulkDataReference
    | null;

/** Private creator entry stored in the normalized dictionary */
interface PrivateCreatorEntry {
    key: string;
    creatorOffset: string;
    [tag: string]: string | NormalizedValue[] | BulkDataReference;
}

/** Dictionary that can hold normalized entries including private creator entries */
type NormalizedDict = Record<string, NormalizedValue | NormalizedValue[] | PrivateCreatorEntry>;

/**
 * This parser will create an already normalized dataset, directly
 * from the underlying data.
 *
 * There are a few differences from the standard denormalizer:
 *    * Only vm==1 entries will have the value replaced
 *    * No denormalization of meta information is performed
 *    * Private tags are denormalized to a child entry keyed by:
 *      `${creatorName}:${group}`
 *      whose value is an object with values not containing the creator
 *      offset key, and having the original offset as creatorOffset
 */
export class NormalizedDictCreator extends DictCreator {
    setValue(cleanTagString: string, readInfo: ReadInfo): void {
        const { tag } = readInfo;
        if (!tag || tag.isMetaInformation()) {
            return super.setValue(cleanTagString, readInfo);
        }
        const { dict } = this.current as { dict: DicomDict };
        const normalizedDict = dict as unknown as NormalizedDict;
        const { values, BulkDataURI, BulkDataUUID } = readInfo;

        if (tag.isPrivateCreator()) {
            const creatorName = values?.[0] as string;
            const key = `${creatorName}:${cleanTagString.substring(0, 4)}`;
            const privateValue: PrivateCreatorEntry = {
                key,
                creatorOffset: cleanTagString.substring(6, 8)
            };
            normalizedDict[key] = privateValue;
            // Assign it so it is accessible by assigner
            Object.defineProperty(normalizedDict, cleanTagString, {
                value: privateValue
            });
            return;
        }

        if (tag.isPrivateValue()) {
            const valueKey = cleanTagString.substring(0, 4) + "00" + cleanTagString.substring(4, 6);
            const key = cleanTagString.substring(0, 4) + "00" + cleanTagString.substring(6, 8);
            const privateValue = normalizedDict[valueKey] as PrivateCreatorEntry | undefined;
            if (!privateValue) {
                console.warn("Private value with no creator tag:", tag);
                return super.setValue(cleanTagString, readInfo);
            }
            if (BulkDataURI || BulkDataUUID) {
                privateValue[key] = { BulkDataURI, BulkDataUUID };
            } else {
                privateValue[key] = values as NormalizedValue[];
            }
            return;
        }

        const punctuatedTag = DicomMetaDictionary.punctuateTag(cleanTagString);
        const entry: DictionaryEntry | undefined = punctuatedTag
            ? DicomMetaDictionary.dictionary[punctuatedTag]
            : undefined;
        if (!entry) {
            return super.setValue(cleanTagString, readInfo);
        }

        const { name, vm } = entry;

        if (values === undefined) {
            return;
        }

        if (name === undefined) {
            return super.setValue(cleanTagString, readInfo);
        }

        if (BulkDataURI || BulkDataUUID) {
            normalizedDict[name] = { BulkDataURI, BulkDataUUID };
        }

        if (vm === "1" && values?.length === 1) {
            normalizedDict[name] = values[0] as NormalizedValue;
        } else {
            normalizedDict[name] = values as NormalizedValue[];
        }
    }

    getSingle(cleanTagString: string): DicomValue {
        const superValue = super.getSingle(cleanTagString);
        if (superValue !== undefined) {
            return superValue;
        }
        const punctuatedTag = DicomMetaDictionary.punctuateTag(cleanTagString);
        const entry: DictionaryEntry | undefined = punctuatedTag
            ? DicomMetaDictionary.dictionary[punctuatedTag]
            : undefined;
        const { dict } = this.current as { dict: DicomDict };
        const normalizedDict = dict as unknown as NormalizedDict;
        return normalizedDict[entry?.name ?? cleanTagString] as DicomValue;
    }
}
