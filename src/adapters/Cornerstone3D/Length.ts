import TID300Length from "../../utilities/TID300/Length";
import CORNERSTONE_3D_TAG from "./cornerstone3DTag";
import MeasurementReport, { type MeasurementGroup, type MetadataProvider } from "./MeasurementReport";
import type {
    WorldPoint,
    CodeSequence,
    AnnotationMetadata,
    SOPInstanceUIDToImageIdMap,
    ImageToWorldCoordsFunction,
    WorldToImageCoordsFunction
} from "./types";

/** Handles data structure for length annotation */
interface LengthHandlesData {
    points: WorldPoint[];
    activeHandleIndex: number;
    textBox: {
        hasMoved: boolean;
    };
}

/** Cached statistics for length measurement */
interface LengthCachedStats {
    [key: string]: {
        length: number;
    };
}

/** Annotation data structure for length annotation */
interface LengthAnnotationData {
    handles: LengthHandlesData;
    cachedStats: LengthCachedStats;
    frameNumber: number | number[] | undefined;
}

/** Full annotation state structure for length */
interface LengthAnnotationState {
    sopInstanceUid: string;
    annotation: {
        annotationUID: string;
        metadata: AnnotationMetadata;
        data?: LengthAnnotationData;
    };
    finding?: CodeSequence;
    findingSites?: CodeSequence[];
    description?: string;
}

/** Tool input structure for TID300 conversion */
interface LengthTool {
    data: {
        cachedStats?: LengthCachedStats;
        handles: {
            points: WorldPoint[];
        };
    };
    metadata: {
        referencedImageId: string;
    };
    finding?: CodeSequence;
    findingSites?: CodeSequence[];
}

/** 2D point with x, y coordinates */
interface Point2D {
    x: number;
    y: number;
}

/** TID300 representation arguments for length measurement */
interface LengthTID300RepresentationArguments {
    point1: Point2D;
    point2: Point2D;
    distance: number | undefined;
    trackingIdentifierTextValue: string;
    finding: CodeSequence | undefined;
    findingSites: CodeSequence[];
}

/** SCOORD group from measurement report */
interface SCOORDGroup {
    GraphicData: number[];
}

/** NUM group from measurement report */
interface NUMGroup {
    MeasuredValueSequence: {
        NumericValue: number;
    };
}

const LENGTH = "Length";
const trackingIdentifierTextValue = `${CORNERSTONE_3D_TAG}:${LENGTH}`;

class Length {
    constructor() {}

    // TODO: this function is required for all Cornerstone Tool Adapters, since it is called by MeasurementReport.
    static getMeasurementData(
        MeasurementGroupData: MeasurementGroup,
        sopInstanceUIDToImageIdMap: SOPInstanceUIDToImageIdMap,
        imageToWorldCoords: ImageToWorldCoordsFunction,
        metadata: MetadataProvider
    ): LengthAnnotationState {
        const { defaultState, NUMGroup, SCOORDGroup, ReferencedFrameNumber } =
            MeasurementReport.getSetupMeasurementData(
                MeasurementGroupData,
                sopInstanceUIDToImageIdMap,
                metadata,
                Length.toolType
            );

        const referencedImageId = defaultState.annotation.metadata.referencedImageId;

        const { GraphicData } = SCOORDGroup as SCOORDGroup;
        const worldCoords: WorldPoint[] = [];
        for (let i = 0; i < GraphicData.length; i += 2) {
            const point = imageToWorldCoords(referencedImageId, [GraphicData[i], GraphicData[i + 1]]);
            worldCoords.push(point);
        }

        const state = defaultState as LengthAnnotationState;
        const numGroup = NUMGroup as NUMGroup | undefined;

        state.annotation.data = {
            handles: {
                points: [worldCoords[0], worldCoords[1]],
                activeHandleIndex: 0,
                textBox: {
                    hasMoved: false
                }
            },
            cachedStats: {
                [`imageId:${referencedImageId}`]: {
                    length: numGroup ? numGroup.MeasuredValueSequence.NumericValue : 0
                }
            },
            frameNumber: ReferencedFrameNumber
        };

        return state;
    }

    static getTID300RepresentationArguments(
        tool: LengthTool,
        worldToImageCoords: WorldToImageCoordsFunction
    ): LengthTID300RepresentationArguments {
        const { data, finding, findingSites, metadata } = tool;
        const { cachedStats = {}, handles } = data;

        const { referencedImageId } = metadata;

        if (!referencedImageId) {
            throw new Error("Length.getTID300RepresentationArguments: referencedImageId is not defined");
        }

        const start = worldToImageCoords(referencedImageId, handles.points[0]);
        const end = worldToImageCoords(referencedImageId, handles.points[1]);

        const point1 = { x: start[0], y: start[1] };
        const point2 = { x: end[0], y: end[1] };

        const { length: distance } = cachedStats[`imageId:${referencedImageId}`] || {};

        return {
            point1,
            point2,
            distance,
            trackingIdentifierTextValue,
            finding,
            findingSites: findingSites || []
        };
    }

    static toolType = LENGTH;
    static utilityToolType = LENGTH;
    static TID300Representation = TID300Length;

    static isValidCornerstoneTrackingIdentifier(TrackingIdentifier: string): boolean {
        if (!TrackingIdentifier.includes(":")) {
            return false;
        }

        const [cornerstone3DTag, toolType] = TrackingIdentifier.split(":");

        if (cornerstone3DTag !== CORNERSTONE_3D_TAG) {
            return false;
        }

        return toolType === LENGTH;
    }
}

MeasurementReport.registerTool(Length);

export default Length;
