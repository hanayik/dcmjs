import { vec3 } from "gl-matrix";
import TID300Ellipse from "../../utilities/TID300/Ellipse";
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

/** Handles data structure for elliptical ROI annotation */
interface EllipticalROIHandlesData {
    points: WorldPoint[];
    activeHandleIndex: number;
    textBox: {
        hasMoved: boolean;
    };
}

/** Cached statistics for elliptical ROI measurement */
interface EllipticalROICachedStats {
    [key: string]: {
        area: number;
    };
}

/** Annotation data structure for elliptical ROI */
interface EllipticalROIAnnotationData {
    handles: EllipticalROIHandlesData;
    cachedStats: EllipticalROICachedStats;
    frameNumber: number | number[] | undefined;
}

/** Full annotation state structure for elliptical ROI */
interface EllipticalROIAnnotationState {
    sopInstanceUid: string;
    annotation: {
        annotationUID: string;
        metadata: AnnotationMetadata;
        data?: EllipticalROIAnnotationData;
    };
    finding?: CodeSequence;
    findingSites?: CodeSequence[];
    description?: string;
}

/** Tool input structure for TID300 conversion */
interface EllipticalROITool {
    data: {
        cachedStats?: EllipticalROICachedStats;
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

/** TID300 representation arguments for elliptical ROI */
interface EllipticalROITID300RepresentationArguments {
    area: number | undefined;
    points: Point2D[];
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

/** Image plane module metadata */
interface ImagePlaneModule {
    columnCosines: [number, number, number];
}

const ELLIPTICALROI = "EllipticalROI";
const EPSILON = 1e-4;

const trackingIdentifierTextValue = `${CORNERSTONE_3D_TAG}:${ELLIPTICALROI}`;

class EllipticalROI {
    constructor() {}

    static getMeasurementData(
        MeasurementGroupData: MeasurementGroup,
        sopInstanceUIDToImageIdMap: SOPInstanceUIDToImageIdMap,
        imageToWorldCoords: ImageToWorldCoordsFunction,
        metadata: MetadataProvider
    ): EllipticalROIAnnotationState {
        const { defaultState, NUMGroup, SCOORDGroup, ReferencedFrameNumber } =
            MeasurementReport.getSetupMeasurementData(
                MeasurementGroupData,
                sopInstanceUIDToImageIdMap,
                metadata,
                EllipticalROI.toolType
            );

        const referencedImageId = defaultState.annotation.metadata.referencedImageId;

        const { GraphicData } = SCOORDGroup as SCOORDGroup;

        // GraphicData is ordered as [majorAxisStartX, majorAxisStartY, majorAxisEndX, majorAxisEndY, minorAxisStartX, minorAxisStartY, minorAxisEndX, minorAxisEndY]
        // But Cornerstone3D points are ordered as top, bottom, left, right for the
        // ellipse so we need to identify if the majorAxis is horizontal or vertical
        // in the image plane and then choose the correct points to use for the ellipse.
        const pointsWorld: WorldPoint[] = [];
        for (let i = 0; i < GraphicData.length; i += 2) {
            const worldPos = imageToWorldCoords(referencedImageId, [GraphicData[i], GraphicData[i + 1]]);

            pointsWorld.push(worldPos);
        }

        const majorAxisStart = vec3.fromValues(...pointsWorld[0]);
        const majorAxisEnd = vec3.fromValues(...pointsWorld[1]);
        const minorAxisStart = vec3.fromValues(...pointsWorld[2]);
        const minorAxisEnd = vec3.fromValues(...pointsWorld[3]);

        const majorAxisVec = vec3.create();
        vec3.sub(majorAxisVec, majorAxisEnd, majorAxisStart);

        // normalize majorAxisVec to avoid scaling issues
        vec3.normalize(majorAxisVec, majorAxisVec);

        const minorAxisVec = vec3.create();
        vec3.sub(minorAxisVec, minorAxisEnd, minorAxisStart);
        vec3.normalize(minorAxisVec, minorAxisVec);

        const imagePlaneModule = metadata.get("imagePlaneModule", referencedImageId) as ImagePlaneModule | undefined;

        if (!imagePlaneModule) {
            throw new Error("imageId does not have imagePlaneModule metadata");
        }

        const { columnCosines } = imagePlaneModule;

        // find which axis is parallel to the columnCosines
        const columnCosinesVec = vec3.fromValues(...columnCosines);

        const projectedMajorAxisOnColVec = vec3.dot(columnCosinesVec, majorAxisVec);

        const projectedMinorAxisOnColVec = vec3.dot(columnCosinesVec, minorAxisVec);

        const absoluteOfMajorDotProduct = Math.abs(projectedMajorAxisOnColVec);
        const absoluteOfMinorDotProduct = Math.abs(projectedMinorAxisOnColVec);

        let ellipsePoints: WorldPoint[] = [];
        if (Math.abs(absoluteOfMajorDotProduct - 1) < EPSILON) {
            ellipsePoints = [pointsWorld[0], pointsWorld[1], pointsWorld[2], pointsWorld[3]];
        } else if (Math.abs(absoluteOfMinorDotProduct - 1) < EPSILON) {
            ellipsePoints = [pointsWorld[2], pointsWorld[3], pointsWorld[0], pointsWorld[1]];
        } else {
            console.warn("OBLIQUE ELLIPSE NOT YET SUPPORTED");
        }

        const state = defaultState as EllipticalROIAnnotationState;
        const numGroup = NUMGroup as NUMGroup | undefined;

        state.annotation.data = {
            handles: {
                points: [...ellipsePoints],
                activeHandleIndex: 0,
                textBox: {
                    hasMoved: false
                }
            },
            cachedStats: {
                [`imageId:${referencedImageId}`]: {
                    area: numGroup ? numGroup.MeasuredValueSequence.NumericValue : 0
                }
            },
            frameNumber: ReferencedFrameNumber
        };

        return state;
    }

    static getTID300RepresentationArguments(
        tool: EllipticalROITool,
        worldToImageCoords: WorldToImageCoordsFunction
    ): EllipticalROITID300RepresentationArguments {
        const { data, finding, findingSites, metadata } = tool;
        const { cachedStats = {}, handles } = data;

        const { referencedImageId } = metadata;

        if (!referencedImageId) {
            throw new Error("EllipticalROI.getTID300RepresentationArguments: referencedImageId is not defined");
        }

        const top = worldToImageCoords(referencedImageId, handles.points[0]);
        const bottom = worldToImageCoords(referencedImageId, handles.points[1]);
        const left = worldToImageCoords(referencedImageId, handles.points[2]);
        const right = worldToImageCoords(referencedImageId, handles.points[3]);

        // find the major axis and minor axis
        const topBottomLength = Math.abs(top[1] - bottom[1]);
        const leftRightLength = Math.abs(left[0] - right[0]);

        const points: Point2D[] = [];
        if (topBottomLength > leftRightLength) {
            // major axis is bottom to top
            points.push({ x: top[0], y: top[1] });
            points.push({ x: bottom[0], y: bottom[1] });

            // minor axis is left to right
            points.push({ x: left[0], y: left[1] });
            points.push({ x: right[0], y: right[1] });
        } else {
            // major axis is left to right
            points.push({ x: left[0], y: left[1] });
            points.push({ x: right[0], y: right[1] });

            // minor axis is bottom to top
            points.push({ x: top[0], y: top[1] });
            points.push({ x: bottom[0], y: bottom[1] });
        }

        const { area } = cachedStats[`imageId:${referencedImageId}`] || {};

        return {
            area,
            points,
            trackingIdentifierTextValue,
            finding,
            findingSites: findingSites || []
        };
    }

    static toolType = ELLIPTICALROI;
    static utilityToolType = ELLIPTICALROI;
    static TID300Representation = TID300Ellipse;

    static isValidCornerstoneTrackingIdentifier(TrackingIdentifier: string): boolean {
        if (!TrackingIdentifier.includes(":")) {
            return false;
        }

        const [cornerstone3DTag, toolType] = TrackingIdentifier.split(":");

        if (cornerstone3DTag !== CORNERSTONE_3D_TAG) {
            return false;
        }

        // The following is needed since the new cornerstone3D has changed
        // the EllipticalRoi toolName (which was in the old cornerstone) to EllipticalROI
        return toolType.toLowerCase() === ELLIPTICALROI.toLowerCase();
    }
}

MeasurementReport.registerTool(EllipticalROI);

export default EllipticalROI;
