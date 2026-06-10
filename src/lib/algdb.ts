import type { Primitive } from "./engine/classify";
import type { AlgExecution } from "./storage/types";

/**
 * Aggregation of recorded alg executions into the self-learning database:
 * cases keyed by their state effect, with move-sequence variants and timing.
 */

export interface VariantAgg {
  moves: string;
  count: number;
  avgExecMs: number;
  bestExecMs: number;
}

export interface CaseAgg {
  caseKey: string;
  primitive: Primitive;
  count: number;
  avgExecMs: number;
  bestExecMs: number;
  avgRecogMs: number;
  lastAt: number;
  variants: VariantAgg[];
  executions: AlgExecution[];
}

export function aggregateCases(execs: AlgExecution[]): CaseAgg[] {
  const byKey = new Map<string, AlgExecution[]>();
  for (const e of execs) {
    const list = byKey.get(e.caseKey);
    if (list) list.push(e);
    else byKey.set(e.caseKey, [e]);
  }
  const out: CaseAgg[] = [];
  for (const [caseKey, list] of byKey) {
    const byMoves = new Map<string, AlgExecution[]>();
    for (const e of list) {
      const v = byMoves.get(e.moves);
      if (v) v.push(e);
      else byMoves.set(e.moves, [e]);
    }
    const variants: VariantAgg[] = [...byMoves.entries()]
      .map(([moves, es]) => ({
        moves,
        count: es.length,
        avgExecMs: es.reduce((a, e) => a + e.execMs, 0) / es.length,
        bestExecMs: Math.min(...es.map((e) => e.execMs)),
      }))
      .sort((a, b) => b.count - a.count);
    out.push({
      caseKey,
      primitive: list[0].primitive,
      count: list.length,
      avgExecMs: list.reduce((a, e) => a + e.execMs, 0) / list.length,
      bestExecMs: Math.min(...list.map((e) => e.execMs)),
      avgRecogMs: list.reduce((a, e) => a + e.recogMs, 0) / list.length,
      lastAt: Math.max(...list.map((e) => e.at)),
      variants,
      executions: [...list].sort((a, b) => b.at - a.at),
    });
  }
  return out;
}
