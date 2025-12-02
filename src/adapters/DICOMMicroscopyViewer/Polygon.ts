import TID300Polygon from "../../utilities/TID300/Polygon";
import MeasurementReport from "./MeasurementReport.js";
import type { MeasurementContentItem, Scoord3d, TID300RepresentationArguments } from "./types";

class Polygon {
    constructor() {}

    static getMeasurementData(measurementContent: MeasurementContentItem[]): number[][][] {
        // removing duplication and Getting only the graphicData information
        const measurement = measurementContent
            .map((item) => item.GraphicData)
            .filter(
                (
                    (s: Set<string>) => (a: number[]) =>
                        ((j: string) => !s.has(j) && s.add(j))(JSON.stringify(a))
                )(new Set())
            );

        // Chunking the array into size of three
        return measurement.map((measurement) => {
            return measurement.reduce<number[][]>((all, one, i) => {
                const ch = Math.floor(i / 3);
                all[ch] = ([] as number[]).concat(all[ch] || [], one);
                return all;
            }, []);
        });
    }

    static getTID300RepresentationArguments(scoord3d: Scoord3d): TID300RepresentationArguments {
        if (scoord3d.graphicType !== "POLYGON") {
            throw new Error("We expected a POLYGON graphicType");
        }

        const points = scoord3d.graphicData;
        const lengths = 1;

        return { points, lengths };
    }

    static graphicType = "POLYGON";
    static toolType = "Polygon";
    static utilityToolType = "Polygon";
    static TID300Representation = TID300Polygon;
}

MeasurementReport.registerTool(Polygon);

export default Polygon;
