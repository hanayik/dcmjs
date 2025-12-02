import { DicomMetaDictionary, type NaturalizedDataset, type VRMap } from "../DicomMetaDictionary";

/** Options for creating a derived dataset */
export interface DerivedDatasetOptions {
    Manufacturer?: string;
    ManufacturerModelName?: string;
    SeriesDescription?: string;
    SeriesNumber?: string;
    SoftwareVersions?: string;
    DeviceSerialNumber?: string;
    SeriesDate?: string;
    SeriesTime?: string;
    ContentDate?: string;
    ContentTime?: string;
    SOPInstanceUID?: string;
    SeriesInstanceUID?: string;
    ClinicalTrialTimePointID?: string;
    ClinicalTrialCoordinatingCenterName?: string;
    ClinicalTrialSeriesID?: string;
    ImageComments?: string;
    ContentQualification?: string;
    ContentLabel?: string;
    ContentDescription?: string;
    ContentCreatorName?: string;
    includeSliceSpacing?: boolean;
    [key: string]: string | boolean | undefined;
}

/** Dataset structure with VR map and metadata */
export interface DerivedDatasetData {
    _vrMap: VRMap;
    _meta?: NaturalizedDataset;
    [key: string]: unknown;
}

export default class DerivedDataset {
    options: DerivedDatasetOptions;
    referencedDatasets: NaturalizedDataset[];
    referencedDataset: NaturalizedDataset;
    dataset: DerivedDatasetData;

    constructor(datasets: NaturalizedDataset[], options: DerivedDatasetOptions = {}) {
        this.options = JSON.parse(JSON.stringify(options)) as DerivedDatasetOptions;
        const o = this.options;

        o.Manufacturer = options.Manufacturer || "Unspecified";
        o.ManufacturerModelName = options.ManufacturerModelName || "Unspecified";
        o.SeriesDescription = options.SeriesDescription || "Research Derived series";
        o.SeriesNumber = options.SeriesNumber || "99";
        o.SoftwareVersions = options.SoftwareVersions || "0";
        o.DeviceSerialNumber = options.DeviceSerialNumber || "1";

        const date = DicomMetaDictionary.date();
        const time = DicomMetaDictionary.time();

        o.SeriesDate = options.SeriesDate || date;
        o.SeriesTime = options.SeriesTime || time;
        o.ContentDate = options.ContentDate || date;
        o.ContentTime = options.ContentTime || time;

        o.SOPInstanceUID = options.SOPInstanceUID || DicomMetaDictionary.uid();
        o.SeriesInstanceUID = options.SeriesInstanceUID || DicomMetaDictionary.uid();

        o.ClinicalTrialTimePointID = options.ClinicalTrialTimePointID || "";
        o.ClinicalTrialCoordinatingCenterName = options.ClinicalTrialCoordinatingCenterName || "";
        o.ClinicalTrialSeriesID = options.ClinicalTrialSeriesID || "";

        o.ImageComments = options.ImageComments || "NOT FOR CLINICAL USE";
        o.ContentQualification = "RESEARCH";

        this.referencedDatasets = datasets; // list of one or more dicom-like object instances
        this.referencedDataset = this.referencedDatasets[0];
        this.dataset = {
            _vrMap: this.referencedDataset._vrMap,
            _meta: this.referencedDataset._meta
        };

        this.derive();
    }

    assignToDataset(data: Record<string, unknown>): void {
        Object.keys(data).forEach((key) => {
            this.dataset[key] = data[key];
            return;
        });
    }

    assignFromReference(tags: string[]): void {
        tags.forEach((tag) => {
            this.dataset[tag] = (this.referencedDataset as Record<string, unknown>)[tag] || "";
            return;
        });
    }

    assignFromOptions(tags: string[]): void {
        tags.forEach((tag) => {
            this.dataset[tag] = this.options[tag] || "";
            return;
        });
    }

    derive(): void {
        // common for all instances in study
        this.assignFromReference([
            "AccessionNumber",
            "ReferringPhysicianName",
            "StudyDate",
            "StudyID",
            "StudyTime",
            "PatientName",
            "PatientID",
            "PatientBirthDate",
            "PatientSex",
            "PatientAge",
            "StudyInstanceUID",
            "StudyID"
        ]);

        this.assignFromOptions([
            "Manufacturer",
            "SoftwareVersions",
            "DeviceSerialNumber",
            "ManufacturerModelName",
            "SeriesDescription",
            "SeriesNumber",
            "ImageComments",
            "SeriesDate",
            "SeriesTime",
            "ContentDate",
            "ContentTime",
            "ContentQualification",
            "SOPInstanceUID",
            "SeriesInstanceUID"
        ]);
    }

    static copyDataset<T>(dataset: T): T {
        // copies everything but the buffers
        return JSON.parse(JSON.stringify(dataset)) as T;
    }
}
