import TID300Point from "../../utilities/TID300/Point";
import CodingScheme from "./CodingScheme";
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

/** Handles data structure for arrow annotation */
interface ArrowHandlesData {
    arrowFirst: boolean;
    points: WorldPoint[];
    activeHandleIndex: number;
    textBox: {
        hasMoved: boolean;
    };
}

/** Annotation data structure for arrow annotation */
interface ArrowAnnotationData {
    text: string;
    handles: ArrowHandlesData;
    frameNumber: number | number[] | undefined;
}

/** Full annotation state structure for arrow annotation */
interface ArrowAnnotationState {
    sopInstanceUid: string;
    annotation: {
        annotationUID: string;
        metadata: AnnotationMetadata;
        data?: ArrowAnnotationData;
    };
    finding?: CodeSequence;
    findingSites?: CodeSequence[];
    description?: string;
}

/** Tool input structure for TID300 conversion */
interface ArrowAnnotateTool {
    data: {
        text: string;
        handles: {
            arrowFirst: boolean;
            points: WorldPoint[];
        };
    };
    metadata: {
        referencedImageId: string;
    };
    finding?: CodeSequence;
    findingSites?: CodeSequence[];
}

/** TID300 representation arguments for arrow annotation */
interface ArrowTID300RepresentationArguments {
    points: Array<{ x: number; y: number }>;
    trackingIdentifierTextValue: string;
    findingSites: CodeSequence[];
    finding?: CodeSequence;
}

/** SCOORD group from measurement report */
interface SCOORDGroup {
    GraphicData: number[];
}

const ARROW_ANNOTATE = "ArrowAnnotate";
const trackingIdentifierTextValue = `${CORNERSTONE_3D_TAG}:${ARROW_ANNOTATE}`;

const { codeValues, CodingSchemeDesignator } = CodingScheme;

class ArrowAnnotate {
    constructor() {}

    static getMeasurementData(
        MeasurementGroupData: MeasurementGroup,
        sopInstanceUIDToImageIdMap: SOPInstanceUIDToImageIdMap,
        imageToWorldCoords: ImageToWorldCoordsFunction,
        metadata: MetadataProvider
    ): ArrowAnnotationState {
        const { defaultState, SCOORDGroup, ReferencedFrameNumber } = MeasurementReport.getSetupMeasurementData(
            MeasurementGroupData,
            sopInstanceUIDToImageIdMap,
            metadata,
            ArrowAnnotate.toolType
        );

        const referencedImageId = defaultState.annotation.metadata.referencedImageId;

        const text = defaultState.annotation.metadata.label;

        const { GraphicData } = SCOORDGroup as SCOORDGroup;

        const worldCoords: WorldPoint[] = [];
        for (let i = 0; i < GraphicData.length; i += 2) {
            const point = imageToWorldCoords(referencedImageId, [GraphicData[i], GraphicData[i + 1]]);
            worldCoords.push(point);
        }

        // Since the arrowAnnotate measurement is just a point, to generate the tool state
        // we derive the second point based on the image size relative to the first point.
        if (worldCoords.length === 1) {
            const imagePixelModule = metadata.get("imagePixelModule", referencedImageId) as
                | { columns: number; rows: number }
                | undefined;

            let xOffset = 10;
            let yOffset = 10;

            if (imagePixelModule) {
                const { columns, rows } = imagePixelModule;
                xOffset = columns / 10;
                yOffset = rows / 10;
            }

            const secondPoint = imageToWorldCoords(referencedImageId, [
                GraphicData[0] + xOffset,
                GraphicData[1] + yOffset
            ]);

            worldCoords.push(secondPoint);
        }

        const state = defaultState as ArrowAnnotationState;

        state.annotation.data = {
            text,
            handles: {
                arrowFirst: true,
                points: [worldCoords[0], worldCoords[1]],
                activeHandleIndex: 0,
                textBox: {
                    hasMoved: false
                }
            },
            frameNumber: ReferencedFrameNumber
        };

        return state;
    }

    static getTID300RepresentationArguments(
        tool: ArrowAnnotateTool,
        worldToImageCoords: WorldToImageCoordsFunction
    ): ArrowTID300RepresentationArguments {
        const { data, metadata, findingSites } = tool;
        let { finding } = tool;
        const { referencedImageId } = metadata;

        if (!referencedImageId) {
            throw new Error("ArrowAnnotate.getTID300RepresentationArguments: referencedImageId is not defined");
        }

        const { points, arrowFirst } = data.handles;

        let point: WorldPoint;

        if (arrowFirst) {
            point = points[0];
        } else {
            point = points[1];
        }

        const pointImage = worldToImageCoords(referencedImageId, point);

        const TID300RepresentationArguments: ArrowTID300RepresentationArguments = {
            points: [
                {
                    x: pointImage[0],
                    y: pointImage[1]
                }
            ],
            trackingIdentifierTextValue,
            findingSites: findingSites || []
        };

        // If freetext finding isn't present, add it from the tool text.
        if (!finding || finding.CodeValue !== codeValues.CORNERSTONEFREETEXT) {
            finding = {
                CodeValue: codeValues.CORNERSTONEFREETEXT,
                CodingSchemeDesignator,
                CodeMeaning: data.text
            };
        }

        TID300RepresentationArguments.finding = finding;

        return TID300RepresentationArguments;
    }

    static toolType = ARROW_ANNOTATE;
    static utilityToolType = ARROW_ANNOTATE;
    static TID300Representation = TID300Point;

    static isValidCornerstoneTrackingIdentifier(TrackingIdentifier: string): boolean {
        if (!TrackingIdentifier.includes(":")) {
            return false;
        }

        const [cornerstone3DTag, toolType] = TrackingIdentifier.split(":");

        if (cornerstone3DTag !== CORNERSTONE_3D_TAG) {
            return false;
        }

        return toolType === ARROW_ANNOTATE;
    }
}

MeasurementReport.registerTool(ArrowAnnotate);

export default ArrowAnnotate;
