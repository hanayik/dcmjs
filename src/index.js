// Data

import { DeflatedReadBufferStream, ReadBufferStream, WriteBufferStream } from "./BufferStream.js";
import { BitArray } from "./bitArray.js";
import { Colors } from "./colors.js";
import { DicomDict } from "./DicomDict.js";
import { DicomMessage } from "./DicomMessage.js";
import { DicomMetaDictionary } from "./DicomMetaDictionary.js";
import { DictCreator } from "./DictCreator.js";
import { datasetToBlob, datasetToBuffer, datasetToDict } from "./datasetToBlob.js";
// Derivations
import {
    DerivedDataset,
    DerivedImage,
    DerivedPixels,
    ParametricMap,
    Segmentation,
    StructuredReport
} from "./derivations/index.js";
import { DICOMWEB } from "./dicomweb.js";
import log from "./log.js";
import { NormalizedDictCreator } from "./NormalizedDictCreator.js";
import { Tag } from "./Tag.js";
import { ValueRepresentation } from "./ValueRepresentation.js";

// Normalizers

import adapters from "./adapters/index.js";
import { cleanTags, getTagsNameToEmpty } from "./anonymizer.js";
import {
    CTImageNormalizer,
    DSRNormalizer,
    EnhancedMRImageNormalizer,
    EnhancedUSVolumeNormalizer,
    ImageNormalizer,
    MRImageNormalizer,
    Normalizer,
    PETImageNormalizer,
    SEGImageNormalizer
} from "./normalizers.js";
import sr from "./sr/index.js";
import utilities from "./utilities/index.js";

const data = {
    BitArray,
    ReadBufferStream,
    DeflatedReadBufferStream,
    WriteBufferStream,
    DicomDict,
    DicomMessage,
    DicomMetaDictionary,
    Tag,
    ValueRepresentation,
    Colors,
    datasetToDict,
    datasetToBuffer,
    datasetToBlob,
    DictCreator,
    NormalizedDictCreator
};

const derivations = {
    DerivedDataset,
    DerivedPixels,
    DerivedImage,
    Segmentation,
    StructuredReport,
    ParametricMap
};

const normalizers = {
    Normalizer,
    ImageNormalizer,
    MRImageNormalizer,
    EnhancedMRImageNormalizer,
    EnhancedUSVolumeNormalizer,
    CTImageNormalizer,
    PETImageNormalizer,
    SEGImageNormalizer,
    DSRNormalizer
};

const anonymizer = {
    cleanTags,
    getTagsNameToEmpty
};

const dcmjs = {
    DICOMWEB,
    adapters,
    data,
    derivations,
    normalizers,
    sr,
    utilities,
    log,
    anonymizer
};

DicomDict.setDicomMessageClass(DicomMessage);
ValueRepresentation.setDicomMessageClass(DicomMessage);
ValueRepresentation.setTagClass(Tag);
Tag.setDicomMessageClass(DicomMessage);

export { DICOMWEB, adapters, data, derivations, normalizers, sr, utilities, log, anonymizer };

export { dcmjs as default };
