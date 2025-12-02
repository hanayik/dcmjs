import TID300Bidirectional from "../../utilities/TID300/Bidirectional";
import { toArray } from "../helpers";
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

/** Handles data structure for bidirectional annotation */
interface BidirectionalHandlesData {
    points: WorldPoint[];
    activeHandleIndex: number;
    textBox: {
        hasMoved: boolean;
    };
}

/** Cached statistics for bidirectional measurement */
interface BidirectionalCachedStats {
    [key: string]: {
        length: number;
        width: number;
    };
}

/** Annotation data structure for bidirectional annotation */
interface BidirectionalAnnotationData {
    handles: BidirectionalHandlesData;
    cachedStats: BidirectionalCachedStats;
    frameNumber: number | number[] | undefined;
}

/** Full annotation state structure for bidirectional */
interface BidirectionalAnnotationState {
    sopInstanceUid: string;
    annotation: {
        annotationUID: string;
        metadata: AnnotationMetadata;
        data?: BidirectionalAnnotationData;
    };
    finding?: CodeSequence;
    findingSites?: CodeSequence[];
    description?: string;
}

/** Tool input structure for TID300 conversion */
interface BidirectionalTool {
    data: {
        cachedStats?: BidirectionalCachedStats;
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

/** Axis with two points */
interface Axis {
    point1: Point2D;
    point2: Point2D;
}

/** TID300 representation arguments for bidirectional measurement */
interface BidirectionalTID300RepresentationArguments {
    longAxis: Axis;
    shortAxis: Axis;
    longAxisLength: number | undefined;
    shortAxisLength: number | undefined;
    trackingIdentifierTextValue: string;
    finding: CodeSequence | undefined;
    findingSites: CodeSequence[];
}

/** Content item in measurement group */
interface ContentItem {
    ConceptNameCodeSequence: CodeSequence;
    ContentSequence?: ContentItem | ContentItem[];
    ValueType?: string;
    GraphicData?: number[];
    MeasuredValueSequence?: {
        NumericValue: number;
    };
}

const BIDIRECTIONAL = "Bidirectional";
const LONG_AXIS = "Long Axis";
const SHORT_AXIS = "Short Axis";
const trackingIdentifierTextValue = `${CORNERSTONE_3D_TAG}:${BIDIRECTIONAL}`;

class Bidirectional {
    constructor() {}

    static getMeasurementData(
        MeasurementGroupData: MeasurementGroup,
        sopInstanceUIDToImageIdMap: SOPInstanceUIDToImageIdMap,
        imageToWorldCoords: ImageToWorldCoordsFunction,
        metadata: MetadataProvider
    ): BidirectionalAnnotationState {
        const { defaultState, ReferencedFrameNumber } = MeasurementReport.getSetupMeasurementData(
            MeasurementGroupData,
            sopInstanceUIDToImageIdMap,
            metadata,
            Bidirectional.toolType
        );

        const referencedImageId = defaultState.annotation.metadata.referencedImageId;
        const { ContentSequence } = MeasurementGroupData;

        const contentSequenceArray = toArray(ContentSequence);

        const longAxisNUMGroup = contentSequenceArray.find(
            (group) => (group as ContentItem).ConceptNameCodeSequence.CodeMeaning === LONG_AXIS
        ) as ContentItem;

        const longAxisSCOORDGroup = toArray(longAxisNUMGroup.ContentSequence).find(
            (group) => (group as ContentItem).ValueType === "SCOORD"
        ) as ContentItem;

        const shortAxisNUMGroup = contentSequenceArray.find(
            (group) => (group as ContentItem).ConceptNameCodeSequence.CodeMeaning === SHORT_AXIS
        ) as ContentItem;

        const shortAxisSCOORDGroup = toArray(shortAxisNUMGroup.ContentSequence).find(
            (group) => (group as ContentItem).ValueType === "SCOORD"
        ) as ContentItem;

        const worldCoords: WorldPoint[] = [];

        [longAxisSCOORDGroup, shortAxisSCOORDGroup].forEach((group) => {
            const { GraphicData } = group;
            if (GraphicData) {
                for (let i = 0; i < GraphicData.length; i += 2) {
                    const point = imageToWorldCoords(referencedImageId, [GraphicData[i], GraphicData[i + 1]]);
                    worldCoords.push(point);
                }
            }
        });

        const state = defaultState as BidirectionalAnnotationState;

        state.annotation.data = {
            handles: {
                points: [worldCoords[0], worldCoords[1], worldCoords[2], worldCoords[3]],
                activeHandleIndex: 0,
                textBox: {
                    hasMoved: false
                }
            },
            cachedStats: {
                [`imageId:${referencedImageId}`]: {
                    length: longAxisNUMGroup.MeasuredValueSequence!.NumericValue,
                    width: shortAxisNUMGroup.MeasuredValueSequence!.NumericValue
                }
            },
            frameNumber: ReferencedFrameNumber
        };

        return state;
    }

    static getTID300RepresentationArguments(
        tool: BidirectionalTool,
        worldToImageCoords: WorldToImageCoordsFunction
    ): BidirectionalTID300RepresentationArguments {
        const { data, finding, findingSites, metadata } = tool;
        const { cachedStats = {}, handles } = data;

        const { referencedImageId } = metadata;

        if (!referencedImageId) {
            throw new Error("Bidirectional.getTID300RepresentationArguments: referencedImageId is not defined");
        }

        const { length, width } = cachedStats[`imageId:${referencedImageId}`] || {};
        const { points } = handles;

        // Find the length and width point pairs by comparing the distances of the points at 0,1 to points at 2,3
        const firstPointPairs = [points[0], points[1]];
        const secondPointPairs = [points[2], points[3]];

        const firstPointPairsDistance = Math.sqrt(
            (firstPointPairs[0][0] - firstPointPairs[1][0]) ** 2 +
                (firstPointPairs[0][1] - firstPointPairs[1][1]) ** 2 +
                (firstPointPairs[0][2] - firstPointPairs[1][2]) ** 2
        );

        const secondPointPairsDistance = Math.sqrt(
            (secondPointPairs[0][0] - secondPointPairs[1][0]) ** 2 +
                (secondPointPairs[0][1] - secondPointPairs[1][1]) ** 2 +
                (secondPointPairs[0][2] - secondPointPairs[1][2]) ** 2
        );

        let shortAxisPoints: WorldPoint[];
        let longAxisPoints: WorldPoint[];
        if (firstPointPairsDistance > secondPointPairsDistance) {
            shortAxisPoints = firstPointPairs;
            longAxisPoints = secondPointPairs;
        } else {
            shortAxisPoints = secondPointPairs;
            longAxisPoints = firstPointPairs;
        }

        const longAxisStartImage = worldToImageCoords(referencedImageId, shortAxisPoints[0]);
        const longAxisEndImage = worldToImageCoords(referencedImageId, shortAxisPoints[1]);
        const shortAxisStartImage = worldToImageCoords(referencedImageId, longAxisPoints[0]);
        const shortAxisEndImage = worldToImageCoords(referencedImageId, longAxisPoints[1]);

        return {
            longAxis: {
                point1: {
                    x: longAxisStartImage[0],
                    y: longAxisStartImage[1]
                },
                point2: {
                    x: longAxisEndImage[0],
                    y: longAxisEndImage[1]
                }
            },
            shortAxis: {
                point1: {
                    x: shortAxisStartImage[0],
                    y: shortAxisStartImage[1]
                },
                point2: {
                    x: shortAxisEndImage[0],
                    y: shortAxisEndImage[1]
                }
            },
            longAxisLength: length,
            shortAxisLength: width,
            trackingIdentifierTextValue,
            finding: finding,
            findingSites: findingSites || []
        };
    }

    static toolType = BIDIRECTIONAL;
    static utilityToolType = BIDIRECTIONAL;
    static TID300Representation = TID300Bidirectional;

    static isValidCornerstoneTrackingIdentifier(TrackingIdentifier: string): boolean {
        if (!TrackingIdentifier.includes(":")) {
            return false;
        }

        const [cornerstone3DTag, toolType] = TrackingIdentifier.split(":");

        if (cornerstone3DTag !== CORNERSTONE_3D_TAG) {
            return false;
        }

        return toolType === BIDIRECTIONAL;
    }
}

MeasurementReport.registerTool(Bidirectional);

export default Bidirectional;
