import DerivedDataset, { type DerivedDatasetOptions } from "./DerivedDataset";
import type { NaturalizedDataset } from "../DicomMetaDictionary";

export default class ParametricMap extends DerivedDataset {
    constructor(datasets: NaturalizedDataset[], options: DerivedDatasetOptions = {}) {
        super(datasets, options);
    }

    // this assumes a normalized multiframe input and will create
    // a multiframe derived image
    derive(): void {
        super.derive();

        this.assignToDataset({
            // TODO: ???
        });

        this.assignFromReference([]);
    }
}
