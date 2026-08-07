import { describe, expect, it } from "vitest";
import { algToOuterMoves, invertOuterMoves, outerMoveToString } from "./cube/alg";
import { applyMoves, solvedState } from "./cube/state";
import {
  buildReplay,
  corePrefix,
  displayPrefix,
  elapsedExecMs,
  orientationFaceMap,
  solvedPieceCount,
  tpsAt,
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
    expect(solvedPieceCount(model.states[model.states.length - 1])).toBe(20);
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
    // and the pause is accounted for
    expect(model.pauseTotalMs).toBe(900);
  });

  it("writes repeated quarter turns of one face as a single move", () => {
    // the cube reports R2 as two R turns, and a cuber writes R2
    const model = buildReplay(record("U", "R R D R' R'"), "");
    expect(model.moves.map((m) => m.display)).toEqual(["R2", "D", "R2"]);
    expect(model.moves[0].quarterTurns).toBe(2);
    // timing stays that of the turns actually played
    expect(model.moves[0].t).toBe(120);
  });

  it("keeps turns apart when the hands paused between them", () => {
    // fast turning throughout, except a think between the two R turns
    const model = buildReplay(record("U", "D F U L R R", [0, 60, 60, 60, 60, 900]), "");
    expect(model.moves.map((m) => m.display)).toEqual(["D", "F", "U", "L", "R", "R"]);
    expect(model.moves[5].pause).toBe(true);
  });

  it("shows a cancelling fidget as played and lets it change nothing", () => {
    const model = buildReplay(record("U", "D R R' D'"), "");
    expect(model.moves.map((m) => m.display)).toEqual(["D", "R R'", "D'"]);
    expect(model.moves[1].move).toBeNull();
    expect(model.states[1]).toEqual(model.states[2]);
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
    expect(corePrefix(model, 2).map(outerMoveToString)).toEqual(["U", "D", "R"]);
  });
});

describe("tps", () => {
  // 6 moves, 120ms apart -> the stream spans 600ms; an execution of 800ms
  // means 200ms passed before the first turn
  const model = () => buildReplay(record("U", "R U R' U' F D"), "");

  it("ends at the solve's own TPS: moves over execution time", () => {
    const m = model();
    expect(tpsAt(m, m.moves.length, 800)).toBeCloseTo(6 / 0.8);
    expect(elapsedExecMs(m, m.moves.length, 800)).toBe(800);
  });

  it("counts the run-up to the first turn", () => {
    const m = model();
    expect(elapsedExecMs(m, 1, 800)).toBe(200);
    expect(tpsAt(m, 1, 800)).toBeCloseTo(5);
  });

  it("has no value before the first move", () => {
    const m = model();
    expect(tpsAt(m, 0, 800)).toBeNull();
    expect(elapsedExecMs(m, 0, 800)).toBe(0);
  });

  it("survives an execution time shorter than the move stream", () => {
    const m = model();
    expect(tpsAt(m, m.moves.length, 100)).toBeCloseTo(10);
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

describe("turning speed", () => {
  it("measures the rate between turns, not including the run-up", () => {
    // 6 moves, 5 intervals of 200ms -> 5 turns per second
    const model = buildReplay(record("U", "R U R' U' F D", [0, 200, 200, 200, 200, 200]), "");
    expect(model.bursts).toHaveLength(1);
    expect(model.bursts[0].tps).toBeCloseTo(5);
    expect(model.moves[model.moves.length - 1].tps).toBeCloseTo(5);
  });

  it("reports no rate when timestamps arrive in one batch", () => {
    // every turn at the same millisecond: a rate would be meaningless
    const model = buildReplay(record("U", "R D R' D'", [0, 0, 0, 0]), "");
    expect(model.bursts[0].tps).toBeNull();
    expect(model.moves.every((m) => m.tps === null)).toBe(true);
  });
});
