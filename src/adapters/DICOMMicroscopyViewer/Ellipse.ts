import TID300Ellipse from "../../utilities/TID300/Ellipse";
import MeasurementReport from "./MeasurementReport.js";
import type { MeasurementContentItem, Scoord3d, TID300RepresentationArguments } from "./types";

class Ellipse {
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
        if (scoord3d.graphicType !== "Ellipse") {
            throw new Error("We expected a Ellipse graphicType");
        }

        const points = scoord3d.graphicData;
        const lengths = 1;

        return { points, lengths };
    }

    static graphicType = "ELLIPSE";
    static toolType = "Ellipse";
    static utilityToolType = "Ellipse";
    static TID300Representation = TID300Ellipse;
}

MeasurementReport.registerTool(Ellipse);

export default Ellipse;
