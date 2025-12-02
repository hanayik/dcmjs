import TID300Point from "../../utilities/TID300/Point";
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

/** Handles data structure for probe annotation */
interface ProbeHandlesData {
    points: WorldPoint[];
    activeHandleIndex: number | null;
    textBox: {
        hasMoved: boolean;
    };
}

/** Annotation data structure for probe annotation */
interface ProbeAnnotationData {
    handles: ProbeHandlesData;
    frameNumber: number | number[] | undefined;
}

/** Full annotation state structure for probe */
interface ProbeAnnotationState {
    sopInstanceUid: string;
    annotation: {
        annotationUID: string;
        metadata: AnnotationMetadata;
        data?: ProbeAnnotationData;
    };
    finding?: CodeSequence;
    findingSites?: CodeSequence[];
    description?: string;
}

/** Tool input structure for TID300 conversion */
interface ProbeTool {
    data: {
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

/** TID300 representation arguments for probe */
interface ProbeTID300RepresentationArguments {
    points: Point2D[];
    trackingIdentifierTextValue: string;
    findingSites: CodeSequence[];
    finding: CodeSequence | undefined;
}

/** SCOORD group from measurement report */
interface SCOORDGroup {
    GraphicData: number[];
}

const PROBE = "Probe";
const trackingIdentifierTextValue = `${CORNERSTONE_3D_TAG}:${PROBE}`;

class Probe {
    constructor() {}

    static getMeasurementData(
        MeasurementGroupData: MeasurementGroup,
        sopInstanceUIDToImageIdMap: SOPInstanceUIDToImageIdMap,
        imageToWorldCoords: ImageToWorldCoordsFunction,
        metadata: MetadataProvider
    ): ProbeAnnotationState {
        const { defaultState, SCOORDGroup, ReferencedFrameNumber } = MeasurementReport.getSetupMeasurementData(
            MeasurementGroupData,
            sopInstanceUIDToImageIdMap,
            metadata,
            Probe.toolType
        );

        const referencedImageId = defaultState.annotation.metadata.referencedImageId;

        const { GraphicData } = SCOORDGroup as SCOORDGroup;

        const worldCoords: WorldPoint[] = [];
        for (let i = 0; i < GraphicData.length; i += 2) {
            const point = imageToWorldCoords(referencedImageId, [GraphicData[i], GraphicData[i + 1]]);
            worldCoords.push(point);
        }

        const state = defaultState as ProbeAnnotationState;

        state.annotation.data = {
            handles: {
                points: worldCoords,
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
        tool: ProbeTool,
        worldToImageCoords: WorldToImageCoordsFunction
    ): ProbeTID300RepresentationArguments {
        const { data, metadata } = tool;
        const { finding, findingSites } = tool;
        const { referencedImageId } = metadata;

        if (!referencedImageId) {
            throw new Error("Probe.getTID300RepresentationArguments: referencedImageId is not defined");
        }

        const { points } = data.handles;

        const pointsImage = points.map((point) => {
            const pointImage = worldToImageCoords(referencedImageId, point);
            return {
                x: pointImage[0],
                y: pointImage[1]
            };
        });

        const TID300RepresentationArguments: ProbeTID300RepresentationArguments = {
            points: pointsImage,
            trackingIdentifierTextValue,
            findingSites: findingSites || [],
            finding
        };

        return TID300RepresentationArguments;
    }

    static toolType = PROBE;
    static utilityToolType = PROBE;
    static TID300Representation = TID300Point;

    static isValidCornerstoneTrackingIdentifier(TrackingIdentifier: string): boolean {
        if (!TrackingIdentifier.includes(":")) {
            return false;
        }

        const [cornerstone3DTag, toolType] = TrackingIdentifier.split(":");

        if (cornerstone3DTag !== CORNERSTONE_3D_TAG) {
            return false;
        }

        return toolType === PROBE;
    }
}

MeasurementReport.registerTool(Probe);

export default Probe;
