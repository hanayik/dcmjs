import { DicomMetaDictionary, type NaturalizedDataset } from "../DicomMetaDictionary";
import DerivedDataset, { type DerivedDatasetOptions } from "./DerivedDataset";

export default class StructuredReport extends DerivedDataset {
    constructor(datasets: NaturalizedDataset[], options: DerivedDatasetOptions = {}) {
        super(datasets, options);
    }

    // this assumes a normalized multiframe input and will create
    // a multiframe derived image
    derive(): void {
        super.derive();

        this.assignToDataset({
            SOPClassUID: DicomMetaDictionary.sopClassUIDsByName.EnhancedSR,
            Modality: "SR",
            ValueType: "CONTAINER"
        });

        this.assignFromReference([]);
    }
}
