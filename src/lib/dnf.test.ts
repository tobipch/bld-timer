import { describe, expect, it } from "vitest";
import { categoryOf, dnfBreakdown, formatPct } from "./dnf";
import type { DnfCategory, SolveRecord } from "./storage/types";

const cats: DnfCategory[] = [
  { id: "memo", name: "Memo lost", color: "#c77dff", sortIndex: 0 },
  { id: "parity", name: "Parity", color: "#e8a13c", sortIndex: 1 },
];

function solve(result: "ok" | "dnf", dnfCategoryId?: string | null): SolveRecord {
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
    dnfCategoryId,
  };
}

describe("dnfBreakdown", () => {
  it("reports the DNF rate and the share of every reason", () => {
    const solves = [
      solve("ok"),
      solve("ok"),
      solve("dnf", "memo"),
      solve("dnf", "memo"),
      solve("dnf", "parity"),
    ];
    const b = dnfBreakdown(solves, cats);
    expect(b.total).toBe(5);
    expect(b.dnf).toBe(3);
    expect(b.dnfRate).toBeCloseTo(0.6);
    expect(b.successRate).toBeCloseTo(0.4);
    // biggest reason first, with both shares
    expect(b.rows[0].category?.name).toBe("Memo lost");
    expect(b.rows[0].count).toBe(2);
    expect(b.rows[0].ofDnf).toBeCloseTo(2 / 3);
    expect(b.rows[0].ofAll).toBeCloseTo(2 / 5);
  });

  it("buckets untagged DNFs and DNFs whose category was deleted", () => {
    const b = dnfBreakdown([solve("dnf"), solve("dnf", "deleted-id"), solve("ok")], cats);
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

  it("resolves the category of a solve", () => {
    expect(categoryOf(solve("dnf", "parity"), cats)?.name).toBe("Parity");
    expect(categoryOf(solve("dnf"), cats)).toBeNull();
    expect(categoryOf(solve("dnf", "gone"), cats)).toBeNull();
  });
});
