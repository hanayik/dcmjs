/** 3D world coordinate point as [x, y, z] */
export type WorldPoint = [number, number, number];

/** 2D image coordinate point as [x, y] */
export type ImagePoint = [number, number];

/** Code sequence for DICOM structured reports */
export interface CodeSequence {
    CodeValue: string;
    CodingSchemeDesignator: string;
    CodeMeaning: string;
}

/** Annotation metadata */
export interface AnnotationMetadata {
    toolName: string;
    referencedImageId: string;
    FrameOfReferenceUID: string;
    label: string;
}

/** Full annotation state structure */
export interface AnnotationState {
    sopInstanceUid: string;
    annotation: {
        annotationUID: string;
        metadata: AnnotationMetadata;
        data?: Record<string, unknown>;
    };
    finding?: CodeSequence;
    findingSites?: CodeSequence[];
    description?: string;
}

/** SOP Instance UID to Image ID mapping */
export type SOPInstanceUIDToImageIdMap = Record<string, string>;

/** Function type for converting image coordinates to world coordinates */
export type ImageToWorldCoordsFunction = (imageId: string, imagePoint: ImagePoint) => WorldPoint;

/** Function type for converting world coordinates to image coordinates */
export type WorldToImageCoordsFunction = (imageId: string, worldPoint: WorldPoint) => ImagePoint;
