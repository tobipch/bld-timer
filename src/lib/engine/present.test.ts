import { describe, expect, it } from "vitest";
import { defaultLetterScheme } from "../cube/speffz";
import { edgeStickerByName, cornerStickerByName } from "../cube/geometry";
import { letterFor, makeOrientationMaps, userStickerName } from "./present";
import type { StickerRef } from "./classify";

const scheme = defaultLetterScheme();
const ufEdge: StickerRef = { kind: "edge", ...edgeStickerByName("UF")! };

describe("orientation maps", () => {
  it("identity orientation uses intrinsic names", () => {
    const maps = makeOrientationMaps("");
    expect(userStickerName(ufEdge, maps)).toBe("UF");
    expect(letterFor(ufEdge, scheme, maps)).toBe("C");
  });

  it("y orientation: the intrinsic UF sticker shows at the user's UL", () => {
    const maps = makeOrientationMaps("y");
    expect(userStickerName(ufEdge, maps)).toBe("UL");
    expect(letterFor(ufEdge, scheme, maps)).toBe("D");
  });

  it("z2 orientation flips top and bottom", () => {
    const maps = makeOrientationMaps("z2");
    expect(userStickerName(ufEdge, maps)).toBe("DF");
  });

  it("user buffer names roundtrip through the orientation", () => {
    for (const orientation of ["", "y", "x y", "z2", "x' z"]) {
      const maps = makeOrientationMaps(orientation);
      for (const name of ["UF", "UB", "FR"]) {
        const intr = maps.edgeNameToIntrinsic(name)!;
        expect(userStickerName(intr, maps)).toBe(name);
      }
      for (const name of ["UFR", "RDF", "FDL"]) {
        const intr = maps.cornerNameToIntrinsic(name)!;
        expect(userStickerName(intr, maps)).toBe(name);
      }
    }
  });

  it("garbage orientation input degrades to identity", () => {
    const maps = makeOrientationMaps("not an alg [[[");
    expect(userStickerName(ufEdge, maps)).toBe("UF");
    expect(cornerStickerByName("UFR")).not.toBeNull();
  });
});
