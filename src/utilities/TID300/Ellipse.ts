import TID300Measurement, {
    type ContentSequenceEntry,
    type TID300MeasurementProps,
    type PointCoord
} from "./TID300Measurement";
import unit2CodingValue from "./unit2CodingValue";

interface EllipseProps extends TID300MeasurementProps {
    points: PointCoord[];
    use3DSpatialCoordinates?: boolean;
    area?: number;
    areaUnit?: string;
    ReferencedFrameOfReferenceUID?: string;
}

export default class Ellipse extends TID300Measurement {
    declare props: EllipseProps;

    contentItem(): ContentSequenceEntry[] {
        const {
            points,
            use3DSpatialCoordinates = false,
            ReferencedSOPSequence,
            area,
            areaUnit,
            ReferencedFrameOfReferenceUID
        } = this.props;

        const GraphicData = this.flattenPoints({
            points,
            use3DSpatialCoordinates
        });

        return this.getMeasurement([
            {
                RelationshipType: "CONTAINS",
                ValueType: "NUM",
                ConceptNameCodeSequence: {
                    CodeValue: "G-D7FE",
                    CodingSchemeDesignator: "SRT",
                    CodeMeaning: "AREA"
                },
                MeasuredValueSequence: {
                    MeasurementUnitsCodeSequence: unit2CodingValue(areaUnit),
                    NumericValue: area
                },
                ContentSequence: {
                    RelationshipType: "INFERRED FROM",
                    ValueType: use3DSpatialCoordinates ? "SCOORD3D" : "SCOORD",
                    GraphicType: "ELLIPSE",
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
