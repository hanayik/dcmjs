import { CodedConcept } from "./coding.js";

const ValueTypes = {
  CODE: "CODE",
  COMPOSITE: "COMPOSITE",
  CONTAINER: "CONTAINER",
  DATE: "DATE",
  DATETIME: "DATETIME",
  IMAGE: "IMAGE",
  NUM: "NUM",
  PNAME: "PNAME",
  SCOORD: "SCOORD",
  SCOORD3D: "SCOORD3D",
  TCOORD: "TCOORD",
  TEXT: "TEXT",
  TIME: "TIME",
  UIDREF: "UIDREF",
  WAVEFORM: "WAVEFORM",
} as const;
Object.freeze(ValueTypes);

type ValueType = (typeof ValueTypes)[keyof typeof ValueTypes];

const GraphicTypes = {
  CIRCLE: "CIRCLE",
  ELLIPSE: "ELLIPSE",
  ELLIPSOID: "ELLIPSOID",
  MULTIPOINT: "MULTIPOINT",
  POINT: "POINT",
  POLYLINE: "POLYLINE",
} as const;
Object.freeze(GraphicTypes);

type GraphicType = (typeof GraphicTypes)[keyof typeof GraphicTypes];

const GraphicTypes3D = {
  ELLIPSE: "ELLIPSE",
  ELLIPSOID: "ELLIPSOID",
  MULTIPOINT: "MULTIPOINT",
  POINT: "POINT",
  POLYLINE: "POLYLINE",
  POLYGON: "POLYGON",
} as const;
Object.freeze(GraphicTypes3D);

type GraphicType3D = (typeof GraphicTypes3D)[keyof typeof GraphicTypes3D];

const TemporalRangeTypes = {
  BEGIN: "BEGIN",
  END: "END",
  MULTIPOINT: "MULTIPOINT",
  MULTISEGMENT: "MULTISEGMENT",
  POINT: "POINT",
  SEGMENT: "SEGMENT",
} as const;
Object.freeze(TemporalRangeTypes);

type TemporalRangeType =
  (typeof TemporalRangeTypes)[keyof typeof TemporalRangeTypes];

const RelationshipTypes = {
  CONTAINS: "CONTAINS",
  HAS_ACQ_CONTENT: "HAS ACQ CONTENT",
  HAS_CONCEPT_MOD: "HAS CONCEPT MOD",
  HAS_OBS_CONTEXT: "HAS OBS CONTEXT",
  HAS_PROPERTIES: "HAS PROPERTIES",
  INFERRED_FROM: "INFERRED FROM",
  SELECTED_FROM: "SELECTED FROM",
} as const;
Object.freeze(RelationshipTypes);

type RelationshipType =
  (typeof RelationshipTypes)[keyof typeof RelationshipTypes];

const PixelOriginInterpretations = {
  FRAME: "FRAME",
  VOLUME: "VOLUME",
} as const;
Object.freeze(PixelOriginInterpretations);

type PixelOriginInterpretation =
  (typeof PixelOriginInterpretations)[keyof typeof PixelOriginInterpretations];

function isFloat(n: number): boolean {
  return n === +n && n !== (n | 0);
}

function zeroPad(value: number): string {
  return (value > 9 ? "" : "0") + value;
}

function TM(date: Date): string {
  // %H%M%S.%f
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = date.getSeconds();
  const milliseconds = date.getMilliseconds();
  return zeroPad(hours) + zeroPad(minutes) + zeroPad(seconds) + milliseconds;
}

function DA(date: Date): string {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return year + zeroPad(month) + zeroPad(day);
}

function DT(date: Date): string {
  return DA(date) + TM(date);
}

// TODO: should the content types be more strict?
// ContentSequence can hold various content item types
// eslint-disable-next-line @typescript-eslint/no-explicit-any
class ContentSequence extends Array<any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(...args: any[]) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    super(...args);
  }
}

interface ContentItemOptions {
  name: CodedConcept;
  valueType: ValueType;
  relationshipType?: RelationshipType;
}

class ContentItem {
  ConceptNameCodeSequence: CodedConcept[];
  ValueType: ValueType;
  RelationshipType?: string;
  ContentSequence?: ContentSequence;

  constructor(options: ContentItemOptions) {
    if (options.name === undefined) {
      throw new Error("Option 'name' is required for ContentItem.");
    }
    if (!(options.name instanceof CodedConcept)) {
      throw new Error("Option 'name' must have type CodedConcept.");
    }
    this.ConceptNameCodeSequence = [options.name];
    if (options.valueType === undefined) {
      throw new Error("Option 'valueType' is required for ContentItem.");
    }
    if (!(Object.values(ValueTypes).indexOf(options.valueType) !== -1)) {
      throw new Error(`Invalid value type ${options.valueType}`);
    }
    this.ValueType = options.valueType;
    if (options.relationshipType !== undefined) {
      if (
        !(
          Object.values(RelationshipTypes).indexOf(options.relationshipType) !==
          -1
        )
      ) {
        throw new Error(
          `Invalid relationship type ${options.relationshipType}`
        );
      }
      this.RelationshipType = options.relationshipType;
    }
  }
}

interface CodeContentItemOptions {
  name: CodedConcept;
  value: CodedConcept;
  relationshipType?: RelationshipType;
}

class CodeContentItem extends ContentItem {
  ConceptCodeSequence: CodedConcept[];

  constructor(options: CodeContentItemOptions) {
    super({
      name: options.name,
      relationshipType: options.relationshipType,
      valueType: ValueTypes.CODE,
    });
    if (options.value === undefined) {
      throw new Error("Option 'value' is required for CodeContentItem.");
    }
    if (!(options.value instanceof CodedConcept)) {
      throw new Error("Option 'value' must have type CodedConcept.");
    }
    this.ConceptCodeSequence = [options.value];
  }
}

interface TextContentItemOptions {
  name: CodedConcept;
  value: string;
  relationshipType?: RelationshipType;
}

class TextContentItem extends ContentItem {
  TextValue: string;

  constructor(options: TextContentItemOptions) {
    super({
      name: options.name,
      relationshipType: options.relationshipType,
      valueType: ValueTypes.TEXT,
    });
    if (options.value === undefined) {
      throw new Error("Option 'value' is required for TextContentItem.");
    }
    if (typeof options.value !== "string") {
      throw new Error("Option 'value' must have type String.");
    }
    this.TextValue = options.value;
  }
}

interface PNameContentItemOptions {
  name: CodedConcept;
  value: string;
  relationshipType?: RelationshipType;
}

class PNameContentItem extends ContentItem {
  PersonName: string;

  constructor(options: PNameContentItemOptions) {
    super({
      name: options.name,
      relationshipType: options.relationshipType,
      valueType: ValueTypes.PNAME,
    });
    if (options.value === undefined) {
      throw new Error("Option 'value' is required for PNameContentItem.");
    }
    if (typeof options.value !== "string") {
      throw new Error("Option 'value' must have type String.");
    }
    this.PersonName = options.value;
  }
}

interface TimeContentItemOptions {
  name: CodedConcept;
  value: Date;
  relationshipType?: RelationshipType;
}

class TimeContentItem extends ContentItem {
  Time: string;

  constructor(options: TimeContentItemOptions) {
    super({
      name: options.name,
      relationshipType: options.relationshipType,
      valueType: ValueTypes.TIME,
    });
    if (options.value === undefined) {
      throw new Error("Option 'value' is required for TimeContentItem.");
    }
    if (!(options.value instanceof Date)) {
      throw new Error("Option 'value' must have type Date.");
    }
    this.Time = TM(options.value);
  }
}

interface DateContentItemOptions {
  name: CodedConcept;
  value: Date;
  relationshipType?: RelationshipType;
}

class DateContentItem extends ContentItem {
  Date: string;

  constructor(options: DateContentItemOptions) {
    super({
      name: options.name,
      relationshipType: options.relationshipType,
      valueType: ValueTypes.DATE,
    });
    if (options.value === undefined) {
      throw new Error("Option 'value' is required for DateContentItem.");
    }
    if (!(options.value instanceof Date)) {
      throw new Error("Option 'value' must have type Date.");
    }
    this.Date = DA(options.value);
  }
}

interface DateTimeContentItemOptions {
  name: CodedConcept;
  value: Date;
  relationshipType?: RelationshipType;
}

class DateTimeContentItem extends ContentItem {
  DateTime: string;

  constructor(options: DateTimeContentItemOptions) {
    super({
      name: options.name,
      relationshipType: options.relationshipType,
      valueType: ValueTypes.DATETIME,
    });
    if (options.value === undefined) {
      throw new Error("Option 'value' is required for DateTimeContentItem.");
    }
    if (!(options.value instanceof Date)) {
      throw new Error("Option 'value' must have type Date.");
    }
    this.DateTime = DT(options.value);
  }
}

interface UIDRefContentItemOptions {
  name: CodedConcept;
  value: string;
  relationshipType?: RelationshipType;
}

class UIDRefContentItem extends ContentItem {
  UID: string;

  constructor(options: UIDRefContentItemOptions) {
    super({
      name: options.name,
      relationshipType: options.relationshipType,
      valueType: ValueTypes.UIDREF,
    });
    if (options.value === undefined) {
      throw new Error("Option 'value' is required for UIDRefContentItem.");
    }
    if (typeof options.value !== "string") {
      throw new Error("Option 'value' must have type String.");
    }
    this.UID = options.value;
  }
}

interface MeasuredValueItem {
  NumericValue: number;
  FloatingPointValue?: number;
  MeasurementUnitsCodeSequence: CodedConcept[];
}

interface NumContentItemOptions {
  name: CodedConcept;
  value?: number;
  unit?: CodedConcept;
  qualifier?: CodedConcept;
  relationshipType?: RelationshipType;
}

class NumContentItem extends ContentItem {
  MeasuredValueSequence?: MeasuredValueItem[];
  NumericValueQualifierCodeSequence?: CodedConcept[];

  constructor(options: NumContentItemOptions) {
    super({
      name: options.name,
      relationshipType: options.relationshipType,
      valueType: ValueTypes.NUM,
    });
    if (options.value !== undefined) {
      if (typeof options.value !== "number") {
        throw new Error("Option 'value' must have type Number.");
      }
      if (options.unit === undefined) {
        throw new Error(
          "Option 'unit' is required for NumContentItem with 'value'."
        );
      }
      if (!(options.unit instanceof CodedConcept)) {
        throw new Error("Option 'unit' must have type CodedConcept.");
      }
      const item: MeasuredValueItem = {
        NumericValue: options.value,
        MeasurementUnitsCodeSequence: [options.unit],
      };
      if (isFloat(options.value)) {
        item.FloatingPointValue = options.value;
      }
      this.MeasuredValueSequence = [item];
    } else if (options.qualifier !== undefined) {
      if (!(options.qualifier instanceof CodedConcept)) {
        throw new Error("Option 'qualifier' must have type CodedConcept.");
      }
      this.NumericValueQualifierCodeSequence = [options.qualifier];
    } else {
      throw new Error(
        "Either option 'value' or 'qualifier' is required for NumContentItem."
      );
    }
  }
}

interface ContentTemplateSequenceItem {
  MappingResource: string;
  TemplateIdentifier: string;
}

interface ContainerContentItemOptions {
  name: CodedConcept;
  relationshipType?: RelationshipType;
  isContentContinuous?: boolean;
  templateID?: string;
}

class ContainerContentItem extends ContentItem {
  ContinuityOfContent: "CONTINUOUS" | "SEPARATE";
  ContentTemplateSequence?: ContentTemplateSequenceItem[];

  constructor(options: ContainerContentItemOptions) {
    super({
      name: options.name,
      relationshipType: options.relationshipType,
      valueType: ValueTypes.CONTAINER,
    });
    if (options.isContentContinuous !== undefined) {
      this.ContinuityOfContent = "CONTINUOUS";
    } else {
      this.ContinuityOfContent = "SEPARATE";
    }
    if (options.templateID !== undefined) {
      if (typeof options.templateID !== "string") {
        throw new Error("Option 'templateID' must have type String.");
      }
      const item: ContentTemplateSequenceItem = {
        MappingResource: "DCMR",
        TemplateIdentifier: options.templateID,
      };
      this.ContentTemplateSequence = [item];
    }
  }
}

interface ReferencedSOPItem {
  ReferencedSOPClassUID: string;
  ReferencedSOPInstanceUID: string;
}

interface CompositeContentItemOptions {
  name: CodedConcept;
  referencedSOPClassUID: string;
  referencedSOPInstanceUID: string;
  relationshipType?: RelationshipType;
}

class CompositeContentItem extends ContentItem {
  ReferenceSOPSequence: ReferencedSOPItem[];

  constructor(options: CompositeContentItemOptions) {
    super({
      name: options.name,
      relationshipType: options.relationshipType,
      valueType: ValueTypes.COMPOSITE,
    });
    if (options.referencedSOPClassUID === undefined) {
      throw new Error(
        "Option 'referencedSOPClassUID' is required for CompositeContentItem."
      );
    }
    if (options.referencedSOPInstanceUID === undefined) {
      throw new Error(
        "Option 'referencedSOPInstanceUID' is required for CompositeContentItem."
      );
    }
    if (typeof options.referencedSOPClassUID !== "string") {
      throw new Error("Option 'referencedSOPClassUID' must have type String.");
    }
    if (typeof options.referencedSOPInstanceUID !== "string") {
      throw new Error(
        "Option 'referencedSOPInstanceUID' must have type String."
      );
    }
    const item: ReferencedSOPItem = {
      ReferencedSOPClassUID: options.referencedSOPClassUID,
      ReferencedSOPInstanceUID: options.referencedSOPInstanceUID,
    };
    this.ReferenceSOPSequence = [item];
  }
}

interface ImageReferencedSOPItem {
  ReferencedSOPClassUID: string;
  ReferencedSOPInstanceUID: string;
  ReferencedFrameNumber?: number[];
  ReferencedSegmentNumber?: number[];
}

interface ImageContentItemOptions {
  name: CodedConcept;
  referencedSOPClassUID: string;
  referencedSOPInstanceUID: string;
  referencedFrameNumbers?: number[];
  referencedFrameSegmentNumber?: boolean;
  referencedSegmentNumbers?: number[];
  relationshipType?: RelationshipType;
}

class ImageContentItem extends ContentItem {
  ReferencedSOPSequence: ImageReferencedSOPItem[];

  constructor(options: ImageContentItemOptions) {
    super({
      name: options.name,
      relationshipType: options.relationshipType,
      valueType: ValueTypes.IMAGE,
    });
    if (options.referencedSOPClassUID === undefined) {
      throw new Error(
        "Option 'referencedSOPClassUID' is required for ImageContentItem."
      );
    }
    if (options.referencedSOPInstanceUID === undefined) {
      throw new Error(
        "Option 'referencedSOPInstanceUID' is required for ImageContentItem."
      );
    }
    if (typeof options.referencedSOPClassUID !== "string") {
      throw new Error("Option 'referencedSOPClassUID' must have type String.");
    }
    if (typeof options.referencedSOPInstanceUID !== "string") {
      throw new Error(
        "Option 'referencedSOPInstanceUID' must have type String."
      );
    }
    const item: ImageReferencedSOPItem = {
      ReferencedSOPClassUID: options.referencedSOPClassUID,
      ReferencedSOPInstanceUID: options.referencedSOPInstanceUID,
    };
    if (options.referencedFrameNumbers !== undefined) {
      if (!Array.isArray(options.referencedFrameNumbers)) {
        throw new Error(
          "Option 'referencedFrameNumbers' must have type Array."
        );
      }
      item.ReferencedFrameNumber = options.referencedFrameNumbers;
    }
    if (options.referencedFrameSegmentNumber !== undefined) {
      if (!Array.isArray(options.referencedSegmentNumbers)) {
        throw new Error(
          "Option 'referencedSegmentNumbers' must have type Array."
        );
      }
      item.ReferencedSegmentNumber = options.referencedSegmentNumbers;
    }
    this.ReferencedSOPSequence = [item];
  }
}

interface ScoordContentItemOptions {
  name: CodedConcept;
  graphicType: GraphicType;
  graphicData: number[] | number[][];
  pixelOriginInterpretation?: PixelOriginInterpretation;
  fiducialUID?: string;
  relationshipType?: RelationshipType;
}

class ScoordContentItem extends ContentItem {
  GraphicData: number[];
  FiducialUID?: string;

  constructor(options: ScoordContentItemOptions) {
    super({
      name: options.name,
      relationshipType: options.relationshipType,
      valueType: ValueTypes.SCOORD,
    });
    if (options.graphicType === undefined) {
      throw new Error(
        "Option 'graphicType' is required for ScoordContentItem."
      );
    }
    if (typeof options.graphicType !== "string") {
      throw new Error(
        "Option 'graphicType' of ScoordContentItem must have type String."
      );
    }
    if (options.graphicData === undefined) {
      throw new Error(
        "Option 'graphicData' is required for ScoordContentItem."
      );
    }
    if (!Array.isArray(options.graphicData)) {
      throw new Error(
        "Option 'graphicData' of ScoordContentItem must have type Array."
      );
    }
    if (Object.values(GraphicTypes).indexOf(options.graphicType) === -1) {
      throw new Error(`Invalid graphic type '${options.graphicType}'.`);
    }
    let graphicData = options.graphicData;
    if (Array.isArray(graphicData[0])) {
      graphicData = ([] as number[]).concat.apply(
        [],
        graphicData as number[][]
      );
    }
    this.GraphicData = graphicData as number[];
    const pixelOriginInterpretation =
      options.pixelOriginInterpretation || PixelOriginInterpretations.VOLUME;
    if (typeof pixelOriginInterpretation !== "string") {
      throw new Error(
        "Option 'pixelOriginInterpretation' must have type String."
      );
    }
    if (
      Object.values(PixelOriginInterpretations).indexOf(
        pixelOriginInterpretation
      ) === -1
    ) {
      throw new Error(
        `Invalid pixel origin interpretation '${pixelOriginInterpretation}'.`
      );
    }
    if (options.fiducialUID !== undefined) {
      if (typeof options.fiducialUID !== "string") {
        throw new Error("Option 'fiducialUID' must have type String.");
      }
      this.FiducialUID = options.fiducialUID;
    }
  }
}

interface Scoord3DContentItemOptions {
  name: CodedConcept;
  graphicType: GraphicType3D;
  graphicData: number[] | number[][];
  frameOfReferenceUID: string;
  fiducialUID?: string;
  relationshipType?: RelationshipType;
}

class Scoord3DContentItem extends ContentItem {
  GraphicType: GraphicType3D;
  GraphicData: number[];
  ReferencedFrameOfReferenceUID: string;
  FiducialUID?: string;

  constructor(options: Scoord3DContentItemOptions) {
    super({
      name: options.name,
      relationshipType: options.relationshipType,
      valueType: ValueTypes.SCOORD3D,
    });
    if (options.graphicType === undefined) {
      throw new Error(
        "Option 'graphicType' is required for Scoord3DContentItem."
      );
    }
    if (typeof options.graphicType !== "string") {
      throw new Error("Option 'graphicType' must have type String.");
    }
    if (options.graphicData === undefined) {
      throw new Error(
        "Option 'graphicData' is required for Scoord3DContentItem."
      );
    }
    if (!Array.isArray(options.graphicData)) {
      throw new Error("Option 'graphicData' must have type Array.");
    }
    if (Object.values(GraphicTypes3D).indexOf(options.graphicType) === -1) {
      throw new Error(`Invalid graphic type '${options.graphicType}'.`);
    }
    let graphicData = options.graphicData;
    if (Array.isArray(graphicData[0])) {
      graphicData = ([] as number[]).concat.apply(
        [],
        graphicData as number[][]
      );
    }
    this.GraphicType = options.graphicType;
    this.GraphicData = graphicData as number[];
    if (options.frameOfReferenceUID === undefined) {
      throw new Error(
        "Option 'frameOfReferenceUID' is required for Scoord3DContentItem."
      );
    }
    if (typeof options.frameOfReferenceUID !== "string") {
      throw new Error("Option 'frameOfReferenceUID' must have type String.");
    }
    this.ReferencedFrameOfReferenceUID = options.frameOfReferenceUID;
    if ("fiducialUID" in options) {
      if (typeof options.fiducialUID !== "string") {
        throw new Error("Option 'fiducialUID' must have type String.");
      }
      this.FiducialUID = options.fiducialUID;
    }
  }
}

interface TcoordContentItemOptions {
  name: CodedConcept;
  temporalRangeType: TemporalRangeType;
  referencedSamplePositions?: number[];
  referencedTimeOffsets?: number[];
  referencedDateTime?: string[];
  relationshipType?: RelationshipType;
}

class TcoordContentItem extends ContentItem {
  ReferencedSamplePositions?: number[];
  ReferencedTimeOffsets?: number[];
  ReferencedDateTime?: string[];

  constructor(options: TcoordContentItemOptions) {
    super({
      name: options.name,
      relationshipType: options.relationshipType,
      valueType: ValueTypes.TCOORD,
    });
    if (options.temporalRangeType === undefined) {
      throw new Error(
        "Option 'temporalRangeType' is required for TcoordContentItem."
      );
    }
    if (
      Object.values(TemporalRangeTypes).indexOf(options.temporalRangeType) ===
      -1
    ) {
      throw new Error(
        `Invalid temporal range type '${options.temporalRangeType}'.`
      );
    }
    if (options.referencedSamplePositions !== undefined) {
      if (!Array.isArray(options.referencedSamplePositions)) {
        throw new Error(
          "Option 'referencedSamplePositions' must have type Array."
        );
      }
      this.ReferencedSamplePositions = options.referencedSamplePositions;
    } else if (options.referencedTimeOffsets !== undefined) {
      if (!Array.isArray(options.referencedTimeOffsets)) {
        throw new Error("Option 'referencedTimeOffsets' must have type Array.");
      }
      this.ReferencedTimeOffsets = options.referencedTimeOffsets;
    } else if (options.referencedDateTime !== undefined) {
      if (!Array.isArray(options.referencedDateTime)) {
        throw new Error("Option 'referencedDateTime' must have type Array.");
      }
      this.ReferencedDateTime = options.referencedDateTime;
    } else {
      throw new Error(
        "One of the following options is required for TcoordContentItem: " +
          "'referencedSamplePositions', 'referencedTimeOffsets', or " +
          "'referencedDateTime'."
      );
    }
  }
}

export {
  CodeContentItem,
  ContainerContentItem,
  ContentSequence,
  CompositeContentItem,
  DateContentItem,
  DateTimeContentItem,
  GraphicTypes,
  GraphicTypes3D,
  ImageContentItem,
  NumContentItem,
  PNameContentItem,
  PixelOriginInterpretations,
  RelationshipTypes,
  ScoordContentItem,
  Scoord3DContentItem,
  TcoordContentItem,
  TemporalRangeTypes,
  TextContentItem,
  TimeContentItem,
  UIDRefContentItem,
  ValueTypes,
};

export type {
  CodeContentItemOptions,
  CompositeContentItemOptions,
  ContainerContentItemOptions,
  ContentItem,
  ContentItemOptions,
  DateContentItemOptions,
  DateTimeContentItemOptions,
  GraphicType,
  GraphicType3D,
  ImageContentItemOptions,
  NumContentItemOptions,
  PNameContentItemOptions,
  PixelOriginInterpretation,
  RelationshipType,
  Scoord3DContentItemOptions,
  ScoordContentItemOptions,
  TcoordContentItemOptions,
  TemporalRangeType,
  TextContentItemOptions,
  TimeContentItemOptions,
  UIDRefContentItemOptions,
  ValueType,
};
