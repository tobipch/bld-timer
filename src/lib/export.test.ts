import { describe, expect, it } from "vitest";
import { algToOuterMoves, invertOuterMoves, outerMoveToString } from "./cube/alg";
import { applyMoves, solvedState } from "./cube/state";
import { buffersFromNames } from "./engine/classify";
import { reconstructSolve, type TimedMove } from "./engine/reconstruct";
import { defaultBuffers, defaultLetterScheme } from "./cube/speffz";
import { exportSolvesMarkdown, solvesWithFeedback } from "./export";
import type { SolveRecord } from "./storage/types";

const bufs = defaultBuffers();
const buffers = buffersFromNames(bufs.corners, bufs.edges);

function makeRecord(algs: string[], note: string | null, confirmed: number[] = []): SolveRecord {
  const perAlg = algs.map((a) => algToOuterMoves(a));
  const start = applyMoves(solvedState(), invertOuterMoves(perAlg.flat()));
  const moves: TimedMove[] = [];
  let t = 1000;
  for (const algMoves of perAlg) {
    t += 900;
    for (const m of algMoves) {
      moves.push({ move: m, t });
      t += 150;
    }
  }
  const rec = reconstructSolve(start, moves, buffers);
  return {
    id: "s1",
    sessionId: "x",
    startedAt: 1750000000000,
    result: rec.solved ? "ok" : "dnf",
    totalMs: 25000,
    memoMs: 9000,
    execMs: 16000,
    scramble: "R U R' U'", // placeholder scramble text
    moves: moves.map((m) => ({ m: outerMoveToString(m.move), t: m.t })),
    reconstruction: rec,
    note,
    confirmedFindings: confirmed,
  };
}

describe("feedback export", () => {
  it("contains everything needed to reproduce and judge a solve", () => {
    // forgotten corner comm -> a missing-case finding
    const record = makeRecord(["[R2 U': [R2, S]]"], "Hier fehlte der Corner-Comm.", [0]);
    // fake the DNF finding structurally: use a real DNF instead
    const dnf = makeRecord(["[R2 U': [R2, S]]", "[R' D R U: [R' D' R, U]]"], "note text");
    dnf.moves = dnf.moves.slice(0, dnf.moves.length); // unchanged
    const md = exportSolvesMarkdown([record, dnf], defaultLetterScheme(), "z2");
    expect(md).toContain("# BLD Timer — solve feedback");
    expect(md).toContain("orientation setting: z2");
    expect(md).toContain("letter scheme: Speffz");
    expect(md).toContain("Scramble: `R U R' U'`");
    expect(md).toContain("> Hier fehlte der Corner-Comm.");
    expect(md).toContain("Edge comm —");
    expect(md).toContain("### Raw data (for reproducing)");
    expect(md).toMatch(/@0 /); // relative timestamps
  });

  it("marks confirmed findings", () => {
    // a solve with a forgotten case has a finding; index 0 confirmed
    const perAlg = ["[R2 U': [R2, S]]", "[R' D R U: [R' D' R, U]]"].map((a) => algToOuterMoves(a));
    const start = applyMoves(solvedState(), invertOuterMoves(perAlg.flat()));
    const moves: TimedMove[] = perAlg[0].map((m, i) => ({ move: m, t: 1000 + i * 150 }));
    const rec = reconstructSolve(start, moves, buffers);
    expect(rec.findings.length).toBeGreaterThan(0);
    const record: SolveRecord = {
      id: "s2",
      sessionId: "x",
      startedAt: 1750000000000,
      result: "dnf",
      totalMs: 20000,
      memoMs: 8000,
      execMs: 12000,
      scramble: "F2 D",
      moves: moves.map((m) => ({ m: outerMoveToString(m.move), t: m.t })),
      reconstruction: rec,
      note: null,
      confirmedFindings: [0],
    };
    const md = exportSolvesMarkdown([record], defaultLetterScheme(), "");
    expect(md).toContain("[✓ user confirmed]");
    expect(md).toContain("### Engine findings");
  });

  it("selects solves carrying feedback and sorts newest first", () => {
    const a = { ...makeRecord(["[R2 U': [R2, S]]"], "x"), startedAt: 1 };
    const b = { ...makeRecord(["[R2 U': [R2, S]]"], null, [0]), startedAt: 2 };
    const c = { ...makeRecord(["[R2 U': [R2, S]]"], null, []), startedAt: 3 };
    const picked = solvesWithFeedback([a, b, c]);
    expect(picked.map((s) => s.startedAt)).toEqual([2, 1]);
  });
});
