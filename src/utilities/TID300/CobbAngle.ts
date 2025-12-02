import TID300Measurement, { type ContentSequenceEntry, type TID300MeasurementProps } from "./TID300Measurement";

interface PointCoord {
    x?: number;
    y?: number;
    z?: number;
    0?: number;
    1?: number;
    2?: number;
}

interface CobbAngleProps extends TID300MeasurementProps {
    point1: PointCoord;
    point2: PointCoord;
    point3: PointCoord;
    point4: PointCoord;
    rAngle?: number;
    use3DSpatialCoordinates?: boolean;
    ReferencedFrameOfReferenceUID?: string;
}

export default class CobbAngle extends TID300Measurement {
    declare props: CobbAngleProps;

    contentItem(): ContentSequenceEntry[] {
        const {
            point1,
            point2,
            point3,
            point4,
            rAngle,
            use3DSpatialCoordinates,
            ReferencedSOPSequence,
            ReferencedFrameOfReferenceUID
        } = this.props;

        const GraphicData = this.flattenPoints({
            points: [point1, point2, point3, point4],
            use3DSpatialCoordinates
        });

        return this.getMeasurement([
            {
                RelationshipType: "CONTAINS",
                ValueType: "NUM",
                ConceptNameCodeSequence: {
                    CodeValue: "285285000",
                    CodingSchemeDesignator: "SCT",
                    CodeMeaning: "Cobb angle"
                },
                MeasuredValueSequence: {
                    MeasurementUnitsCodeSequence: {
                        CodeValue: "deg",
                        CodingSchemeDesignator: "UCUM",
                        CodingSchemeVersion: "1.4",
                        CodeMeaning: "\u00B0"
                    },
                    NumericValue: rAngle
                },
                ContentSequence: {
                    RelationshipType: "INFERRED FROM",
                    ValueType: use3DSpatialCoordinates ? "SCOORD3D" : "SCOORD",
                    GraphicType: "POLYLINE",
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
