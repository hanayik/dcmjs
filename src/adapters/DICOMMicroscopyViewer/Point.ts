import TID300Point from "../../utilities/TID300/Point";
import MeasurementReport from "./MeasurementReport.js";

interface MeasurementContentItem {
    GraphicData: number[];
    GraphicType?: string;
    [key: string]: unknown;
}

interface Point3D {
    0: number;
    1: number;
    2: number;
}

interface Scoord3d {
    graphicType: string;
    graphicData: Point3D;
}

interface TID300RepresentationArguments {
    points: Point3D[];
    lengths: number;
}

class Point {
    constructor() {}

    static getMeasurementData(measurementContent: MeasurementContentItem[]): number[][] {
        const measurement = measurementContent.map((item) => item.GraphicData);
        return measurement.filter(
            (
                (s: Set<string>) => (a: number[]) =>
                    ((j: string) => !s.has(j) && s.add(j))(JSON.stringify(a))
            )(new Set())
        );
    }

    static getTID300RepresentationArguments(scoord3d: Scoord3d): TID300RepresentationArguments {
        if (scoord3d.graphicType !== "POINT") {
            throw new Error("We expected a POINT graphicType");
        }

        const points = [scoord3d.graphicData];
        const lengths = 1;

        return { points, lengths };
    }

    static graphicType = "POINT";
    static toolType = "Point";
    static utilityToolType = "Point";
    static TID300Representation = TID300Point;
}

MeasurementReport.registerTool(Point);

export default Point;
