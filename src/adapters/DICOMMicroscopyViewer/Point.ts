import TID300Point from "../../utilities/TID300/Point";
import MeasurementReport from "./MeasurementReport";
import type { MeasurementContentItem, Point3D, Scoord3d, TID300RepresentationArguments } from "./types";

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

        // For POINT, graphicData is a single Point3D, wrap it in an array
        const points = [scoord3d.graphicData as Point3D];
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
