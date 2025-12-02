import { DicomDict } from "./DicomDict.js";
import {
    DicomMetaDictionary,
    type NaturalizedDataset,
    type VRMap
} from "./DicomMetaDictionary.js";

/**
 * Represents a potential DICOM JSON value holder.
 * Used when _meta may contain entries in denaturalized format (with Value arrays).
 */
interface ValueHolder {
    Value?: (string | undefined)[];
}

function datasetToDict(dataset: NaturalizedDataset): DicomDict {
    const fileMetaInformationVersionArray = new Uint8Array(2);
    fileMetaInformationVersionArray[1] = 1;

    // Handle TransferSyntaxUID which may be in DICOM JSON format (with Value array)
    // or may not exist at all. Default to Explicit VR Little Endian.
    let TransferSyntaxUID = "1.2.840.10008.1.2.1";

    if (dataset._meta?.TransferSyntaxUID) {
        const tsxEntry = dataset._meta.TransferSyntaxUID as ValueHolder | undefined;
        if (tsxEntry?.Value?.[0]) {
            TransferSyntaxUID = tsxEntry.Value[0];
        }
    }

    const newMeta: NaturalizedDataset = {
        _vrMap: {} as VRMap,
        MediaStorageSOPClassUID: dataset.SOPClassUID,
        MediaStorageSOPInstanceUID: dataset.SOPInstanceUID,
        ImplementationVersionName: "dcmjs-0.0",
        TransferSyntaxUID,
        ImplementationClassUID:
            "2.25.80302813137786398554742050926734630921603366648225212145404",
        FileMetaInformationVersion: fileMetaInformationVersionArray.buffer
    };

    dataset._meta = newMeta;

    const denaturalized = DicomMetaDictionary.denaturalizeDataset(dataset._meta);
    const dicomDict = new DicomDict(denaturalized);
    dicomDict.dict = DicomMetaDictionary.denaturalizeDataset(dataset);
    return dicomDict;
}

function datasetToBuffer(dataset: NaturalizedDataset): Buffer {
    const written = datasetToDict(dataset).write();
    return Buffer.from(written as ArrayBuffer);
}

function datasetToBlob(dataset: NaturalizedDataset): Blob {
    const written = datasetToDict(dataset).write();
    return new Blob([written as ArrayBuffer], { type: "application/dicom" });
}

export { datasetToBlob, datasetToBuffer, datasetToDict };
