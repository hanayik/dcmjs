import { UNDEFINED_LENGTH, TagHex } from "./constants/dicom";
import {
  ValueRepresentation,
  type VRType,
  type TransferSyntax,
  type DicomDataset,
} from "./ValueRepresentation";
import { type ReadBufferStream } from "./BufferStream";
import { type Tag } from "./Tag";

/** Interface representing a Value Representation object */
interface VRObject {
  type: VRType;
}

/** Header information for a DICOM tag */
interface TagHeader {
  vr: VRObject;
  tag: Tag;
  length: number;
}

/** Result from reading a tag's value */
interface ReadInfo {
  vr: VRObject;
  tag?: Tag;
  length?: number;
  values?: DicomValue[];
  rawValues?: DicomValue[];
  BulkDataUUID?: string;
  BulkDataURI?: string;
}

/** DICOM element/tag entry stored in the dictionary */
interface DictEntry {
  vr: VRType;
  Value?: DicomValue[];
  BulkDataUUID?: string;
  BulkDataURI?: string;
  _rawValue?: DicomValue[];
}

/** Value types that can be stored in DICOM elements */
type DicomValue =
  | string
  | number
  | DicomDataset
  | ArrayBuffer
  | Uint8Array
  | ArrayBufferLike
  | (ArrayBuffer | Uint8Array | ArrayBufferLike)[]
  | null
  | undefined;

/** Dictionary mapping tag strings to their entries */
type DicomDict = Record<string, DictEntry>;

/** Handler function type for custom tag/VR processing */
type TagHandler = (
  this: DictCreator,
  header: TagHeader,
  stream: ReadBufferStream,
  tsuid: TransferSyntax,
  options: DictCreatorOptions
) => boolean | undefined;

/** Function to determine if a value is bulkdata */
type IsBulkdataFn = (
  this: DictCreator,
  header: TagHeader,
  options: DictCreatorOptions
) => boolean | undefined;

/** Function to write bulkdata and return read info */
type WriteBulkdataFn = (
  this: DictCreator,
  header: TagHeader,
  stream: ReadBufferStream,
  tsuid: TransferSyntax,
  options: DictCreatorOptions
) => ReadInfo;

/** Map of handlers keyed by tag string or VR type */
interface HandlersMap {
  [TagHex.Item]: TagHandler;
  [TagHex.ItemDelimitationEnd]: TagHandler;
  [TagHex.SequenceDelimitationEnd]: TagHandler;
  SQ: TagHandler;
  [TagHex.PixelData]: TagHandler;
  bulkdata?: TagHandler;
  [key: string]: TagHandler | undefined;
}

/** Options for DictCreator constructor and operations */
interface DictCreatorOptions {
  writeBulkdata?: WriteBulkdataFn;
  isBulkdata?: IsBulkdataFn;
  privateTagBulkdataSize?: number;
  publicTagBulkdataSize?: number;
  handlers?: Partial<HandlersMap>;
  forceStoreRaw?: boolean;
  separateUncompressedFrames?: boolean;
}

/** Base parse level state */
interface BaseParseLevelState {
  dict: DicomDict | DictEntry[] | DicomDataset[];
  parent: ParseLevelState | null;
  level: number;
}

/** Root level parse state */
interface RootParseLevelState extends BaseParseLevelState {
  dict: DicomDict;
  parent: null;
  level: 0;
}

/** Sequence parse state */
interface SequenceParseLevelState extends BaseParseLevelState {
  type: "Sequence";
  dict: DicomDict;
  values: DicomDataset[];
  rawValues?: DicomDataset[];
  vr: VRObject;
  tag: Tag;
  offset: number;
  length: number;
  cleanTagString: string;
}

/** Item parse state */
interface ItemParseLevelState extends BaseParseLevelState {
  type: "Item";
  dict: DicomDict;
  offset: number;
  length: number;
  cleanTagString: number;
  pop: (current: ItemParseLevelState) => null;
}

/** Pixel data with undefined length parse state */
interface PixelUndefinedParseLevelState extends BaseParseLevelState {
  type: "PixelUndefined";
  dict: DicomDict;
  values: (
    | ArrayBuffer
    | Uint8Array
    | ArrayBufferLike
    | (ArrayBuffer | Uint8Array | ArrayBufferLike)[]
  )[];
  rawValues?: (ArrayBuffer | Uint8Array | ArrayBufferLike)[];
  vr: VRObject;
  tag: Tag;
  offset: number;
  level: number;
  cleanTagString: string;
  handleItem: TagHandler;
  offsets?: number[];
  nextFrameIndex?: number;
  offsetStart?: number;
}

/** Union of all parse level state types */
type ParseLevelState =
  | RootParseLevelState
  | SequenceParseLevelState
  | ItemParseLevelState
  | PixelUndefinedParseLevelState;

/** Interface for continueParse state tracking */
interface ContinueParseState {
  length: number;
  offset: number;
  parent: ParseLevelState | null;
  pop?: (current: ParseLevelState) => null;
  cleanTagString?: string | number;
  vr?: VRObject;
  values?: DicomValue[];
  rawValues?: DicomValue[];
}

/**
 * This class handles assignment of the tag values, and tracks the current
 * parse level.
 * The intent is to allow direct creation/handling of the dict object for
 * various custom purposes such as:
 *
 * * Bulk data direct writes, to avoid needing to keep the entire bulkdata in memory.
 * * Directly normalized instance data
 * * Grouped/deduplicated metadata
 * * Other custom handling.
 * * Direct output stream writing/filtering
 * * Restartable parsing, to allow stream inputs
 */
export class DictCreator {
  dict: DicomDict = {};
  current: ParseLevelState = {
    dict: this.dict,
    parent: null,
    level: 0 as const,
  };
  /* eslint-disable @typescript-eslint/unbound-method */
  // Methods are stored unbound and called with .call(this, ...) at invocation time
  handlers: HandlersMap = {
    [TagHex.Item]: this.handleItem,
    [TagHex.ItemDelimitationEnd]: this.handleItemDelimitationEnd,
    [TagHex.SequenceDelimitationEnd]: this.handleSequenceDelimitationEnd,
    SQ: this.handleSequence,
    [TagHex.PixelData]: this.handlePixel,
  };
  /* eslint-enable @typescript-eslint/unbound-method */

  privateTagBulkdataSize = 128;
  publicTagBulkdataSize = 1024;

  /**
   * Creates a dict object using the given options.
   *
   * options.handlers replaces any default handlers
   * options.writeBulkdata activates bulkdata writing, and must be a function
   *    returning falsy or a BulkDataUUID or BulkDataUID containing value.
   * options.isBulkdata is used to determine if the value is bulkdata
   * options.private/public tag bulkdata size used to determine if a value is
   *      bulkdata based on the size of it.
   */
  constructor(_dicomMessage: unknown, options: DictCreatorOptions) {
    if (options.writeBulkdata) {
      // eslint-disable-next-line @typescript-eslint/unbound-method
      this.handlers.bulkdata = this.handleBulkdata;
    }
    if (options.privateTagBulkdataSize !== undefined) {
      this.privateTagBulkdataSize = options.privateTagBulkdataSize;
    }
    if (options.publicTagBulkdataSize !== undefined) {
      this.publicTagBulkdataSize = options.publicTagBulkdataSize;
    }
    if (options.handlers) {
      Object.assign(this.handlers, options.handlers);
    }
  }

  /**
   * Creates a new tag attribute on cleanTagString based on the readInfo
   * readInfo has attributes values, BulkDataUUID and BulkDataURI for the
   * various attributes, as well as vr and rawValues.
   */
  setValue(cleanTagString: string, readInfo: ReadInfo): void {
    const { dict } = this.current as { dict: DicomDict };
    dict[cleanTagString] = ValueRepresentation.addTagAccessors({
      vr: readInfo.vr.type,
    }) as DictEntry;
    if (readInfo.values !== undefined) {
      dict[cleanTagString].Value = readInfo.values;
    }
    if (readInfo.BulkDataUUID) {
      dict[cleanTagString].BulkDataUUID = readInfo.BulkDataUUID;
    }
    if (readInfo.BulkDataURI) {
      dict[cleanTagString].BulkDataURI = readInfo.BulkDataUUID;
    }
    if (readInfo.rawValues !== undefined) {
      dict[cleanTagString]._rawValue = readInfo.rawValues;
    }
  }

  /**
   * Gets a single tag value given a tag
   */
  getSingle(cleanTagString: string): DicomValue {
    const { dict } = this.current as { dict: DicomDict };
    const value = dict[cleanTagString];
    return value?.Value?.[0];
  }

  /**
   * Parses the tag body instead of the default handling.  This allows
   * direct streaming from the stream to bulkdata files, as well as
   * allow restarting the overall parse.
   */
  handleTagBody(
    header: TagHeader,
    stream: ReadBufferStream,
    tsuid: TransferSyntax,
    options: DictCreatorOptions
  ): boolean | undefined {
    const { vr, tag } = header;
    const cleanTag = tag.toCleanString();

    const handler =
      this.handlers[cleanTag] ||
      this.handlers[vr.type] ||
      this.handlers.bulkdata;

    // Item tag - means add to current header and continue parsing
    return handler?.call(this, header, stream, tsuid, options);
  }

  continueParse(stream: ReadBufferStream): boolean | undefined {
    const { current } = this;
    const currentWithState = current as unknown as ContinueParseState;
    if (
      currentWithState.length !== UNDEFINED_LENGTH &&
      currentWithState.offset >= 0 &&
      stream.offset >= currentWithState.offset + currentWithState.length
    ) {
      this.current = this.current.parent as ParseLevelState;
      if (currentWithState.pop) {
        currentWithState.pop(current);
      } else {
        this.setValue(currentWithState.cleanTagString as string, {
          vr: currentWithState.vr as VRObject,
          values: currentWithState.values,
          rawValues: currentWithState.rawValues,
        });
      }

      return true;
    }
  }

  /**
   * Handles an ITEM tag value.  This will pop a new handler onto the stack,
   * and create the appropriate sequence item within that stack.
   */
  handleItem(
    header: TagHeader,
    stream: ReadBufferStream,
    tsuid: TransferSyntax,
    options: DictCreatorOptions
  ): boolean {
    const parent = this.current;

    const parentWithHandleItem = parent as PixelUndefinedParseLevelState;
    if (parentWithHandleItem.handleItem) {
      // Call the parent handle item
      return parentWithHandleItem.handleItem.call(
        this,
        header,
        stream,
        tsuid,
        options
      ) as boolean;
    }

    const { length } = header;
    const dict: DicomDict = {};
    const parentSeq = parent as SequenceParseLevelState;
    const newCurrent: ItemParseLevelState = {
      type: "Item",
      dict,
      parent,
      offset: stream.offset,
      length,
      cleanTagString: parentSeq.values.length,
      level: parent.level + 1,
      pop: (_cur) => null,
    };
    parentSeq.values.push(dict);
    if (parentSeq.rawValues) {
      parentSeq.rawValues.push(dict);
    }
    this.current = newCurrent;
    // Keep on parsing, delivering to the array element
    return true;
  }

  /**
   * Handles an item delimitation item by switching back to the parent
   * sequence being created.
   */
  handleItemDelimitationEnd(
    _header: TagHeader,
    _stream: ReadBufferStream,
    _tsuid: TransferSyntax,
    _options: DictCreatorOptions
  ): boolean {
    const { parent } = this.current;
    this.current = parent as ParseLevelState;
    return true;
  }

  /**
   * Handles a sequence delimitation item by setting the value of the parent
   * tag to the sequence result.
   */
  handleSequenceDelimitationEnd(
    _header: TagHeader,
    _stream: ReadBufferStream,
    _tsuid: TransferSyntax,
    _options: DictCreatorOptions
  ): boolean {
    const currentSeq = this.current as
      | SequenceParseLevelState
      | PixelUndefinedParseLevelState;
    const { parent, cleanTagString } = currentSeq;
    this.setValue(cleanTagString, {
      vr: currentSeq.vr,
      tag: currentSeq.tag,
      values: currentSeq.values as DicomValue[],
      rawValues: currentSeq.rawValues as DicomValue[] | undefined,
    });
    this.current = parent as ParseLevelState;
    return true;
  }

  /**
   * Creates a sequence handler
   */
  handleSequence(
    header: TagHeader,
    stream: ReadBufferStream,
    _tsuid: TransferSyntax,
    options: DictCreatorOptions
  ): boolean {
    const { length } = header;
    const values: DicomDataset[] = [];
    const currentDict = this.current as { dict: DicomDict };
    const newCurrent: SequenceParseLevelState = {
      type: "Sequence",
      dict: currentDict.dict,
      values,
      rawValues: options.forceStoreRaw ? [] : undefined,
      vr: header.vr,
      tag: header.tag,
      parent: this.current,
      offset: stream.offset,
      length,
      level: this.current.level + 1,
      cleanTagString: header.tag.toCleanString(),
    };
    this.current = newCurrent;
    // Keep on parsing in the parsing loop - should auto deliver to current.dict
    return true;
  }

  /**
   * Handles pixel data with undefined length
   */
  handlePixelUndefined(
    header: TagHeader,
    stream: ReadBufferStream,
    _tsuid: TransferSyntax,
    options: DictCreatorOptions
  ): boolean {
    const values: (ArrayBuffer | Uint8Array | ArrayBufferLike)[] = [];
    const rawValues = options.forceStoreRaw ? [] : undefined;
    const currentDict = this.current as { dict: DicomDict };
    const newCurrent: PixelUndefinedParseLevelState = {
      type: "PixelUndefined",
      dict: currentDict.dict,
      values,
      rawValues,
      vr: header.vr,
      tag: header.tag,
      parent: this.current,
      offset: stream.offset,
      level: this.current.level + 1,
      cleanTagString: header.tag.toCleanString(),
      // eslint-disable-next-line @typescript-eslint/unbound-method
      handleItem: this.handlePixelItem,
    };
    this.current = newCurrent;
    // Keep on parsing in the parsing loop - this should go into the
    // continue parsing section
    return true;
  }

  /**
   * Reads a "next" pixel data item.
   */
  handlePixelItem(
    header: TagHeader,
    stream: ReadBufferStream,
    _tsuid: TransferSyntax,
    _options: DictCreatorOptions
  ): boolean {
    const { current } = this;
    const pixelCurrent = current as PixelUndefinedParseLevelState;
    const { length } = header;

    const bytes = stream.getBuffer(stream.offset, stream.offset + length);

    if (!pixelCurrent.offsets) {
      pixelCurrent.offsets = [];
      if (length) {
        const { offsets } = pixelCurrent;
        // Read length entries
        for (let offset = 0; offset < length; offset += 4) {
          offsets.push(stream.readUint32());
        }
        pixelCurrent.offsetStart = stream.offset;
        pixelCurrent.nextFrameIndex = 1;
      }
      return true;
    }

    stream.increment(length);
    pixelCurrent.values.push(
      bytes as ArrayBuffer | Uint8Array | ArrayBufferLike
    );
    if (pixelCurrent.offsets?.length) {
      const { nextFrameIndex } = pixelCurrent;
      const nextOffset =
        pixelCurrent.offsets[nextFrameIndex!] ?? Number.MAX_VALUE;
      const pixelOffset = stream.offset - pixelCurrent.offsetStart!;
      if (
        pixelOffset <= nextOffset &&
        pixelCurrent.values.length > nextFrameIndex!
      ) {
        const frameIndex = nextFrameIndex! - 1;
        if (!Array.isArray(pixelCurrent.values[frameIndex])) {
          pixelCurrent.values[frameIndex] = [pixelCurrent.values[frameIndex]];
        }
        pixelCurrent.values[frameIndex].push(
          pixelCurrent.values.pop() as
            | ArrayBuffer
            | Uint8Array
            | ArrayBufferLike
        );
      }
      if (pixelOffset >= nextOffset) {
        pixelCurrent.nextFrameIndex!++;
      }
    }
    return true;
  }

  /**
   * Handles pixel data with defined length
   * For single frames, returns an array with a single buffer, while
   * for multiframes, returns an array with one buffer per frame.
   */
  handlePixelDefined(
    header: TagHeader,
    stream: ReadBufferStream,
    _tsuid: TransferSyntax,
    options: DictCreatorOptions
  ): boolean {
    const { length } = header;
    const numberOfFramesValue = this.getSingle("00280008");
    const numberOfFrames =
      (typeof numberOfFramesValue === "number" ? numberOfFramesValue : 1) || 1;
    if (numberOfFrames === 1 || options.separateUncompressedFrames !== true) {
      const bytes = stream.getBuffer(stream.offset, stream.offset + length);
      stream.increment(length);
      // TODO - split this up into frames
      const values = [bytes] as DicomValue[];
      const readInfo: ReadInfo = {
        ...header,
        values,
      };
      if (options.forceStoreRaw) {
        readInfo.rawValues = values;
      }
      this.setValue(header.tag.toCleanString(), readInfo);
      return true;
    }

    const rowsValue = this.getSingle("00280010");
    const columnsValue = this.getSingle("00280011");
    const bitsAllocatedValue = this.getSingle("00280100");
    const rows = typeof rowsValue === "number" ? rowsValue : 0;
    const columns = typeof columnsValue === "number" ? columnsValue : 0;
    const bitsAllocated =
      typeof bitsAllocatedValue === "number" ? bitsAllocatedValue : 0;
    const values: DicomValue[] = [];
    const bitSize = rows * columns * bitsAllocated;
    for (let frameIndex = 0; frameIndex < numberOfFrames; frameIndex++) {
      const start = Math.floor((bitSize * frameIndex) / 8);
      // End is exclusive, so add one to it
      // Use ceiling to ensure all the bits required are included
      const end = 1 + Math.ceil((bitSize * frameIndex + bitSize - 1) / 8);
      const bytes = stream.getBuffer(
        stream.offset + start,
        stream.offset + end
      );
      values.push(bytes);
    }
    stream.increment(length);
    const readInfo: ReadInfo = {
      ...header,
      values,
    };
    this.setValue(header.tag.toCleanString(), readInfo);
    return true;
  }

  /**
   * Handles general pixel data, switching between the two types
   */
  handlePixel(
    header: TagHeader,
    stream: ReadBufferStream,
    tsuid: TransferSyntax,
    options: DictCreatorOptions
  ): boolean {
    if (this.current.level) {
      throw new Error("Level greater than 0 = " + this.current.level);
    }
    const { length } = header;
    if (length === UNDEFINED_LENGTH) {
      return this.handlePixelUndefined(header, stream, tsuid, options);
    }
    return this.handlePixelDefined(header, stream, tsuid, options);
  }

  /**
   * Figures out if the current header data is bulkdata
   * This will call options.isBulkdata if available, otherwise will
   * check the default or provided sizes for bulkdata.
   */
  isBulkdata(
    header: TagHeader,
    options: DictCreatorOptions
  ): boolean | undefined {
    if (header.tag.isMetaInformation()) {
      return;
    }
    if (options.isBulkdata) {
      return options.isBulkdata.call(this, header, options);
    }
    const { length, tag } = header;
    if (length === UNDEFINED_LENGTH || tag.isPrivateCreator()) {
      return;
    }
    const compareSize = tag.isPrivateValue()
      ? this.privateTagBulkdataSize
      : this.publicTagBulkdataSize;

    return length > compareSize;
  }

  /**
   * Handles writing of bulkdata based on the options provided
   */
  handleBulkdata(
    header: TagHeader,
    stream: ReadBufferStream,
    tsuid: TransferSyntax,
    options: DictCreatorOptions
  ): boolean | undefined {
    if (!this.isBulkdata(header, options)) {
      return;
    }
    const { length } = header;
    const readInfo = options.writeBulkdata!.call(
      this,
      header,
      stream,
      tsuid,
      options
    );
    this.setValue(header.tag.toCleanString(), readInfo);
    stream.increment(length);
    return true;
  }
}

export type {
  DictCreatorOptions,
  TagHeader,
  ReadInfo,
  DictEntry,
  DicomDict,
  TagHandler,
  HandlersMap,
  ParseLevelState,
  VRObject,
};
