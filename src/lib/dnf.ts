import type { DnfCategory, SolveRecord } from "./storage/types";

/**
 * DNF categorisation. A BLD solve either works or it doesn't — what matters
 * for improving is *why* it didn't. The user tags every DNF; the stats then
 * answer both questions the old dnf-tracker couldn't: how often do I DNF at
 * all, and which failure mode costs me the most solves.
 *
 * A DNF can carry several reasons: "Edge exec" *and* "Wrong cancel" says
 * considerably more than either alone.
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
  { name: "Wrong cancel", color: "#ff9f7d", hint: "cancelled moves that should have stayed" },
  { name: "Cube / Pop", color: "#95a3b5", hint: "hardware: pop, lockup, misturn" },
  { name: "Unknown", color: "#6b7a8f", hint: "no idea yet — replay it later" },
];

/**
 * Reasons tagged on a solve. Solves stored before multiple reasons existed
 * carry a single `dnfCategoryId`, which still counts.
 */
export function categoryIdsOf(solve: Pick<SolveRecord, "dnfCategoryIds" | "dnfCategoryId">): string[] {
  if (solve.dnfCategoryIds?.length) return solve.dnfCategoryIds;
  return solve.dnfCategoryId ? [solve.dnfCategoryId] : [];
}

/** The tagged reasons of a solve, in the order the categories are listed. */
export function categoriesOf(
  solve: Pick<SolveRecord, "dnfCategoryIds" | "dnfCategoryId">,
  categories: DnfCategory[],
): DnfCategory[] {
  const ids = new Set(categoryIdsOf(solve));
  return categories.filter((c) => ids.has(c.id));
}

export interface CategoryStat {
  category: DnfCategory | null;
  /** DNFs carrying this reason */
  count: number;
  /** share of all DNFs — sums above 100% when solves carry several reasons */
  ofDnf: number;
  /** share of all solves — the number the old tracker never showed */
  ofAll: number;
  /** width of this reason's slice of the outcome bar (fraction of all solves) */
  barShare: number;
}

export interface DnfBreakdown {
  total: number;
  ok: number;
  dnf: number;
  /** null when there are no solves yet */
  dnfRate: number | null;
  successRate: number | null;
  /** every used reason plus an "untagged" bucket, biggest first */
  rows: CategoryStat[];
  untagged: number;
  /** true when at least one DNF carries more than one reason */
  multiTagged: boolean;
}

export function dnfBreakdown(solves: SolveRecord[], categories: DnfCategory[]): DnfBreakdown {
  const total = solves.length;
  const dnfs = solves.filter((s) => s.result === "dnf");
  const known = new Set(categories.map((c) => c.id));

  const counts = new Map<string | null, number>();
  let tags = 0;
  let multiTagged = false;
  for (const s of dnfs) {
    const ids = categoryIdsOf(s).filter((id) => known.has(id));
    if (ids.length > 1) multiTagged = true;
    if (ids.length === 0) {
      counts.set(null, (counts.get(null) ?? 0) + 1);
      tags++;
      continue;
    }
    for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
    tags += ids.length;
  }

  const byId = new Map(categories.map((c) => [c.id, c]));
  const dnfRate = total > 0 ? dnfs.length / total : 0;

  const rows: CategoryStat[] = [...counts.entries()]
    .map(([key, count]) => ({
      category: key === null ? null : byId.get(key)!,
      count,
      ofDnf: dnfs.length > 0 ? count / dnfs.length : 0,
      ofAll: total > 0 ? count / total : 0,
      // the DNF part of the bar keeps its true width and is split by how
      // often each reason was named
      barShare: tags > 0 ? (count / tags) * dnfRate : 0,
    }))
    .sort((a, b) => b.count - a.count || (a.category?.sortIndex ?? 99) - (b.category?.sortIndex ?? 99));

  return {
    total,
    ok: total - dnfs.length,
    dnf: dnfs.length,
    dnfRate: total > 0 ? dnfRate : null,
    successRate: total > 0 ? (total - dnfs.length) / total : null,
    rows,
    untagged: counts.get(null) ?? 0,
    multiTagged,
  };
}

export function formatPct(x: number | null): string {
  return x === null ? "—" : `${Math.round(x * 100)}%`;
}
