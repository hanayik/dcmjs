import DerivedDataset, { type DerivedDatasetOptions, type DerivedDatasetData } from "./DerivedDataset";
import type { NaturalizedDataset } from "../DicomMetaDictionary";

/** Extended interface for pixel-based datasets */
export interface PixelDatasetData extends DerivedDatasetData {
    ImageType?: string[];
    LossyImageCompression?: string;
    InstanceNumber?: string;
    SOPClassUID?: string;
    Modality?: string;
    FrameOfReferenceUID?: string;
    PositionReferenceIndicator?: string;
    NumberOfFrames?: string | number;
    Rows?: string | number;
    Columns?: string | number;
    SamplesPerPixel?: string;
    PhotometricInterpretation?: string;
    BitsStored?: string;
    HighBit?: string;
    ContentLabel?: string;
    ContentDescription?: string;
    ContentCreatorName?: string;
    SharedFunctionalGroupsSequence?: Record<string, unknown>;
    PerFrameFunctionalGroupsSequence?: Record<string, unknown>[] | Record<string, unknown>;
    PixelData?: ArrayBuffer;
}

export default class DerivedPixels extends DerivedDataset {
    declare dataset: PixelDatasetData;
    declare referencedDataset: NaturalizedDataset & {
        SharedFunctionalGroupsSequence?: Record<string, unknown>;
        PerFrameFunctionalGroupsSequence?: Record<string, unknown>[] | Record<string, unknown>;
        PixelData?: ArrayBuffer;
    };

    constructor(datasets: NaturalizedDataset[], options: DerivedDatasetOptions = {}) {
        super(datasets, options);
        const o = this.options;

        o.ContentLabel = options.ContentLabel || "";
        o.ContentDescription = options.ContentDescription || "";
        o.ContentCreatorName = options.ContentCreatorName || "";
    }

    // this assumes a normalized multiframe input and will create
    // a multiframe derived image
    derive(): void {
        super.derive();

        this.assignToDataset({
            ImageType: ["DERIVED", "PRIMARY"],
            LossyImageCompression: "00",
            InstanceNumber: "1"
        });

        this.assignFromReference([
            "SOPClassUID",
            "Modality",
            "FrameOfReferenceUID",
            "PositionReferenceIndicator",
            "NumberOfFrames",
            "Rows",
            "Columns",
            "SamplesPerPixel",
            "PhotometricInterpretation",
            "BitsStored",
            "HighBit"
        ]);

        this.assignFromOptions(["ContentLabel", "ContentDescription", "ContentCreatorName"]);

        //
        // TODO: more carefully copy only PixelMeasures and related
        // TODO: add derivation references
        //
        if (this.referencedDataset.SharedFunctionalGroupsSequence) {
            this.dataset.SharedFunctionalGroupsSequence = DerivedDataset.copyDataset(
                this.referencedDataset.SharedFunctionalGroupsSequence
            );
        }
        if (this.referencedDataset.PerFrameFunctionalGroupsSequence) {
            this.dataset.PerFrameFunctionalGroupsSequence = DerivedDataset.copyDataset(
                this.referencedDataset.PerFrameFunctionalGroupsSequence
            );
        }

        // make an array of zeros for the pixels
        if (this.referencedDataset.PixelData) {
            this.dataset.PixelData = new ArrayBuffer(this.referencedDataset.PixelData.byteLength);
        }
    }
}
