import type { DnfCategory, SolveRecord } from "./storage/types";

/**
 * DNF categorisation. A BLD solve either works or it doesn't — what matters
 * for improving is *why* it didn't. The user tags every DNF; the stats then
 * answer both questions the old dnf-tracker couldn't: how often do I DNF at
 * all, and which failure mode costs me the most solves.
 */

export interface DnfCategorySeed {
  name: string;
  color: string;
  /** one-line reminder shown in the picker */
  hint: string;
}

/** Starting set; fully editable by the user afterwards. */
export const DEFAULT_DNF_CATEGORIES: DnfCategorySeed[] = [
  { name: "Memo lost", color: "#c77dff", hint: "a letter pair was simply gone" },
  { name: "Wrong memo", color: "#8f7dff", hint: "memorised a piece incorrectly" },
  { name: "Edge exec", color: "#4da3ff", hint: "wrong or botched edge alg" },
  { name: "Corner exec", color: "#3ad0d0", hint: "wrong or botched corner alg" },
  { name: "Parity", color: "#e8a13c", hint: "parity forgotten, doubled or misplaced" },
  { name: "Twist / Flip", color: "#f2d14e", hint: "forgot a twisted corner or flipped edge" },
  { name: "Cycle break", color: "#7ee081", hint: "broke into the wrong piece" },
  { name: "Cube / Pop", color: "#95a3b5", hint: "hardware: pop, lockup, misturn" },
  { name: "Unknown", color: "#6b7a8f", hint: "no idea yet — replay it later" },
];

export interface CategoryStat {
  category: DnfCategory | null;
  count: number;
  /** share of all DNFs */
  ofDnf: number;
  /** share of all solves — the number the old tracker never showed */
  ofAll: number;
}

export interface DnfBreakdown {
  total: number;
  ok: number;
  dnf: number;
  /** null when there are no solves yet */
  dnfRate: number | null;
  successRate: number | null;
  /** every used category plus an "untagged" bucket, biggest first */
  rows: CategoryStat[];
  untagged: number;
}

export function dnfBreakdown(solves: SolveRecord[], categories: DnfCategory[]): DnfBreakdown {
  const total = solves.length;
  const dnfs = solves.filter((s) => s.result === "dnf");
  const byId = new Map<string, DnfCategory>(categories.map((c) => [c.id, c]));

  const counts = new Map<string | null, number>();
  for (const s of dnfs) {
    const key = s.dnfCategoryId && byId.has(s.dnfCategoryId) ? s.dnfCategoryId : null;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const rows: CategoryStat[] = [...counts.entries()]
    .map(([key, count]) => ({
      category: key === null ? null : byId.get(key)!,
      count,
      ofDnf: dnfs.length > 0 ? count / dnfs.length : 0,
      ofAll: total > 0 ? count / total : 0,
    }))
    .sort((a, b) => b.count - a.count || (a.category?.sortIndex ?? 99) - (b.category?.sortIndex ?? 99));

  return {
    total,
    ok: total - dnfs.length,
    dnf: dnfs.length,
    dnfRate: total > 0 ? dnfs.length / total : null,
    successRate: total > 0 ? (total - dnfs.length) / total : null,
    rows,
    untagged: counts.get(null) ?? 0,
  };
}

/** "Memo lost" for a solve, or null when it is not a tagged DNF. */
export function categoryOf(solve: SolveRecord, categories: DnfCategory[]): DnfCategory | null {
  if (!solve.dnfCategoryId) return null;
  return categories.find((c) => c.id === solve.dnfCategoryId) ?? null;
}

export function formatPct(x: number | null): string {
  return x === null ? "—" : `${Math.round(x * 100)}%`;
}
