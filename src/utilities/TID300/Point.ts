import TID300Measurement, { type ContentSequenceEntry, type TID300MeasurementProps } from "./TID300Measurement";

interface PointCoord {
    x?: number;
    y?: number;
    z?: number;
    0?: number;
    1?: number;
    2?: number;
}

interface PointProps extends TID300MeasurementProps {
    points: PointCoord[];
    use3DSpatialCoordinates?: boolean;
    ReferencedFrameOfReferenceUID?: string;
}

export default class Point extends TID300Measurement {
    declare props: PointProps;

    contentItem(): ContentSequenceEntry[] {
        const {
            points,
            ReferencedSOPSequence,
            use3DSpatialCoordinates = false,
            ReferencedFrameOfReferenceUID
        } = this.props;

        const GraphicData = this.flattenPoints({
            // Allow storing another point as part of an indicator showing a single point
            points: points.slice(0, 2),
            use3DSpatialCoordinates
        });

        return this.getMeasurement([
            {
                RelationshipType: "CONTAINS",
                ValueType: "NUM",
                ConceptNameCodeSequence: {
                    CodeValue: "111010",
                    CodingSchemeDesignator: "DCM",
                    CodeMeaning: "Center"
                },
                //MeasuredValueSequence: ,
                ContentSequence: {
                    RelationshipType: "INFERRED FROM",
                    ValueType: use3DSpatialCoordinates ? "SCOORD3D" : "SCOORD",
                    GraphicType: "POINT",
                    GraphicData,
                    ReferencedFrameOfReferenceUID: use3DSpatialCoordinates ? ReferencedFrameOfReferenceUID : undefined,
                    ContentSequence: use3DSpatialCoordinates
                        ? undefined
                        : {
                              RelationshipType: "SELECTED FROM",
                              ValueType: "IMAGE",
                              ReferencedSOPSequence
                          }
                }
            }
        ]);
    }
}
