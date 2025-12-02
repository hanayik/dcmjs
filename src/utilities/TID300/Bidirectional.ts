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

interface Axis {
    point1: PointCoord;
    point2: PointCoord;
}

interface BidirectionalProps extends TID300MeasurementProps {
    longAxis: Axis;
    shortAxis: Axis;
    longAxisLength?: number;
    shortAxisLength?: number;
    unit?: string;
    use3DSpatialCoordinates?: boolean;
    ReferencedFrameOfReferenceUID?: string;
}

export default class Bidirectional extends TID300Measurement {
    declare props: BidirectionalProps;

    contentItem(): ContentSequenceEntry[] {
        const {
            longAxis,
            shortAxis,
            longAxisLength,
            shortAxisLength,
            unit,
            use3DSpatialCoordinates = false,
            ReferencedSOPSequence,
            ReferencedFrameOfReferenceUID
        } = this.props;

        const longAxisGraphicData = this.flattenPoints({
            points: [longAxis.point1, longAxis.point2],
            use3DSpatialCoordinates
        });
        const shortAxisGraphicData = this.flattenPoints({
            points: [shortAxis.point1, shortAxis.point2],
            use3DSpatialCoordinates
        });

        return this.getMeasurement([
            {
                RelationshipType: "CONTAINS",
                ValueType: "NUM",
                ConceptNameCodeSequence: {
                    CodeValue: "G-A185",
                    CodingSchemeDesignator: "SRT",
                    CodeMeaning: "Long Axis"
                },
                MeasuredValueSequence: {
                    MeasurementUnitsCodeSequence: unit2CodingValue(unit),
                    NumericValue: longAxisLength
                },
                ContentSequence: {
                    RelationshipType: "INFERRED FROM",
                    ValueType: use3DSpatialCoordinates ? "SCOORD3D" : "SCOORD",
                    GraphicType: "POLYLINE",
                    GraphicData: longAxisGraphicData,
                    ReferencedFrameOfReferenceUID: use3DSpatialCoordinates ? ReferencedFrameOfReferenceUID : undefined,
                    ContentSequence: use3DSpatialCoordinates
                        ? undefined
                        : {
                              RelationshipType: "SELECTED FROM",
                              ValueType: "IMAGE",
                              ReferencedSOPSequence
                          }
                }
            },
            {
                RelationshipType: "CONTAINS",
                ValueType: "NUM",
                ConceptNameCodeSequence: {
                    CodeValue: "G-A186",
                    CodingSchemeDesignator: "SRT",
                    CodeMeaning: "Short Axis"
                },
                MeasuredValueSequence: {
                    MeasurementUnitsCodeSequence: unit2CodingValue(unit),
                    NumericValue: shortAxisLength
                },
                ContentSequence: {
                    RelationshipType: "INFERRED FROM",
                    ValueType: use3DSpatialCoordinates ? "SCOORD3D" : "SCOORD",
                    GraphicType: "POLYLINE",
                    GraphicData: shortAxisGraphicData,
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
