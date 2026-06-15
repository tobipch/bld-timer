import { describe, expect, it } from "vitest";
import { algToOuterMoves, invertOuterMoves } from "../cube/alg";
import { applyMoves, diffStates, solvedState, type OuterMove } from "../cube/state";
import { buffersFromNames, classifyDiff, refName } from "./classify";
import { defaultBuffers } from "../cube/speffz";
import { reconstructSolve, type TimedMove } from "./reconstruct";

const bufs = defaultBuffers();
const buffers = buffersFromNames(bufs.corners, bufs.edges);

/**
 * Synthesize a BLD solve: the execution is a known sequence of algs, the
 * "scramble" is the inverse of their combined effect. Timestamps: 150 ms
 * between moves within an alg, 900 ms thinking pause before each alg.
 */
function makeSolve(algs: string[]): { start: ReturnType<typeof solvedState>; moves: TimedMove[] } {
  const perAlg = algs.map((a) => algToOuterMoves(a));
  const all: OuterMove[] = perAlg.flat();
  const start = applyMoves(solvedState(), invertOuterMoves(all));
  const moves: TimedMove[] = [];
  let t = 1000;
  for (const algMoves of perAlg) {
    t += 900; // recognition pause
    for (const m of algMoves) {
      moves.push({ move: m, t });
      t += 150;
    }
  }
  return { start, moves };
}

const EDGE_COMM_1 = "[R2 U': [R2, S]]"; // UF: UR UB (BA)
const EDGE_COMM_2 = "[U' M2 U': [M, U2]]"; // UF: UL UB (DA)
const EDGE_COMM_3 = "[U: [L' E' L, U2]]"; // UF: UB LD (AG)
const CORNER_COMM_1 = "[R' D R U: [R' D' R, U]]"; // UFR: UBR UBL (BA)
const CORNER_COMM_2 = "[F: [R' D' R, U2]]"; // UFR: LUF UBL (FA)
const PARITY_UFR_UBL = "r2 D' r2 U' r2 D r2 D' r2 D r2 U' r2 U r2"; // UFR<->UBL, UF<->UR
const FLIP_UF_UR = "R' F R U' M' U2 M U' S R' F' R S'";
const PSEUDO_SWAP_TO_UR = "[R U' R' U, M']"; // UF -> FD -> UR: cycle ends in the parity slot

describe("reconstructSolve", () => {
  it("segments a clean multi-alg solve into the executed cases", () => {
    const { start, moves } = makeSolve([EDGE_COMM_1, EDGE_COMM_2, CORNER_COMM_1, CORNER_COMM_2]);
    const rec = reconstructSolve(start, moves, buffers);
    expect(rec.solved).toBe(true);
    expect(rec.brokenFromIdx).toBeNull();
    const cases = rec.steps.filter((s) => s.kind === "case");
    expect(cases.map((s) => s.primitive!.type)).toEqual([
      "edgeComm",
      "edgeComm",
      "cornerComm",
      "cornerComm",
    ]);
    const first = cases[0].primitive!;
    if (first.type !== "edgeComm") throw new Error("unreachable");
    expect(refName(first.buffer)).toBe("UF");
    expect(first.targets.map(refName)).toEqual(["UR", "UB"]);
  });

  it("measures recognition and execution time per case", () => {
    const { start, moves } = makeSolve([EDGE_COMM_1, CORNER_COMM_1]);
    const rec = reconstructSolve(start, moves, buffers);
    const cases = rec.steps.filter((s) => s.kind === "case");
    expect(cases).toHaveLength(2);
    // within-alg time: (moveCount - 1) * 150
    expect(cases[0].execMs).toBe((cases[0].moves.length - 1) * 150);
    // second case: 900 ms pause plus the 150 ms tail of the previous step
    expect(cases[1].recogMs).toBe(900 + 150);
  });

  it("handles parity and flags the pseudo-swap edge target", () => {
    const { start, moves } = makeSolve([PSEUDO_SWAP_TO_UR, CORNER_COMM_1, PARITY_UFR_UBL]);
    const rec = reconstructSolve(start, moves, buffers);
    expect(rec.solved).toBe(true);
    const types = rec.steps.filter((s) => s.kind === "case").map((s) => s.primitive!.type);
    expect(types).toEqual(["edgeComm", "cornerComm", "parity"]);
    const edge = rec.steps[0].primitive!;
    if (edge.type !== "edgeComm") throw new Error("unreachable");
    expect(edge.pseudoSwap).toBe(true);
  });

  it("recognizes flips", () => {
    const { start, moves } = makeSolve([EDGE_COMM_1, FLIP_UF_UR]);
    const rec = reconstructSolve(start, moves, buffers);
    expect(rec.solved).toBe(true);
    const types = rec.steps.filter((s) => s.kind === "case").map((s) => s.primitive!.type);
    expect(types).toEqual(["edgeComm", "flip"]);
  });

  it("treats cancelling fidget moves as a no-op segment", () => {
    const fidget: TimedMove[] = [];
    const { start, moves } = makeSolve([EDGE_COMM_1, CORNER_COMM_1]);
    // insert U U' between the algs
    const splitAt = algToOuterMoves(EDGE_COMM_1).length;
    const withFidget = [
      ...moves.slice(0, splitAt),
      { move: { face: "U", amount: 1 }, t: moves[splitAt - 1].t + 100 },
      { move: { face: "U", amount: 3 }, t: moves[splitAt - 1].t + 200 },
      ...moves.slice(splitAt),
    ] as TimedMove[];
    const rec = reconstructSolve(start, withFidget, buffers);
    expect(rec.solved).toBe(true);
    expect(rec.steps.some((s) => s.kind === "noop")).toBe(true);
    const caseTypes = rec.steps.filter((s) => s.kind === "case").map((s) => s.primitive!.type);
    expect(caseTypes).toEqual(["edgeComm", "cornerComm"]);
    expect(fidget).toHaveLength(0);
  });

  it("reports the point of failure for a DNF (interrupted alg)", () => {
    const { start, moves } = makeSolve([EDGE_COMM_1, EDGE_COMM_2, CORNER_COMM_1]);
    // user stops 3 moves into the third alg
    const len1 = algToOuterMoves(EDGE_COMM_1).length;
    const len2 = algToOuterMoves(EDGE_COMM_2).length;
    const truncated = moves.slice(0, len1 + len2 + 3);
    const rec = reconstructSolve(start, truncated, buffers);
    expect(rec.solved).toBe(false);
    const cases = rec.steps.filter((s) => s.kind === "case");
    expect(cases.map((s) => s.primitive!.type)).toEqual(["edgeComm", "edgeComm"]);
    expect(rec.brokenFromIdx).toBe(len1 + len2);
    expect(rec.leftover).not.toBeNull();
    expect(rec.leftover!.corners.length).toBeGreaterThan(0);
  });

  it("recovers after an unexplained block when later algs are clean", () => {
    const { start, moves } = makeSolve([EDGE_COMM_1, CORNER_COMM_1]);
    const len1 = algToOuterMoves(EDGE_COMM_1).length;
    // wreck the middle: two moves that don't cancel (F2 D), making the rest wrong too
    const junk: TimedMove[] = [
      { move: { face: "F", amount: 2 }, t: moves[len1 - 1].t + 100 },
      { move: { face: "D", amount: 1 }, t: moves[len1 - 1].t + 200 },
    ];
    const wrecked = [...moves.slice(0, len1), ...junk, ...moves.slice(len1)];
    const rec = reconstructSolve(start, wrecked, buffers);
    expect(rec.solved).toBe(false);
    // the first comm is still recognized
    const cases = rec.steps.filter((s) => s.kind === "case");
    expect(cases.length).toBeGreaterThanOrEqual(1);
    const first = cases[0].primitive!;
    if (first.type !== "edgeComm") throw new Error("unreachable");
    expect(first.targets.map(refName)).toEqual(["UR", "UB"]);
  });

  it("explains an empty or single-move tail honestly", () => {
    const { start } = makeSolve([EDGE_COMM_1]);
    const rec = reconstructSolve(start, [], buffers);
    expect(rec.solved).toBe(false);
    expect(rec.steps).toHaveLength(0);
  });
});

describe("progress-aware parsing", () => {
  it("treats an alternate pseudo-swap (non-UF/UR parity) as legitimate progress", () => {
    // The last edge comm parks UB and UL (neither is the buffer) for an
    // alternate parity that swaps UB/UL — toward home it 'solves no piece',
    // but it is a real pseudo-swap, recognized via the parity alg's actual
    // edge swap. The standard parity conjugated by U2 swaps UB/UL.
    const pseudo = algToOuterMoves("[U' M2 U: [M, U2]]"); // UF: UB UL
    const parityAlt = algToOuterMoves("U2 r2 D' r2 U' r2 D r2 D' r2 D r2 U' r2 U r2 U2");
    const exec = [...pseudo, ...parityAlt];
    const start = applyMoves(solvedState(), invertOuterMoves(exec));
    const moves: TimedMove[] = [];
    let t = 1000;
    for (const block of [pseudo, parityAlt]) {
      t += 900;
      for (const m of block) {
        moves.push({ move: m, t });
        t += 150;
      }
    }
    const rec = reconstructSolve(start, moves, buffers);
    expect(rec.solved).toBe(true);
    const par = rec.steps.find((s) => s.primitive?.type === "parity")!.primitive!;
    if (par.type !== "parity") throw new Error("unreachable");
    expect(par.edgeSwap.map(refName).sort()).toEqual(["UB", "UL"]);
    const edgeStep = rec.steps.find((s) => s.primitive?.type === "edgeComm")!;
    const edge = edgeStep.primitive!;
    if (edge.type !== "edgeComm") throw new Error("unreachable");
    expect(edge.pseudoSwap).toBe(true);
    // toward the pre-parity goal the comm parks both parity slots = progress;
    // it must not be flagged a mistrace ('solved no piece')
    expect(edgeStep.progress?.suspicious).toBe(false);
    expect(edgeStep.progress?.newlySolved).toBe(2);
  });

  it("re-attributes a setup shared by consecutive cases", () => {
    // the solver executes [U': comm1 comm2] — one wrapper, two cases. The
    // stray U'/U fragments are absorbed and the cases are reported as their
    // conjugates with setupMoves attached.
    const inner1 = algToOuterMoves(EDGE_COMM_1);
    const inner2 = algToOuterMoves(EDGE_COMM_2);
    const wrapper = algToOuterMoves("D");
    const all = [...wrapper, ...inner1, ...inner2, ...invertOuterMoves(wrapper)];
    const start = applyMoves(solvedState(), invertOuterMoves(all));
    const moves: TimedMove[] = [];
    let t = 1000;
    for (const algMoves of [wrapper, inner1, inner2, invertOuterMoves(wrapper)]) {
      t += 900;
      for (const m of algMoves) {
        moves.push({ move: m, t });
        t += 150;
      }
    }
    const rec = reconstructSolve(start, moves, buffers);
    expect(rec.solved).toBe(true);
    expect(rec.steps.some((s) => s.kind === "unknown")).toBe(false);
    const cases = rec.steps.filter((s) => s.kind === "case");
    expect(cases).toHaveLength(2);
    expect(cases.every((s) => s.setupMoves?.length === 1)).toBe(true);
    expect(cases.every((s) => !s.progress?.suspicious)).toBe(true);
    // the reported case is the D-conjugate of the inner comm
    const expected = applyMoves(solvedState(), algToOuterMoves(`D ${EDGE_COMM_1} D'`));
    const expectedPrim = classifyDiff(diffStates(solvedState(), expected), buffers);
    expect(JSON.stringify(cases[0].primitive)).toBe(JSON.stringify(expectedPrim));
  });
  it("keeps a conjugated comm whole instead of carving out its inner comm", () => {
    // [D: [R' D' R, U]] executed with an R R' fidget after the setup D,
    // followed by a comm that itself starts with D. A naive parse strips the
    // D...D' conjugation (stray D + inner comm + cancelled D'·D) — but the
    // inner comm alone solves nothing, so the conjugated parse must win.
    const CONJ = "[D: [R' D' R, U]]"; // UFR: UBR FDL (BL)
    const NEXT = "[D: [U', R D' R']]"; // starts with D
    const conjMoves = algToOuterMoves(CONJ);
    const nextMoves = algToOuterMoves(NEXT);
    const start = applyMoves(solvedState(), invertOuterMoves([...conjMoves, ...nextMoves]));
    const executed = [
      conjMoves[0], // setup D
      { face: "R", amount: 1 } as const,
      { face: "R", amount: 3 } as const, // fidget
      ...conjMoves.slice(1),
      ...nextMoves,
    ];
    const moves: TimedMove[] = executed.map((m, i) => ({ move: m, t: 1000 + i * 150 }));
    const rec = reconstructSolve(start, moves, buffers);
    expect(rec.solved).toBe(true);
    expect(rec.steps.some((s) => s.kind === "unknown")).toBe(false);
    const cases = rec.steps.filter((s) => s.kind === "case");
    expect(cases).toHaveLength(2);
    expect(cases.every((s) => !s.progress?.suspicious)).toBe(true);
    const first = cases[0].primitive!;
    if (first.type !== "cornerComm") throw new Error("unreachable");
    expect(first.targets.map(refName)).toEqual(["UBR", "FDL"]);
  });
});

describe("mistake diagnosis", () => {
  it("steps after a stray block are judged counterfactually, not as follow-up errors", () => {
    // intended E1 E2 C1; after E1 the solver fumbles a garbage block, then
    // keeps executing the memo correctly (the algs are position-independent)
    const intended = [EDGE_COMM_1, EDGE_COMM_2, CORNER_COMM_1].map((a) => algToOuterMoves(a));
    const start = applyMoves(solvedState(), invertOuterMoves(intended.flat()));
    const junk = algToOuterMoves("F2 D R'"); // does not cancel, not a case
    const moves: TimedMove[] = [];
    let t = 1000;
    for (const algMoves of [intended[0], junk, intended[1], intended[2]]) {
      t += 900;
      for (const m of algMoves) {
        moves.push({ move: m, t });
        t += 150;
      }
    }
    const rec = reconstructSolve(start, moves, buffers);
    expect(rec.solved).toBe(false);
    const cases = rec.steps.filter((s) => s.kind === "case");
    expect(cases).toHaveLength(3);
    // none of the post-block algs are flagged: in the timeline without the
    // block they solve exactly what the memo said
    expect(cases.every((s) => !s.progress?.suspicious)).toBe(true);
    expect(rec.findings).toHaveLength(1);
    expect(rec.findings[0].kind).toBe("stray-block");
    expect(rec.steps[rec.findings[0].wrongStepIdx!].kind).toBe("unknown");
  });
  it("a forgotten lone flip is reported at the end", () => {
    const FLIP = "R' F R U' M' U2 M U' S R' F' R S'"; // UF & UR flip
    const perAlg = [EDGE_COMM_1, CORNER_COMM_1, FLIP].map((a) => algToOuterMoves(a));
    const start = applyMoves(solvedState(), invertOuterMoves(perAlg.flat()));
    const moves: TimedMove[] = [];
    let t = 1000;
    for (const algMoves of perAlg.slice(0, 2)) {
      t += 900;
      for (const m of algMoves) {
        moves.push({ move: m, t });
        t += 150;
      }
    }
    const rec = reconstructSolve(start, moves, buffers);
    expect(rec.diagnosis?.kind).toBe("missing-case");
    expect(rec.diagnosis?.missing?.type).toBe("flip");
    // no flip steps exist to sit next to, so it lands at the very end
    expect(rec.diagnosis?.insertAfterStepIdx).toBe(1);
  });

  it("flags a comm that takes one target when the full pair was available", () => {
    // state calls for EDGE_COMM_1 (UF: UR UB); the user shoots UR but takes
    // the wrong second target (LU), solving only one piece
    const intended = algToOuterMoves(EDGE_COMM_1);
    const start = applyMoves(solvedState(), invertOuterMoves(intended));
    const detour = algToOuterMoves("[S', L F' L']"); // UF: UR LU (BE)
    const moves: TimedMove[] = detour.map((m, i) => ({ move: m, t: 1000 + i * 150 }));
    const rec = reconstructSolve(start, moves, buffers);
    const cases = rec.steps.filter((s) => s.kind === "case");
    expect(cases).toHaveLength(1);
    const pr = cases[0].progress!;
    expect(pr.newlySolved).toBe(1);
    expect(pr.suspicious).toBe(false);
    expect(pr.suboptimal).toBe(true);
    expect(pr.suggestion?.kind).toBe("pair");
    if (pr.suggestion?.kind === "pair") {
      expect(pr.suggestion.pair.map(refName)).toEqual(["UR", "UB"]);
    }
  });
  it("a forgotten comm is reported as the missing case", () => {
    // scramble expects three cases, only two are executed
    const perAlg = [EDGE_COMM_1, EDGE_COMM_2, CORNER_COMM_1].map((a) => algToOuterMoves(a));
    const start = applyMoves(solvedState(), invertOuterMoves(perAlg.flat()));
    const moves: TimedMove[] = [];
    let t = 1000;
    for (const algMoves of perAlg.slice(0, 2)) {
      t += 900;
      for (const m of algMoves) {
        moves.push({ move: m, t });
        t += 150;
      }
    }
    const rec = reconstructSolve(start, moves, buffers);
    expect(rec.solved).toBe(false);
    expect(rec.diagnosis?.kind).toBe("missing-case");
    expect(rec.diagnosis?.missing?.type).toBe("cornerComm");
  });

  it("an inverted comm is recognized as such", () => {
    // the scramble expects EDGE_COMM_1, the user executes its inverse
    const intended = algToOuterMoves(EDGE_COMM_1);
    const start = applyMoves(solvedState(), invertOuterMoves(intended));
    const executed = invertOuterMoves(intended);
    const moves: TimedMove[] = executed.map((m, i) => ({ move: m, t: 1000 + i * 150 }));
    const rec = reconstructSolve(start, moves, buffers);
    expect(rec.solved).toBe(false);
    expect(rec.diagnosis?.kind).toBe("wrong-case");
    expect(rec.diagnosis?.wrongStepIdx).toBe(0);
    expect(rec.diagnosis?.invertedExecution).toBe(true);
    expect(rec.diagnosis?.shouldHaveBeen?.type).toBe("edgeComm");
  });

  it("a wrong comm is identified with what it should have been", () => {
    // the scramble expects EDGE_COMM_1 then CORNER_COMM_1; the user does
    // CORNER_COMM_2 instead of CORNER_COMM_1 (cleanly executed, wrong case)
    const intended = [EDGE_COMM_1, CORNER_COMM_1].map((a) => algToOuterMoves(a));
    const start = applyMoves(solvedState(), invertOuterMoves(intended.flat()));
    const executedAlgs = [EDGE_COMM_1, CORNER_COMM_2].map((a) => algToOuterMoves(a));
    const moves: TimedMove[] = [];
    let t = 1000;
    for (const algMoves of executedAlgs) {
      t += 900;
      for (const m of algMoves) {
        moves.push({ move: m, t });
        t += 150;
      }
    }
    const rec = reconstructSolve(start, moves, buffers);
    expect(rec.solved).toBe(false);
    // both comms parse cleanly, but the corner comm was the wrong one
    expect(rec.steps.filter((s) => s.kind === "case")).toHaveLength(2);
    expect(rec.diagnosis?.kind).toBe("wrong-case");
    expect(rec.diagnosis?.wrongStepIdx).toBe(1);
    expect(rec.diagnosis?.invertedExecution).toBe(false);
    const should = rec.diagnosis?.shouldHaveBeen;
    expect(should?.type).toBe("cornerComm");
    if (should?.type === "cornerComm") {
      // CORNER_COMM_1 solves UFR: UBR UBL
      expect(should.targets.map(refName)).toEqual(["UBR", "UBL"]);
    }
  });

  it("flags a comm that solves nothing and suggests the real continuation", () => {
    // scramble expects E1 then E2; the user mistraces and does E3 instead of E2
    const intended = [EDGE_COMM_1, EDGE_COMM_2].map((a) => algToOuterMoves(a));
    const start = applyMoves(solvedState(), invertOuterMoves(intended.flat()));
    const executedAlgs = [EDGE_COMM_1, EDGE_COMM_3].map((a) => algToOuterMoves(a));
    const moves: TimedMove[] = [];
    let t = 1000;
    for (const algMoves of executedAlgs) {
      t += 900;
      for (const m of algMoves) {
        moves.push({ move: m, t });
        t += 150;
      }
    }
    const rec = reconstructSolve(start, moves, buffers);
    const cases = rec.steps.filter((s) => s.kind === "case");
    expect(cases[0].progress?.suspicious).toBe(false);
    expect(cases[1].progress?.suspicious).toBe(true);
    expect(cases[1].progress?.newlySolved).toBe(0);
    const sug = cases[1].progress?.suggestion;
    expect(sug?.kind).toBe("pair");
    if (sug?.kind === "pair") {
      // the state called for EDGE_COMM_2's targets: UL then UB
      expect(sug.pair.map(refName)).toEqual(["UL", "UB"]);
    }
  });

  it("diagnoses a wrong edge comm and a forgotten corner comm independently", () => {
    // intended: E1 E2 C1 C2 — executed: E1, E3 (wrong), C1 (C2 forgotten)
    const intended = [EDGE_COMM_1, EDGE_COMM_2, CORNER_COMM_1, CORNER_COMM_2].map((a) =>
      algToOuterMoves(a),
    );
    const start = applyMoves(solvedState(), invertOuterMoves(intended.flat()));
    const executedAlgs = [EDGE_COMM_1, EDGE_COMM_3, CORNER_COMM_1].map((a) => algToOuterMoves(a));
    const moves: TimedMove[] = [];
    let t = 1000;
    for (const algMoves of executedAlgs) {
      t += 900;
      for (const m of algMoves) {
        moves.push({ move: m, t });
        t += 150;
      }
    }
    const rec = reconstructSolve(start, moves, buffers);
    expect(rec.solved).toBe(false);
    expect(rec.findings).toHaveLength(2);
    const edgeFinding = rec.findings.find((f) => f.shouldHaveBeen?.type === "edgeComm");
    const cornerFinding = rec.findings.find((f) => f.missing?.type === "cornerComm");
    expect(edgeFinding?.kind).toBe("wrong-case");
    expect(edgeFinding?.wrongStepIdx).toBe(1);
    if (edgeFinding?.shouldHaveBeen?.type === "edgeComm") {
      expect(edgeFinding.shouldHaveBeen.targets.map(refName)).toEqual(["UL", "UB"]);
    }
    expect(cornerFinding?.kind).toBe("missing-case");
    expect(cornerFinding?.insertAfterStepIdx).toBe(2);
  });

  it("a forgotten comm in the middle is fitted where it makes sense", () => {
    // scramble expects edge, edge, corner — the second edge comm is skipped
    const perAlg = [EDGE_COMM_1, EDGE_COMM_2, CORNER_COMM_1].map((a) => algToOuterMoves(a));
    const start = applyMoves(solvedState(), invertOuterMoves(perAlg.flat()));
    const executed = [perAlg[0], perAlg[2]];
    const moves: TimedMove[] = [];
    let t = 1000;
    for (const algMoves of executed) {
      t += 900;
      for (const m of algMoves) {
        moves.push({ move: m, t });
        t += 150;
      }
    }
    const rec = reconstructSolve(start, moves, buffers);
    expect(rec.solved).toBe(false);
    expect(rec.diagnosis?.kind).toBe("missing-case");
    expect(rec.diagnosis?.missing?.type).toBe("edgeComm");
    // fits after the first (edge) step, not after the corner comm
    expect(rec.diagnosis?.insertAfterStepIdx).toBe(0);
  });

  it("a single wrong move is located, with the rest validated", () => {
    const { start, moves } = makeSolve([EDGE_COMM_1, CORNER_COMM_1]);
    // flip the direction of the 4th move of the first comm
    const wrong = moves.map((m, i) =>
      i === 3 ? { ...m, move: { ...m.move, amount: ((4 - m.move.amount) % 4) as 1 | 2 | 3 } } : m,
    );
    const rec = reconstructSolve(start, wrong, buffers);
    expect(rec.solved).toBe(false);
    expect(rec.diagnosis?.kind).toBe("small-mistake");
    expect(rec.diagnosis?.atMoveIdx).toBe(3);
    expect(rec.diagnosis?.played).toEqual(wrong[3].move);
    expect(rec.diagnosis?.shouldHave).toEqual(moves[3].move);
    expect(rec.diagnosis?.hypothetical?.solved).toBe(true);
    const hypoCases = rec.diagnosis!.hypothetical!.steps.filter((s) => s.kind === "case");
    expect(hypoCases.map((s) => s.primitive!.type)).toEqual(["edgeComm", "cornerComm"]);
  });

  it("an extra stray move is located", () => {
    const { start, moves } = makeSolve([EDGE_COMM_1, CORNER_COMM_1]);
    const stray: TimedMove = { move: { face: "F", amount: 1 }, t: moves[2].t + 50 };
    const withStray = [...moves.slice(0, 3), stray, ...moves.slice(3)];
    const rec = reconstructSolve(start, withStray, buffers);
    expect(rec.solved).toBe(false);
    expect(rec.diagnosis?.kind).toBe("small-mistake");
    expect(rec.diagnosis?.atMoveIdx).toBe(3);
    expect(rec.diagnosis?.played).toEqual(stray.move);
    expect(rec.diagnosis?.shouldHave).toBeNull();
    expect(rec.diagnosis?.hypothetical?.solved).toBe(true);
  });

  it("a missing move is located and supplied", () => {
    const { start, moves } = makeSolve([EDGE_COMM_1, CORNER_COMM_1]);
    const dropped = moves[2];
    const withoutMove = [...moves.slice(0, 2), ...moves.slice(3)];
    const rec = reconstructSolve(start, withoutMove, buffers);
    expect(rec.solved).toBe(false);
    expect(rec.diagnosis?.kind).toBe("small-mistake");
    expect(rec.diagnosis?.atMoveIdx).toBe(2);
    expect(rec.diagnosis?.played).toBeNull();
    expect(rec.diagnosis?.shouldHave).toEqual(dropped.move);
    expect(rec.diagnosis?.hypothetical?.solved).toBe(true);
  });
});
