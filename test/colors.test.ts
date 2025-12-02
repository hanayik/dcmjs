import { Colors } from "../src/colors";

describe("Colors", () => {
  describe("d65WhitePointXYZ", () => {
    it("returns the D65 standard white point", () => {
      const whitePoint = Colors.d65WhitePointXYZ();
      expect(whitePoint).toEqual([0.950456, 1.0, 1.088754]);
    });
  });

  describe("gamma correction", () => {
    it("gammaCorrection handles linear region", () => {
      const result = Colors.gammaCorrection(0.001);
      expect(result).toBeCloseTo(0.01292, 5);
    });

    it("gammaCorrection handles non-linear region", () => {
      const result = Colors.gammaCorrection(0.5);
      expect(result).toBeCloseTo(0.7354, 3);
    });

    it("invGammaCorrection handles linear region", () => {
      const result = Colors.invGammaCorrection(0.01);
      expect(result).toBeCloseTo(0.000774, 5);
    });

    it("invGammaCorrection handles non-linear region", () => {
      const result = Colors.invGammaCorrection(0.5);
      expect(result).toBeCloseTo(0.214, 4);
    });

    it("gammaCorrection and invGammaCorrection are inverses", () => {
      const testValues = [0, 0.1, 0.25, 0.5, 0.75, 1.0];
      for (const value of testValues) {
        const corrected = Colors.gammaCorrection(value);
        const restored = Colors.invGammaCorrection(corrected);
        expect(restored).toBeCloseTo(value, 10);
      }
    });
  });

  describe("labf functions", () => {
    it("labf handles values above threshold", () => {
      const result = Colors.labf(0.5);
      expect(result).toBeCloseTo(0.7937, 4);
    });

    it("labf handles values below threshold", () => {
      const result = Colors.labf(0.001);
      expect(result).toBeCloseTo(0.1457, 4);
    });

    it("labfInv handles values above threshold", () => {
      const result = Colors.labfInv(0.5);
      expect(result).toBeCloseTo(0.125, 5);
    });

    it("labfInv handles values below threshold", () => {
      const result = Colors.labfInv(0.15);
      expect(result).toBeCloseTo(0.00155, 4);
    });

    it("labf and labfInv are inverses", () => {
      const testValues = [0.001, 0.01, 0.1, 0.5, 1.0];
      for (const value of testValues) {
        const transformed = Colors.labf(value);
        const restored = Colors.labfInv(transformed);
        expect(restored).toBeCloseTo(value, 10);
      }
    });
  });

  describe("DICOMLAB to LAB conversion", () => {
    it("converts DICOMLAB black to LAB", () => {
      const dicomlab: [number, number, number] = [0, 32896, 32896];
      const lab = Colors.dicomlab2LAB(dicomlab);
      expect(lab[0]).toBeCloseTo(0, 2); // L = 0
      expect(lab[1]).toBeCloseTo(0, 0); // a ≈ 0
      expect(lab[2]).toBeCloseTo(0, 0); // b ≈ 0
    });

    it("converts DICOMLAB white to LAB", () => {
      const dicomlab: [number, number, number] = [65535, 32896, 32896];
      const lab = Colors.dicomlab2LAB(dicomlab);
      expect(lab[0]).toBeCloseTo(100, 2); // L = 100
      expect(lab[1]).toBeCloseTo(0, 0); // a ≈ 0
      expect(lab[2]).toBeCloseTo(0, 0); // b ≈ 0
    });

    it("dicomlab2LAB and lab2DICOMLAB are inverses", () => {
      const testCases: [number, number, number][] = [
        [0, 32768, 32768], // neutral black
        [65535, 32768, 32768], // neutral white
        [32768, 0, 0], // extreme a-, b-
        [32768, 65535, 65535], // extreme a+, b+
        [32768, 32768, 32768], // mid gray
      ];

      for (const dicomlab of testCases) {
        const lab = Colors.dicomlab2LAB(dicomlab);
        const restored = Colors.lab2DICOMLAB(lab);
        expect(restored[0]).toBeCloseTo(dicomlab[0], 5);
        expect(restored[1]).toBeCloseTo(dicomlab[1], 5);
        expect(restored[2]).toBeCloseTo(dicomlab[2], 5);
      }
    });
  });

  describe("RGB to XYZ conversion", () => {
    it("converts black RGB to XYZ", () => {
      const rgb: [number, number, number] = [0, 0, 0];
      const xyz = Colors.rgb2XYZ(rgb);
      expect(xyz[0]).toBeCloseTo(0, 5);
      expect(xyz[1]).toBeCloseTo(0, 5);
      expect(xyz[2]).toBeCloseTo(0, 5);
    });

    it("converts white RGB to XYZ (D65 white point)", () => {
      const rgb: [number, number, number] = [1, 1, 1];
      const xyz = Colors.rgb2XYZ(rgb);
      // Should be close to D65 white point
      expect(xyz[0]).toBeCloseTo(0.9505, 3);
      expect(xyz[1]).toBeCloseTo(1.0, 3);
      expect(xyz[2]).toBeCloseTo(1.089, 2);
    });

    it("converts red RGB to XYZ", () => {
      const rgb: [number, number, number] = [1, 0, 0];
      const xyz = Colors.rgb2XYZ(rgb);
      expect(xyz[0]).toBeCloseTo(0.4124, 3);
      expect(xyz[1]).toBeCloseTo(0.2126, 3);
      expect(xyz[2]).toBeCloseTo(0.0193, 3);
    });
  });

  describe("XYZ to RGB conversion", () => {
    it("converts black XYZ to RGB", () => {
      const xyz: [number, number, number] = [0, 0, 0];
      const rgb = Colors.xyz2RGB(xyz);
      expect(rgb[0]).toBeCloseTo(0, 5);
      expect(rgb[1]).toBeCloseTo(0, 5);
      expect(rgb[2]).toBeCloseTo(0, 5);
    });

    it("converts D65 white point XYZ to white RGB", () => {
      const whitePoint = Colors.d65WhitePointXYZ();
      const rgb = Colors.xyz2RGB(whitePoint);
      expect(rgb[0]).toBeCloseTo(1, 2);
      expect(rgb[1]).toBeCloseTo(1, 2);
      expect(rgb[2]).toBeCloseTo(1, 2);
    });
  });

  describe("LAB to XYZ conversion", () => {
    it("converts L=0 (black) to XYZ origin", () => {
      const lab: [number, number, number] = [0, 0, 0];
      const xyz = Colors.lab2XYZ(lab);
      expect(xyz[0]).toBeCloseTo(0, 3);
      expect(xyz[1]).toBeCloseTo(0, 3);
      expect(xyz[2]).toBeCloseTo(0, 3);
    });

    it("converts L=100 (white) to D65 white point", () => {
      const lab: [number, number, number] = [100, 0, 0];
      const xyz = Colors.lab2XYZ(lab);
      const whitePoint = Colors.d65WhitePointXYZ();
      expect(xyz[0]).toBeCloseTo(whitePoint[0], 3);
      expect(xyz[1]).toBeCloseTo(whitePoint[1], 3);
      expect(xyz[2]).toBeCloseTo(whitePoint[2], 3);
    });

    it("xyz2LAB and lab2XYZ are inverses", () => {
      const testCases: [number, number, number][] = [
        [0.1, 0.1, 0.1],
        [0.5, 0.5, 0.5],
        [0.95, 1.0, 1.09],
      ];

      for (const xyz of testCases) {
        const lab = Colors.xyz2LAB(xyz);
        const restored = Colors.lab2XYZ(lab);
        expect(restored[0]).toBeCloseTo(xyz[0], 8);
        expect(restored[1]).toBeCloseTo(xyz[1], 8);
        expect(restored[2]).toBeCloseTo(xyz[2], 8);
      }
    });
  });

  describe("RGB to LAB round-trip", () => {
    it("rgb2LAB and lab2RGB preserve black", () => {
      const rgb: [number, number, number] = [0, 0, 0];
      const lab = Colors.rgb2LAB(rgb);
      const restored = Colors.lab2RGB(lab);
      expect(restored[0]).toBeCloseTo(0, 3);
      expect(restored[1]).toBeCloseTo(0, 3);
      expect(restored[2]).toBeCloseTo(0, 3);
    });

    it("rgb2LAB and lab2RGB preserve white", () => {
      const rgb: [number, number, number] = [1, 1, 1];
      const lab = Colors.rgb2LAB(rgb);
      const restored = Colors.lab2RGB(lab);
      expect(restored[0]).toBeCloseTo(1, 2);
      expect(restored[1]).toBeCloseTo(1, 2);
      expect(restored[2]).toBeCloseTo(1, 2);
    });

    it("rgb2LAB and lab2RGB preserve primary colors", () => {
      const primaries: [number, number, number][] = [
        [1, 0, 0], // red
        [0, 1, 0], // green
        [0, 0, 1], // blue
      ];

      for (const rgb of primaries) {
        const lab = Colors.rgb2LAB(rgb);
        const restored = Colors.lab2RGB(lab);
        expect(restored[0]).toBeCloseTo(rgb[0], 2);
        expect(restored[1]).toBeCloseTo(rgb[1], 2);
        expect(restored[2]).toBeCloseTo(rgb[2], 2);
      }
    });

    it("rgb2LAB and lab2RGB preserve gray values", () => {
      const grays: [number, number, number][] = [
        [0.25, 0.25, 0.25],
        [0.5, 0.5, 0.5],
        [0.75, 0.75, 0.75],
      ];

      for (const rgb of grays) {
        const lab = Colors.rgb2LAB(rgb);
        // Gray values should have a ≈ 0 and b ≈ 0
        expect(lab[1]).toBeCloseTo(0, 1);
        expect(lab[2]).toBeCloseTo(0, 1);

        const restored = Colors.lab2RGB(lab);
        expect(restored[0]).toBeCloseTo(rgb[0], 2);
        expect(restored[1]).toBeCloseTo(rgb[1], 2);
        expect(restored[2]).toBeCloseTo(rgb[2], 2);
      }
    });
  });

  describe("DICOMLAB to RGB round-trip", () => {
    it("dicomlab2RGB and rgb2DICOMLAB preserve mid-range values", () => {
      const testCases: [number, number, number][] = [
        [32768, 32768, 32768], // mid gray
        [49152, 32768, 32768], // light gray
        [16384, 32768, 32768], // dark gray
      ];

      for (const dicomlab of testCases) {
        const rgb = Colors.dicomlab2RGB(dicomlab);
        const restored = Colors.rgb2DICOMLAB(rgb);
        expect(restored[0]).toBeCloseTo(dicomlab[0], -2);
        expect(restored[1]).toBeCloseTo(dicomlab[1], -2);
        expect(restored[2]).toBeCloseTo(dicomlab[2], -2);
      }
    });

    it("converts DICOMLAB white to near-white RGB", () => {
      const dicomlabWhite: [number, number, number] = [65535, 32896, 32896];
      const rgb = Colors.dicomlab2RGB(dicomlabWhite);
      expect(rgb[0]).toBeCloseTo(1, 1);
      expect(rgb[1]).toBeCloseTo(1, 1);
      expect(rgb[2]).toBeCloseTo(1, 1);
    });

    it("converts DICOMLAB black to near-black RGB", () => {
      const dicomlabBlack: [number, number, number] = [0, 32896, 32896];
      const rgb = Colors.dicomlab2RGB(dicomlabBlack);
      expect(rgb[0]).toBeCloseTo(0, 1);
      expect(rgb[1]).toBeCloseTo(0, 1);
      expect(rgb[2]).toBeCloseTo(0, 1);
    });
  });

  describe("known reference values", () => {
    it("converts sRGB red to correct LAB values", () => {
      const rgb: [number, number, number] = [1, 0, 0];
      const lab = Colors.rgb2LAB(rgb);
      expect(lab[0]).toBeCloseTo(53.23, 1); // L
      expect(lab[1]).toBeCloseTo(80.11, 0); // a (red-green)
      expect(lab[2]).toBeCloseTo(67.22, 0); // b (yellow-blue)
    });

    it("converts sRGB green to correct LAB values", () => {
      const rgb: [number, number, number] = [0, 1, 0];
      const lab = Colors.rgb2LAB(rgb);
      expect(lab[0]).toBeCloseTo(87.74, 1); // L
      expect(lab[1]).toBeCloseTo(-86.18, 0); // a (negative = green)
      expect(lab[2]).toBeCloseTo(83.18, 0); // b (positive = yellow)
    });

    it("converts sRGB blue to correct LAB values", () => {
      const rgb: [number, number, number] = [0, 0, 1];
      const lab = Colors.rgb2LAB(rgb);
      expect(lab[0]).toBeCloseTo(32.3, 1); // L
      expect(lab[1]).toBeCloseTo(79.2, 0); // a (positive = red/magenta)
      expect(lab[2]).toBeCloseTo(-107.86, 0); // b (negative = blue)
    });

    it("50% gray has L ≈ 53.39", () => {
      const rgb: [number, number, number] = [0.5, 0.5, 0.5];
      const lab = Colors.rgb2LAB(rgb);
      expect(lab[0]).toBeCloseTo(53.39, 1);
      expect(lab[1]).toBeCloseTo(0, 1);
      expect(lab[2]).toBeCloseTo(0, 1);
    });
  });
});
