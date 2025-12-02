import TID300Measurement, { type ContentSequenceEntry, type TID300MeasurementProps } from "./TID300Measurement";
import unit2CodingValue from "./unit2CodingValue";

interface PointCoord {
    x?: number;
    y?: number;
    z?: number;
    0?: number;
    1?: number;
    2?: number;
}

interface CalibrationProps extends TID300MeasurementProps {
    point1: PointCoord;
    point2: PointCoord;
    unit?: string;
    use3DSpatialCoordinates?: boolean;
    distance?: number;
    ReferencedFrameOfReferenceUID?: string;
}

export default class Calibration extends TID300Measurement {
    declare props: CalibrationProps;

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
                    CodeValue: "102304005",
                    CodingSchemeDesignator: "SCT",
                    CodeMeaning: "Calibration Ruler"
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
