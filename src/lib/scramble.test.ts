import { describe, expect, it } from "vitest";
import {
  cleanScramble,
  generateScramble,
  hasRedundantTurn,
  permutationParity,
  randomOrbit,
} from "./scramble";
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

describe("permutationParity", () => {
  it("counts transpositions", () => {
    expect(permutationParity([0, 1, 2, 3])).toBe(0);
    expect(permutationParity([1, 0, 2, 3])).toBe(1);
    expect(permutationParity([1, 2, 0, 3])).toBe(0);
  });
});

describe("randomOrbit", () => {
  it("always produces a legal orbit", () => {
    for (let i = 0; i < 200; i++) {
      const edges = randomOrbit(12, 2);
      expect(permutationParity(edges.pieces)).toBe(0);
      expect([...edges.pieces].sort((a, b) => a - b)).toEqual([...Array(12).keys()]);
      expect(edges.orientation.reduce((a, b) => a + b, 0) % 2).toBe(0);

      const corners = randomOrbit(8, 3);
      expect(permutationParity(corners.pieces)).toBe(0);
      expect([...corners.pieces].sort((a, b) => a - b)).toEqual([...Array(8).keys()]);
      expect(corners.orientation.reduce((a, b) => a + b, 0) % 3).toBe(0);
    }
  });

  it("actually scrambles the orbit", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) seen.add(randomOrbit(12, 2).pieces.join(","));
    expect(seen.size).toBeGreaterThan(40);
  });
});

function stateOf(alg: string): CubeState {
  return applyMoves(solvedState(), algToOuterMoves(alg));
}

const cornersSolved = (s: CubeState) => s.cp.every((p, i) => p === i) && s.co.every((o) => o === 0);
const edgesSolved = (s: CubeState) => s.ep.every((p, i) => p === i) && s.eo.every((o) => o === 0);

describe("generateScramble", () => {
  it("leaves the corners alone in an edges scramble", async () => {
    for (let i = 0; i < 3; i++) {
      const state = stateOf(await generateScramble("edges"));
      expect(cornersSolved(state)).toBe(true);
      expect(edgesSolved(state)).toBe(false);
    }
  }, 60_000);

  it("leaves the edges alone in a corners scramble", async () => {
    for (let i = 0; i < 3; i++) {
      const state = stateOf(await generateScramble("corners"));
      expect(edgesSolved(state)).toBe(true);
      expect(cornersSolved(state)).toBe(false);
    }
  }, 60_000);

  it("comes out at normal scramble length", async () => {
    const moves = algToOuterMoves(await generateScramble("edges"));
    expect(moves.length).toBeGreaterThan(12);
    expect(moves.length).toBeLessThan(30);
  }, 60_000);

  it("scrambles everything in a full scramble", async () => {
    const state = stateOf(await generateScramble("full"));
    expect(cornersSolved(state)).toBe(false);
    expect(edgesSolved(state)).toBe(false);
  }, 60_000);
});
