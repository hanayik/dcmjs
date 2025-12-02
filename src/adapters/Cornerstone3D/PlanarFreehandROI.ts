import { vec3 } from "gl-matrix";
import TID300Polyline from "../../utilities/TID300/Polyline";
import CORNERSTONE_3D_TAG from "./cornerstone3DTag";
import MeasurementReport, { type MeasurementGroup, type MetadataProvider } from "./MeasurementReport";
import type {
    WorldPoint,
    ImagePoint,
    CodeSequence,
    AnnotationMetadata,
    SOPInstanceUIDToImageIdMap,
    ImageToWorldCoordsFunction,
    WorldToImageCoordsFunction
} from "./types";

/** Handles data structure for planar freehand ROI annotation */
interface PlanarFreehandROIHandlesData {
    points: WorldPoint[];
    activeHandleIndex: number | null;
    textBox: {
        hasMoved: boolean;
    };
}

/** Annotation data structure for planar freehand ROI */
interface PlanarFreehandROIAnnotationData {
    polyline: WorldPoint[];
    isOpenContour: boolean;
    handles: PlanarFreehandROIHandlesData;
    frameNumber: number | number[] | undefined;
}

/** Full annotation state structure for planar freehand ROI */
interface PlanarFreehandROIAnnotationState {
    sopInstanceUid: string;
    annotation: {
        annotationUID: string;
        metadata: AnnotationMetadata;
        data?: PlanarFreehandROIAnnotationData;
    };
    finding?: CodeSequence;
    findingSites?: CodeSequence[];
    description?: string;
}

/** Tool input structure for TID300 conversion */
interface PlanarFreehandROITool {
    data: {
        isOpenContour: boolean;
        polyline: WorldPoint[];
    };
    metadata: {
        referencedImageId: string;
    };
    finding?: CodeSequence;
    findingSites?: CodeSequence[];
}

/** TID300 representation arguments for planar freehand ROI */
interface PlanarFreehandROITID300RepresentationArguments {
    points: ImagePoint[];
    area: number;
    perimeter: number;
    trackingIdentifierTextValue: string;
    finding: CodeSequence | undefined;
    findingSites: CodeSequence[];
}

/** SCOORD group from measurement report */
interface SCOORDGroup {
    GraphicData: number[];
}

const PLANARFREEHANDROI = "PlanarFreehandROI";
const trackingIdentifierTextValue = `${CORNERSTONE_3D_TAG}:${PLANARFREEHANDROI}`;
const closedContourThreshold = 1e-5;

class PlanarFreehandROI {
    constructor() {}

    static getMeasurementData(
        MeasurementGroupData: MeasurementGroup,
        sopInstanceUIDToImageIdMap: SOPInstanceUIDToImageIdMap,
        imageToWorldCoords: ImageToWorldCoordsFunction,
        metadata: MetadataProvider
    ): PlanarFreehandROIAnnotationState {
        const { defaultState, SCOORDGroup, ReferencedFrameNumber } = MeasurementReport.getSetupMeasurementData(
            MeasurementGroupData,
            sopInstanceUIDToImageIdMap,
            metadata,
            PlanarFreehandROI.toolType
        );

        const referencedImageId = defaultState.annotation.metadata.referencedImageId;
        const { GraphicData } = SCOORDGroup as SCOORDGroup;

        const worldCoords: WorldPoint[] = [];

        for (let i = 0; i < GraphicData.length; i += 2) {
            const point = imageToWorldCoords(referencedImageId, [GraphicData[i], GraphicData[i + 1]]);

            worldCoords.push(point);
        }

        const distanceBetweenFirstAndLastPoint = vec3.distance(
            worldCoords[worldCoords.length - 1] as vec3,
            worldCoords[0] as vec3
        );

        let isOpenContour = true;

        // If the contour is closed, this should have been encoded as exactly the same point, so check for a very small difference.
        if (distanceBetweenFirstAndLastPoint < closedContourThreshold) {
            worldCoords.pop(); // Remove the last element which is duplicated.

            isOpenContour = false;
        }

        const points: WorldPoint[] = [];

        if (isOpenContour) {
            points.push(worldCoords[0], worldCoords[worldCoords.length - 1]);
        }

        const state = defaultState as PlanarFreehandROIAnnotationState;

        state.annotation.data = {
            polyline: worldCoords,
            isOpenContour,
            handles: {
                points,
                activeHandleIndex: null,
                textBox: {
                    hasMoved: false
                }
            },
            frameNumber: ReferencedFrameNumber
        };

        return state;
    }

    static getTID300RepresentationArguments(
        tool: PlanarFreehandROITool,
        worldToImageCoords: WorldToImageCoordsFunction
    ): PlanarFreehandROITID300RepresentationArguments {
        const { data, finding, findingSites, metadata } = tool;
        const { isOpenContour, polyline } = data;

        const { referencedImageId } = metadata;

        if (!referencedImageId) {
            throw new Error("PlanarFreehandROI.getTID300RepresentationArguments: referencedImageId is not defined");
        }

        const points: ImagePoint[] = polyline.map((worldPos) => worldToImageCoords(referencedImageId, worldPos));

        if (!isOpenContour) {
            // Need to repeat the first point at the end of to have an explicitly closed contour.
            const firstPoint = points[0];

            // Explicitly expand to avoid ciruclar references.
            points.push([firstPoint[0], firstPoint[1]]);
        }

        const area = 0; // TODO -> The tool doesn't have these stats yet.
        const perimeter = 0;

        return {
            points,
            area,
            perimeter,
            trackingIdentifierTextValue,
            finding,
            findingSites: findingSites || []
        };
    }

    static toolType = PLANARFREEHANDROI;
    static utilityToolType = PLANARFREEHANDROI;
    static TID300Representation = TID300Polyline;

    static isValidCornerstoneTrackingIdentifier(TrackingIdentifier: string): boolean {
        if (!TrackingIdentifier.includes(":")) {
            return false;
        }

        const [cornerstone3DTag, toolType] = TrackingIdentifier.split(":");

        if (cornerstone3DTag !== CORNERSTONE_3D_TAG) {
            return false;
        }

        return toolType === PLANARFREEHANDROI;
    }
}

MeasurementReport.registerTool(PlanarFreehandROI);

export default PlanarFreehandROI;
