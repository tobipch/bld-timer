import { describe, expect, it } from "vitest";
import { cleanScramble, generateScramble, hasRedundantTurn } from "./scramble";
import { algToOuterMoves } from "./cube/alg";
import { applyMoves, solvedState, type CubeState } from "./cube/state";

describe("hasRedundantTurn", () => {
  it("spots the same face twice in a row, through wide moves", () => {
    // Rw' is L' x', so the L2 and the suffix merge into a single L
    expect(hasRedundantTurn("L2 U2 L2 Rw' Dw")).toBe(true);
    expect(hasRedundantTurn("R U R' U'")).toBe(false);
  });

  it("leaves unparseable input alone", () => {
    expect(hasRedundantTurn("not an alg")).toBe(false);
  });
});

describe("cleanScramble", () => {
  it("draws again for a redundant scramble, bounded", () => {
    const draws = ["L2 U2 L2 Rw' Dw", "L2 U2 L2 Rw' Dw", "R U R' U'"];
    let i = 0;
    return cleanScramble(async () => draws[i++]).then((alg) => {
      expect(alg).toBe("R U R' U'");
      expect(i).toBe(3);
    });
  });

  it("uses the last draw rather than giving up", async () => {
    const alg = await cleanScramble(async () => "L2 U2 L2 Rw' Dw", 3);
    expect(alg).toBe("L2 U2 L2 Rw' Dw");
  });
});

function stateOf(alg: string): CubeState {
  return applyMoves(solvedState(), algToOuterMoves(alg));
}

const cornersSolved = (s: CubeState) => s.cp.every((p, i) => p === i) && s.co.every((o) => o === 0);
const edgesSolved = (s: CubeState) => s.ep.every((p, i) => p === i) && s.eo.every((o) => o === 0);

describe("generateScramble", () => {
  it("scrambles corners and edges", async () => {
    const state = stateOf(await generateScramble());
    expect(cornersSolved(state)).toBe(false);
    expect(edgesSolved(state)).toBe(false);
  }, 60_000);
});
