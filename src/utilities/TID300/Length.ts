import TID300Measurement, { type ContentSequenceEntry, type TID300MeasurementProps, type PointCoord } from "./TID300Measurement";
import unit2CodingValue from "./unit2CodingValue";

interface LengthProps extends TID300MeasurementProps {
    point1: PointCoord;
    point2: PointCoord;
    unit?: string;
    use3DSpatialCoordinates?: boolean;
    distance?: number;
    ReferencedFrameOfReferenceUID?: string;
}

export default class Length extends TID300Measurement {
    declare props: LengthProps;

    contentItem(): ContentSequenceEntry[] {
        const {
            point1,
            point2,
            unit = "mm",
            use3DSpatialCoordinates = false,
            distance,
            ReferencedSOPSequence,
            ReferencedFrameOfReferenceUID
        } = this.props;

        const GraphicData = this.flattenPoints({
            points: [point1, point2],
            use3DSpatialCoordinates
        });

        return this.getMeasurement([
            {
                RelationshipType: "CONTAINS",
                ValueType: "NUM",
                ConceptNameCodeSequence: {
                    CodeValue: "G-D7FE",
                    CodingSchemeDesignator: "SRT",
                    CodeMeaning: "Length"
                },
                MeasuredValueSequence: {
                    MeasurementUnitsCodeSequence: unit2CodingValue(unit),
                    NumericValue: distance
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
