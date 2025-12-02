import { DicomMetaDictionary } from "../../DicomMetaDictionary.js";
import addAccessors from "../addAccessors.js";

interface CodeSequence {
    CodeValue: string;
    CodingSchemeDesignator: string;
    CodeMeaning: string;
}

export interface ReferencedSOPSequenceItem {
    ReferencedSOPClassUID?: string;
    ReferencedSOPInstanceUID?: string;
    ReferencedFrameNumber?: number | number[];
}

export interface ContentSequenceEntry {
    RelationshipType: string;
    ValueType: string;
    ConceptNameCodeSequence?: CodeSequence | ReturnType<typeof addAccessors>;
    ConceptCodeSequence?: CodeSequence | ReturnType<typeof addAccessors>;
    TextValue?: string;
    UID?: string;
    MeasuredValueSequence?: {
        MeasurementUnitsCodeSequence: unknown;
        NumericValue: number | undefined;
    };
    ContentSequence?: ContentSequenceEntry | undefined;
    GraphicType?: string;
    GraphicData?: number[];
    ReferencedFrameOfReferenceUID?: string;
    ReferencedSOPSequence?: ReferencedSOPSequenceItem | ReferencedSOPSequenceItem[];
}

export interface Point2D {
    x?: number;
    y?: number;
    0?: number;
    1?: number;
}

export interface Point3D extends Point2D {
    z?: number;
    2?: number;
}

export type PointCoord = Point3D;

interface FlattenPointsParams {
    points: (Point2D | Point3D)[];
    use3DSpatialCoordinates?: boolean;
}

export interface TID300MeasurementProps {
    ReferencedSOPSequence?: ReferencedSOPSequenceItem | ReferencedSOPSequenceItem[];
    trackingIdentifierTextValue?: string;
    finding?: CodeSequence;
    findingSites?: CodeSequence[];
}

export default class TID300Measurement {
    ReferencedSOPSequence: ReferencedSOPSequenceItem | ReferencedSOPSequenceItem[] | undefined;
    props: TID300MeasurementProps;

    constructor(props: TID300MeasurementProps) {
        this.ReferencedSOPSequence = props.ReferencedSOPSequence;
        this.props = props;
    }

    getMeasurement(contentSequenceEntries: ContentSequenceEntry[]): ContentSequenceEntry[] {
        return [
            ...this.getTrackingGroups(),
            ...this.getFindingGroup(),
            ...this.getFindingSiteGroups(),
            ...contentSequenceEntries
        ];
    }

    getTrackingGroups(): ContentSequenceEntry[] {
        const { trackingIdentifierTextValue } = this.props;

        return [
            {
                RelationshipType: "HAS OBS CONTEXT",
                ValueType: "TEXT",
                ConceptNameCodeSequence: {
                    CodeValue: "112039",
                    CodingSchemeDesignator: "DCM",
                    CodeMeaning: "Tracking Identifier"
                },
                TextValue: trackingIdentifierTextValue || "web annotation"
            },
            {
                RelationshipType: "HAS OBS CONTEXT",
                ValueType: "UIDREF",
                ConceptNameCodeSequence: {
                    CodeValue: "112040",
                    CodingSchemeDesignator: "DCM",
                    CodeMeaning: "Tracking Unique Identifier"
                },
                UID: DicomMetaDictionary.uid()
            }
        ];
    }

    getFindingGroup(): ContentSequenceEntry[] {
        const finding = this.props.finding;

        if (!finding) {
            return [];
        }

        const { CodeValue, CodingSchemeDesignator, CodeMeaning } = finding;

        return [
            {
                RelationshipType: "CONTAINS",
                ValueType: "CODE",
                ConceptNameCodeSequence: addAccessors({
                    CodeValue: "121071",
                    CodingSchemeDesignator: "DCM",
                    CodeMeaning: "Finding"
                }),
                ConceptCodeSequence: addAccessors({
                    CodeValue, //: "SAMPLE FINDING",
                    CodingSchemeDesignator, //: "99dcmjs",
                    CodeMeaning //: "Sample Finding"
                })
            }
        ];
    }

    getFindingSiteGroups(): ContentSequenceEntry[] {
        const findingSites = this.props.findingSites || [];

        return findingSites.map((findingSite) => {
            const { CodeValue, CodingSchemeDesignator, CodeMeaning } = findingSite;
            return {
                RelationshipType: "CONTAINS",
                ValueType: "CODE",
                ConceptNameCodeSequence: addAccessors({
                    CodeValue: "363698007",
                    CodingSchemeDesignator: "SCT",
                    CodeMeaning: "Finding Site"
                }),
                ConceptCodeSequence: addAccessors({
                    CodeValue, //: "SAMPLE FINDING SITE",
                    CodingSchemeDesignator, //: "99dcmjs",
                    CodeMeaning //: "Sample Finding Site"
                })
            };
        });
    }

    /**
     * Expands an array of points stored as objects into a flattened array of points
     *
     * @param params.points [{x: 0, y: 1}, {x: 1, y: 2}] or [{x: 0, y: 1, z: 0}, {x: 1, y: 2, z: 0}]
     * @param params.use3DSpatialCoordinates boolean: true for 3D points and false for 2D points.
     *
     * @returns [point1x, point1y, point2x, point2y] or [point1x, point1y, point1z, point2x, point2y, point2z]
     */
    flattenPoints({ points, use3DSpatialCoordinates = false }: FlattenPointsParams): number[] {
        const flattenedCoordinates: number[] = [];

        points.forEach((point) => {
            flattenedCoordinates.push(point[0] ?? point.x ?? 0);
            flattenedCoordinates.push(point[1] ?? point.y ?? 0);
            if (use3DSpatialCoordinates) {
                flattenedCoordinates.push((point as Point3D)[2] ?? (point as Point3D).z ?? 0);
            }
        });

        return flattenedCoordinates;
    }
}
