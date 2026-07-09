import { invertOuterMoves } from "./cube/alg";
import { humanizeMoves, humanizeMovesVerbatim } from "./cube/humanize";
import { defaultLetterScheme, type LetterScheme } from "./cube/speffz";
import type { MistakeDiagnosis, ReconstructionStep } from "./engine/reconstruct";
import {
  describeContinuation,
  describePrimitive,
  makeOrientationMaps,
  type OrientationMaps,
} from "./engine/present";
import { formatMs } from "./stats";
import type { SolveRecord } from "./storage/types";

/**
 * Markdown export of solves with user feedback — the raw material for
 * improving the reconstruction engine. Contains everything needed to
 * reproduce a solve exactly: scramble, orientation, raw timed moves, the
 * engine's parse with its warnings and findings, which findings the user
 * confirmed, and the user's note.
 */

function stepLines(step: ReconstructionStep, scheme: LetterScheme, maps: OrientationMaps, orientation: string): string[] {
  if (step.kind === "unknown") {
    return [`? ${step.moves.length} moves not forming any case: \`${humanizeMovesVerbatim(step.moves, orientation)}\``];
  }
  if (step.kind === "noop") {
    return [
      `No-op — cancelled out: \`${humanizeMovesVerbatim(step.moves, orientation)}\` (${formatMs(
        step.recogMs + step.execMs,
      )} lost)`,
    ];
  }
  const d = describePrimitive(step.primitive!, scheme, maps);
  const moves = step.setupMoves
    ? [...step.setupMoves, ...step.moves, ...invertOuterMoves(step.setupMoves)]
    : step.moves;
  const alg = humanizeMoves(moves, orientation) + (step.setupMoves ? " (shared setup)" : "");
  const out = [
    `${d.kind} — ${d.label} — \`${alg}\` (rec ${formatMs(step.recogMs)} · exec ${formatMs(step.execMs)})`,
  ];
  const p = step.progress;
  if (p?.suspicious || p?.suboptimal) {
    const head = p.suspicious ? "solved no piece" : `solved only ${p.newlySolved} piece — a full pair was available`;
    const sugg = p.suggestion ? ` — ${describeContinuation(p.suggestion, scheme, maps)}` : "";
    out.push(`   ⚠ ${head}${sugg}`);
  }
  return out;
}

function findingLines(
  f: MistakeDiagnosis,
  index: number,
  confirmed: number[],
  scheme: LetterScheme,
  maps: OrientationMaps,
  orientation: string,
): string[] {
  const label = (p: NonNullable<MistakeDiagnosis["missing"]>) => {
    const d = describePrimitive(p, scheme, maps);
    return `${d.kind} ${d.label}`;
  };
  let head: string;
  switch (f.kind) {
    case "wrong-case":
      head = `Step ${(f.wrongStepIdx ?? 0) + 1} was the wrong case${
        f.invertedExecution ? " (executed exactly inverted)" : ""
      }; it should have solved: ${f.shouldHaveBeen ? label(f.shouldHaveBeen) : "?"}.`;
      break;
    case "missing-case":
      head = `One case was never solved: ${f.missing ? label(f.missing) : "?"}${
        f.insertAfterStepIdx !== undefined
          ? f.insertAfterStepIdx >= 0
            ? ` — fits after step ${f.insertAfterStepIdx + 1}.`
            : " — fits before everything else."
          : "."
      }`;
      break;
    case "inverted-case":
      head = `Step ${(f.invertedStepIdx ?? 0) + 1} was executed inverted (${f.missing ? label(f.missing) : "?"} left).`;
      break;
    case "small-mistake": {
      const played = f.played ? `played \`${f.played.face}${f.played.amount === 2 ? "2" : f.played.amount === 3 ? "'" : ""}\`` : "a move was missing";
      const should = f.shouldHave
        ? `should have been \`${f.shouldHave.face}${f.shouldHave.amount === 2 ? "2" : f.shouldHave.amount === 3 ? "'" : ""}\``
        : "the move was extra";
      head = `Mistake at move ${(f.atMoveIdx ?? 0) + 1}: ${played}, ${should}.`;
      break;
    }
    case "stray-block":
      head = `The unrecognized block at step ${(f.wrongStepIdx ?? 0) + 1} derailed the cube; everything after it was consistent with the state before.`;
      break;
  }
  const mark = confirmed.includes(index) ? "[✓ user confirmed]" : "[not confirmed]";
  const out = [`- ${mark} ${head}`];
  if (f.kind === "small-mistake" && f.hypothetical) {
    out.push(`  With the fix the rest parses as${f.hypothetical.solved ? " a finished solve" : ""}:`);
    for (const s of f.hypothetical.steps) {
      for (const line of stepLines(s, scheme, maps, orientation)) out.push(`    ${line}`);
    }
  }
  return out;
}

export function exportSolvesMarkdown(
  solves: SolveRecord[],
  scheme: LetterScheme,
  orientation: string,
): string {
  const maps = makeOrientationMaps(orientation);
  const def = defaultLetterScheme();
  const isSpeffz = JSON.stringify(scheme) === JSON.stringify(def);
  const lines: string[] = [
    `# BLD Timer — solve feedback`,
    ``,
    `- exported: ${new Date().toISOString()}`,
    `- solves with feedback: ${solves.length}`,
    `- orientation setting: ${orientation.trim() || "(default: white top, green front)"}`,
    `- letter scheme: ${isSpeffz ? "Speffz" : "custom"}`,
    ``,
  ];
  solves.forEach((s, i) => {
    const time = s.result === "dnf" ? `DNF (${formatMs(s.totalMs)})` : formatMs(s.totalMs);
    lines.push(
      `## ${i + 1}. ${new Date(s.startedAt).toLocaleString()} — ${time} · memo ${formatMs(s.memoMs)} · exec ${formatMs(s.execMs)}`,
      ``,
      `Scramble: \`${s.scramble}\``,
      ``,
    );
    if (s.note?.trim()) {
      lines.push(`### User note`, ``, ...s.note.trim().split("\n").map((l) => `> ${l}`), ``);
    }
    lines.push(`### Reconstruction (as shown)`, ``);
    s.reconstruction.steps.forEach((step, n) => {
      const [head, ...rest] = stepLines(step, scheme, maps, orientation);
      lines.push(`${n + 1}. ${head}`, ...rest);
    });
    const findings = s.reconstruction.findings ?? (s.reconstruction.diagnosis ? [s.reconstruction.diagnosis] : []);
    if (findings.length > 0) {
      lines.push(``, `### Engine findings`, ``);
      findings.forEach((f, idx) =>
        lines.push(...findingLines(f, idx, s.confirmedFindings ?? [], scheme, maps, orientation)),
      );
    }
    if (s.reconstruction.leftover) {
      const lo = s.reconstruction.leftover;
      const parts = [
        lo.corners.length ? `corners ${lo.corners.join(", ")}` : null,
        lo.edges.length ? `edges ${lo.edges.join(", ")}` : null,
      ].filter(Boolean);
      if (parts.length) lines.push(``, `Left broken: ${parts.join(" · ")}`);
    }
    const t0 = s.moves[0]?.t ?? 0;
    lines.push(
      ``,
      `### Raw data (for reproducing)`,
      ``,
      `Moves (core frame, ms after first move):`,
      ``,
      "```",
      s.moves.map((m) => `${m.m}@${m.t - t0}`).join(" "),
      "```",
      ``,
    );
  });
  return lines.join("\n");
}

/** Solves carrying feedback: a note or at least one confirmed finding. */
export function solvesWithFeedback(solves: SolveRecord[]): SolveRecord[] {
  return solves
    .filter((s) => s.note?.trim() || (s.confirmedFindings?.length ?? 0) > 0)
    .sort((a, b) => b.startedAt - a.startedAt);
}
