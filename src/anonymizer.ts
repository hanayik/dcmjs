import { DicomMetaDictionary, type DictionaryEntry } from "./DicomMetaDictionary";
import { Tag } from "./Tag";
import { ValueRepresentation, type DicomTag } from "./ValueRepresentation";

/**
 * Dictionary mapping tag strings (8 hex digits) to replacement values.
 * Keys are unpunctuated tag strings like "00100010", values are the replacement string.
 */
interface TagReplacementMap {
    [tagString: string]: string;
}

/**
 * Dictionary structure used for anonymization operations.
 * Maps unpunctuated tag strings (8 hex digits) to DICOM tag objects.
 */
interface AnonymizationDict {
    [tagString: string]: DicomTag;
}

const tagNamesToEmpty: readonly string[] = [
    // please override these in specificReplaceDefaults to have useful values
    "PatientID",
    "PatientName",

    // 0/3: those that appear missing in CTP
    "SeriesDate",
    "AccessionNumber",
    // (valuable, but sometimes manually filled)
    "SeriesDescription",
    // cat 1/3: CTP: set to empty explicitely using @empty
    "StudyTime",
    "ContentTime",
    "ReferringPhysicianName",
    "PatientBirthDate",
    "PatientSex",
    "ClinicalTrialSiteID",
    "ClinicalTrialSiteName",
    "ClinicalTrialSubjectID",
    "ClinicalTrialSubjectReadingID",
    "ClinicalTrialTimePointID",
    "ClinicalTrialTimePointDescription",
    "ContrastBolusAgent",
    "StudyID",
    // cat 2/3: CTP: set to increment dates
    "InstanceCreationDate",
    "StudyDate",
    "ContentDate",
    "DateOfSecondaryCapture",
    "DateOfLastCalibration",
    "DateOfLastDetectorCalibration",
    "FrameAcquisitionDatetime",
    "FrameReferenceDatetime",
    "StudyVerifiedDate",
    "StudyReadDate",
    "ScheduledStudyStartDate",
    "ScheduledStudyStopDate",
    "StudyArrivalDate",
    "StudyCompletionDate",
    "ScheduledAdmissionDate",
    "ScheduledDischargeDate",
    "DischargeDate",
    "SPSStartDate",
    "SPSEndDate",
    "PPSStartDate",
    "PPSEndDate",
    "IssueDateOfImagingServiceRequest",
    "VerificationDateTime",
    "ObservationDateTime",
    "DateTime",
    "Date",
    "RefDatetime",
    // cat 3/3: CTP: set to remove using @remove
    "AcquisitionDate",
    "OverlayDate",
    "CurveDate",
    "AcquisitionDatetime",
    "SeriesTime",
    "AcquisitionTime",
    "OverlayTime",
    "CurveTime",
    "InstitutionName",
    "InstitutionAddress",
    "ReferringPhysicianAddress",
    "ReferringPhysicianPhoneNumbers",
    "ReferringPhysiciansIDSeq",
    "TimezoneOffsetFromUTC",
    "StationName",
    "StudyDescription",
    "InstitutionalDepartmentName",
    "PhysicianOfRecord",
    "PhysicianOfRecordIdSeq",
    "PerformingPhysicianName",
    "PerformingPhysicianIdSeq",
    "NameOfPhysicianReadingStudy",
    "PhysicianReadingStudyIdSeq",
    "OperatorName",
    "OperatorsIdentificationSeq",
    "AdmittingDiagnosisDescription",
    "AdmittingDiagnosisCodeSeq",
    "RefStudySeq",
    "RefPPSSeq",
    "RefPatientSeq",
    "RefImageSeq",
    "DerivationDescription",
    "SourceImageSeq",
    "IdentifyingComments",
    "IssuerOfPatientID",
    "PatientBirthTime",
    "PatientInsurancePlanCodeSeq",
    "PatientPrimaryLanguageCodeSeq",
    "PatientPrimaryLanguageModifierCodeSeq",
    "OtherPatientIDs",
    "OtherPatientNames",
    "OtherPatientIDsSeq",
    "PatientBirthName",
    "PatientAge",
    "PatientSize",
    "PatientWeight",
    "PatientAddress",
    "InsurancePlanIdentification",
    "PatientMotherBirthName",
    "MilitaryRank",
    "BranchOfService",
    "MedicalRecordLocator",
    "MedicalAlerts",
    "ContrastAllergies",
    "CountryOfResidence",
    "RegionOfResidence",
    "PatientPhoneNumbers",
    "EthnicGroup",
    "Occupation",
    "SmokingStatus",
    "AdditionalPatientHistory",
    "PregnancyStatus",
    "LastMenstrualDate",
    "PatientReligiousPreference",
    "PatientSexNeutered",
    "ResponsiblePerson",
    "ResponsibleOrganization",
    "PatientComments",
    "DeviceSerialNumber",
    "PlateID",
    "GeneratorID",
    "CassetteID",
    "GantryID",
    // we keep - should be SoftwareVersions anyway
    // "SoftwareVersion",
    "ProtocolName",
    "AcquisitionDeviceProcessingDescription",
    "AcquisitionComments",
    "DetectorID",
    "AcquisitionProtocolDescription",
    "ContributionDescription",
    "ModifyingDeviceID",
    "ModifyingDeviceManufacturer",
    "ModifiedImageDescription",
    "ImageComments",
    "ImagePresentationComments",
    "StudyIDIssuer",
    "ScheduledStudyLocation",
    "ScheduledStudyLocationAET",
    "ReasonforStudy",
    "RequestingPhysician",
    "RequestingService",
    "RequestedProcedureDescription",
    "RequestedContrastAgent",
    "StudyComments",
    "AdmissionID",
    "IssuerOfAdmissionID",
    "ScheduledPatientInstitutionResidence",
    "AdmittingDate",
    "AdmittingTime",
    "DischargeDiagnosisDescription",
    "SpecialNeeds",
    "ServiceEpisodeID",
    "IssuerOfServiceEpisodeId",
    "ServiceEpisodeDescription",
    "CurrentPatientLocation",
    "PatientInstitutionResidence",
    "PatientState",
    "ReferencedPatientAliasSeq",
    "VisitComments",
    "ScheduledStationAET",
    "ScheduledPerformingPhysicianName",
    "SPSDescription",
    "ScheduledStationName",
    "SPSLocation",
    "PreMedication",
    "PerformedStationAET",
    "PerformedStationName",
    "PerformedLocation",
    "PerformedStationNameCodeSeq",
    "PPSID",
    "PPSDescription",
    "RequestAttributesSeq",
    "PPSComments",
    "AcquisitionContextSeq",
    "PatientTransportArrangements",
    "RequestedProcedureLocation",
    "NamesOfIntendedRecipientsOfResults",
    "IntendedRecipientsOfResultsIDSequence",
    "PersonAddress",
    "PersonTelephoneNumbers",
    "RequestedProcedureComments",
    "ReasonForTheImagingServiceRequest",
    "OrderEnteredBy",
    "OrderEntererLocation",
    "OrderCallbackPhoneNumber",
    "ImagingServiceRequestComments",
    "ConfidentialityPatientData",
    "ScheduledStationNameCodeSeq",
    "ScheduledStationGeographicLocCodeSeq",
    "PerformedStationGeoLocCodeSeq",
    "ScheduledHumanPerformersSeq",
    "ActualHumanPerformersSequence",
    "HumanPerformersOrganization",
    "HumanPerformersName",
    "VerifyingOrganization",
    "VerifyingObserverName",
    "AuthorObserverSequence",
    "ParticipantSequence",
    "CustodialOrganizationSeq",
    "VerifyingObserverIdentificationCodeSeq",
    "PersonName",
    "ContentSeq",
    "OverlayData",
    "OverlayComments",
    "IconImageSequence",
    "TopicSubject",
    "TopicAuthor",
    "TopicKeyWords",
    "TextString",
    "Arbitrary",
    "TextComments",
    "ResultsIDIssuer",
    "InterpretationRecorder",
    "InterpretationTranscriber",
    "InterpretationText",
    "InterpretationAuthor",
    "InterpretationApproverSequence",
    "PhysicianApprovingInterpretation",
    "InterpretationDiagnosisDescription",
    "ResultsDistributionListSeq",
    "DistributionName",
    "DistributionAddress",
    "InterpretationIdIssuer",
    "Impressions",
    "ResultComments",
    "DigitalSignaturesSeq",
    "DataSetTrailingPadding"
] as const;

/**
 * Returns a copy of the list of tag names that will be emptied during anonymization.
 * @returns Array of tag names to empty
 */
export function getTagsNameToEmpty(): string[] {
    return [...tagNamesToEmpty];
}

/**
 * Cleans sensitive tags from a DICOM dictionary by emptying or replacing their values.
 *
 * @param dict - The DICOM dictionary to clean (maps tag strings to DicomTag objects)
 * @param tagNamesToReplace - Optional map of tag strings to replacement values.
 *                            Defaults to replacing PatientID and PatientName with anonymous values.
 * @param customTagNamesToEmpty - Optional array of tag names to empty instead of the default list.
 */
export function cleanTags(
    dict: AnonymizationDict,
    tagNamesToReplace: TagReplacementMap | undefined = undefined,
    customTagNamesToEmpty: readonly string[] | undefined = undefined
): void {
    if (tagNamesToReplace === undefined) {
        tagNamesToReplace = {
            "00100010": "ANON^PATIENT",
            "00100020": "ANON^ID"
        };
    }
    const tags = customTagNamesToEmpty !== undefined ? customTagNamesToEmpty : tagNamesToEmpty;
    tags.forEach(function (tag) {
        const tagInfo: DictionaryEntry | undefined = DicomMetaDictionary.nameMap[tag];
        if (tagInfo && tagInfo.version !== "PrivateTag") {
            const tagNumber = tagInfo.tag;
            const tagString = Tag.fromPString(tagNumber).toCleanString();
            if (dict[tagString]) {
                let newValue: string[];
                if (tagString in tagNamesToReplace) {
                    newValue = [tagNamesToReplace[tagString]];
                } else {
                    newValue = [];
                }
                dict[tagString] = ValueRepresentation.addTagAccessors(dict[tagString]);
                dict[tagString].Value = newValue;
            }
        }
    });
}
