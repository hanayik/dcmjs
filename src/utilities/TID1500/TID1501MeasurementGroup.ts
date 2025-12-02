import type { ContentSequenceEntry, ReferencedSOPSequenceItem } from "../TID300/TID300Measurement";

interface CodeSequence {
    CodeValue: string;
    CodingSchemeDesignator: string;
    CodeMeaning: string;
}

interface MeasurementGroupContainer {
    RelationshipType: string;
    ValueType: string;
    ConceptNameCodeSequence: CodeSequence;
    ContinuityOfContent: string;
    ContentSequence: ContentSequenceEntry[];
}

/** Represents a TID300Measurement instance that can produce content items */
export interface TID300MeasurementInstance {
    ReferencedSOPSequence: ReferencedSOPSequenceItem;
    contentItem(): ContentSequenceEntry[];
}

export default class TID1501MeasurementGroup {
    TID300Measurements: TID300MeasurementInstance[];

    constructor(TID300Measurements: TID300MeasurementInstance[]) {
        this.TID300Measurements = TID300Measurements;
    }

    contentItem(): MeasurementGroupContainer[] {
        const { TID300Measurements } = this;

        // TODO: Is there nothing else in this group?
        const measurementGroups: MeasurementGroupContainer[] = [];

        TID300Measurements.forEach((TID300Measurement) => {
            measurementGroups.push(this.getMeasurementGroup(TID300Measurement.contentItem()));
        });

        return measurementGroups;
    }

    getMeasurementGroup(contentSequenceEntries: ContentSequenceEntry[]): MeasurementGroupContainer {
        return {
            RelationshipType: "CONTAINS",
            ValueType: "CONTAINER",
            ConceptNameCodeSequence: {
                CodeValue: "125007",
                CodingSchemeDesignator: "DCM",
                CodeMeaning: "Measurement Group"
            },
            ContinuityOfContent: "SEPARATE",
            ContentSequence: [...contentSequenceEntries]
        };
    }
}
