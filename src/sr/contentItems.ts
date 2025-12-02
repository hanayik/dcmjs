import { CodedConcept } from "./coding.js";
import type { GraphicType, GraphicType3D, PixelOriginInterpretation } from "./valueTypes.js";
import {
    CodeContentItem,
    CompositeContentItem,
    ContentSequence,
    GraphicTypes,
    GraphicTypes3D,
    ImageContentItem,
    NumContentItem,
    RelationshipTypes,
    Scoord3DContentItem,
    ScoordContentItem,
    UIDRefContentItem
} from "./valueTypes.js";

interface LongitudinalTemporalOffsetFromEventOptions {
    value: number;
    unit: CodedConcept;
    eventType: CodedConcept;
}

class LongitudinalTemporalOffsetFromEvent extends NumContentItem {
    override ContentSequence: ContentSequence;

    constructor(options: LongitudinalTemporalOffsetFromEventOptions) {
        super({
            name: new CodedConcept({
                value: "128740",
                meaning: "Longitudinal Temporal Offset from Event",
                schemeDesignator: "DCM"
            }),
            value: options.value,
            unit: options.unit,
            relationshipType: RelationshipTypes.HAS_OBS_CONTEXT
        });
        this.ContentSequence = new ContentSequence();
        const item = new CodeContentItem({
            name: new CodedConcept({
                value: "128741",
                meaning: "Longitudinal Temporal Event Type",
                schemeDesignator: "DCM"
            }),
            value: options.eventType,
            relationshipType: RelationshipTypes.HAS_CONCEPT_MOD
        });
        this.ContentSequence.push(item);
    }
}

interface SourceImageForRegionOptions {
    referencedSOPClassUID: string;
    referencedSOPInstanceUID: string;
    referencedFrameNumbers?: number[];
}

class SourceImageForRegion extends ImageContentItem {
    constructor(options: SourceImageForRegionOptions) {
        super({
            name: new CodedConcept({
                value: "121324",
                meaning: "Source Image",
                schemeDesignator: "DCM"
            }),
            referencedSOPClassUID: options.referencedSOPClassUID,
            referencedSOPInstanceUID: options.referencedSOPInstanceUID,
            referencedFrameNumbers: options.referencedFrameNumbers,
            relationshipType: RelationshipTypes.SELECTED_FROM
        });
    }
}

interface SourceImageForSegmentationOptions {
    referencedSOPClassUID: string;
    referencedSOPInstanceUID: string;
    referencedFrameNumbers?: number[];
}

class SourceImageForSegmentation extends ImageContentItem {
    constructor(options: SourceImageForSegmentationOptions) {
        super({
            name: new CodedConcept({
                value: "121233",
                meaning: "Source Image for Segmentation",
                schemeDesignator: "DCM"
            }),
            referencedSOPClassUID: options.referencedSOPClassUID,
            referencedSOPInstanceUID: options.referencedSOPInstanceUID,
            referencedFrameNumbers: options.referencedFrameNumbers,
            relationshipType: RelationshipTypes.SELECTED_FROM
        });
    }
}

interface SourceSeriesForSegmentationOptions {
    referencedSeriesInstanceUID: string;
}

class SourceSeriesForSegmentation extends UIDRefContentItem {
    constructor(options: SourceSeriesForSegmentationOptions) {
        super({
            name: new CodedConcept({
                value: "121232",
                meaning: "Source Series for Segmentation",
                schemeDesignator: "DCM"
            }),
            value: options.referencedSeriesInstanceUID,
            relationshipType: RelationshipTypes.CONTAINS
        });
    }
}

interface ImageRegionOptions {
    graphicType: GraphicType;
    graphicData: number[] | number[][];
    pixelOriginInterpretation?: PixelOriginInterpretation;
    sourceImage: SourceImageForRegion;
}

class ImageRegion extends ScoordContentItem {
    override ContentSequence: ContentSequence;

    constructor(options: ImageRegionOptions) {
        super({
            name: new CodedConcept({
                value: "111030",
                meaning: "Image Region",
                schemeDesignator: "DCM"
            }),
            graphicType: options.graphicType,
            graphicData: options.graphicData,
            pixelOriginInterpretation: options.pixelOriginInterpretation,
            relationshipType: RelationshipTypes.CONTAINS
        });
        if (options.graphicType === GraphicTypes.MULTIPOINT) {
            throw new Error("Graphic type 'MULTIPOINT' is not valid for region.");
        }
        if (options.sourceImage === undefined) {
            throw Error("Option 'sourceImage' is required for ImageRegion.");
        }
        if (!(options.sourceImage instanceof SourceImageForRegion)) {
            throw new Error("Option 'sourceImage' of ImageRegion must have type " + "SourceImageForRegion.");
        }
        this.ContentSequence = new ContentSequence();
        this.ContentSequence.push(options.sourceImage);
    }
}

interface ImageRegion3DOptions {
    graphicType: GraphicType3D;
    graphicData: number[] | number[][];
    frameOfReferenceUID: string;
}

class ImageRegion3D extends Scoord3DContentItem {
    constructor(options: ImageRegion3DOptions) {
        super({
            name: new CodedConcept({
                value: "111030",
                meaning: "Image Region",
                schemeDesignator: "DCM"
            }),
            graphicType: options.graphicType,
            graphicData: options.graphicData,
            frameOfReferenceUID: options.frameOfReferenceUID,
            relationshipType: RelationshipTypes.CONTAINS
        });
        if (options.graphicType === GraphicTypes3D.MULTIPOINT) {
            throw new Error("Graphic type 'MULTIPOINT' is not valid for region.");
        }
        if (options.graphicType === GraphicTypes3D.ELLIPSOID) {
            throw new Error("Graphic type 'ELLIPSOID' is not valid for region.");
        }
    }
}

interface VolumeSurfaceOptions {
    graphicType: GraphicType3D;
    graphicData: number[] | number[][];
    frameOfFeferenceUID: string;
    sourceImages?: SourceImageForRegion[];
    sourceSeries?: SourceSeriesForSegmentation;
}

class VolumeSurface extends Scoord3DContentItem {
    override ContentSequence: ContentSequence;

    constructor(options: VolumeSurfaceOptions) {
        super({
            name: new CodedConcept({
                value: "121231",
                meaning: "Volume Surface",
                schemeDesignator: "DCM"
            }),
            graphicType: options.graphicType,
            graphicData: options.graphicData,
            frameOfReferenceUID: options.frameOfFeferenceUID,
            relationshipType: RelationshipTypes.CONTAINS
        });
        if (options.graphicType !== GraphicTypes3D.ELLIPSOID) {
            throw new Error("Graphic type for volume surface must be 'ELLIPSOID'.");
        }
        this.ContentSequence = new ContentSequence();
        if (options.sourceImages) {
            options.sourceImages.forEach((image) => {
                if (!(image instanceof SourceImageForRegion)) {
                    throw new Error(
                        "Items of option 'sourceImages' of VolumeSurface " + "must have type SourceImageForRegion."
                    );
                }
                this.ContentSequence.push(image);
            });
        } else if (options.sourceSeries) {
            if (!(options.sourceSeries instanceof SourceSeriesForSegmentation)) {
                throw new Error(
                    "Option 'sourceSeries' of VolumeSurface " + "must have type SourceSeriesForSegmentation."
                );
            }
            this.ContentSequence.push(options.sourceSeries);
        } else {
            throw new Error("One of the following two options must be provided: " + "'sourceImage' or 'sourceSeries'.");
        }
    }
}

interface ReferencedRealWorldValueMapOptions {
    referencedSOPClassUID: string;
    referencedSOPInstanceUID: string;
}

class ReferencedRealWorldValueMap extends CompositeContentItem {
    constructor(options: ReferencedRealWorldValueMapOptions) {
        super({
            name: new CodedConcept({
                value: "126100",
                meaning: "Real World Value Map used for measurement",
                schemeDesignator: "DCM"
            }),
            referencedSOPClassUID: options.referencedSOPClassUID,
            referencedSOPInstanceUID: options.referencedSOPInstanceUID,
            relationshipType: RelationshipTypes.CONTAINS
        });
    }
}

interface FindingSiteOptions {
    anatomicLocation: CodedConcept;
    laterality?: CodedConcept;
    topographicalModifier?: CodedConcept;
}

class FindingSite extends CodeContentItem {
    override ContentSequence: ContentSequence;

    constructor(options: FindingSiteOptions) {
        super({
            name: new CodedConcept({
                value: "363698007",
                meaning: "Finding Site",
                schemeDesignator: "SCT"
            }),
            value: options.anatomicLocation,
            relationshipType: RelationshipTypes.HAS_CONCEPT_MOD
        });
        this.ContentSequence = new ContentSequence();
        if (options.laterality) {
            const item = new CodeContentItem({
                name: new CodedConcept({
                    value: "272741003",
                    meaning: "Laterality",
                    schemeDesignator: "SCT"
                }),
                value: options.laterality,
                relationshipType: RelationshipTypes.HAS_CONCEPT_MOD
            });
            this.ContentSequence.push(item);
        }
        if (options.topographicalModifier) {
            const item = new CodeContentItem({
                name: new CodedConcept({
                    value: "106233006",
                    meaning: "Topographical Modifier",
                    schemeDesignator: "SCT"
                }),
                value: options.topographicalModifier,
                relationshipType: RelationshipTypes.HAS_CONCEPT_MOD
            });
            this.ContentSequence.push(item);
        }
    }
}

interface ReferencedSegmentationFrameOptions {
    sopClassUID: string;
    sopInstanceUID: string;
    frameNumber: number;
    segmentNumber: number;
    sourceImage: SourceImageForSegmentation;
    sopClassUid?: string;
    sopInstanceUid?: string;
}

class ReferencedSegmentationFrame extends ContentSequence {
    constructor(options: ReferencedSegmentationFrameOptions) {
        if (options.sopClassUID === undefined) {
            throw new Error("Option 'sopClassUID' is required for ReferencedSegmentationFrame.");
        }
        if (options.sopInstanceUID === undefined) {
            throw new Error("Option 'sopInstanceUID' is required for ReferencedSegmentationFrame.");
        }
        if (options.frameNumber === undefined) {
            throw new Error("Option 'frameNumber' is required for ReferencedSegmentationFrame.");
        }
        if (options.segmentNumber === undefined) {
            throw new Error("Option 'segmentNumber' is required for ReferencedSegmentationFrame.");
        }
        if (options.sourceImage === undefined) {
            throw new Error("Option 'sourceImage' is required for ReferencedSegmentationFrame.");
        }
        super();
        const segmentationItem = new ImageContentItem({
            name: new CodedConcept({
                value: "121214",
                meaning: "Referenced Segmentation Frame",
                schemeDesignator: "DCM"
            }),
            referencedSOPClassUID: options.sopClassUid ?? options.sopClassUID,
            referencedSOPInstanceUID: options.sopInstanceUid ?? options.sopInstanceUID,
            referencedFrameNumbers: [options.frameNumber],
            referencedSegmentNumbers: [options.segmentNumber],
            referencedFrameSegmentNumber: true
        });
        this.push(segmentationItem);
        if (!(options.sourceImage instanceof SourceImageForSegmentation)) {
            throw new Error("Option 'sourceImage' must have type SourceImageForSegmentation.");
        }
        this.push(options.sourceImage);
    }
}

interface ReferencedSegmentationOptions {
    sopClassUID: string;
    sopInstanceUID: string;
    frameNumbers: number[];
    segmentNumber: number;
    sourceImages?: SourceImageForSegmentation[];
    sourceSeries?: SourceSeriesForSegmentation;
    sopClassUid?: string;
    sopInstanceUid?: string;
}

class ReferencedSegmentation extends ContentSequence {
    constructor(options: ReferencedSegmentationOptions) {
        if (options.sopClassUID === undefined) {
            throw new Error("Option 'sopClassUID' is required for ReferencedSegmentation.");
        }
        if (options.sopInstanceUID === undefined) {
            throw new Error("Option 'sopInstanceUID' is required for ReferencedSegmentation.");
        }
        if (options.frameNumbers === undefined) {
            throw new Error("Option 'frameNumbers' is required for ReferencedSegmentation.");
        }
        if (options.segmentNumber === undefined) {
            throw new Error("Option 'segmentNumber' is required for ReferencedSegmentation.");
        }
        super();
        const segmentationItem = new ImageContentItem({
            name: new CodedConcept({
                value: "121191",
                meaning: "Referenced Segment",
                schemeDesignator: "DCM"
            }),
            referencedSOPClassUID: options.sopClassUid ?? options.sopClassUID,
            referencedSOPInstanceUID: options.sopInstanceUid ?? options.sopInstanceUID,
            referencedFrameNumbers: options.frameNumbers,
            referencedSegmentNumbers: [options.segmentNumber],
            referencedFrameSegmentNumber: true
        });
        this.push(segmentationItem);
        if (options.sourceImages !== undefined) {
            options.sourceImages.forEach((image) => {
                if (!image || !(image instanceof SourceImageForSegmentation)) {
                    throw new Error("Items of option 'sourceImages' must have type " + "SourceImageForSegmentation.");
                }
                this.push(image);
            });
        } else if (options.sourceSeries !== undefined) {
            if (!(options.sourceSeries instanceof SourceSeriesForSegmentation)) {
                throw new Error("Option 'sourceSeries' must have type SourceSeriesForSegmentation.");
            }
            this.push(options.sourceSeries);
        } else {
            throw new Error(
                "One of the following two options must be provided: " + "'sourceImages' or 'sourceSeries'."
            );
        }
    }
}

export {
    FindingSite,
    LongitudinalTemporalOffsetFromEvent,
    ReferencedRealWorldValueMap,
    ImageRegion,
    ImageRegion3D,
    ReferencedSegmentation,
    ReferencedSegmentationFrame,
    VolumeSurface,
    SourceImageForRegion,
    SourceImageForSegmentation,
    SourceSeriesForSegmentation
};

export type {
    FindingSiteOptions,
    ImageRegion3DOptions,
    ImageRegionOptions,
    LongitudinalTemporalOffsetFromEventOptions,
    ReferencedRealWorldValueMapOptions,
    ReferencedSegmentationFrameOptions,
    ReferencedSegmentationOptions,
    SourceImageForRegionOptions,
    SourceImageForSegmentationOptions,
    SourceSeriesForSegmentationOptions,
    VolumeSurfaceOptions
};
