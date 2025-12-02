import { DicomMetaDictionary } from "../DicomMetaDictionary.js";
import { ContentSequence } from "./valueTypes.js";

const _attributesToInclude: string[] = [
    // Patient
    "00080054",
    "00080100",
    "00080102",
    "00080103",
    "00080104",
    "00080105",
    "00080106",
    "00080107",
    "0008010B",
    "0008010D",
    "0008010F",
    "00080117",
    "00080118",
    "00080119",
    "00080120",
    "00080121",
    "00080122",
    "00081120",
    "00081150",
    "00081155",
    "00081160",
    "00081190",
    "00081199",
    "00100010",
    "00100020",
    "00100021",
    "00100022",
    "00100024",
    "00100026",
    "00100027",
    "00100028",
    "00100030",
    "00100032",
    "00100033",
    "00100034",
    "00100035",
    "00100040",
    "00100200",
    "00100212",
    "00100213",
    "00100214",
    "00100215",
    "00100216",
    "00100217",
    "00100218",
    "00100219",
    "00100221",
    "00100222",
    "00100223",
    "00100229",
    "00101001",
    "00101002",
    "00101100",
    "00102160",
    "00102201",
    "00102202",
    "00102292",
    "00102293",
    "00102294",
    "00102295",
    "00102296",
    "00102297",
    "00102298",
    "00102299",
    "00104000",
    "00120062",
    "00120063",
    "00120064",
    "0020000D",
    "00400031",
    "00400032",
    "00400033",
    "00400035",
    "00400036",
    "00400039",
    "0040003A",
    "0040E001",
    "0040E010",
    "0040E020",
    "0040E021",
    "0040E022",
    "0040E023",
    "0040E024",
    "0040E025",
    "0040E030",
    "0040E031",
    "0062000B",
    "00880130",
    "00880140",
    // Patient Study
    "00080100",
    "00080102",
    "00080103",
    "00080104",
    "00080105",
    "00080106",
    "00080107",
    "0008010B",
    "0008010D",
    "0008010F",
    "00080117",
    "00080118",
    "00080119",
    "00080120",
    "00080121",
    "00080122",
    "00081080",
    "00081084",
    "00101010",
    "00101020",
    "00101021",
    "00101022",
    "00101023",
    "00101024",
    "00101030",
    "00102000",
    "00102110",
    "00102180",
    "001021A0",
    "001021B0",
    "001021C0",
    "001021D0",
    "00102203",
    "00380010",
    "00380014",
    "00380060",
    "00380062",
    "00380064",
    "00380500",
    "00400031",
    "00400032",
    "00400033",
    // General Study
    "00080020",
    "00080030",
    "00080050",
    "00080051",
    "00080080",
    "00080081",
    "00080082",
    "00080090",
    "00080096",
    "0008009C",
    "0008009D",
    "00080100",
    "00080102",
    "00080103",
    "00080104",
    "00080105",
    "00080106",
    "00080107",
    "0008010B",
    "0008010D",
    "0008010F",
    "00080117",
    "00080118",
    "00080119",
    "00080120",
    "00080121",
    "00080122",
    "00081030",
    "00081032",
    "00081048",
    "00081049",
    "00081060",
    "00081062",
    "00081110",
    "00081150",
    "00081155",
    "0020000D",
    "00200010",
    "00321034",
    "00400031",
    "00400032",
    "00400033",
    "00401012",
    "00401101",
    "00401102",
    "00401103",
    "00401104",
    // Clinical Trial Subject
    "00120010",
    "00120020",
    "00120021",
    "00120030",
    "00120031",
    "00120040",
    "00120042",
    "00120081",
    "00120082",
    // Clinical Trial Study
    "00120020",
    "00120050",
    "00120051",
    "00120052",
    "00120053",
    "00120083",
    "00120084",
    "00120085"
];

interface EvidenceItem {
    StudyInstanceUID: string;
    SeriesInstanceUID: string;
    SOPClassUID: string;
    SOPInstanceUID: string;
    [key: string]: unknown;
}

interface VerifyingObserverItem {
    VerifyingObserverName: string;
    VerifyingOrganization: string;
    VerificationDateTime: string;
}

interface ReferencedInstanceItem {
    ReferencedSOPClassUID: string;
    ReferencedSOPInstanceUID: string;
}

interface ReferencedSeriesItem {
    SeriesInstanceUID: string;
    ReferencedSOPSequence: ReferencedInstanceItem[];
}

interface EvidenceStudyItem {
    StudyInstanceUID: string;
    ReferencedSeriesSequence: ReferencedSeriesItem[];
}

interface ContentObject {
    [key: string]: unknown;
}

interface Comprehensive3DSROptions {
    evidence: EvidenceItem[];
    content: ContentObject;
    seriesInstanceUID: string;
    seriesNumber: number;
    seriesDescription: string;
    sopInstanceUID: string;
    instanceNumber: number;
    manufacturer: string;
    institutionName?: string;
    institutionalDepartmentName?: string;
    institutionDepartmentName?: string;
    isComplete?: boolean;
    isVerified?: boolean;
    verifyingObserverName?: string;
    verifyingOrganization?: string;
    isFinal?: boolean;
    requestedProcedures?: ContentObject[];
    previousVersions?: EvidenceItem[];
    performedProcedureCodes?: ContentObject[];
}

class Comprehensive3DSR {
    SOPClassUID: string;
    SOPInstanceUID: string;
    Modality: string;
    SeriesDescription: string;
    SeriesInstanceUID: string;
    SeriesNumber: number;
    InstanceNumber: number;
    Manufacturer: string;
    InstitutionName?: string;
    InstitutionalDepartmentName?: string;
    CompletionFlag: "COMPLETE" | "PARTIAL";
    VerificationFlag: "VERIFIED" | "UNVERIFIED";
    VerifyingObserverSequence?: VerifyingObserverItem[];
    PreliminaryFlag: "FINAL" | "PRELIMINARY";
    ContentDate: string;
    ContentTime: string;
    ReferencedRequestSequence?: ContentSequence;
    CurrentRequestedProcedureEvidenceSequence?: EvidenceStudyItem[];
    PertinentOtherEvidenceSequence?: EvidenceStudyItem[];
    PredecessorDocumentsSequence?: EvidenceStudyItem[];
    PerformedProcedureCodeSequence: ContentSequence | unknown[];
    ReferencedPerformedProcedureStepSequence: unknown[];
    [key: string]: unknown;

    constructor(options: Comprehensive3DSROptions) {
        if (options.evidence === undefined) {
            throw new Error("Option 'evidence' is required for Comprehensive3DSR.");
        }
        if (!(typeof options.evidence === "object" || Array.isArray(options.evidence))) {
            throw new Error("Option 'evidence' must have type Array.");
        }
        if (options.evidence.length === 0) {
            throw new Error("Option 'evidence' must have non-zero length.");
        }
        if (options.content === undefined) {
            throw new Error("Option 'content' is required for Comprehensive3DSR.");
        }
        if (options.seriesInstanceUID === undefined) {
            throw new Error("Option 'seriesInstanceUID' is required for Comprehensive3DSR.");
        }
        if (options.seriesNumber === undefined) {
            throw new Error("Option 'seriesNumber' is required for Comprehensive3DSR.");
        }
        if (options.seriesDescription === undefined) {
            throw new Error("Option 'seriesDescription' is required for Comprehensive3DSR.");
        }
        if (options.sopInstanceUID === undefined) {
            throw new Error("Option 'sopInstanceUID' is required for Comprehensive3DSR.");
        }
        if (options.instanceNumber === undefined) {
            throw new Error("Option 'instanceNumber' is required for Comprehensive3DSR.");
        }
        if (options.manufacturer === undefined) {
            throw new Error("Option 'manufacturer' is required for Comprehensive3DSR.");
        }

        this.SOPClassUID = "1.2.840.10008.5.1.4.1.1.88.34";
        this.SOPInstanceUID = options.sopInstanceUID;
        this.Modality = "SR";
        this.SeriesDescription = options.seriesDescription;
        this.SeriesInstanceUID = options.seriesInstanceUID;
        this.SeriesNumber = options.seriesNumber;
        this.InstanceNumber = options.instanceNumber;

        this.Manufacturer = options.manufacturer;
        if (options.institutionName !== undefined) {
            this.InstitutionName = options.institutionName;
            if (options.institutionalDepartmentName !== undefined) {
                this.InstitutionalDepartmentName = options.institutionDepartmentName;
            }
        }

        if (options.isComplete) {
            this.CompletionFlag = "COMPLETE";
        } else {
            this.CompletionFlag = "PARTIAL";
        }
        if (options.isVerified) {
            if (options.verifyingObserverName === undefined) {
                throw new Error("Verifying Observer Name must be specified if SR document " + "has been verified.");
            }
            if (options.verifyingOrganization === undefined) {
                throw new Error("Verifying Organization must be specified if SR document " + "has been verified.");
            }
            this.VerificationFlag = "VERIFIED";
            const ovserver_item: VerifyingObserverItem = {
                VerifyingObserverName: options.verifyingObserverName,
                VerifyingOrganization: options.verifyingOrganization,
                VerificationDateTime: DicomMetaDictionary.dateTime()
            };
            this.VerifyingObserverSequence = [ovserver_item];
        } else {
            this.VerificationFlag = "UNVERIFIED";
        }
        if (options.isFinal) {
            this.PreliminaryFlag = "FINAL";
        } else {
            this.PreliminaryFlag = "PRELIMINARY";
        }

        this.ContentDate = DicomMetaDictionary.date();
        this.ContentTime = DicomMetaDictionary.time();

        Object.keys(options.content).forEach((keyword) => {
            this[keyword] = options.content[keyword];
        });

        const evidenceCollection: Record<string, ReferencedInstanceItem[]> = {};
        options.evidence.forEach((evidence) => {
            if (evidence.StudyInstanceUID !== options.evidence[0].StudyInstanceUID) {
                throw new Error("Referenced data sets must all belong to the same study.");
            }
            if (!(evidence.SeriesInstanceUID in evidenceCollection)) {
                evidenceCollection[evidence.SeriesInstanceUID] = [];
            }
            const instanceItem: ReferencedInstanceItem = {
                ReferencedSOPClassUID: evidence.SOPClassUID,
                ReferencedSOPInstanceUID: evidence.SOPInstanceUID
            };
            evidenceCollection[evidence.SeriesInstanceUID].push(instanceItem);
        });
        const evidenceStudyItem: EvidenceStudyItem = {
            StudyInstanceUID: options.evidence[0].StudyInstanceUID,
            ReferencedSeriesSequence: []
        };
        Object.keys(evidenceCollection).forEach((seriesInstanceUID) => {
            const seriesItem: ReferencedSeriesItem = {
                SeriesInstanceUID: seriesInstanceUID,
                ReferencedSOPSequence: evidenceCollection[seriesInstanceUID]
            };
            evidenceStudyItem.ReferencedSeriesSequence.push(seriesItem);
        });

        if (options.requestedProcedures !== undefined) {
            if (!(typeof options.requestedProcedures === "object" || Array.isArray(options.requestedProcedures))) {
                throw new Error("Option 'requestedProcedures' must have type Array.");
            }
            this.ReferencedRequestSequence = new ContentSequence(...(options.requestedProcedures as []));
            this.CurrentRequestedProcedureEvidenceSequence = [evidenceStudyItem];
        } else {
            this.PertinentOtherEvidenceSequence = [evidenceStudyItem];
        }

        if (options.previousVersions !== undefined) {
            const preCollection: Record<string, ReferencedInstanceItem[]> = {};
            options.previousVersions.forEach((version) => {
                if (version.StudyInstanceUID !== options.evidence[0].StudyInstanceUID) {
                    throw new Error("Previous version data sets must belong to the same study.");
                }
                if (!(version.SeriesInstanceUID in preCollection)) {
                    preCollection[version.SeriesInstanceUID] = [];
                }
                const instanceItem: ReferencedInstanceItem = {
                    ReferencedSOPClassUID: version.SOPClassUID,
                    ReferencedSOPInstanceUID: version.SOPInstanceUID
                };
                preCollection[version.SeriesInstanceUID].push(instanceItem);
            });
            const preStudyItem: EvidenceStudyItem = {
                StudyInstanceUID: options.previousVersions[0].StudyInstanceUID,
                ReferencedSeriesSequence: []
            };
            Object.keys(preCollection).forEach((seriesInstanceUID) => {
                const seriesItem: ReferencedSeriesItem = {
                    SeriesInstanceUID: seriesInstanceUID,
                    ReferencedSOPSequence: preCollection[seriesInstanceUID]
                };
                preStudyItem.ReferencedSeriesSequence.push(seriesItem);
            });
            this.PredecessorDocumentsSequence = [preStudyItem];
        }

        if (options.performedProcedureCodes !== undefined) {
            if (
                !(typeof options.performedProcedureCodes === "object" || Array.isArray(options.performedProcedureCodes))
            ) {
                throw new Error("Option 'performedProcedureCodes' must have type Array.");
            }
            this.PerformedProcedureCodeSequence = new ContentSequence(...(options.performedProcedureCodes as []));
        } else {
            this.PerformedProcedureCodeSequence = [];
        }

        this.ReferencedPerformedProcedureStepSequence = [];

        _attributesToInclude.forEach((tag) => {
            const key = DicomMetaDictionary.punctuateTag(tag);
            if (key === undefined) {
                return;
            }
            const element = DicomMetaDictionary.dictionary[key];
            if (element !== undefined && element.name !== undefined) {
                const keyword = element.name;
                const value = options.evidence[0][keyword];
                if (value !== undefined) {
                    this[keyword] = value;
                }
            }
        });
    }
}

export { Comprehensive3DSR };
export type { Comprehensive3DSROptions, EvidenceItem };
