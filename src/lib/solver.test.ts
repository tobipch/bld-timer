import { describe, expect, it } from "vitest";
import { algToOuterMoves } from "./cube/alg";
import { applyMoves, solvedState, statesEqual } from "./cube/state";
import { pathBetween, shortScrambleFor } from "./solver";

const state = (alg: string) => applyMoves(solvedState(), algToOuterMoves(alg));

describe("pathBetween", () => {
  it("takes the cube from where it is to where you want it", () => {
    const from = algToOuterMoves("R U F D2 L'");
    const target = algToOuterMoves("B2 D R' U2 F");
    const path = pathBetween(from, target);
    const here = applyMoves(solvedState(), from);
    expect(statesEqual(applyMoves(here, path), applyMoves(solvedState(), target))).toBe(true);
  });

  it("is empty work when you are already there", () => {
    const same = algToOuterMoves("R U R'");
    const here = applyMoves(solvedState(), same);
    expect(statesEqual(applyMoves(here, pathBetween(same, same)), here)).toBe(true);
  });

  it("is just the target from a solved cube", () => {
    const target = algToOuterMoves("R U F");
    expect(pathBetween([], target)).toEqual(target);
  });
});

describe("shortScrambleFor", () => {
  it("reaches exactly the same state in scramble length", { timeout: 120000 }, async () => {
    for (const alg of [
      "R U R' U' F2 D L2 B R2 F' U D2 L F B' R L' U2 D' F2 B2 R2 L2 U",
      "D2 L' B F R2 U D' L2 F' B R U2 R' L D F2 U' B2 L2 R' F D' U2 B",
      "M2 U M2 U2 M2 U M2 R U R' F' R U R' U' R' F R2 U' R'",
    ]) {
      const moves = algToOuterMoves(alg);
      const short = await shortScrambleFor(moves);
      expect(short).not.toBeNull();
      expect(statesEqual(applyMoves(solvedState(), short!), state(alg))).toBe(true);
      expect(short!.length).toBeLessThanOrEqual(21);
    }
  });
});
