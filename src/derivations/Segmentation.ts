import { BitArray } from "../bitArray";
import { DicomMetaDictionary, type NaturalizedDataset, type VRMap } from "../DicomMetaDictionary";
import { Normalizer } from "../normalizers";
import DerivedDataset, { type DerivedDatasetOptions } from "./DerivedDataset";
import DerivedPixels from "./DerivedPixels";

/** Code sequence entry with code value, scheme, and meaning */
interface CodeSequence {
    CodeValue: string;
    CodingSchemeDesignator: string;
    CodeMeaning: string;
}

/** Source image sequence entry */
interface SourceImageSequence {
    ReferencedSOPClassUID: string;
    ReferencedSOPInstanceUID: string;
    ReferencedFrameNumber?: number;
    PurposeOfReferenceCodeSequence: CodeSequence;
}

/** Derivation image sequence */
interface DerivationImageSequence {
    SourceImageSequence: SourceImageSequence;
    DerivationCodeSequence: CodeSequence;
}

/** Plane position sequence */
interface PlanePositionSequence {
    ImagePositionPatient: number[] | string[];
}

/** Plane orientation sequence */
interface PlaneOrientationSequence {
    ImageOrientationPatient?: number[] | string[];
}

/** Frame content sequence */
interface FrameContentSequence {
    DimensionIndexValues: [string, number];
}

/** Segment identification sequence */
interface SegmentIdentificationSequence {
    ReferencedSegmentNumber: string;
}

/** Per-frame functional groups entry */
interface PerFrameFunctionalGroup {
    PlanePositionSequence: PlanePositionSequence;
    PlaneOrientationSequence?: PlaneOrientationSequence;
    FrameContentSequence: FrameContentSequence;
    SegmentIdentificationSequence: SegmentIdentificationSequence;
    DerivationImageSequence: DerivationImageSequence;
    [key: string]: unknown;
}

/** Dimension index sequence entry */
interface DimensionIndexSequenceEntry {
    DimensionOrganizationUID: string;
    DimensionIndexPointer: number;
    FunctionalGroupPointer: number;
    DimensionDescriptionLabel: string;
}

/** Dimension organization sequence */
interface DimensionOrganizationSequence {
    DimensionOrganizationUID: string;
}

/** Referenced instance sequence entry */
interface ReferencedInstanceSequenceEntry {
    ReferencedSOPClassUID: string;
    ReferencedSOPInstanceUID: string;
}

/** Referenced series sequence */
interface ReferencedSeriesSequence {
    SeriesInstanceUID?: string;
    StudyInstanceUID?: string;
    ReferencedInstanceSequence: ReferencedInstanceSequenceEntry[];
    [key: string]: unknown;
}

/** Segment metadata input */
export interface SegmentMetadata {
    SegmentLabel: string;
    SegmentDescription?: string;
    SegmentedPropertyCategoryCodeSequence: CodeSequence;
    SegmentedPropertyTypeCodeSequence: CodeSequence;
    SegmentAlgorithmType: string;
    SegmentAlgorithmName?: string;
    RecommendedDisplayCIELabValue?: number[];
}

/** Segment sequence entry (stored in dataset) */
interface SegmentSequenceEntry {
    SegmentedPropertyCategoryCodeSequence: CodeSequence;
    SegmentNumber: string;
    SegmentLabel: string;
    SegmentDescription?: string;
    SegmentAlgorithmType: string;
    SegmentAlgorithmName?: string;
    RecommendedDisplayCIELabValue?: number[];
    SegmentedPropertyTypeCodeSequence: CodeSequence;
}

/** Pixel measures sequence */
interface PixelMeasuresSequence {
    PixelSpacing?: number[] | string[];
    SpacingBetweenSlices?: number | string;
    SliceThickness?: number | string;
    [key: string]: unknown;
}

/** Shared functional groups sequence for segmentation */
interface SegmentationSharedFunctionalGroupsSequence {
    PixelMeasuresSequence?: PixelMeasuresSequence;
    PlaneOrientationSequence?: PlaneOrientationSequence;
    PixelValueTransformationSequence?: Record<string, unknown>;
    [key: string]: unknown;
}

/** Segmentation-specific dataset structure */
export interface SegmentationDataset {
    _vrMap: VRMap;
    _meta?: NaturalizedDataset;
    SOPClassUID: string;
    Modality: string;
    SamplesPerPixel: string;
    PhotometricInterpretation: string;
    BitsAllocated: string;
    BitsStored: string;
    HighBit: string;
    PixelRepresentation: string;
    LossyImageCompression: string;
    SegmentationType: string;
    ContentLabel: string;
    NumberOfFrames: number;
    Rows: number;
    Columns: number;
    DimensionOrganizationSequence: DimensionOrganizationSequence;
    DimensionIndexSequence: DimensionIndexSequenceEntry[];
    SegmentSequence: SegmentSequenceEntry[];
    ReferencedSeriesSequence: ReferencedSeriesSequence;
    PerFrameFunctionalGroupsSequence: PerFrameFunctionalGroup[];
    SharedFunctionalGroupsSequence: SegmentationSharedFunctionalGroupsSequence;
    PixelData: ArrayBuffer | undefined;
    [key: string]: unknown;
}

/** Referenced dataset with segmentation-related properties */
interface SegmentationReferencedDataset {
    _vrMap: VRMap;
    _meta?: NaturalizedDataset;
    SOPClassUID?: string;
    SOPInstanceUID?: string;
    SeriesInstanceUID?: string;
    StudyInstanceUID?: string;
    ReferencedSeriesSequence?: ReferencedSeriesSequence;
    PerFrameFunctionalGroupsSequence?: PerFrameFunctionalGroup[];
    SharedFunctionalGroupsSequence?: SegmentationSharedFunctionalGroupsSequence;
    [key: string]: unknown;
}

/** Options for segmentation with includeSliceSpacing */
interface SegmentationOptions extends DerivedDatasetOptions {
    includeSliceSpacing?: boolean;
}

export default class Segmentation extends DerivedPixels {
    declare dataset: SegmentationDataset;
    isBitpacked: boolean = false;

    private get _referencedDataset(): SegmentationReferencedDataset {
        return this.referencedDataset as unknown as SegmentationReferencedDataset;
    }

    private get _referencedDatasets(): SegmentationReferencedDataset[] {
        return this.referencedDatasets as unknown as SegmentationReferencedDataset[];
    }

    constructor(datasets: NaturalizedDataset[], options: SegmentationOptions = { includeSliceSpacing: true }) {
        super(datasets, options);
    }

    derive(): void {
        super.derive();

        this.assignToDataset({
            SOPClassUID: DicomMetaDictionary.sopClassUIDsByName.Segmentation,
            Modality: "SEG",
            SamplesPerPixel: "1",
            PhotometricInterpretation: "MONOCHROME2",
            BitsAllocated: "1",
            BitsStored: "1",
            HighBit: "0",
            PixelRepresentation: "0",
            LossyImageCompression: "00",
            SegmentationType: "BINARY",
            ContentLabel: "SEGMENTATION"
        });

        const dimensionUID = DicomMetaDictionary.uid();
        this.dataset.DimensionOrganizationSequence = {
            DimensionOrganizationUID: dimensionUID
        };
        this.dataset.DimensionIndexSequence = [
            {
                DimensionOrganizationUID: dimensionUID,
                DimensionIndexPointer: 6422539,
                FunctionalGroupPointer: 6422538, // SegmentIdentificationSequence
                DimensionDescriptionLabel: "ReferencedSegmentNumber"
            },
            {
                DimensionOrganizationUID: dimensionUID,
                DimensionIndexPointer: 2097202,
                FunctionalGroupPointer: 2134291, // PlanePositionSequence
                DimensionDescriptionLabel: "ImagePositionPatient"
            }
        ];

        this.dataset.SegmentSequence = [];

        // TODO: check logic here.
        // If the referenced dataset itself references a series, then copy.
        // Otherwise, reference the dataset itself.
        // This should allow Slicer and others to get the correct original
        // images when loading Legacy Converted Images, but it's a workaround
        // that really doesn't belong here.
        if (this._referencedDataset.ReferencedSeriesSequence) {
            this.dataset.ReferencedSeriesSequence = DerivedDataset.copyDataset(
                this._referencedDataset.ReferencedSeriesSequence
            );
        } else {
            const ReferencedInstanceSequence: ReferencedInstanceSequenceEntry[] = [];

            for (let i = 0; i < this._referencedDatasets.length; i++) {
                ReferencedInstanceSequence.push({
                    ReferencedSOPClassUID: this._referencedDatasets[i].SOPClassUID || "",
                    ReferencedSOPInstanceUID: this._referencedDatasets[i].SOPInstanceUID || ""
                });
            }

            this.dataset.ReferencedSeriesSequence = {
                SeriesInstanceUID: this._referencedDataset.SeriesInstanceUID,
                StudyInstanceUID: this._referencedDataset.StudyInstanceUID,
                ReferencedInstanceSequence
            };
        }

        if (!this.options.includeSliceSpacing) {
            // per dciodvfy this should not be included, but dcmqi/Slicer requires it
            if (this.dataset.SharedFunctionalGroupsSequence?.PixelMeasuresSequence) {
                delete this.dataset.SharedFunctionalGroupsSequence.PixelMeasuresSequence.SpacingBetweenSlices;
            }
        }

        if (this.dataset.SharedFunctionalGroupsSequence?.PixelValueTransformationSequence) {
            // If derived from a CT, this shouldn't be left in the SEG.
            delete this.dataset.SharedFunctionalGroupsSequence.PixelValueTransformationSequence;
        }

        // The pixelData array needs to be defined once you know how many frames you'll have.
        this.dataset.PixelData = undefined;
        this.dataset.NumberOfFrames = 0;

        this.dataset.PerFrameFunctionalGroupsSequence = [];
    }

    /**
     * setNumberOfFrames - Sets the number of frames of the segmentation object
     * and allocates (non-bitpacked) memory for the PixelData for constuction.
     *
     * @param NumberOfFrames - The number of segmentation frames.
     */
    setNumberOfFrames(NumberOfFrames: number): void {
        const dataset = this.dataset;
        dataset.NumberOfFrames = NumberOfFrames;

        dataset.PixelData = new ArrayBuffer(dataset.Rows * dataset.Columns * NumberOfFrames);
    }

    /**
     * bitPackPixelData - Bitpacks the pixeldata, should be called after all
     * segments are addded.
     */
    bitPackPixelData(): void {
        if (this.isBitpacked) {
            console.warn(
                `This.bitPackPixelData has already been called, it should only be called once, when all frames have been added. Exiting.`
            );
        }

        const dataset = this.dataset;
        const unpackedPixelData = dataset.PixelData;
        if (!unpackedPixelData) {
            return;
        }
        const uInt8ViewUnpackedPixelData = new Uint8Array(unpackedPixelData);
        const bitPackedPixelData = BitArray.pack(uInt8ViewUnpackedPixelData);

        dataset.PixelData = bitPackedPixelData.buffer as ArrayBuffer;

        this.isBitpacked = true;
    }

    /**
     * addSegmentFromLabelmap - Adds a segment to the dataset,
     * where the labelmaps are a set of 2D labelmaps, from which to extract the binary maps.
     *
     * @param Segment - The segment metadata.
     * @param labelmaps - labelmap arrays for each index of referencedFrameNumbers.
     * @param segmentIndexInLabelmap - The segment index to extract from the labelmap
     *    (might be different to the segment metadata depending on implementation).
     * @param referencedFrameNumbers - The frames that the segmentation references.
     */
    addSegmentFromLabelmap(
        Segment: SegmentMetadata,
        labelmaps: Uint8Array[],
        segmentIndexInLabelmap: number,
        referencedFrameNumbers: number[]
    ): void {
        if (this.dataset.NumberOfFrames === 0) {
            throw new Error(
                "Must set the total number of frames via setNumberOfFrames() before adding segments to the segmentation."
            );
        }

        this._addSegmentPixelDataFromLabelmaps(labelmaps, segmentIndexInLabelmap);
        const ReferencedSegmentNumber = this._addSegmentMetadata(Segment);
        this._addPerFrameFunctionalGroups(ReferencedSegmentNumber, referencedFrameNumbers);
    }

    private _addSegmentPixelDataFromLabelmaps(labelmaps: Uint8Array[], segmentIndex: number): void {
        const dataset = this.dataset;
        const existingFrames = dataset.PerFrameFunctionalGroupsSequence.length;
        const sliceLength = dataset.Rows * dataset.Columns;
        const byteOffset = existingFrames * sliceLength;

        if (!dataset.PixelData) {
            return;
        }
        const pixelDataUInt8View = new Uint8Array(dataset.PixelData, byteOffset, labelmaps.length * sliceLength);

        const occupiedValue = this._getOccupiedValue();

        for (let l = 0; l < labelmaps.length; l++) {
            const labelmap = labelmaps[l];

            for (let i = 0; i < labelmap.length; i++) {
                if (labelmap[i] === segmentIndex) {
                    pixelDataUInt8View[l * sliceLength + i] = occupiedValue;
                }
            }
        }
    }

    private _getOccupiedValue(): number {
        if (this.dataset.SegmentationType === "FRACTIONAL") {
            return 255;
        }

        return 1;
    }

    /**
     * addSegment - Adds a segment to the dataset.
     *
     * @param Segment - The segment metadata.
     * @param pixelData - The pixelData array containing all frames of the segmentation.
     * @param referencedFrameNumbers - The frames that the segmentation references.
     */
    addSegment(Segment: SegmentMetadata, pixelData: Uint8Array, referencedFrameNumbers: number[]): void {
        if (this.dataset.NumberOfFrames === 0) {
            throw new Error(
                "Must set the total number of frames via setNumberOfFrames() before adding segments to the segmentation."
            );
        }

        this._addSegmentPixelData(pixelData);
        const ReferencedSegmentNumber = this._addSegmentMetadata(Segment);
        this._addPerFrameFunctionalGroups(ReferencedSegmentNumber, referencedFrameNumbers);
    }

    private _addSegmentPixelData(pixelData: Uint8Array): void {
        const dataset = this.dataset;

        const existingFrames = dataset.PerFrameFunctionalGroupsSequence.length;
        const sliceLength = dataset.Rows * dataset.Columns;
        const byteOffset = existingFrames * sliceLength;

        if (!dataset.PixelData) {
            return;
        }
        const pixelDataUInt8View = new Uint8Array(dataset.PixelData, byteOffset, pixelData.length);

        for (let i = 0; i < pixelData.length; i++) {
            pixelDataUInt8View[i] = pixelData[i];
        }
    }

    private _addPerFrameFunctionalGroups(ReferencedSegmentNumber: string, referencedFrameNumbers: number[]): void {
        const PerFrameFunctionalGroupsSequence = this.dataset.PerFrameFunctionalGroupsSequence;

        const ReferencedSeriesSequence = this._referencedDataset.ReferencedSeriesSequence;

        for (let i = 0; i < referencedFrameNumbers.length; i++) {
            const frameNumber = referencedFrameNumbers[i];

            const perFrameFunctionalGroups: Partial<PerFrameFunctionalGroup> = {};

            const referencedPerFrame = this._referencedDataset.PerFrameFunctionalGroupsSequence;
            if (referencedPerFrame && referencedPerFrame[frameNumber - 1]) {
                perFrameFunctionalGroups.PlanePositionSequence = DerivedDataset.copyDataset(
                    referencedPerFrame[frameNumber - 1].PlanePositionSequence
                );

                // If the PlaneOrientationSequence is not in the SharedFunctionalGroupsSequence,
                // extract it from the PerFrameFunctionalGroupsSequence.
                if (!this.dataset.SharedFunctionalGroupsSequence?.PlaneOrientationSequence) {
                    perFrameFunctionalGroups.PlaneOrientationSequence = DerivedDataset.copyDataset(
                        referencedPerFrame[frameNumber - 1].PlaneOrientationSequence
                    );
                }
            }

            perFrameFunctionalGroups.FrameContentSequence = {
                DimensionIndexValues: [ReferencedSegmentNumber, frameNumber]
            };

            perFrameFunctionalGroups.SegmentIdentificationSequence = {
                ReferencedSegmentNumber
            };

            let ReferencedSOPClassUID: string;
            let ReferencedSOPInstanceUID: string;
            let ReferencedFrameNumber: number | undefined;

            if (ReferencedSeriesSequence) {
                const referencedInstanceSequenceI =
                    ReferencedSeriesSequence.ReferencedInstanceSequence[frameNumber - 1];

                ReferencedSOPClassUID = referencedInstanceSequenceI.ReferencedSOPClassUID;
                ReferencedSOPInstanceUID = referencedInstanceSequenceI.ReferencedSOPInstanceUID;

                if (Normalizer.isMultiframeSOPClassUID(ReferencedSOPClassUID)) {
                    ReferencedFrameNumber = frameNumber;
                }
            } else {
                ReferencedSOPClassUID = this._referencedDataset.SOPClassUID || "";
                ReferencedSOPInstanceUID = this._referencedDataset.SOPInstanceUID || "";
                ReferencedFrameNumber = frameNumber;
            }

            if (ReferencedFrameNumber) {
                perFrameFunctionalGroups.DerivationImageSequence = {
                    SourceImageSequence: {
                        ReferencedSOPClassUID,
                        ReferencedSOPInstanceUID,
                        ReferencedFrameNumber,
                        PurposeOfReferenceCodeSequence: {
                            CodeValue: "121322",
                            CodingSchemeDesignator: "DCM",
                            CodeMeaning: "Source image for image processing operation"
                        }
                    },
                    DerivationCodeSequence: {
                        CodeValue: "113076",
                        CodingSchemeDesignator: "DCM",
                        CodeMeaning: "Segmentation"
                    }
                };
            } else {
                perFrameFunctionalGroups.DerivationImageSequence = {
                    SourceImageSequence: {
                        ReferencedSOPClassUID,
                        ReferencedSOPInstanceUID,
                        PurposeOfReferenceCodeSequence: {
                            CodeValue: "121322",
                            CodingSchemeDesignator: "DCM",
                            CodeMeaning: "Source image for image processing operation"
                        }
                    },
                    DerivationCodeSequence: {
                        CodeValue: "113076",
                        CodingSchemeDesignator: "DCM",
                        CodeMeaning: "Segmentation"
                    }
                };
            }

            PerFrameFunctionalGroupsSequence.push(perFrameFunctionalGroups as PerFrameFunctionalGroup);
        }
    }

    private _addSegmentMetadata(Segment: SegmentMetadata): string {
        if (
            !Segment.SegmentLabel ||
            !Segment.SegmentedPropertyCategoryCodeSequence ||
            !Segment.SegmentedPropertyTypeCodeSequence ||
            !Segment.SegmentAlgorithmType
        ) {
            throw new Error(`Segment does not contain all the required fields.`);
        }

        // Capitalise the SegmentAlgorithmType if it happens to be given in
        // Lower/mixed case.
        Segment.SegmentAlgorithmType = Segment.SegmentAlgorithmType.toUpperCase();

        // Check SegmentAlgorithmType and SegmentAlgorithmName if necessary.
        switch (Segment.SegmentAlgorithmType) {
            case "AUTOMATIC":
            case "SEMIAUTOMATIC":
                if (!Segment.SegmentAlgorithmName) {
                    throw new Error(
                        `If the SegmentAlgorithmType is SEMIAUTOMATIC or AUTOMATIC,
          SegmentAlgorithmName must be provided`
                    );
                }

                break;
            case "MANUAL":
                break;
            default:
                throw new Error(`SegmentAlgorithmType ${Segment.SegmentAlgorithmType} invalid.`);
        }

        // Deep copy, so we don't change the segment index stored in cornerstoneTools.

        const SegmentSequence = this.dataset.SegmentSequence;

        const SegmentAlgorithmType = Segment.SegmentAlgorithmType;

        const reNumberedSegmentCopy: SegmentSequenceEntry = {
            SegmentedPropertyCategoryCodeSequence: Segment.SegmentedPropertyCategoryCodeSequence,
            SegmentNumber: (SegmentSequence.length + 1).toString(),
            SegmentLabel: Segment.SegmentLabel,
            SegmentAlgorithmType,
            RecommendedDisplayCIELabValue: Segment.RecommendedDisplayCIELabValue,
            SegmentedPropertyTypeCodeSequence: Segment.SegmentedPropertyTypeCodeSequence
        };

        if (Segment.SegmentDescription) {
            reNumberedSegmentCopy.SegmentDescription = Segment.SegmentDescription;
        }

        if (SegmentAlgorithmType === "AUTOMATIC" || SegmentAlgorithmType === "SEMIAUTOMATIC") {
            reNumberedSegmentCopy.SegmentAlgorithmName = Segment.SegmentAlgorithmName;
        }

        SegmentSequence.push(reNumberedSegmentCopy);

        return reNumberedSegmentCopy.SegmentNumber;
    }
}
