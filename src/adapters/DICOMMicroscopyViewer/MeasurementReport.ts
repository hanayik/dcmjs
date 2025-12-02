import { DicomMetaDictionary, type NaturalizedDataset } from "../../DicomMetaDictionary";
import { StructuredReport } from "../../derivations/";
import TID1500MeasurementReport from "../../utilities/TID1500/TID1500MeasurementReport";
import TID1501MeasurementGroup from "../../utilities/TID1500/TID1501MeasurementGroup";
import { toArray } from "../helpers";
import type { MeasurementContentItem, Point3D, Scoord3d, TID300RepresentationArguments } from "./types";

/** TID300 measurement instance interface */
interface TID300Instance {
    contentItem(): unknown[];
    ReferencedSOPSequence: unknown;
}

/** Interface for a microscopy tool class - uses looser typing to match original JS behavior
 *  TODO: use more strict types for this?
 */
interface MicroscopyToolClass {
    graphicType: string;
    toolType: string;
    utilityToolType: string;
    TID300Representation: new (args: Record<string, unknown>) => TID300Instance;
    getMeasurementData(measurementContent: MeasurementContentItem[]): number[][] | number[][][];
    getTID300RepresentationArguments(scoord3d: Scoord3d): TID300RepresentationArguments;
}

/** Dictionary mapping graphic types to tool classes */
interface ToolClassesByGraphicType {
    [graphicType: string]: MicroscopyToolClass;
}

/** Dictionary mapping utility types to tool classes */
interface ToolClassesByUtilityType {
    [utilityType: string]: MicroscopyToolClass;
}

/** Dictionary mapping tool types to utility types */
interface MeasurementByToolType {
    [toolType: string]: string;
}

/** ROI structure from DICOM Microscopy Viewer */
interface ROI {
    scoord3d: Scoord3d & {
        graphicData: Point3D[];
    };
}

/** Measurements organized by graphic type */
interface MeasurementsByGraphicType {
    [graphicType: string]: Scoord3d[];
}

/** Dataset structure for generating tool state */
interface ToolStateDataset {
    ContentTemplateSequence: {
        TemplateIdentifier: string;
    };
    ContentSequence: ContentSequenceItem | ContentSequenceItem[];
}

/** Code sequence structure */
interface CodeSequence {
    CodeValue: string;
    CodingSchemeDesignator: string;
    CodeMeaning: string;
}

/** Content sequence item structure */
interface ContentSequenceItem {
    ConceptNameCodeSequence: CodeSequence;
    ContentSequence?: ContentSequenceItem | ContentSequenceItem[];
    GraphicType?: string;
    GraphicData?: number[];
    [key: string]: unknown;
}

/** Tool state measurement data */
interface ToolStateMeasurementData {
    [toolType: string]: (number[][] | number[][][])[];
}

/** Options for generating report */
interface GenerateReportOptions {
    PersonName?: string;
    sopInstanceUIDsToSeriesInstanceUIDMap?: Record<string, string>;
}

function getTID300ContentItem(tool: Scoord3d, toolClass: MicroscopyToolClass): TID300Instance {
    const args: Record<string, unknown> = {
        ...toolClass.getTID300RepresentationArguments(tool)
    };
    args.use3DSpatialCoordinates = true;
    return new toolClass.TID300Representation(args);
}

function getMeasurementGroup(graphicType: string, measurements: Scoord3d[]): TID1501MeasurementGroup | undefined {
    const toolClass = MeasurementReport.MICROSCOPY_TOOL_CLASSES_BY_TOOL_TYPE[graphicType];

    if (!toolClass) {
        return undefined;
    }

    // Loop through the array of tool instances
    // for this tool
    const Measurements = measurements.map((tool) => {
        return getTID300ContentItem(tool, toolClass);
    });

    // Cast to expected type - the TID300Instance interface matches TID300MeasurementInstance
    return new TID1501MeasurementGroup(
        Measurements as unknown as ConstructorParameters<typeof TID1501MeasurementGroup>[0]
    );
}

export default class MeasurementReport {
    static MEASUREMENT_BY_TOOLTYPE: MeasurementByToolType = {};
    static MICROSCOPY_TOOL_CLASSES_BY_UTILITY_TYPE: ToolClassesByUtilityType = {};
    static MICROSCOPY_TOOL_CLASSES_BY_TOOL_TYPE: ToolClassesByGraphicType = {};

    constructor() {}

    static generateReport(rois: ROI[], _metadataProvider: unknown, options?: GenerateReportOptions): StructuredReport {
        // Input is all ROIS returned via viewer.getALLROIs()
        // let report = MeasurementReport.generateReport(viewer.getAllROIs());

        // Sort and split into arrays by scoord3d.graphicType
        const measurementsByGraphicType: MeasurementsByGraphicType = {};
        rois.forEach((roi) => {
            const graphicType = roi.scoord3d.graphicType;

            if (graphicType !== "POINT") {
                // adding z coord as 0
                roi.scoord3d.graphicData.map((coord) => coord.push(0));
            }

            if (!measurementsByGraphicType[graphicType]) {
                measurementsByGraphicType[graphicType] = [];
            }

            measurementsByGraphicType[graphicType].push(roi.scoord3d);
        });

        // For each measurement, get the utility arguments using the adapter, and create TID300 Measurement
        // Group these TID300 Measurements into a TID1501 Measurement Group (for each graphicType)
        // Use TID1500MeasurementReport utility to create a single report from the created groups
        // return report;

        let allMeasurementGroups: TID1501MeasurementGroup[] = [];
        const measurementGroups: TID1501MeasurementGroup[] = [];
        Object.keys(measurementsByGraphicType).forEach((graphicType) => {
            const measurements = measurementsByGraphicType[graphicType];

            const group = getMeasurementGroup(graphicType, measurements);
            if (group) {
                measurementGroups.push(group);
            }

            allMeasurementGroups = allMeasurementGroups.concat(measurementGroups);
        });

        const MeasurementReportInstance = new TID1500MeasurementReport({
            TID1501MeasurementGroups: allMeasurementGroups as unknown as ConstructorParameters<
                typeof TID1500MeasurementReport
            >[0]["TID1501MeasurementGroups"]
        });

        // TODO: what is the correct metaheader
        // http://dicom.nema.org/medical/Dicom/current/output/chtml/part10/chapter_7.html
        // TODO: move meta creation to happen in derivations.js
        const fileMetaInformationVersionArray = new Uint8Array(2);
        fileMetaInformationVersionArray[1] = 1;

        // TODO: Find out how to reference the data from dicom-microscopy-viewer
        const studyInstanceUID = "12.4";
        const seriesInstanceUID = "12.4";

        const derivationSourceDataset = {
            StudyInstanceUID: studyInstanceUID,
            SeriesInstanceUID: seriesInstanceUID
            //SOPInstanceUID: sopInstanceUID, // TODO: Necessary?
            //SOPClassUID: sopClassUID,
        };

        const _meta = {
            FileMetaInformationVersion: {
                Value: [fileMetaInformationVersionArray.buffer],
                vr: "OB"
            },
            //MediaStorageSOPClassUID
            //MediaStorageSOPInstanceUID: sopCommonModule.sopInstanceUID,
            TransferSyntaxUID: {
                Value: ["1.2.840.10008.1.2.1"],
                vr: "UI"
            },
            ImplementationClassUID: {
                Value: [DicomMetaDictionary.uid()], // TODO: could be git hash or other valid id
                vr: "UI"
            },
            ImplementationVersionName: {
                Value: ["dcmjs"],
                vr: "SH"
            }
        };

        const _vrMap = {
            PixelData: "OW"
        };

        // Use type assertions to match the expected interface
        const derivationSourceDatasetWithMeta = {
            ...derivationSourceDataset,
            _meta,
            _vrMap
        } as unknown as NaturalizedDataset;

        const report = new StructuredReport([derivationSourceDatasetWithMeta]);
        const contentItem = MeasurementReportInstance.contentItem(
            derivationSourceDatasetWithMeta as unknown as Parameters<typeof MeasurementReportInstance.contentItem>[0],
            options
        );

        // Merge the derived dataset with the content from the Measurement Report
        report.dataset = Object.assign(report.dataset, contentItem);
        report.dataset._meta = _meta as unknown as NaturalizedDataset;

        return report;
    }

    //@ToDo
    static generateToolState(dataset: ToolStateDataset): ToolStateMeasurementData {
        // For now, bail out if the dataset is not a TID1500 SR with length measurements
        if (dataset.ContentTemplateSequence.TemplateIdentifier !== "1500") {
            throw new Error("This package can currently only interpret DICOM SR TID 1500");
        }

        const REPORT = "Imaging Measurements";
        const GROUP = "Measurement Group";

        // Split the imagingMeasurementContent into measurement groups by their code meaning
        const contentSequenceArray = toArray(dataset.ContentSequence);
        const imagingMeasurementContent = contentSequenceArray.find(
            (item): item is ContentSequenceItem => item.ConceptNameCodeSequence?.CodeMeaning === REPORT
        );

        if (!imagingMeasurementContent) {
            return {};
        }

        // Retrieve the Measurements themselves
        const measurementGroups = toArray(imagingMeasurementContent.ContentSequence || []).filter(
            (item): item is ContentSequenceItem => item.ConceptNameCodeSequence?.CodeMeaning === GROUP
        );

        // // For each of the supported measurement types, compute the measurement data
        const measurementData: ToolStateMeasurementData = {};

        measurementGroups.forEach((mg) => {
            Object.keys(MeasurementReport.MICROSCOPY_TOOL_CLASSES_BY_UTILITY_TYPE).forEach((measurementType) => {
                // Find supported measurement types in the Structured Report
                const measurementGroupContentSequence = toArray(mg.ContentSequence || []);
                const measurementContent = measurementGroupContentSequence.filter(
                    (item): item is ContentSequenceItem & MeasurementContentItem =>
                        item.GraphicType === measurementType.toUpperCase() && item.GraphicData !== undefined
                );
                if (!measurementContent || measurementContent.length === 0) {
                    return;
                }

                const toolClass = MeasurementReport.MICROSCOPY_TOOL_CLASSES_BY_UTILITY_TYPE[measurementType];
                const toolType = toolClass.toolType;

                if (!toolClass.getMeasurementData) {
                    throw new Error("MICROSCOPY Tool Adapters must define a getMeasurementData static method.");
                }

                if (!measurementData[toolType]) {
                    measurementData[toolType] = [];
                }
                const data = toolClass.getMeasurementData(measurementContent);
                measurementData[toolType] = [...measurementData[toolType], ...(data as (number[][] | number[][][])[])];
            });
        });

        return measurementData;
    }

    static registerTool(toolClass: {
        graphicType: string;
        toolType: string;
        utilityToolType: string;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        TID300Representation: new (
            args: any
        ) => TID300Instance;
        getMeasurementData(measurementContent: MeasurementContentItem[]): number[][] | number[][][];
        getTID300RepresentationArguments(scoord3d: Scoord3d): TID300RepresentationArguments;
    }): void {
        const tc = toolClass as MicroscopyToolClass;
        MeasurementReport.MICROSCOPY_TOOL_CLASSES_BY_UTILITY_TYPE[tc.utilityToolType] = tc;
        MeasurementReport.MICROSCOPY_TOOL_CLASSES_BY_TOOL_TYPE[tc.graphicType] = tc;
        MeasurementReport.MEASUREMENT_BY_TOOLTYPE[tc.graphicType] = tc.utilityToolType;
    }
}
