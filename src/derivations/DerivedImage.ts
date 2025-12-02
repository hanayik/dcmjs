import DerivedPixels from "./DerivedPixels";
import type { DerivedDatasetOptions } from "./DerivedDataset";
import type { NaturalizedDataset } from "../DicomMetaDictionary";

export default class DerivedImage extends DerivedPixels {
    constructor(datasets: NaturalizedDataset[], options: DerivedDatasetOptions = {}) {
        super(datasets, options);
    }

    derive(): void {
        super.derive();
        this.assignFromReference([
            "WindowCenter",
            "WindowWidth",
            "BitsAllocated",
            "PixelRepresentation",
            "BodyPartExamined",
            "Laterality",
            "PatientPosition",
            "RescaleSlope",
            "RescaleIntercept",
            "PixelPresentation",
            "VolumetricProperties",
            "VolumeBasedCalculationTechnique",
            "PresentationLUTShape"
        ]);
    }
}
