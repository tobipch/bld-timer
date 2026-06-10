import { describe, expect, it } from "vitest";
import { algToOuterMoves } from "../cube/alg";
import { applyMoves, diffStates, solvedState } from "../cube/state";
import { CORNER_SLOTS } from "../cube/geometry";
import { buffersFromNames, classifyDiff, refName, type Primitive } from "./classify";
import { defaultBuffers, SPEFFZ_CORNERS } from "../cube/speffz";
import fixtures from "./fixtures/excel-algs.json";

/**
 * Ground truth: every algorithm from Tobias' BLD sheets, with the case it
 * solves. The classifier must recognize each alg's effect on a solved cube
 * and produce exactly the buffer/targets the sheet says.
 */

const bufs = defaultBuffers();
const buffers = buffersFromNames(bufs.corners, bufs.edges);

function classify(alg: string): Primitive | null {
  const state = applyMoves(solvedState(), algToOuterMoves(alg));
  return classifyDiff(diffStates(solvedState(), state), buffers);
}

interface Failure {
  alg: string;
  expected: string;
  got: string;
}

function report(failures: Failure[], total: number, allow = 0) {
  if (failures.length > allow) {
    const sample = failures
      .slice(0, 12)
      .map((f) => `  expected ${f.expected}\n  got      ${f.got}\n  alg      ${f.alg}`)
      .join("\n---\n");
    expect.fail(`${failures.length}/${total} fixtures failed (allowed ${allow}):\n${sample}`);
  }
}

describe("excel fixtures", () => {
  it("recognizes all edge commutators with the right buffer and targets", () => {
    const failures: Failure[] = [];
    for (const fx of fixtures.edgeComms) {
      const expected = `edgeComm ${fx.buffer}: ${fx.first} ${fx.second}`;
      let got: string;
      try {
        const p = classify(fx.alg);
        got =
          p && p.type === "edgeComm"
            ? `edgeComm ${refName(p.buffer)}: ${refName(p.targets[0])} ${refName(p.targets[1])}`
            : `(${p?.type ?? "unrecognized"})`;
      } catch (err) {
        got = `error: ${err}`;
      }
      if (got !== expected) failures.push({ alg: fx.alg, expected, got });
    }
    report(failures, fixtures.edgeComms.length, ALLOWED.edge);
  });

  it("recognizes all corner commutators with the right buffer and targets", () => {
    const failures: Failure[] = [];
    for (const fx of fixtures.cornerComms) {
      const expected = `cornerComm ${fx.buffer}: ${fx.first} ${fx.second}`;
      let got: string;
      try {
        const p = classify(fx.alg);
        got =
          p && p.type === "cornerComm"
            ? `cornerComm ${refName(p.buffer)}: ${refName(p.targets[0])} ${refName(p.targets[1])}`
            : `(${p?.type ?? "unrecognized"})`;
      } catch (err) {
        got = `error: ${err}`;
      }
      if (got !== expected) failures.push({ alg: fx.alg, expected, got });
    }
    report(failures, fixtures.cornerComms.length, ALLOWED.corner);
  });

  it("recognizes parity algs", () => {
    const failures: Failure[] = [];
    for (const fx of fixtures.parity) {
      const expected = `parity ${fx.cornerBuffer}->${fx.cornerTarget} edges ${[...fx.edgeSwap].sort().join("/")}`;
      let got: string;
      try {
        const p = classify(fx.alg);
        got =
          p && p.type === "parity"
            ? `parity ${refName(p.cornerBuffer)}->${refName(p.cornerTarget)} edges ${p.edgeSwap
                .map(refName)
                .sort()
                .join("/")}`
            : `(${p?.type ?? "unrecognized"})`;
      } catch (err) {
        got = `error: ${err}`;
      }
      if (got !== expected) failures.push({ alg: fx.alg, expected, got });
    }
    report(failures, fixtures.parity.length, ALLOWED.parity);
  });

  it("recognizes LTCT algs including the twisted corner", () => {
    const failures: Failure[] = [];
    for (const fx of fixtures.ltct) {
      const expected = `ltct UFR->${fx.lastTarget} twist ${fx.twistSticker}`;
      let got: string;
      try {
        const p = classify(fx.alg);
        got =
          p && p.type === "ltct"
            ? `ltct ${refName(p.cornerBuffer)}->${refName(p.cornerTarget)} twist ${refName(p.twisted)}`
            : `(${p?.type ?? "unrecognized"})`;
      } catch (err) {
        got = `error: ${err}`;
      }
      if (got !== expected) failures.push({ alg: fx.alg, expected, got });
    }
    report(failures, fixtures.ltct.length, ALLOWED.ltct);
  });

  it("recognizes 2-flips", () => {
    const failures: Failure[] = [];
    for (const fx of fixtures.flips2) {
      const expected = `flip ${[...fx.edges].sort().join("/")}`;
      let got: string;
      try {
        const p = classify(fx.alg);
        got =
          p && p.type === "flip" ? `flip ${p.edges.map(refName).sort().join("/")}` : `(${p?.type ?? "unrecognized"})`;
      } catch (err) {
        got = `error: ${err}`;
      }
      if (got !== expected) failures.push({ alg: fx.alg, expected, got });
    }
    report(failures, fixtures.flips2.length, ALLOWED.flip);
  });

  it("recognizes 2-twists on the right corners", () => {
    const failures: Failure[] = [];
    for (const fx of fixtures.twists2) {
      const expected = `twist ${[fx.cw, fx.ccw].sort().join("/")}`;
      let got: string;
      try {
        const p = classify(fx.alg);
        got =
          p && p.type === "twist" && p.corners.length === 2
            ? `twist ${p.corners.map((c) => CORNER_SLOTS[c.sticker.slot]).sort().join("/")}`
            : `(${p?.type ?? "unrecognized"})`;
      } catch (err) {
        got = `error: ${err}`;
      }
      if (got !== expected) failures.push({ alg: fx.alg, expected, got });
    }
    report(failures, fixtures.twists2.length, ALLOWED.twist2);
  });

  it("recognizes 3-twists on the right corners", () => {
    // slot names in the sheet are sometimes written face-first (RFD = DFR)
    const norm = (s: string) => s.split("").sort().join("");
    const failures: Failure[] = [];
    for (const fx of fixtures.twists3) {
      const expected = `twist ${fx.corners.map(norm).sort().join("/")}`;
      let got: string;
      try {
        const p = classify(fx.alg);
        got =
          p && p.type === "twist" && p.corners.length === 3
            ? `twist ${p.corners.map((c) => norm(CORNER_SLOTS[c.sticker.slot])).sort().join("/")}`
            : `(${p?.type ?? "unrecognized"})`;
      } catch (err) {
        got = `error: ${err}`;
      }
      if (got !== expected) failures.push({ alg: fx.alg, expected, got });
    }
    report(failures, fixtures.twists3.length, ALLOWED.twist3);
  });

  it("3-twist letter annotations match the sticker-level twist cases", () => {
    const speffzToName = Object.fromEntries(Object.entries(SPEFFZ_CORNERS).map(([n, l]) => [l, n]));
    const failures: Failure[] = [];
    for (const fx of fixtures.twists3) {
      let p: Primitive | null;
      try {
        p = classify(fx.alg);
      } catch {
        continue; // unparseable sheet typos are covered by the slots test
      }
      if (!p || p.type !== "twist" || p.corners.length !== 3) continue; // covered above
      const gotNames = new Set(p.corners.map((c) => refName(c.sticker)));
      const wantNames = fx.letters.split("").map((l) => speffzToName[l]);
      // the cell letters name the two non-buffer corners' showing U/D stickers
      if (!wantNames.every((n) => gotNames.has(n))) {
        failures.push({
          alg: fx.alg,
          expected: `stickers include ${wantNames.join(",")}`,
          got: [...gotNames].join(","),
        });
      }
    }
    report(failures, fixtures.twists3.length, ALLOWED.twist3Letters);
  });
});

/**
 * Allowed failures — verified typos in the source spreadsheet, not engine
 * bugs (reported to Tobias):
 * - twist2: 12 cells contain algs with an odd quarter-turn count (a pure
 *   twist needs an even corner permutation parity), i.e. a move is missing;
 *   1 cell (cw DBL / ccw DBR) contains an alg that actually twists DFL/DBR.
 * - twist3: 1 incomplete alg (UFR buffer, CCW EQ); 1 alg containing a stray
 *   "D 2" (space inside D2).
 */
const ALLOWED = {
  edge: 0,
  corner: 0,
  parity: 0,
  ltct: 0,
  flip: 0,
  twist2: 13,
  twist3: 2,
  twist3Letters: 0,
};
