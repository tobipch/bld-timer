import { describe, expect, it } from "vitest";
import { aoN, bestAoN, bestSingle, formatAvg, formatMs, formatPct, rollingAoN, scoreOf, successRate, trimCount } from "./stats";

const range = <T,>(n: number, f: (i: number) => T): T[] => Array.from({ length: n }, (_, i) => f(i));

describe("formatting", () => {
  it("prints times and percentages", () => {
    expect(formatMs(1234)).toBe("1.23");
    expect(formatMs(61_500)).toBe("1:01.50");
    expect(formatPct(0.5)).toBe("50%");
    expect(formatPct(null)).toBe("—");
    expect(formatAvg({ kind: "flow", value: 0.9125 })).toBe("91.3%");
    expect(formatAvg({ kind: "none" })).toBe("—");
  });
});

describe("trimCount", () => {
  it("follows the usual convention", () => {
    expect(trimCount(5)).toBe(1);
    expect(trimCount(12)).toBe(1);
    expect(trimCount(50)).toBe(3);
    expect(trimCount(100)).toBe(5);
  });
});

describe("aoN", () => {
  it("needs a full window", () => {
    expect(aoN([1, 1, 1, 1], 5)).toEqual({ kind: "none" });
  });

  it("drops the best and the worst", () => {
    // 0 and 1 are trimmed, the middle three average to 0.5
    expect(aoN([0, 0.4, 0.5, 0.6, 1], 5)).toEqual({ kind: "flow", value: 0.5 });
  });

  it("only looks at the last n", () => {
    const values = [0, 0, 0, 0, 0, 0.4, 0.5, 0.6, 0.5, 0.5];
    expect(aoN(values, 5)).toEqual({ kind: "flow", value: 0.5 });
  });

  it("lets a single bad attempt fall out of the window", () => {
    const withoutMiss = aoN([0.8, 0.8, 0.8, 0.8, 0.8], 5);
    const withMiss = aoN([0.8, 0.8, 0.8, 0.8, 0], 5);
    expect(withMiss).toEqual(withoutMiss);
  });

  it("does feel a second bad attempt", () => {
    const a = aoN([0.8, 0.8, 0.8, 0, 0], 5);
    expect(a.kind === "flow" && a.value).toBeCloseTo((0.8 + 0.8 + 0) / 3, 6);
  });

  it("trims 5% at each end of a long average", () => {
    // 50 values: three lowest and three highest dropped
    const values = [...range(3, () => 0), ...range(44, () => 0.5), ...range(3, () => 1)];
    expect(aoN(values, 50)).toEqual({ kind: "flow", value: 0.5 });
  });
});

describe("bestAoN", () => {
  it("finds the best window anywhere in the history", () => {
    const values = [0.9, 0.9, 0.9, 0.9, 0.9, 0.2, 0.2, 0.2, 0.2, 0.2];
    expect(bestAoN(values, 5)).toEqual({ kind: "flow", value: 0.9 });
  });

  it("is none before the first full window", () => {
    expect(bestAoN([0.9, 0.9], 5)).toEqual({ kind: "none" });
  });

  it("never beats the best single", () => {
    const values = [0.3, 0.95, 0.4, 0.6, 0.7, 0.8, 0.55];
    const best = bestAoN(values, 5);
    expect(best.kind === "flow" && best.value).toBeLessThanOrEqual(0.95);
  });
});

describe("rollingAoN", () => {
  it("starts at the nth value", () => {
    const r = rollingAoN([0.5, 0.5, 0.5, 0.5, 0.5, 0.5], 5);
    expect(r.slice(0, 4)).toEqual([null, null, null, null]);
    expect(r[4]).toBeCloseTo(0.5, 6);
    expect(r[5]).toBeCloseTo(0.5, 6);
  });
});

describe("bestSingle", () => {
  it("is the highest flow", () => {
    expect(bestSingle([0.3, 0.9, 0.5])).toEqual({ kind: "flow", value: 0.9 });
    expect(bestSingle([])).toEqual({ kind: "none" });
  });
});

describe("successRate", () => {
  it("counts successes over attempts", () => {
    expect(successRate([{ result: "ok" }, { result: "dnf" }, { result: "ok" }])).toBeCloseTo(2 / 3, 6);
    expect(successRate([])).toBeNull();
  });
});

describe("scoreOf", () => {
  it("scores a failed attempt on its execution, like any other", () => {
    const moves = range(20, (i) => ({ m: "R", t: 1000 + i * 150 }));
    expect(scoreOf({ moves })).toBe(1);
  });

  it("scores an attempt given up before turning as zero", () => {
    expect(scoreOf({ moves: [] })).toBe(0);
    expect(scoreOf({ moves: [{ m: "R", t: 1000 }] })).toBe(0);
  });
});
