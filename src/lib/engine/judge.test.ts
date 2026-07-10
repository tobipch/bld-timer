import { describe, expect, it } from "vitest";
import { algToOuterMoves, invertOuterMoves } from "../cube/alg";
import { applyMoves, solvedState, type OuterMove } from "../cube/state";
import { buffersFromNames } from "./classify";
import { defaultBuffers } from "../cube/speffz";
import { defaultProfile, type TechniqueProfile } from "./profile";
import type { JudgeContext } from "./judge";
import { reconstructSolve, type TimedMove } from "./reconstruct";

const bufs = defaultBuffers();
const buffers = buffersFromNames(bufs.corners, bufs.edges);

function ctxWith(overrides: Partial<TechniqueProfile>): JudgeContext {
  return {
    profile: { ...defaultProfile(), onboarded: true, ...overrides },
    standardCorner: buffers.corners[0],
    standardEdge: buffers.edges[0],
    orozcoCornerHelper: buffers.corners[1], // UBL
    orozcoEdgeHelper: buffers.edges[1], // UB
  };
}

function runSolve(algs: string[], ctx: JudgeContext, executed?: string[]) {
  const intended = algs.map((a) => algToOuterMoves(a));
  const start = applyMoves(solvedState(), invertOuterMoves(intended.flat()));
  const done = (executed ?? algs).map((a) => algToOuterMoves(a));
  const moves: TimedMove[] = [];
  let t = 1000;
  for (const algMoves of done) {
    t += 900;
    for (const m of algMoves) {
      moves.push({ move: m, t });
      t += 150;
    }
  }
  return reconstructSolve(start, moves, buffers, undefined, true, ctx);
}

const E1 = "[R2 U': [R2, S]]"; // UF: UR UB
const E2 = "[U' M2 U': [M, U2]]"; // UF: UL UB
const E3 = "[U: [L' E' L, U2]]"; // UF: UB LD
const C1 = "[R' D R U: [R' D' R, U]]"; // UFR: UBR UBL
const PSEUDO = "[U' M2 U: [M, U2]]"; // UF: UB UL (parks both)
const PARITY_ALT = "U2 r2 D' r2 U' r2 D r2 D' r2 D r2 U' r2 U r2 U2"; // swaps UB/UL
const PARITY_STD = "r2 D' r2 U' r2 D r2 D' r2 D r2 U' r2 U r2"; // UFR<->UBL, UF<->UR

describe("profile judge", () => {
  it("a correct 3-style solve produces no flags", () => {
    const rec = runSolve([E1, E2, C1], ctxWith({}));
    expect(rec.solved).toBe(true);
    const cases = rec.steps.filter((s) => s.kind === "case");
    expect(cases.length).toBe(3);
    expect(cases.every((s) => !s.progress?.suspicious)).toBe(true);
  });

  it("a mistraced comm is flagged with a reason and the expected continuation", () => {
    // state calls for E2 (UL UB); the user does E3 (UB LD) instead
    const rec = runSolve([E1, E2], ctxWith({}), [E1, E3]);
    const cases = rec.steps.filter((s) => s.kind === "case");
    expect(cases[0].progress?.suspicious).toBeFalsy();
    expect(cases[1].progress?.suspicious).toBe(true);
    expect(cases[1].progress?.reason).toContain("first target");
    expect(cases[1].progress?.suggestion?.kind).toBe("pair");
  });

  it("floating buffers off: a foreign-buffer cycle is flagged", () => {
    // UB-buffer comm from the fixtures: [U, R E' R'] is UB: UR LB (BH)
    const rec = runSolve(["[U, R E' R']"], ctxWith({ floating: false }));
    const step = rec.steps.find((s) => s.kind === "case")!;
    expect(step.progress?.suspicious).toBe(true);
    expect(step.progress?.reason).toContain("floating");
  });

  it("floating buffers on: the same cycle is fine", () => {
    const rec = runSolve(["[U, R E' R']"], ctxWith({ floating: true }));
    const step = rec.steps.find((s) => s.kind === "case")!;
    expect(step.progress?.suspicious).toBeFalsy();
  });

  it("pseudo swap is valid only when the profile enables it", () => {
    const on = runSolve([PSEUDO, C1, PARITY_ALT], ctxWith({ pseudoSwap: true }));
    expect(on.solved).toBe(true);
    const onEdge = on.steps.find((s) => s.primitive?.type === "edgeComm")!;
    expect(onEdge.progress?.suspicious).toBeFalsy();

    const off = runSolve([PSEUDO, C1, PARITY_ALT], ctxWith({ pseudoSwap: false }));
    const offEdge = off.steps.find((s) => s.primitive?.type === "edgeComm")!;
    expect(offEdge.progress?.suspicious).toBe(true);
  });

  it("OP corners: swap steps are judged on the corner orbit only", () => {
    // a 2c2e swap alg used OP-style: buffer UFR, target = where its content belongs
    const ctx = ctxWith({ cornerMethod: "op" });
    const rec = runSolve([PARITY_STD], ctx);
    const step = rec.steps.find((s) => s.primitive?.type === "parity")!;
    expect(step.progress?.suspicious).toBeFalsy();
  });

  it("Orozco: a cycle through the helper is accepted even out of forced order", () => {
    // needs E-then-C1; the user starts with C1 — its cycle includes the
    // helper UBL, which Orozco allows
    const plain = runSolve([C1, "[F: [R' D' R, U2]]"], ctxWith({}), ["[F: [R' D' R, U2]]", C1]);
    const first3 = plain.steps.find((s) => s.kind === "case")!;
    expect(first3.progress?.suspicious).toBe(true); // 3-style: out of order

    const oro = runSolve([C1, "[F: [R' D' R, U2]]"], ctxWith({ cornerMethod: "orozco" }), [
      "[F: [R' D' R, U2]]",
      C1,
    ]);
    const firstO = oro.steps.find((s) => s.kind === "case")!;
    expect(firstO.progress?.suspicious).toBeFalsy(); // helper UBL is in the cycle
  });
});
