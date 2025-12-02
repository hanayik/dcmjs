import {
    DicomMetaDictionary,
    type NaturalizedDataset,
    type SopClassUIDsByName,
    type VRMap
} from "./DicomMetaDictionary.js";
import { DerivedImage } from "./derivations/index.js";
import log from "./log.js";

/** 3D vector represented as a 3-element number array */
type Vec3 = [number, number, number];

/** Pair of distance and dataset used during sorting */
type DistanceDatasetPair = [number, DicomDataset];

/** VOI LUT Sequence structure for window/level information */
interface FrameVOILUTSequence {
    WindowCenter?: string | number | (string | number)[];
    WindowWidth?: string | number | (string | number)[];
}

/** Frame content sequence for per-frame information */
interface FrameContentSequence {
    FrameAcquisitionDuration: number;
    StackID: number;
    InStackPositionNumber: number;
    DimensionIndexValues: number;
    FrameAcquisitionDateTime?: string;
    FrameReferenceDateTime?: string;
}

/** Plane position sequence with image position */
interface PlanePositionSequence {
    ImagePositionPatient: number[];
}

/** Per-frame functional group structure */
interface PerFrameFunctionalGroup {
    PlanePositionSequence?: PlanePositionSequence;
    FrameVOILUTSequence?: FrameVOILUTSequence;
    FrameVOILUT?: boolean;
    FrameContentSequence?: FrameContentSequence;
}

/** Plane orientation sequence */
interface PlaneOrientationSequence {
    ImageOrientationPatient: number[];
}

/** Pixel measures sequence */
interface PixelMeasuresSequence {
    PixelSpacing: number[];
    SpacingBetweenSlices: number;
    SliceThickness: number;
}

/** Pixel value transformation sequence */
interface PixelValueTransformationSequence {
    RescaleIntercept: number | string;
    RescaleSlope: number | string;
    RescaleType: string;
}

/** MR Image frame type sequence */
interface MRImageFrameTypeSequence {
    FrameType: string[];
    PixelPresentation: string;
    VolumetricProperties: string;
    VolumeBasedCalculationTechnique: string;
    ComplexImageComponent: string;
    AcquisitionContrast: string;
}

/** Frame anatomy sequence */
interface FrameAnatomySequence {
    AnatomicRegionSequence: {
        CodeValue: string;
        CodingSchemeDesignator: string;
        CodeMeaning: string;
    };
    FrameLaterality: string;
}

/** Shared functional groups sequence structure */
interface SharedFunctionalGroupsSequence {
    PlaneOrientationSequence?: PlaneOrientationSequence;
    PixelMeasuresSequence?: PixelMeasuresSequence;
    PixelValueTransformationSequence?: PixelValueTransformationSequence;
    MRImageFrameTypeSequence?: MRImageFrameTypeSequence;
    FrameAnatomySequence?: FrameAnatomySequence;
}

/** Referenced instance in a series */
interface ReferencedInstance {
    ReferencedSOPClassUID: string;
    ReferencedSOPInstanceUID: string;
}

/** Referenced series sequence */
interface ReferencedSeriesSequence {
    SeriesInstanceUID: string;
    ReferencedInstanceSequence: ReferencedInstance[];
}

/** Dimension index sequence item */
interface DimensionIndexSequenceItem {
    DimensionOrganizationUID: string;
    DimensionIndexPointer: number;
    FunctionalGroupPointer: number;
    DimensionDescriptionLabel: string;
}

/** Dimension organization sequence */
interface DimensionOrganizationSequence {
    DimensionOrganizationUID: string;
}

/** DICOM Dataset with all properties needed for normalization */
interface DicomDataset {
    _vrMap: VRMap;
    _meta?: NaturalizedDataset;
    SOPClassUID?: string;
    SOPInstanceUID?: string;
    SeriesInstanceUID?: string;
    NumberOfFrames?: number | string;
    Rows?: number;
    Columns?: number;
    BitsAllocated?: number;
    PixelRepresentation?: number;
    RescaleSlope?: string | number;
    RescaleIntercept?: string | number;
    ImagePositionPatient?: number[];
    ImageOrientationPatient?: number[];
    PixelSpacing?: number[];
    PixelData?: ArrayBuffer;
    WindowCenter?: (string | number)[] | string | number;
    WindowWidth?: (string | number)[] | string | number;
    SharedFunctionalGroupsSequence?: SharedFunctionalGroupsSequence;
    PerFrameFunctionalGroupsSequence?: PerFrameFunctionalGroup[] | PerFrameFunctionalGroup;
    ReferencedSeriesSequence?: ReferencedSeriesSequence;
    DimensionOrganizationSequence?: DimensionOrganizationSequence;
    DimensionIndexSequence?: DimensionIndexSequenceItem[];
    StudyID?: string;
    Laterality?: string;
    PresentationLUTShape?: string;
    BodyPartExamined?: string;
    ImageType?: string[];
    AcquisitionDate?: string;
    AcquisitionTime?: string;
    [key: string]: unknown;
}

/** Constructor type for normalizer classes */
type NormalizerConstructor = new (datasets: DicomDataset[]) => Normalizer;

class Normalizer {
    datasets: DicomDataset[];
    dataset: DicomDataset | undefined;

    constructor(datasets: DicomDataset[]) {
        this.datasets = datasets; // one or more dicom-like object instances
        this.dataset = undefined; // a normalized multiframe dicom object instance
    }

    static consistentSOPClassUIDs(datasets: DicomDataset[]): string | undefined {
        // return sopClassUID if all exist and match, otherwise undefined
        let sopClassUID: string | undefined;
        datasets.forEach(function (dataset) {
            if (!dataset.SOPClassUID) {
                return undefined;
            }
            if (!sopClassUID) {
                sopClassUID = dataset.SOPClassUID;
            }
            if (dataset.SOPClassUID !== sopClassUID) {
                log.error("inconsistent sopClassUIDs: ", dataset.SOPClassUID, sopClassUID);
                return undefined;
            }
        });
        return sopClassUID;
    }

    static normalizerForSOPClassUID(sopClassUID: string): NormalizerConstructor | undefined {
        sopClassUID = sopClassUID.replace(/[^0-9.]/g, ""); // TODO: clean all VRs as part of normalizing
        const toUID: SopClassUIDsByName = DicomMetaDictionary.sopClassUIDsByName;
        const sopClassUIDMap: Record<string, NormalizerConstructor> = {};
        sopClassUIDMap[toUID.NMImage] = NMImageNormalizer;
        sopClassUIDMap[toUID.CTImage] = CTImageNormalizer;
        sopClassUIDMap[toUID.ParametricMapStorage] = PMImageNormalizer;
        sopClassUIDMap[toUID.MRImage] = MRImageNormalizer;
        sopClassUIDMap[toUID.EnhancedCTImage] = EnhancedCTImageNormalizer;
        sopClassUIDMap[toUID.LegacyConvertedEnhancedCTImage] = EnhancedCTImageNormalizer;
        sopClassUIDMap[toUID.EnhancedMRImage] = EnhancedMRImageNormalizer;
        sopClassUIDMap[toUID.LegacyConvertedEnhancedMRImage] = EnhancedMRImageNormalizer;
        sopClassUIDMap[toUID.EnhancedUSVolume] = EnhancedUSVolumeNormalizer;
        sopClassUIDMap[toUID.PETImage] = PETImageNormalizer;
        sopClassUIDMap[toUID.EnhancedPETImage] = PETImageNormalizer;
        sopClassUIDMap[toUID.LegacyConvertedEnhancedPETImage] = PETImageNormalizer;
        sopClassUIDMap[toUID.Segmentation] = SEGImageNormalizer;
        sopClassUIDMap[toUID.DeformableSpatialRegistration] = DSRNormalizer;
        sopClassUIDMap[toUID.OphthalmicPhotography8BitImage] = OPImageNormalizer;
        sopClassUIDMap[toUID.OphthalmicTomographyImage] = OCTImageNormalizer;
        sopClassUIDMap[toUID.LabelmapSegmentation] = SEGImageNormalizer; // Labelmap Segmentation uses the same normalizer as Segmentation
        return sopClassUIDMap[sopClassUID];
    }

    static isMultiframeSOPClassUID(sopClassUID: string): boolean {
        const toUID: SopClassUIDsByName = DicomMetaDictionary.sopClassUIDsByName;
        const multiframeSOPClasses: string[] = [
            toUID.NMImage,
            toUID.EnhancedMRImage,
            toUID.LegacyConvertedEnhancedMRImage,
            toUID.EnhancedCTImage,
            toUID.LegacyConvertedEnhancedCTImage,
            toUID.EnhancedUSVolume,
            toUID.EnhancedPETImage,
            toUID.LegacyConvertedEnhancedPETImage,
            toUID.Segmentation,
            toUID.ParametricMapStorage,
            toUID.OphthalmicTomographyImage,
            toUID.LabelmapSegmentation // Labelmap Segmentation SOP Class UID
        ];
        return multiframeSOPClasses.indexOf(sopClassUID) !== -1;
    }

    static isMultiframeDataset(ds: DicomDataset): boolean {
        const sopClassUID = ds.SOPClassUID!.replace(/[^0-9.]/g, ""); // TODO: clean all VRs as part of normalizing
        return Normalizer.isMultiframeSOPClassUID(sopClassUID);
    }

    normalize(): string | void {
        return "No normalization defined";
    }

    static normalizeToDataset(datasets: DicomDataset[]): DicomDataset | undefined {
        const sopClassUID = Normalizer.consistentSOPClassUIDs(datasets);
        if (!sopClassUID) {
            log.error("no sopClassUID found");
            return undefined;
        }
        const normalizerClass = Normalizer.normalizerForSOPClassUID(sopClassUID);

        if (!normalizerClass) {
            log.error("no normalizerClass for ", sopClassUID);
            return undefined;
        }
        const normalizer = new normalizerClass(datasets);
        normalizer.normalize();
        return normalizer.dataset;
    }
}

class ImageNormalizer extends Normalizer {
    derivation: DerivedImage | undefined;

    normalize(): void {
        this.convertToMultiframe();
        this.normalizeMultiframe();
    }

    static vec3CrossProduct(a: Vec3, b: Vec3): Vec3 {
        const ax = a[0],
            ay = a[1],
            az = a[2],
            bx = b[0],
            by = b[1],
            bz = b[2];
        const out: Vec3 = [0, 0, 0];
        out[0] = ay * bz - az * by;
        out[1] = az * bx - ax * bz;
        out[2] = ax * by - ay * bx;
        return out;
    }

    static vec3Subtract(a: Vec3, b: Vec3): Vec3 {
        const out: Vec3 = [0, 0, 0];
        out[0] = a[0] - b[0];
        out[1] = a[1] - b[1];
        out[2] = a[2] - b[2];
        return out;
    }

    static vec3Dot(a: Vec3, b: Vec3): number {
        return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    }

    convertToMultiframe(): void {
        if (this.datasets.length === 1 && Normalizer.isMultiframeDataset(this.datasets[0])) {
            // already a multiframe, so just use it
            this.dataset = this.datasets[0];
            return;
        }
        this.derivation = new DerivedImage(this.datasets as NaturalizedDataset[]);
        this.dataset = this.derivation.dataset as unknown as DicomDataset;
        const ds = this.dataset;
        // create a new multiframe from the source datasets
        // fill in only those elements required to make a valid image
        // for volumetric processing
        const referenceDataset = this.datasets[0];
        ds.NumberOfFrames = this.datasets.length;

        // TODO: develop sets of elements to copy over in loops
        ds.SOPClassUID = referenceDataset.SOPClassUID;
        ds.Rows = referenceDataset.Rows;
        ds.Columns = referenceDataset.Columns;
        ds.BitsAllocated = referenceDataset.BitsAllocated;
        ds.PixelRepresentation = referenceDataset.PixelRepresentation;
        ds.RescaleSlope = referenceDataset.RescaleSlope || "1";
        ds.RescaleIntercept = referenceDataset.RescaleIntercept || "0";
        //ds.BurnedInAnnotation = referenceDataset.BurnedInAnnotation || "YES";

        // sort
        // https://github.com/pieper/Slicer3/blob/master/Base/GUI/Tcl/LoadVolume.tcl
        // TODO: add spacing checks:
        // https://github.com/Slicer/Slicer/blob/master/Modules/Scripted/DICOMPlugins/DICOMScalarVolumePlugin.py#L228-L250
        // TODO: put this information into the Shared and PerFrame functional groups
        // TODO: sorting of frames could happen in normalizeMultiframe instead, since other
        // multiframe converters may not sort the images
        // TODO: sorting can be seen as part of generation of the Dimension Multiframe Dimension Module
        // and should really be done in an acquisition-specific way (e.g. for DCE)
        const referencePosition = referenceDataset.ImagePositionPatient!;
        const rowVector = referenceDataset.ImageOrientationPatient!.slice(0, 3) as Vec3;
        const columnVector = referenceDataset.ImageOrientationPatient!.slice(3, 6) as Vec3;
        const scanAxis = ImageNormalizer.vec3CrossProduct(rowVector, columnVector);
        const distanceDatasetPairs: DistanceDatasetPair[] = [];
        this.datasets.forEach(function (dataset) {
            const position = dataset.ImagePositionPatient!.slice() as Vec3;
            const positionVector = ImageNormalizer.vec3Subtract(position, referencePosition as Vec3);
            const distance = ImageNormalizer.vec3Dot(positionVector, scanAxis);
            distanceDatasetPairs.push([distance, dataset]);
        });
        distanceDatasetPairs.sort(function (a, b) {
            return b[0] - a[0];
        });

        // assign array buffers
        if (ds.BitsAllocated !== 16) {
            log.error("Only works with 16 bit data, not " + String(this.dataset.BitsAllocated));
        }
        const refVrMap = referenceDataset._vrMap as VRMap | undefined;
        if (refVrMap && !refVrMap.PixelData) {
            log.warn("No vr map given for pixel data, using OW");
            ds._vrMap = { PixelData: "OW" } as VRMap;
        } else {
            ds._vrMap = { PixelData: refVrMap?.PixelData || "OW" } as VRMap;
        }
        const frameSize = referenceDataset.PixelData!.byteLength;
        const numFrames = ds.NumberOfFrames;
        ds.PixelData = new ArrayBuffer(numFrames * frameSize);
        let frame = 0;
        distanceDatasetPairs.forEach(function (pair) {
            const [pairDistance, dataset] = pair;
            const pixels = new Uint16Array(dataset.PixelData!);
            const frameView = new Uint16Array(ds.PixelData!, frame * frameSize, frameSize / 2);
            try {
                frameView.set(pixels);
            } catch (e) {
                if (e instanceof RangeError) {
                    const message =
                        "Error inserting pixels in PixelData\n" +
                        `frameSize ${frameSize}\n` +
                        `NumberOfFrames ${ds.NumberOfFrames}\n` +
                        `pair distance: ${pairDistance}, dataset SOPInstanceUID: ${dataset.SOPInstanceUID}\n` +
                        `dataset PixelData size ${dataset.PixelData!.byteLength}`;
                    log.error(message);
                }
            }
            frame++;
        });

        if (numFrames < 2) {
            // TODO
            log.error("Cannot populate shared groups uniquely without multiple frames");
        }
        const [distance0, dataset0] = distanceDatasetPairs[0];
        const distance1 = distanceDatasetPairs[1][0];

        //
        // make the functional groups
        //
        // shared
        const SpacingBetweenSlices = Math.abs(distance1 - distance0);

        ds.SharedFunctionalGroupsSequence = {
            PlaneOrientationSequence: {
                ImageOrientationPatient: dataset0.ImageOrientationPatient!
            },
            PixelMeasuresSequence: {
                PixelSpacing: dataset0.PixelSpacing!,
                SpacingBetweenSlices: SpacingBetweenSlices,
                SliceThickness: SpacingBetweenSlices
            }
        };

        ds.ReferencedSeriesSequence = {
            SeriesInstanceUID: dataset0.SeriesInstanceUID!,
            ReferencedInstanceSequence: []
        };

        // per-frame
        ds.PerFrameFunctionalGroupsSequence = [];

        // copy over each datasets window/level into the per-frame groups
        // and set the referenced series uid
        distanceDatasetPairs.forEach(function (pair) {
            const dataset = pair[1];

            (ds.PerFrameFunctionalGroupsSequence as PerFrameFunctionalGroup[]).push({
                PlanePositionSequence: {
                    ImagePositionPatient: dataset.ImagePositionPatient!
                },
                FrameVOILUTSequence: {
                    WindowCenter: dataset.WindowCenter as string | number | (string | number)[],
                    WindowWidth: dataset.WindowWidth as string | number | (string | number)[]
                }
            });

            ds.ReferencedSeriesSequence!.ReferencedInstanceSequence.push({
                ReferencedSOPClassUID: dataset.SOPClassUID!,
                ReferencedSOPInstanceUID: dataset.SOPInstanceUID!
            });
        });

        const dimensionUID = DicomMetaDictionary.uid();
        this.dataset.DimensionOrganizationSequence = {
            DimensionOrganizationUID: dimensionUID
        };
        this.dataset.DimensionIndexSequence = [
            {
                DimensionOrganizationUID: dimensionUID,
                DimensionIndexPointer: 2097202,
                FunctionalGroupPointer: 2134291, // PlanePositionSequence
                DimensionDescriptionLabel: "ImagePositionPatient"
            }
        ];
    }

    normalizeMultiframe(): void {
        const ds = this.dataset!;

        if (!ds.NumberOfFrames) {
            log.error("Missing number or frames not supported");
            return;
        }

        if (!ds.PixelRepresentation) {
            // Required tag: guess signed
            ds.PixelRepresentation = 1;
        }

        if (!ds.StudyID || ds.StudyID === "") {
            // Required tag: fill in if needed
            ds.StudyID = "No Study ID";
        }

        const validLateralities = ["R", "L"];
        if (ds.Laterality && validLateralities.indexOf(ds.Laterality) === -1) {
            delete ds.Laterality;
        }

        if (!ds.PresentationLUTShape) {
            ds.PresentationLUTShape = "IDENTITY";
        }

        if (!ds.SharedFunctionalGroupsSequence) {
            log.error("Can only process multiframe data with SharedFunctionalGroupsSequence");
        }

        // TODO: special case!
        if (ds.BodyPartExamined === "PROSTATE") {
            ds.SharedFunctionalGroupsSequence!.FrameAnatomySequence = {
                AnatomicRegionSequence: {
                    CodeValue: "T-9200B",
                    CodingSchemeDesignator: "SRT",
                    CodeMeaning: "Prostate"
                },
                FrameLaterality: "U"
            };
        }

        const rescaleIntercept = ds.RescaleIntercept || 0;
        const rescaleSlope = ds.RescaleSlope || 1;
        ds.SharedFunctionalGroupsSequence!.PixelValueTransformationSequence = {
            RescaleIntercept: rescaleIntercept,
            RescaleSlope: rescaleSlope,
            RescaleType: "US"
        };
        let frameNumber = 1;
        this.datasets.forEach((dataset) => {
            if (ds.NumberOfFrames === 1) {
                ds.PerFrameFunctionalGroupsSequence = [ds.PerFrameFunctionalGroupsSequence as PerFrameFunctionalGroup];
            }
            (ds.PerFrameFunctionalGroupsSequence as PerFrameFunctionalGroup[])[frameNumber - 1].FrameContentSequence = {
                FrameAcquisitionDuration: 0,
                StackID: 1,
                InStackPositionNumber: frameNumber,
                DimensionIndexValues: frameNumber
            };
            const frameTime = (dataset.AcquisitionDate || "") + (dataset.AcquisitionTime || "");
            if (frameTime && !isNaN(Number(frameTime))) {
                const frameContentSequence = (ds.PerFrameFunctionalGroupsSequence as PerFrameFunctionalGroup[])[
                    frameNumber - 1
                ].FrameContentSequence!;
                frameContentSequence.FrameAcquisitionDateTime = frameTime;
                frameContentSequence.FrameReferenceDateTime = frameTime;
            }

            frameNumber++;
        });

        //
        // TODO: convert this to shared functional group not top level element
        //
        if (ds.WindowCenter && ds.WindowWidth) {
            // if they exist as single values, make them lists for consistency
            if (!Array.isArray(ds.WindowCenter)) {
                ds.WindowCenter = [ds.WindowCenter];
            }
            if (!Array.isArray(ds.WindowWidth)) {
                ds.WindowWidth = [ds.WindowWidth];
            }
        }
        if (!ds.WindowCenter || !ds.WindowWidth) {
            // if they don't exist, make them empty lists and try to initialize them
            ds.WindowCenter = []; // both must exist and be the same length
            ds.WindowWidth = [];
            // provide a volume-level window/level guess (mean of per-frame)
            if (ds.PerFrameFunctionalGroupsSequence) {
                const wcww = { center: 0, width: 0, count: 0 };
                (ds.PerFrameFunctionalGroupsSequence as PerFrameFunctionalGroup[]).forEach(function (functionalGroup) {
                    if (functionalGroup.FrameVOILUT) {
                        let wc = functionalGroup.FrameVOILUTSequence?.WindowCenter;
                        let ww = functionalGroup.FrameVOILUTSequence?.WindowWidth;
                        if (functionalGroup.FrameVOILUTSequence && wc && ww) {
                            if (Array.isArray(wc)) {
                                wc = wc[0];
                            }
                            if (Array.isArray(ww)) {
                                ww = ww[0];
                            }
                            wcww.center += Number(wc);
                            wcww.width += Number(ww);
                            wcww.count++;
                        }
                    }
                });
                if (wcww.count > 0) {
                    ds.WindowCenter.push(String(wcww.center / wcww.count));
                    ds.WindowWidth.push(String(wcww.width / wcww.count));
                }
            }
        }
        // last gasp, pick an arbitrary default
        if ((ds.WindowCenter as (string | number)[]).length === 0) {
            ds.WindowCenter = [300];
        }
        if ((ds.WindowWidth as (string | number)[]).length === 0) {
            ds.WindowWidth = [500];
        }
    }
}

class MRImageNormalizer extends ImageNormalizer {
    normalize(): void {
        super.normalize();
        // TODO: make specialization for LegacyConverted vs normal EnhanceMRImage
        //let toUID = DicomMetaDictionary.sopClassUIDsByName;
        this.dataset!.SOPClassUID = "LegacyConvertedEnhancedMRImage";
        //this.dataset.SOPClassUID = toUID.EnhancedMRImage;
    }

    normalizeMultiframe(): void {
        super.normalizeMultiframe();
        const ds = this.dataset!;

        if (
            !ds.ImageType ||
            !ds.ImageType.constructor ||
            ds.ImageType.constructor.name != "Array" ||
            ds.ImageType.length != 4
        ) {
            ds.ImageType = ["ORIGINAL", "PRIMARY", "OTHER", "NONE"];
        }

        ds.SharedFunctionalGroupsSequence!.MRImageFrameTypeSequence = {
            FrameType: ds.ImageType,
            PixelPresentation: "MONOCHROME",
            VolumetricProperties: "VOLUME",
            VolumeBasedCalculationTechnique: "NONE",
            ComplexImageComponent: "MAGNITUDE",
            AcquisitionContrast: "UNKNOWN"
        };
    }
}

class EnhancedCTImageNormalizer extends ImageNormalizer {
    normalize(): void {
        super.normalize();
    }
}

class EnhancedMRImageNormalizer extends ImageNormalizer {
    normalize(): void {
        super.normalize();
    }
}

class EnhancedUSVolumeNormalizer extends ImageNormalizer {
    normalize(): void {
        super.normalize();
    }
}
class NMImageNormalizer extends ImageNormalizer {
    normalize(): void {
        super.normalize();
        // TODO: provide option at export to swap in LegacyConverted UID
        const toUID: SopClassUIDsByName = DicomMetaDictionary.sopClassUIDsByName;

        this.dataset!.SOPClassUID = toUID.NMImage;
    }
}

class CTImageNormalizer extends ImageNormalizer {
    normalize(): void {
        super.normalize();
        // TODO: provide option at export to swap in LegacyConverted UID
        const toUID: SopClassUIDsByName = DicomMetaDictionary.sopClassUIDsByName;
        //this.dataset.SOPClassUID = "LegacyConvertedEnhancedCTImage";
        this.dataset!.SOPClassUID = toUID.EnhancedCTImage;
    }
}

class PETImageNormalizer extends ImageNormalizer {
    normalize(): void {
        super.normalize();
        // TODO: provide option at export to swap in LegacyConverted UID
        const toUID: SopClassUIDsByName = DicomMetaDictionary.sopClassUIDsByName;
        //this.dataset.SOPClassUID = "LegacyConvertedEnhancedPETImage";
        this.dataset!.SOPClassUID = toUID.EnhancedPETImage;
    }
}

class SEGImageNormalizer extends ImageNormalizer {
    normalize(): void {
        super.normalize();
    }
}

class PMImageNormalizer extends ImageNormalizer {
    normalize(): void {
        super.normalize();
        const ds = this.datasets[0];
        if (ds.BitsAllocated !== 32) {
            log.error("Only works with 32 bit data, not " + String(ds.BitsAllocated));
        }
    }
}

class DSRNormalizer extends Normalizer {
    normalize(): void {
        this.dataset = this.datasets[0]; // only one dataset per series and for now we assume it is normalized
    }
}

class OPImageNormalizer extends Normalizer {
    normalize(): void {
        this.dataset = this.datasets[0]; // only one dataset per series and for now we assume it is normalized
    }
}

class OCTImageNormalizer extends ImageNormalizer {
    normalize(): void {
        super.normalize();
    }
}

export { Normalizer };
export { ImageNormalizer };
export { MRImageNormalizer };
export { EnhancedCTImageNormalizer };
export { EnhancedMRImageNormalizer };
export { EnhancedUSVolumeNormalizer };
export { NMImageNormalizer };
export { CTImageNormalizer };
export { PETImageNormalizer };
export { SEGImageNormalizer };
export { PMImageNormalizer };
export { DSRNormalizer };
export { OPImageNormalizer };
export { OCTImageNormalizer };
export type { DicomDataset, Vec3 };
