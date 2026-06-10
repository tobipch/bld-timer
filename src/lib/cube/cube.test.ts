import { describe, expect, it } from "vitest";
import { algToOuterMoves, invertOuterMoves, outerMovesToString, parseAlg, simplifyOuterMoves, tokensToOuterMoves } from "./alg";
import { applyMoves, isSolved, solvedState, statesEqual } from "./state";
import { cornerStickerByName, cornerStickerName, edgeStickerByName } from "./geometry";

const apply = (alg: string) => applyMoves(solvedState(), algToOuterMoves(alg));

describe("move tables", () => {
  it("every quarter turn has period 4", () => {
    for (const f of ["U", "D", "L", "R", "F", "B"]) {
      expect(isSolved(apply(`${f} ${f} ${f} ${f}`))).toBe(true);
      expect(isSolved(apply(`${f}2 ${f}2`))).toBe(true);
      expect(isSolved(apply(`${f} ${f}'`))).toBe(true);
    }
  });

  it("sexy move has period 6", () => {
    expect(isSolved(apply("[R, U] [R, U] [R, U] [R, U] [R, U] [R, U]"))).toBe(true);
    expect(isSolved(apply("[R, U] [R, U] [R, U]"))).toBe(false);
  });

  it("U cycles the U-layer corners front-right -> front-left", () => {
    const s = apply("U");
    const ufr = cornerStickerByName("UFR")!;
    const ufl = cornerStickerByName("UFL")!;
    // piece from UFR is now at UFL, not twisted
    expect(s.cp[ufl.slot]).toBe(ufr.slot);
    expect(s.co[ufl.slot]).toBe(0);
  });

  it("superflip flips all 12 edges in place", () => {
    const s = apply("U R2 F B R B2 R U2 L B2 R U' D' R2 F R' L B2 U2 F2");
    expect(s.cp).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(s.co).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(s.ep).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(s.eo).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
  });
});

describe("alg parsing and translation", () => {
  it("expands commutator and conjugate notation", () => {
    expect(outerMovesToString(algToOuterMoves("[R, U]"))).toBe("R U R' U'");
    expect(outerMovesToString(algToOuterMoves("[F: [R, U]]"))).toBe("F R U R' U' F'");
    expect(outerMovesToString(algToOuterMoves("[R2 U': [R2, S]]"))).toMatch(/^R2 U' R2 /);
  });

  it("translates slices into the outer moves a smart cube reports", () => {
    // M = R L' with the core shifted x'; a following U is physically the old B face
    expect(outerMovesToString(algToOuterMoves("M"))).toBe("R L'");
    expect(outerMovesToString(algToOuterMoves("M U"))).toBe("R L' B");
    expect(outerMovesToString(algToOuterMoves("M'"))).toBe("R' L");
    expect(outerMovesToString(algToOuterMoves("M2"))).toBe("R2 L2");
  });

  it("translates wide moves", () => {
    expect(outerMovesToString(algToOuterMoves("r"))).toBe("L");
    expect(outerMovesToString(algToOuterMoves("r U r'"))).toBe("L F L'");
    expect(outerMovesToString(algToOuterMoves("Rw U Rw'"))).toBe("L F L'");
  });

  it("rotation-containing algs cancel out physically", () => {
    // after y, logical R is the core's B face
    expect(outerMovesToString(algToOuterMoves("y R y' R'"))).toBe("B R'");
    // an alg and its rotated equivalent produce the same state
    const a = apply("R U R' U'");
    const viaRotation = apply("y F U F' U' y'");
    expect(statesEqual(a, viaRotation)).toBe(true);
  });

  it("slice algs behave like the physical cube", () => {
    // H-perm has order 2
    const once = apply("M2 U M2 U2 M2 U M2");
    expect(isSolved(once)).toBe(false);
    const twice = applyMoves(once, algToOuterMoves("M2 U M2 U2 M2 U M2"));
    expect(isSolved(twice)).toBe(true);
    // M4 is the identity
    expect(isSolved(apply("M M M M"))).toBe(true);
    expect(isSolved(apply("E2 E2 S2 S2"))).toBe(true);
  });

  it("inverts and simplifies move lists", () => {
    const moves = algToOuterMoves("R U2 F'");
    expect(outerMovesToString(invertOuterMoves(moves))).toBe("F U2 R'");
    expect(outerMovesToString(simplifyOuterMoves(algToOuterMoves("R R U U' F2 F2 L")))).toBe("R2 L");
  });

  it("tracks the frame across the whole token stream", () => {
    const { frame } = tokensToOuterMoves(parseAlg("x y"));
    expect(frame.U).not.toBe("U");
  });
});

describe("sticker naming", () => {
  it("matches the Speffz-style names used in the alg sheets", () => {
    expect(cornerStickerName(cornerStickerByName("UBR")!.slot, 0)).toBe("UBR");
    expect(cornerStickerByName("RUB")).toEqual({ slot: cornerStickerByName("UBR")!.slot, sticker: 2 });
    expect(cornerStickerByName("BUR")).toEqual({ slot: cornerStickerByName("UBR")!.slot, sticker: 1 });
    expect(cornerStickerByName("RDF")).not.toBeNull();
    expect(cornerStickerByName("FDL")).not.toBeNull();
    expect(edgeStickerByName("LU")).toEqual({ slot: edgeStickerByName("UL")!.slot, sticker: 1 });
  });
});
