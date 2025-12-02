import { DicomMetaDictionary, type NaturalizedDataset } from "../../DicomMetaDictionary";
import { StructuredReport } from "../../derivations/index";
import { Normalizer } from "../../normalizers";
import addAccessors from "../../utilities/addAccessors";
import TID1500MeasurementReport from "../../utilities/TID1500/TID1500MeasurementReport";
import TID1501MeasurementGroup, {
    type TID300MeasurementInstance
} from "../../utilities/TID1500/TID1501MeasurementGroup";
import { toArray } from "../helpers";
import Cornerstone3DCodingScheme from "./CodingScheme";
import type {
    CodeSequence,
    AnnotationState,
    SOPInstanceUIDToImageIdMap,
    ImageToWorldCoordsFunction,
    WorldToImageCoordsFunction
} from "./types";

/** Code identifier for matching codes */
interface CodeIdentifier {
    CodingSchemeDesignator: string;
    CodeValue: string;
}

/** Concept name code sequence with code meaning */
interface ConceptNameCodeSequence {
    CodeMeaning?: string;
    CodeValue?: string;
    CodingSchemeDesignator?: string;
}

/** Referenced SOP sequence item */
interface ReferencedSOPSequenceItem {
    ReferencedSOPClassUID?: string;
    ReferencedSOPInstanceUID?: string;
    ReferencedFrameNumber?: number | number[];
}

/** Content item in measurement group */
interface ContentItem {
    ConceptNameCodeSequence?: ConceptNameCodeSequence;
    ConceptCodeSequence?: CodeSequence | CodeSequence[];
    ContentSequence?: ContentItem | ContentItem[];
    ValueType?: string;
    TextValue?: string;
    GraphicData?: number[];
    MeasuredValueSequence?: {
        NumericValue: number;
    };
    ReferencedSOPSequence?: ReferencedSOPSequenceItem;
}

/** Measurement group from DICOM SR */
export interface MeasurementGroup {
    ContentSequence: ContentItem | ContentItem[];
}

/** Dataset meta information */
interface DatasetMeta {
    FileMetaInformationVersion: { Value: ArrayBuffer[]; vr: string };
    TransferSyntaxUID: { Value: string[]; vr: string };
    ImplementationClassUID: { Value: string[]; vr: string };
    ImplementationVersionName: { Value: string[]; vr: string };
}

/** Derivation source dataset structure */
interface DerivationSourceDataset {
    StudyInstanceUID: string;
    SeriesInstanceUID: string;
    _meta: DatasetMeta;
    _vrMap: Record<string, string>;
}

/** Default state structure from setup measurement data */
interface DefaultState {
    sopInstanceUid: string;
    annotation: {
        annotationUID: string;
        metadata: {
            toolName: string;
            referencedImageId: string;
            FrameOfReferenceUID: string;
            label: string;
        };
    };
    finding?: CodeSequence;
    findingSites: CodeSequence[];
    description?: string;
}

/** Setup measurement data result */
interface SetupMeasurementDataResult {
    defaultState: DefaultState;
    NUMGroup: ContentItem | undefined;
    SCOORDGroup: ContentItem | undefined;
    ReferencedSOPSequence: ReferencedSOPSequenceItem | undefined;
    ReferencedSOPInstanceUID: string | undefined;
    ReferencedFrameNumber: number | number[] | undefined;
}

/** Tool class interface for Cornerstone 3D tools */
export interface ToolClass {
    toolType: string;
    utilityToolType: string;
    TID300Representation: new (
        args: Record<string, unknown>
    ) => { ReferencedSOPSequence: unknown; contentItem(): unknown[] };
    getMeasurementData(
        measurementGroup: MeasurementGroup,
        sopInstanceUIDToImageIdMap: SOPInstanceUIDToImageIdMap,
        imageToWorldCoords: ImageToWorldCoordsFunction,
        metadata: MetadataProvider
    ): AnnotationState;
    getTID300RepresentationArguments(
        tool: Record<string, unknown>,
        worldToImageCoords: WorldToImageCoordsFunction
    ): Record<string, unknown>;
    isValidCornerstoneTrackingIdentifier(trackingIdentifier: string): boolean;
}

/** Tool data for individual measurements */
interface ToolData {
    data: Record<string, unknown>;
    metadata: {
        referencedImageId: string;
    };
    finding?: CodeSequence;
    findingSites?: CodeSequence[];
}

/** Tool data by type */
interface ToolTypeData {
    data?: ToolData[];
}

/** Tool state organized by image ID and tool type */
interface ToolState {
    [imageId: string]: {
        [toolType: string]: ToolTypeData;
    };
}

/** SOP Common module metadata */
interface SOPCommonModule {
    sopInstanceUID: string;
    sopClassUID: string;
}

/** General Series module metadata */
interface GeneralSeriesModule {
    studyInstanceUID: string;
    seriesInstanceUID: string;
}

/** Image Plane module metadata */
interface ImagePlaneModule {
    frameOfReferenceUID: string;
}

/** Instance metadata */
interface InstanceMetadata {
    NumberOfFrames?: number;
}

/** Metadata provider interface */
export interface MetadataProvider {
    get(type: "sopCommonModule", imageId: string): SOPCommonModule | undefined;
    get(type: "generalSeriesModule", imageId: string): GeneralSeriesModule | undefined;
    get(type: "imagePlaneModule", imageId: string): ImagePlaneModule | undefined;
    get(type: "frameNumber", imageId: string): number | undefined;
    get(type: "instance", imageId: string): InstanceMetadata | undefined;
    get(type: string, imageId: string): Record<string, unknown> | undefined;
}

/** DICOM SR dataset structure */
interface SRDataset {
    ContentTemplateSequence: {
        TemplateIdentifier: string;
    };
    ContentSequence: ContentItem | ContentItem[];
}

/** Generate tool state hooks */
interface GenerateToolStateHooks {
    getToolClass?: (
        measurementGroup: MeasurementGroup,
        dataset: SRDataset,
        registeredToolClasses: ToolClass[]
    ) => ToolClass | undefined;
}

/** Report generation options */
interface ReportOptions {
    [key: string]: unknown;
}

/** Measurement data organized by tool type */
interface MeasurementData {
    [toolType: string]: AnnotationState[];
}

const FINDING: CodeIdentifier = { CodingSchemeDesignator: "DCM", CodeValue: "121071" };
const FINDING_SITE: CodeIdentifier = { CodingSchemeDesignator: "SCT", CodeValue: "363698007" };
const FINDING_SITE_OLD: CodeIdentifier = { CodingSchemeDesignator: "SRT", CodeValue: "G-C0E3" };

const codeValueMatch = (group: ContentItem, code: CodeIdentifier, oldCode?: CodeIdentifier): boolean | undefined => {
    const { ConceptNameCodeSequence } = group;
    if (!ConceptNameCodeSequence) return;
    const { CodingSchemeDesignator, CodeValue } = ConceptNameCodeSequence;
    return (
        (CodingSchemeDesignator === code.CodingSchemeDesignator && CodeValue === code.CodeValue) ||
        (oldCode !== undefined &&
            CodingSchemeDesignator === oldCode.CodingSchemeDesignator &&
            CodeValue === oldCode.CodeValue)
    );
};

function getTID300ContentItem(
    tool: ToolData,
    _toolType: string,
    ReferencedSOPSequence: ReferencedSOPSequenceItem,
    toolClass: ToolClass,
    worldToImageCoords: WorldToImageCoordsFunction
): TID300MeasurementInstance {
    const args = toolClass.getTID300RepresentationArguments(
        tool as unknown as Record<string, unknown>,
        worldToImageCoords
    );
    args.ReferencedSOPSequence = ReferencedSOPSequence;

    const TID300Measurement = new toolClass.TID300Representation(args);

    return TID300Measurement as unknown as TID300MeasurementInstance;
}

function getMeasurementGroup(
    toolType: string,
    toolData: Record<string, ToolTypeData>,
    ReferencedSOPSequence: ReferencedSOPSequenceItem,
    worldToImageCoords: WorldToImageCoordsFunction
): TID1501MeasurementGroup | undefined {
    const toolTypeData = toolData[toolType];
    const toolClass = MeasurementReport.CORNERSTONE_TOOL_CLASSES_BY_TOOL_TYPE[toolType];
    if (!toolTypeData || !toolTypeData.data || !toolTypeData.data.length || !toolClass) {
        return;
    }

    // Loop through the array of tool instances
    // for this tool
    const Measurements = toolTypeData.data.map((tool) => {
        return getTID300ContentItem(tool, toolType, ReferencedSOPSequence, toolClass, worldToImageCoords);
    });

    return new TID1501MeasurementGroup(Measurements);
}

export default class MeasurementReport {
    constructor() {}

    static getCornerstoneLabelFromDefaultState(defaultState: DefaultState): string | undefined {
        const { findingSites = [], finding } = defaultState;

        const cornersoneFreeTextCodingValue = Cornerstone3DCodingScheme.codeValues.CORNERSTONEFREETEXT;

        const freeTextLabel = findingSites.find((fs) => fs.CodeValue === cornersoneFreeTextCodingValue);

        if (freeTextLabel) {
            return freeTextLabel.CodeMeaning;
        }

        if (finding && finding.CodeValue === cornersoneFreeTextCodingValue) {
            return finding.CodeMeaning;
        }
    }

    static generateDatasetMeta(): DatasetMeta {
        // TODO: what is the correct metaheader
        // http://dicom.nema.org/medical/Dicom/current/output/chtml/part10/chapter_7.html
        // TODO: move meta creation to happen in derivations.js
        const fileMetaInformationVersionArray = new Uint8Array(2);
        fileMetaInformationVersionArray[1] = 1;

        const _meta: DatasetMeta = {
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

        return _meta;
    }

    static generateDerivationSourceDataset(
        StudyInstanceUID: string,
        SeriesInstanceUID: string
    ): DerivationSourceDataset {
        const _vrMap: Record<string, string> = {
            PixelData: "OW"
        };

        const _meta = MeasurementReport.generateDatasetMeta();

        const derivationSourceDataset: DerivationSourceDataset = {
            StudyInstanceUID,
            SeriesInstanceUID,
            _meta: _meta,
            _vrMap: _vrMap
        };

        return derivationSourceDataset;
    }

    static getSetupMeasurementData(
        MeasurementGroupData: MeasurementGroup,
        sopInstanceUIDToImageIdMap: SOPInstanceUIDToImageIdMap,
        metadata: MetadataProvider,
        toolType: string
    ): SetupMeasurementDataResult {
        const { ContentSequence } = MeasurementGroupData;

        const contentSequenceArr = toArray(ContentSequence);
        const findingGroup = contentSequenceArr.find((group) => codeValueMatch(group, FINDING));
        const findingSiteGroups =
            contentSequenceArr.filter((group) => codeValueMatch(group, FINDING_SITE, FINDING_SITE_OLD)) || [];
        const NUMGroup = contentSequenceArr.find((group) => group.ValueType === "NUM");
        const SCOORDGroup = NUMGroup
            ? toArray(NUMGroup.ContentSequence).find((group) => group?.ValueType === "SCOORD")
            : undefined;
        const ReferencedSOPSequence = SCOORDGroup?.ContentSequence
            ? (SCOORDGroup.ContentSequence as ContentItem).ReferencedSOPSequence
            : undefined;
        const ReferencedSOPInstanceUID = ReferencedSOPSequence?.ReferencedSOPInstanceUID;
        const ReferencedFrameNumber = ReferencedSOPSequence?.ReferencedFrameNumber;

        const referencedImageId = ReferencedSOPInstanceUID ? sopInstanceUIDToImageIdMap[ReferencedSOPInstanceUID] : "";
        const imagePlaneModule = metadata.get("imagePlaneModule", referencedImageId);

        const finding = findingGroup
            ? (addAccessors(findingGroup.ConceptCodeSequence as CodeSequence) as CodeSequence)
            : undefined;
        const findingSites = findingSiteGroups.map((fsg) => {
            return addAccessors(fsg.ConceptCodeSequence as CodeSequence) as CodeSequence;
        });

        const defaultState: DefaultState = {
            sopInstanceUid: ReferencedSOPInstanceUID || "",
            annotation: {
                annotationUID: DicomMetaDictionary.uid(),
                metadata: {
                    toolName: toolType,
                    referencedImageId,
                    FrameOfReferenceUID: imagePlaneModule?.frameOfReferenceUID || "",
                    label: ""
                }
            },
            finding,
            findingSites
        };
        if (defaultState.finding) {
            defaultState.description = defaultState.finding.CodeMeaning;
        }

        defaultState.annotation.metadata.label =
            MeasurementReport.getCornerstoneLabelFromDefaultState(defaultState) || "";

        return {
            defaultState,
            NUMGroup,
            SCOORDGroup,
            ReferencedSOPSequence,
            ReferencedSOPInstanceUID,
            ReferencedFrameNumber
        };
    }

    static generateReport(
        toolState: ToolState,
        metadataProvider: MetadataProvider,
        worldToImageCoords: WorldToImageCoordsFunction,
        _options?: ReportOptions
    ): StructuredReport {
        // ToolState for array of imageIDs to a Report
        // Assume Cornerstone metadata provider has access to Study / Series / Sop Instance UID
        let allMeasurementGroups: TID1501MeasurementGroup[] = [];

        /* Patient ID
        Warning - Missing attribute or value that would be needed to build DICOMDIR - Patient ID
        Warning - Missing attribute or value that would be needed to build DICOMDIR - Study Date
        Warning - Missing attribute or value that would be needed to build DICOMDIR - Study Time
        Warning - Missing attribute or value that would be needed to build DICOMDIR - Study ID
        */

        const sopInstanceUIDsToSeriesInstanceUIDMap: Record<string, string> = {};
        const derivationSourceDatasets: DerivationSourceDataset[] = [];

        const _meta = MeasurementReport.generateDatasetMeta();

        // Loop through each image in the toolData
        Object.keys(toolState).forEach((imageId) => {
            const sopCommonModule = metadataProvider.get("sopCommonModule", imageId);
            const generalSeriesModule = metadataProvider.get("generalSeriesModule", imageId);

            if (!sopCommonModule || !generalSeriesModule) {
                return;
            }

            const { sopInstanceUID, sopClassUID } = sopCommonModule;
            const { studyInstanceUID, seriesInstanceUID } = generalSeriesModule;

            sopInstanceUIDsToSeriesInstanceUIDMap[sopInstanceUID] = seriesInstanceUID;

            if (!derivationSourceDatasets.find((dsd) => dsd.SeriesInstanceUID === seriesInstanceUID)) {
                // Entry not present for series, create one.
                const derivationSourceDataset = MeasurementReport.generateDerivationSourceDataset(
                    studyInstanceUID,
                    seriesInstanceUID
                );

                derivationSourceDatasets.push(derivationSourceDataset);
            }

            const frameNumber = metadataProvider.get("frameNumber", imageId);
            const toolData = toolState[imageId];
            const toolTypes = Object.keys(toolData);

            const ReferencedSOPSequence: ReferencedSOPSequenceItem = {
                ReferencedSOPClassUID: sopClassUID,
                ReferencedSOPInstanceUID: sopInstanceUID
            };

            const instance = metadataProvider.get("instance", imageId);
            if (
                (instance?.NumberOfFrames && instance.NumberOfFrames > 1) ||
                Normalizer.isMultiframeSOPClassUID(sopClassUID)
            ) {
                ReferencedSOPSequence.ReferencedFrameNumber = frameNumber;
            }

            // Loop through each tool type for the image
            const measurementGroups: TID1501MeasurementGroup[] = [];

            toolTypes.forEach((toolType) => {
                const group = getMeasurementGroup(toolType, toolData, ReferencedSOPSequence, worldToImageCoords);
                if (group) {
                    measurementGroups.push(group);
                }
            });

            allMeasurementGroups = allMeasurementGroups.concat(measurementGroups);
        });

        const tid1500MeasurementReport = new TID1500MeasurementReport({
            TID1501MeasurementGroups: allMeasurementGroups
        } as unknown as ConstructorParameters<typeof TID1500MeasurementReport>[0]);

        const report = new StructuredReport(derivationSourceDatasets as unknown as NaturalizedDataset[]);

        const contentItem = tid1500MeasurementReport.contentItem(derivationSourceDatasets, {
            sopInstanceUIDsToSeriesInstanceUIDMap
        });

        // Merge the derived dataset with the content from the Measurement Report
        report.dataset = Object.assign(report.dataset, contentItem);
        report.dataset._meta = _meta as unknown as NaturalizedDataset;

        return report;
    }

    /**
     * Generate Cornerstone tool state from dataset
     * @param dataset dataset
     * @param sopInstanceUIDToImageIdMap mapping of SOP Instance UIDs to image IDs
     * @param imageToWorldCoords function to convert image to world coordinates
     * @param metadata metadata provider
     * @param hooks optional hooks
     * @param hooks.getToolClass Function to map dataset to a tool class
     * @returns measurement data organized by tool type
     */
    static generateToolState(
        dataset: SRDataset,
        sopInstanceUIDToImageIdMap: SOPInstanceUIDToImageIdMap,
        imageToWorldCoords: ImageToWorldCoordsFunction,
        metadata: MetadataProvider,
        hooks: GenerateToolStateHooks = {}
    ): MeasurementData {
        // For now, bail out if the dataset is not a TID1500 SR with length measurements
        if (dataset.ContentTemplateSequence.TemplateIdentifier !== "1500") {
            throw new Error("This package can currently only interpret DICOM SR TID 1500");
        }

        const REPORT = "Imaging Measurements";
        const GROUP = "Measurement Group";
        const TRACKING_IDENTIFIER = "Tracking Identifier";

        // Identify the Imaging Measurements
        const contentSequenceArray = toArray(dataset.ContentSequence);
        const imagingMeasurementContent = contentSequenceArray.find((item) => {
            return item.ConceptNameCodeSequence?.CodeMeaning === REPORT;
        });

        // Retrieve the Measurements themselves
        const measurementGroups = toArray(imagingMeasurementContent?.ContentSequence).filter(
            (item): item is MeasurementGroup => {
                return item?.ConceptNameCodeSequence?.CodeMeaning === GROUP;
            }
        );

        // For each of the supported measurement types, compute the measurement data
        const measurementData: MeasurementData = {};

        const cornerstoneToolClasses = MeasurementReport.CORNERSTONE_TOOL_CLASSES_BY_UTILITY_TYPE;

        const registeredToolClasses: ToolClass[] = [];

        Object.keys(cornerstoneToolClasses).forEach((key) => {
            registeredToolClasses.push(cornerstoneToolClasses[key]);
            measurementData[key] = [];
        });

        measurementGroups.forEach((measurementGroup) => {
            const measurementGroupContentSequence = toArray(measurementGroup.ContentSequence);

            const TrackingIdentifierGroup = measurementGroupContentSequence.find(
                (contentItem) => contentItem.ConceptNameCodeSequence?.CodeMeaning === TRACKING_IDENTIFIER
            );

            const TrackingIdentifierValue = TrackingIdentifierGroup?.TextValue || "";

            const toolClass = hooks.getToolClass
                ? hooks.getToolClass(measurementGroup, dataset, registeredToolClasses)
                : registeredToolClasses.find((tc) => tc.isValidCornerstoneTrackingIdentifier(TrackingIdentifierValue));

            if (toolClass) {
                const measurement = toolClass.getMeasurementData(
                    measurementGroup,
                    sopInstanceUIDToImageIdMap,
                    imageToWorldCoords,
                    metadata
                );

                console.log(`=== ${toolClass.toolType} ===`);
                console.log(measurement);

                measurementData[toolClass.toolType].push(measurement);
            }
        });

        // NOTE: There is no way of knowing the cornerstone imageIds as that could be anything.
        // That is up to the consumer to derive from the SOPInstanceUIDs.
        return measurementData;
    }

    static registerTool(toolClass: { toolType: string; utilityToolType: string }): void {
        MeasurementReport.CORNERSTONE_TOOL_CLASSES_BY_UTILITY_TYPE[toolClass.utilityToolType] =
            toolClass as unknown as ToolClass;
        MeasurementReport.CORNERSTONE_TOOL_CLASSES_BY_TOOL_TYPE[toolClass.toolType] = toolClass as unknown as ToolClass;
        MeasurementReport.MEASUREMENT_BY_TOOLTYPE[toolClass.toolType] = toolClass.utilityToolType;
    }

    static MEASUREMENT_BY_TOOLTYPE: Record<string, string> = {};
    static CORNERSTONE_TOOL_CLASSES_BY_UTILITY_TYPE: Record<string, ToolClass> = {};
    static CORNERSTONE_TOOL_CLASSES_BY_TOOL_TYPE: Record<string, ToolClass> = {};
}
