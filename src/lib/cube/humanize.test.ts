import { describe, expect, it } from "vitest";
import { algToOuterMoves } from "./alg";
import { humanizeMoves } from "./humanize";
import { applyMoves, solvedState, statesEqual } from "./state";
import fixtures from "../engine/fixtures/excel-algs.json";

/** Re-translate a humanized (user-frame) alg back into core moves. */
const recore = (human: string, orientation: string) =>
  algToOuterMoves(orientation ? `${orientation} ${human}` : human);

describe("humanizeMoves", () => {
  it("reconstructs Tobias' EQ comm under z2 orientation", () => {
    // executing [L' U' L U, M'] while holding z2 produces these core moves
    const core = algToOuterMoves("z2 [L' U' L U, M']");
    expect(humanizeMoves(core, "z2")).toBe("[L' U' L U, M']");
  });

  it("does not fold corner-comm move pairs into slices that break the brackets", () => {
    // adjacent D/U' here are plain moves, not an E
    const bt = algToOuterMoves("z2 [D: [U', R D' R']]");
    expect(humanizeMoves(bt, "z2")).toBe("[D: [U', R D' R']]");
    const gp = algToOuterMoves("z2 [U R' D: [R U' R', D2]]");
    expect(humanizeMoves(gp, "z2")).toBe("[U R' D: [R U' R', D2]]");
  });

  it("picks the fold reading that factors when slices are genuinely involved", () => {
    const pf = algToOuterMoves("z2 [U E R: [S, R2]]");
    expect(humanizeMoves(pf, "z2")).toBe("[U E R: [S, R2]]");
  });

  it("folds slices and restores commutator/conjugate notation", () => {
    const core = algToOuterMoves("[R2 U': [R2, S]]");
    expect(humanizeMoves(core, "")).toBe("[R2 U': [R2, S]]");
    expect(humanizeMoves(algToOuterMoves("[M', U2]"), "")).toBe("[M', U2]");
    expect(humanizeMoves(algToOuterMoves("[U' M2 U': [M, U2]]"), "")).toBe("[U' M2 U': [M, U2]]");
  });

  it("renders plain sequences without forcing a bracket structure", () => {
    expect(humanizeMoves(algToOuterMoves("R U R' F'"), "")).toBe("R U R' F'");
    expect(humanizeMoves(algToOuterMoves("M2"), "")).toBe("M2");
  });

  it("merges doubled quarter turns", () => {
    expect(humanizeMoves(algToOuterMoves("R R U U' F"), "")).toBe("R2 F");
  });

  it("round-trips every fixture alg (state-identical, plain orientation)", () => {
    const all = [
      ...fixtures.edgeComms.map((f) => f.alg),
      ...fixtures.cornerComms.map((f) => f.alg),
      ...fixtures.parity.map((f) => f.alg),
      ...fixtures.ltct.map((f) => f.alg),
      ...fixtures.flips2.map((f) => f.alg),
    ];
    let checked = 0;
    for (const alg of all) {
      let core;
      try {
        core = algToOuterMoves(alg);
      } catch {
        continue; // known sheet typos
      }
      const human = humanizeMoves(core, "");
      const a = applyMoves(solvedState(), core);
      const b = applyMoves(solvedState(), recore(human, ""));
      if (!statesEqual(a, b)) {
        expect.fail(`humanize changed the state:\n  alg   ${alg}\n  human ${human}`);
      }
      checked++;
    }
    expect(checked).toBeGreaterThan(3000);
  });

  it("round-trips under a z2 orientation", () => {
    for (const fx of fixtures.edgeComms.slice(0, 200)) {
      const core = algToOuterMoves(`z2 ${fx.alg}`);
      const human = humanizeMoves(core, "z2");
      const a = applyMoves(solvedState(), core);
      const b = applyMoves(solvedState(), recore(human, "z2"));
      if (!statesEqual(a, b)) {
        expect.fail(`z2 humanize changed the state:\n  alg   ${fx.alg}\n  human ${human}`);
      }
    }
  });
});
