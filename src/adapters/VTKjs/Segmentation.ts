import BitArray from "../../bitArray.js";
import Colors from "../../colors.js";

/** 3D vector as [x, y, z] */
type Vec3 = [number, number, number];

/** RGBA color with values 0-255 */
type RGBA = [number, number, number, number];

/** DICOM LAB color as [L, a, b] with values scaled to 0-65535 */
type DICOMLAB = [number, number, number];

/** Plane position sequence containing ImagePositionPatient */
interface PlanePositionSequence {
    ImagePositionPatient: (string | number)[];
}

/** Segment identification within a functional group */
interface SegmentIdentificationSequence {
    ReferencedSegmentNumber: number;
}

/** Per-frame functional group structure */
interface PerFrameFunctionalGroup {
    PlanePositionSequence: PlanePositionSequence;
    SegmentIdentificationSequence: SegmentIdentificationSequence;
}

/** Pixel measures in shared functional groups */
interface PixelMeasuresSequence {
    PixelSpacing: (string | number)[];
    SpacingBetweenSlices: string | number;
}

/** Plane orientation in shared functional groups */
interface PlaneOrientationSequence {
    ImageOrientationPatient: (string | number)[];
}

/** Shared functional groups structure */
interface SharedFunctionalGroups {
    PixelMeasuresSequence: PixelMeasuresSequence;
    PlaneOrientationSequence: PlaneOrientationSequence;
}

/** Segment definition from SegmentSequence */
interface SegmentDefinition {
    SegmentNumber: number;
    RecommendedDisplayCIELabValue: DICOMLAB;
}

/** Segmentation DICOM dataset structure */
interface SegmentationDataset {
    SegmentSequence: SegmentDefinition | SegmentDefinition[];
    SharedFunctionalGroupsSequence: SharedFunctionalGroups;
    PerFrameFunctionalGroupsSequence: PerFrameFunctionalGroup[];
    Columns: number;
    Rows: number;
    PixelData: ArrayLike<number>;
}

/** Geometry information for volume reconstruction */
interface Geometry {
    origin: number[];
    spacing: number[];
    dimensions: number[];
    planeNormal: number[];
    sliceStep: number[];
    direction: number[];
}

/** Result segment with geometry and pixel data */
interface SegmentResult {
    color: RGBA;
    functionalGroups: PerFrameFunctionalGroup[];
    offset: number | null;
    size: number | null;
    pixelData: Uint8Array | null;
    numberOfFrames?: number;
    geometry?: Geometry;
}

/** Map of segment numbers to segment results */
interface SegmentsMap {
    [segmentNumber: number]: SegmentResult;
}

/**
 * Converts DICOM LAB color to RGBA with values 0-255.
 * @param cielab - DICOM LAB color values
 * @returns RGBA color with values 0-255
 */
function dicomlab2RGBA(cielab: DICOMLAB): RGBA {
    const rgb = Colors.dicomlab2RGB(cielab).map((x) => Math.round(x * 255));
    return [rgb[0], rgb[1], rgb[2], 255];
}

/**
 * Computes cross product of two 3D vectors.
 * @param x - First vector
 * @param y - Second vector
 * @param out - Output vector to store result
 */
function cross(x: Vec3, y: Vec3, out: number[]): void {
    const Zx = x[1] * y[2] - x[2] * y[1];
    const Zy = x[2] * y[0] - x[0] * y[2];
    const Zz = x[0] * y[1] - x[1] * y[0];
    out[0] = Zx;
    out[1] = Zy;
    out[2] = Zz;
}

/**
 * Computes the norm (magnitude) of a vector.
 * @param x - Input vector or scalar
 * @param n - Dimension of the vector (default 3)
 * @returns The norm of the vector
 */
function norm(x: number | number[], n = 3): number {
    switch (n) {
        case 1:
            return Math.abs(x as number);
        case 2: {
            const v2 = x as number[];
            return Math.sqrt(v2[0] * v2[0] + v2[1] * v2[1]);
        }
        case 3: {
            const v3 = x as number[];
            return Math.sqrt(v3[0] * v3[0] + v3[1] * v3[1] + v3[2] * v3[2]);
        }
        default: {
            const v = x as number[];
            let sum = 0;
            for (let i = 0; i < n; i++) {
                sum += v[i] * v[i];
            }
            return Math.sqrt(sum);
        }
    }
}

/**
 * Normalizes a 3D vector in place.
 * @param x - Vector to normalize (modified in place)
 * @returns The original magnitude of the vector
 */
function normalize(x: number[]): number {
    const den = norm(x);
    if (den !== 0.0) {
        x[0] /= den;
        x[1] /= den;
        x[2] /= den;
    }
    return den;
}

/**
 * Subtracts two 3D vectors.
 * @param a - First vector
 * @param b - Second vector
 * @param out - Output vector to store result
 */
function subtract(a: number[], b: number[], out: number[]): void {
    out[0] = a[0] - b[0];
    out[1] = a[1] - b[1];
    out[2] = a[2] - b[2];
}

/**
 * Extracts geometry information from DICOM functional groups.
 * @param dataset - The segmentation dataset
 * @param PerFrameFunctionalGroups - Array of per-frame functional groups
 * @returns Geometry information for volume reconstruction
 */
function geometryFromFunctionalGroups(
    dataset: SegmentationDataset,
    PerFrameFunctionalGroups: PerFrameFunctionalGroup[]
): Geometry {
    const geometry: Geometry = {
        origin: [],
        spacing: [],
        dimensions: [],
        planeNormal: [],
        sliceStep: [],
        direction: []
    };

    const pixelMeasures = dataset.SharedFunctionalGroupsSequence.PixelMeasuresSequence;
    const planeOrientation = dataset.SharedFunctionalGroupsSequence.PlaneOrientationSequence;

    // Find the origin of the volume from the PerFrameFunctionalGroups' ImagePositionPatient values
    //
    // TODO: assumes sorted frames. This should read the ImagePositionPatient from each frame and
    // sort them to obtain the first and last position along the acquisition axis.
    const firstFunctionalGroup = PerFrameFunctionalGroups[0];
    const lastFunctionalGroup = PerFrameFunctionalGroups[PerFrameFunctionalGroups.length - 1];
    const firstPosition = firstFunctionalGroup.PlanePositionSequence.ImagePositionPatient.map(Number);
    const lastPosition = lastFunctionalGroup.PlanePositionSequence.ImagePositionPatient.map(Number);

    geometry.origin = firstPosition;

    // NB: DICOM PixelSpacing is defined as Row then Column,
    // unlike ImageOrientationPatient
    geometry.spacing = [
        pixelMeasures.PixelSpacing[1],
        pixelMeasures.PixelSpacing[0],
        pixelMeasures.SpacingBetweenSlices
    ].map(Number);

    geometry.dimensions = [dataset.Columns, dataset.Rows, PerFrameFunctionalGroups.length].map(Number);

    const orientation = planeOrientation.ImageOrientationPatient.map(Number);
    const columnStepToPatient = orientation.slice(0, 3) as Vec3;
    const rowStepToPatient = orientation.slice(3, 6) as Vec3;

    cross(columnStepToPatient, rowStepToPatient, geometry.planeNormal);

    subtract(lastPosition, firstPosition, geometry.sliceStep);
    normalize(geometry.sliceStep);
    geometry.direction = columnStepToPatient.concat(rowStepToPatient).concat(geometry.sliceStep);

    return geometry;
}

export default class Segmentation {
    constructor() {}

    /**
     * Produces an array of Segments from an input DICOM Segmentation dataset
     *
     * Segments are returned with Geometry values that can be used to create
     * VTK Image Data objects.
     *
     * @example Example usage to create VTK Volume actors from each segment:
     *
     * const actors = [];
     * const segments = generateToolState(dataset);
     * segments.forEach(segment => {
     *   // now make actors using the segment information
     *   const scalarArray = vtk.Common.Core.vtkDataArray.newInstance({
     *        name: "Scalars",
     *        numberOfComponents: 1,
     *        values: segment.pixelData,
     *    });
     *
     *    const imageData = vtk.Common.DataModel.vtkImageData.newInstance();
     *    imageData.getPointData().setScalars(scalarArray);
     *    imageData.setDimensions(geometry.dimensions);
     *    imageData.setSpacing(geometry.spacing);
     *    imageData.setOrigin(geometry.origin);
     *    imageData.setDirection(geometry.direction);
     *
     *    const mapper = vtk.Rendering.Core.vtkVolumeMapper.newInstance();
     *    mapper.setInputData(imageData);
     *    mapper.setSampleDistance(2.);
     *
     *    const actor = vtk.Rendering.Core.vtkVolume.newInstance();
     *    actor.setMapper(mapper);
     *
     *    actors.push(actor);
     * });
     *
     * @param dataset - The DICOM Segmentation dataset
     * @returns Map of segment numbers to segment results with geometry and pixel data
     */
    static generateSegments(dataset: SegmentationDataset): SegmentsMap {
        let segmentSequence = dataset.SegmentSequence;
        if (!Array.isArray(segmentSequence)) {
            segmentSequence = [segmentSequence];
        }

        const segments: SegmentsMap = {};
        segmentSequence.forEach((segment) => {
            // TODO: other interesting fields could be extracted from the segment
            // TODO: Read SegmentsOverlay field
            // http://dicom.nema.org/medical/dicom/current/output/chtml/part03/sect_C.8.20.2.html

            // TODO: Looks like vtkColor only wants RGB in 0-1 values.
            // Why was this example converting to RGBA with 0-255 values?
            const color = dicomlab2RGBA(segment.RecommendedDisplayCIELabValue);

            segments[segment.SegmentNumber] = {
                color,
                functionalGroups: [],
                offset: null,
                size: null,
                pixelData: null
            };
        });

        // make a list of functional groups per segment
        dataset.PerFrameFunctionalGroupsSequence.forEach((functionalGroup) => {
            const segmentNumber = functionalGroup.SegmentIdentificationSequence.ReferencedSegmentNumber;

            segments[segmentNumber].functionalGroups.push(functionalGroup);
        });

        // determine per-segment index into the pixel data
        // TODO: only handles one-bit-per pixel
        const frameSize = Math.ceil((dataset.Rows * dataset.Columns) / 8);
        let nextOffset = 0;

        Object.keys(segments).forEach((segmentNumberStr) => {
            const segmentNumber = Number(segmentNumberStr);
            const segment = segments[segmentNumber];

            segment.numberOfFrames = segment.functionalGroups.length;
            segment.size = segment.numberOfFrames * frameSize;
            segment.offset = nextOffset;

            nextOffset = segment.offset + segment.size;

            const packedSegment = (dataset.PixelData as Uint8Array).slice(segment.offset, nextOffset);

            segment.pixelData = BitArray.unpack(packedSegment);

            const geometry = geometryFromFunctionalGroups(dataset, segment.functionalGroups);

            segment.geometry = geometry;
        });

        return segments;
    }
}
