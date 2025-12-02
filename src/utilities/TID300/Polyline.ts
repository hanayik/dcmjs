import TID300Measurement, { type ContentSequenceEntry, type TID300MeasurementProps } from "./TID300Measurement";
import unit2CodingValue from "./unit2CodingValue";

interface Point {
    x?: number;
    y?: number;
    z?: number;
    0?: number;
    1?: number;
    2?: number;
}

interface PolylineProps extends TID300MeasurementProps {
    points: Point[];
    area?: number;
    areaUnit?: string;
    use3DSpatialCoordinates?: boolean;
    perimeter?: number;
    unit?: string;
    ReferencedFrameOfReferenceUID?: string;
}

export default class Polyline extends TID300Measurement {
    declare props: PolylineProps;

    contentItem(): ContentSequenceEntry[] {
        const {
            points,
            area,
            areaUnit = "mm2",
            ReferencedSOPSequence,
            use3DSpatialCoordinates = false,
            perimeter,
            unit = "mm",
            ReferencedFrameOfReferenceUID
        } = this.props;

        const GraphicData = this.flattenPoints({
            points,
            use3DSpatialCoordinates
        });

        // TODO: Add Mean and STDev value of (modality?) pixels
        return this.getMeasurement([
            {
                RelationshipType: "CONTAINS",
                ValueType: "NUM",
                ConceptNameCodeSequence: {
                    CodeValue: "131191004",
                    CodingSchemeDesignator: "SCT",
                    CodeMeaning: "Perimeter"
                },
                MeasuredValueSequence: {
                    MeasurementUnitsCodeSequence: unit2CodingValue(unit),
                    NumericValue: perimeter
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
            },
            {
                // TODO: This feels weird to repeat the GraphicData
                RelationshipType: "CONTAINS",
                ValueType: "NUM",
                ConceptNameCodeSequence: {
                    CodeValue: "G-A166",
                    CodingSchemeDesignator: "SRT",
                    CodeMeaning: "Area" // TODO: Look this up from a Code Meaning dictionary
                },
                MeasuredValueSequence: {
                    MeasurementUnitsCodeSequence: unit2CodingValue(areaUnit),
                    NumericValue: area
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
