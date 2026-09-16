import { describe, expect, it } from "vitest";
import { computeFlow, DEFAULT_FLOW_OPTIONS, formatFlow, median } from "./flow";

/** Turn timestamps from a list of gaps, starting at 1000. */
function times(gaps: number[]): number[] {
  const out = [1000];
  for (const g of gaps) out.push(out[out.length - 1] + g);
  return out;
}

const steady = (n: number, gap: number) => times(new Array(n).fill(gap));

describe("median", () => {
  it("handles odd and even lengths", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBe(0);
  });
});

describe("computeFlow", () => {
  it("has nothing to measure below two turns", () => {
    expect(computeFlow([]).flow).toBeNull();
    expect(computeFlow([1000]).flow).toBeNull();
  });

  it("calls an even execution fully fluent", () => {
    const r = computeFlow(steady(20, 150));
    expect(r.flow).toBe(1);
    expect(r.pauses).toBe(0);
    expect(r.execMs).toBe(20 * 150);
  });

  it("scales the threshold with the solver's own speed", () => {
    // a slow but even solver is fluent, not paused
    expect(computeFlow(steady(20, 400)).flow).toBe(1);
    // and the threshold follows: 3x the 400 ms median
    expect(computeFlow(steady(20, 400)).thresholdMs).toBe(1200);
  });

  it("keeps the floor for fast solvers", () => {
    // 3x a 50 ms median would be 150 ms; the floor wins
    expect(computeFlow(steady(20, 50)).thresholdMs).toBe(DEFAULT_FLOW_OPTIONS.floorMs);
  });

  it("counts only the part of a gap above the threshold", () => {
    // 19 gaps of 50 ms (3x the median stays under the floor, so the
    // threshold is 250) and one long one
    const r = computeFlow(times([...new Array(19).fill(50), 1250]));
    expect(r.thresholdMs).toBe(250);
    expect(r.pauses).toBe(1);
    expect(r.pausedMs).toBe(1250 - 250);
    expect(r.execMs).toBe(19 * 50 + 1250);
    expect(r.flow).toBeCloseTo((2200 - 1000) / 2200, 6);
  });

  it("has no cliff at the threshold", () => {
    const below = computeFlow(times([...new Array(19).fill(50), 249]));
    const above = computeFlow(times([...new Array(19).fill(50), 251]));
    expect(below.flow).toBe(1);
    expect(above.flow! > 0.999).toBe(true);
  });

  it("drops with the number of pauses", () => {
    const one = computeFlow(times([...new Array(18).fill(50), 1000, 50]));
    const three = computeFlow(times([...new Array(14).fill(50), 1000, 50, 1000, 50, 1000, 50]));
    expect(three.flow!).toBeLessThan(one.flow!);
    expect(three.pauses).toBe(3);
  });

  it("is 50% when standing still as long as turning", () => {
    // 19 gaps of 50 ms (threshold 250) and one gap of 1450: 1200 ms of the
    // 2400 ms execution were spent standing still
    const r = computeFlow(times([...new Array(19).fill(50), 1450]));
    expect(r.execMs).toBe(2400);
    expect(r.pausedMs).toBe(1200);
    expect(r.flow).toBe(0.5);
  });

  it("merges turns the cube reports at the same moment", () => {
    // a slice arrives as two outer turns with the same timestamp
    const raw = [1000, 1000, 1150, 1155, 1300, 1300];
    const r = computeFlow(raw);
    expect(r.turns).toBe(3);
    expect(r.execMs).toBe(300);
  });

  it("ignores the gap before the stop key by construction", () => {
    // the window ends with the last turn, so whatever happens after it
    // cannot show up here at all
    const r = computeFlow(steady(10, 150));
    expect(r.execMs).toBe(1500);
    expect(r.flow).toBe(1);
  });

  it("respects a configured threshold", () => {
    const gaps = [...new Array(19).fill(100), 400];
    const strict = computeFlow(times(gaps), { floorMs: 200, factor: 2 });
    const loose = computeFlow(times(gaps), { floorMs: 1000, factor: 3 });
    expect(strict.thresholdMs).toBe(200);
    expect(strict.pausedMs).toBe(200);
    expect(loose.flow).toBe(1);
  });

  it("never leaves 0..1", () => {
    const r = computeFlow(times([100, 100, 100, 100, 100_000]));
    expect(r.flow!).toBeGreaterThanOrEqual(0);
    expect(r.flow!).toBeLessThanOrEqual(1);
  });
});

describe("formatFlow", () => {
  it("prints a percentage, and a dash for nothing", () => {
    expect(formatFlow(1)).toBe("100.0%");
    expect(formatFlow(0.8735)).toBe("87.4%");
    expect(formatFlow(null)).toBe("—");
  });
});
