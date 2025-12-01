import fs from "fs";
import dcmjs from "../src";
import { DicomMessage } from "../src/DicomMessage";
import { DicomMetaDictionary } from "../src/DicomMetaDictionary";
import { getTestDataset } from "./testUtils";

it("test_normalizer_op", async () => {
    const file = fs.readFileSync("test/sample-op.dcm");
    const dicomDict = DicomMessage.readFile(file.buffer);

    const dataset = DicomMetaDictionary.naturalizeDataset(dicomDict.dict);
    const multiframe = dcmjs.normalizers.Normalizer.normalizeToDataset([dataset]);

    expect(dataset.NumberOfFrames).toEqual(1);
    expect(multiframe.NumberOfFrames).toEqual(1);
});

it("test_normalizer_oct", async () => {
    const url = "https://github.com/dcmjs-org/data/releases/download/oct/oct.dcm";
    const dcmPath = await getTestDataset(url, "oct.dcm");
    const file = fs.readFileSync(dcmPath);
    const dicomDict = DicomMessage.readFile(file.buffer);

    const dataset = DicomMetaDictionary.naturalizeDataset(dicomDict.dict);
    const multiframe = dcmjs.normalizers.Normalizer.normalizeToDataset([dataset]);

    expect(dataset.NumberOfFrames).toEqual(97);
    expect(multiframe.NumberOfFrames).toEqual(97);
});
