import { describe, expect, it } from "vitest";
import { algToOuterMoves, invertOuterMoves, outerMoveToString } from "./cube/alg";
import { applyMoves, solvedState } from "./cube/state";
import {
  buildReplay,
  displayPrefix,
  orientationFaceMap,
  solvedPieceCount,
  unsolvedSlots,
} from "./replay";

/** A solve record built from a scramble and the moves that undo it. */
function record(scramble: string, solution: string, gaps: number[] = []) {
  const moves = algToOuterMoves(solution);
  let t = 5000;
  return {
    scramble,
    moves: moves.map((m, i) => {
      t += i === 0 ? 0 : (gaps[i] ?? 120);
      return { m: outerMoveToString(m), t };
    }),
  };
}

describe("orientation face map", () => {
  it("is the identity without a rotation", () => {
    expect(orientationFaceMap("")).toMatchObject({ U: "U", F: "F", R: "R" });
  });

  it("turns the cube over for z2", () => {
    const m = orientationFaceMap("z2");
    expect(m.U).toBe("D");
    expect(m.D).toBe("U");
    expect(m.R).toBe("L");
    expect(m.L).toBe("R");
    expect(m.F).toBe("F");
    expect(m.B).toBe("B");
  });

  it("composes a sequence", () => {
    // x then y: F -> U (by x), U -> U (by y)
    expect(orientationFaceMap("x y").F).toBe("U");
  });
});

describe("buildReplay", () => {
  const scramble = "R U R' U' F2 D";
  const solution = invertOuterMoves(algToOuterMoves(scramble))
    .map(outerMoveToString)
    .join(" ");

  it("tracks one state per move, ending solved when the solve worked", () => {
    const model = buildReplay(record(scramble, solution), "");
    expect(model.moves).toHaveLength(6);
    expect(model.states).toHaveLength(7);
    expect(model.solved).toBe(true);
    expect(model.moves[model.moves.length - 1].solvedAfter).toBe(20);
    // the scrambled state is not solved
    expect(solvedPieceCount(model.states[0])).toBeLessThan(20);
  });

  it("renders moves in the user's holding orientation", () => {
    const model = buildReplay(record("U", "U'"), "z2");
    expect(model.moves[0].display).toBe("D'");
    // scramble is rotated the same way, after the leading rotation
    expect(model.setupAlg).toBe("z2 D");
  });

  it("marks hesitations relative to the solver's own turning speed", () => {
    // fast turner: 60ms per move, one 900ms think
    const gaps = [0, 60, 60, 900, 60, 60];
    const model = buildReplay(record(scramble, solution, gaps), "");
    expect(model.pauseThresholdMs).toBe(250);
    expect(model.moves.filter((m) => m.pause).map((m) => m.t - model.moves[0].t)).toHaveLength(1);
    expect(model.moves[3].pause).toBe(true);
    expect(model.moves[2].pause).toBe(false);
  });

  it("groups moves into bursts split by the pauses", () => {
    const gaps = [0, 60, 60, 900, 60, 60];
    const model = buildReplay(record(scramble, solution, gaps), "");
    expect(model.bursts).toHaveLength(2);
    expect(model.bursts[0]).toMatchObject({ from: 0, to: 2 });
    expect(model.bursts[1]).toMatchObject({ from: 3, to: 5, pauseBeforeMs: 900 });
    // the last burst finishes the cube
    expect(model.bursts[1].delta).toBeGreaterThan(0);
  });

  it("keeps a solve usable when the scramble cannot be parsed", () => {
    const model = buildReplay(record("nonsense!!", "R U"), "");
    expect(model.moves).toHaveLength(2);
    expect(model.states).toHaveLength(3);
  });

  it("builds the setup that reaches any point in the solve", () => {
    const model = buildReplay(record("U", "D R U'"), "");
    expect(displayPrefix(model, 0)).toBe("U");
    expect(displayPrefix(model, 2)).toBe("U D R");
  });
});

describe("unsolvedSlots", () => {
  it("is empty on a solved cube and names what a move breaks", () => {
    expect(unsolvedSlots(solvedState())).toEqual({ corners: [], edges: [] });
    const afterU = applyMoves(solvedState(), algToOuterMoves("U"));
    expect(unsolvedSlots(afterU).corners).toHaveLength(4);
    expect(unsolvedSlots(afterU).edges).toHaveLength(4);
  });
});
