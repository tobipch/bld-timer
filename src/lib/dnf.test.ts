import { describe, expect, it } from "vitest";
import { categoriesOf, categoryIdsOf, dnfBreakdown, formatPct } from "./dnf";
import type { DnfCategory, SolveRecord } from "./storage/types";

const cats: DnfCategory[] = [
  { id: "memo", name: "Memo lost", color: "#c77dff", sortIndex: 0 },
  { id: "edge", name: "Edge exec", color: "#4da3ff", sortIndex: 1 },
  { id: "cancel", name: "Wrong cancel", color: "#ff9f7d", sortIndex: 2 },
];

function solve(result: "ok" | "dnf", dnfCategoryIds?: string[]): SolveRecord {
  return {
    id: Math.random().toString(36).slice(2),
    sessionId: "s",
    startedAt: 0,
    result,
    totalMs: 60000,
    memoMs: 20000,
    execMs: 40000,
    scramble: "",
    moves: [],
    // the breakdown never looks at the reconstruction
    reconstruction: undefined as never,
    dnfCategoryIds,
  };
}

describe("categoryIdsOf", () => {
  it("reads the list", () => {
    expect(categoryIdsOf(solve("dnf", ["edge", "cancel"]))).toEqual(["edge", "cancel"]);
  });

  it("still counts the single reason of older solves", () => {
    expect(categoryIdsOf({ dnfCategoryIds: null, dnfCategoryId: "memo" })).toEqual(["memo"]);
    expect(categoryIdsOf({ dnfCategoryIds: [], dnfCategoryId: "memo" })).toEqual(["memo"]);
    expect(categoryIdsOf({ dnfCategoryIds: null, dnfCategoryId: null })).toEqual([]);
  });

  it("resolves reasons and drops deleted ones", () => {
    expect(categoriesOf(solve("dnf", ["cancel", "edge", "gone"]), cats).map((c) => c.name)).toEqual([
      "Edge exec",
      "Wrong cancel",
    ]);
  });
});

describe("dnfBreakdown", () => {
  it("reports the DNF rate and the share of every reason", () => {
    const solves = [
      solve("ok"),
      solve("ok"),
      solve("dnf", ["memo"]),
      solve("dnf", ["memo"]),
      solve("dnf", ["edge"]),
    ];
    const b = dnfBreakdown(solves, cats);
    expect(b.total).toBe(5);
    expect(b.dnf).toBe(3);
    expect(b.dnfRate).toBeCloseTo(0.6);
    expect(b.successRate).toBeCloseTo(0.4);
    expect(b.multiTagged).toBe(false);
    // biggest reason first, with both shares
    expect(b.rows[0].category?.name).toBe("Memo lost");
    expect(b.rows[0].count).toBe(2);
    expect(b.rows[0].ofDnf).toBeCloseTo(2 / 3);
    expect(b.rows[0].ofAll).toBeCloseTo(2 / 5);
  });

  it("counts a solve under each of its reasons", () => {
    // one solve, two reasons: it shows up in both rows
    const b = dnfBreakdown([solve("ok"), solve("dnf", ["edge", "cancel"])], cats);
    expect(b.dnf).toBe(1);
    expect(b.multiTagged).toBe(true);
    expect(b.rows.map((r) => [r.category?.name, r.count])).toEqual([
      ["Edge exec", 1],
      ["Wrong cancel", 1],
    ]);
    // each reason applies to the one DNF, so the shares add up past 100%
    expect(b.rows[0].ofDnf).toBe(1);
    expect(b.rows[1].ofDnf).toBe(1);
    // the bar stays a partition: the DNF slices sum to the DNF rate
    const dnfBar = b.rows.reduce((sum, r) => sum + r.barShare, 0);
    expect(dnfBar).toBeCloseTo(0.5);
  });

  it("buckets untagged DNFs and DNFs whose reasons were all deleted", () => {
    const b = dnfBreakdown([solve("dnf"), solve("dnf", ["deleted-id"]), solve("ok")], cats);
    expect(b.untagged).toBe(2);
    expect(b.rows).toHaveLength(1);
    expect(b.rows[0].category).toBeNull();
  });

  it("has no rate without solves", () => {
    const b = dnfBreakdown([], cats);
    expect(b.dnfRate).toBeNull();
    expect(b.rows).toEqual([]);
    expect(formatPct(b.dnfRate)).toBe("—");
  });
});
