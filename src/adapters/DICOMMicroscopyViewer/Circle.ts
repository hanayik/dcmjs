import TID300Circle from "../../utilities/TID300/Circle";
import MeasurementReport from "./MeasurementReport.js";
import type { MeasurementContentItem, Scoord3d, TID300RepresentationArguments } from "./types";

class Circle {
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
        if (scoord3d.graphicType !== "CIRCLE") {
            throw new Error("We expected a CIRCLE graphicType");
        }

        const points = scoord3d.graphicData;
        const lengths = 1;

        return { points, lengths };
    }

    static graphicType = "CIRCLE";
    static toolType = "Circle";
    static utilityToolType = "Circle";
    static TID300Representation = TID300Circle;
}

MeasurementReport.registerTool(Circle);

export default Circle;
