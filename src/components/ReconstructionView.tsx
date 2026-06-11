import { createMemo, For, Show } from "solid-js";
import { outerMoveToString } from "~/lib/cube/alg";
import { humanizeMoves, humanizeMovesVerbatim } from "~/lib/cube/humanize";
import { describePrimitive, letterFor, makeOrientationMaps } from "~/lib/engine/present";
import type { OrientationMaps } from "~/lib/engine/present";
import type { MistakeDiagnosis, Reconstruction, ReconstructionStep } from "~/lib/engine/reconstruct";
import type { Continuation } from "~/lib/engine/suggest";
import { formatMs } from "~/lib/stats";
import { settings } from "~/state/settings";

function continuationText(c: Continuation, maps: OrientationMaps): string {
  const L = (r: Parameters<typeof letterFor>[0]) => letterFor(r, settings.letterScheme, maps);
  switch (c.kind) {
    case "pair":
      return `the state called for ${L(c.pair[0])}${L(c.pair[1])}`;
    case "closes":
      return `the state called for ${L(c.first)}, closing the cycle (then break to an unsolved piece)`;
    case "breaks": {
      const opts = c.options.slice(0, 5).map(([a, b]) => `${L(a)}${L(b)}`);
      return `the buffer was solved — a cycle break was needed, e.g. ${opts.join(", ")}${
        c.options.length > 5 ? ", …" : ""
      }`;
    }
  }
}

const KIND_CLASS: Record<string, string> = {
  "Edge comm": "step-edge",
  "Corner comm": "step-corner",
  Parity: "step-parity",
  LTCT: "step-ltct",
  Flip: "step-flip",
  Twist: "step-twist",
  "3-Twist": "step-twist",
  "No-op": "step-noop",
};

function StepItem(props: { step: ReconstructionStep; ghost?: boolean; flagged?: boolean }) {
  if (props.step.kind === "unknown") {
    return (
      <li class="recon-step step-unknown" classList={{ ghost: props.ghost }}>
        <span class="step-kind">?</span>
        <span class="step-label">{props.step.moves.length} moves not forming any case</span>
        <span class="step-moves mono">{humanizeMovesVerbatim(props.step.moves, settings.orientation)}</span>
      </li>
    );
  }
  if (props.step.kind === "noop") {
    return (
      <li class="recon-step step-noop-row" classList={{ ghost: props.ghost }}>
        <span class="step-kind">No-op</span>
        <span class="step-label muted">cancelled out:</span>
        <span class="step-moves mono">{humanizeMovesVerbatim(props.step.moves, settings.orientation)}</span>
        <span class="step-times mono muted">
          {formatMs(props.step.recogMs + props.step.execMs)} lost
        </span>
      </li>
    );
  }
  const maps = makeOrientationMaps(settings.orientation);
  const d = describePrimitive(props.step.primitive!, settings.letterScheme, maps);
  const suspicious = () => props.step.progress?.suspicious && !props.ghost;
  return (
    <li
      class={`recon-step ${KIND_CLASS[d.kind] ?? ""}`}
      classList={{ ghost: props.ghost, "step-flagged": props.flagged || suspicious() }}
    >
      <span class="step-kind">{d.kind}</span>
      <span class="step-label">{d.label}</span>
      <span class="step-moves mono">{humanizeMoves(props.step.moves, settings.orientation)}</span>
      <span class="step-times mono muted">
        rec {formatMs(props.step.recogMs)} · exec {formatMs(props.step.execMs)}
      </span>
      <Show when={props.flagged}>
        <span class="bad step-flag">⟵ wrong</span>
      </Show>
      <Show when={suspicious()}>
        <div class="step-suspicion warn">
          ⚠ {props.step.progress!.newlySolved === 0 ? "solved no piece" : ""}
          {props.step.progress!.newlySolved === 0 && props.step.progress!.broke > 0 ? ", " : ""}
          {props.step.progress!.broke > 0 ? `displaced ${props.step.progress!.broke} solved` : ""}
          <Show when={props.step.progress!.suggestion}>
            {" — "}
            {continuationText(props.step.progress!.suggestion!, maps)}
          </Show>
        </div>
      </Show>
    </li>
  );
}

function GhostCaseItem(props: { row: GhostRow; maps: OrientationMaps }) {
  const d = () => describePrimitive(props.row.prim, settings.letterScheme, props.maps);
  return (
    <li
      class={`recon-step ghost-case ${KIND_CLASS[d().kind] ?? ""}`}
      title={props.row.setup ? `Setup to practice this spot:\n${props.row.setup}` : undefined}
    >
      <span class="step-kind">{d().kind}</span>
      <span class="step-label">{d().label}</span>
      <span class="warn step-flag">⟵ {props.row.note}</span>
    </li>
  );
}

function DiagnosisView(props: { d: MistakeDiagnosis; maps: OrientationMaps }) {
  const missingLabel = () =>
    props.d.missing ? describePrimitive(props.d.missing, settings.letterScheme, props.maps) : null;
  const shouldLabel = () =>
    props.d.shouldHaveBeen
      ? describePrimitive(props.d.shouldHaveBeen, settings.letterScheme, props.maps)
      : null;

  return (
    <div class="diagnosis">
      <Show when={props.d.kind === "wrong-case"}>
        <div class="diag-head bad">
          ↯ Step {props.d.wrongStepIdx! + 1} was the wrong case
          {props.d.invertedExecution ? " — you executed exactly the inverse of what was needed" : ""}.
          It should have solved: <strong>{shouldLabel()?.kind}</strong> {shouldLabel()?.label}. Everything
          else was correct.
        </div>
      </Show>
      <Show when={props.d.kind === "missing-case"}>
        <div class="diag-head bad">
          ↯ One case was never solved: <strong>{missingLabel()?.kind}</strong> {missingLabel()?.label}
          {props.d.insertAfterStepIdx !== undefined
            ? props.d.insertAfterStepIdx! >= 0
              ? ` — it fits after step ${props.d.insertAfterStepIdx! + 1}.`
              : " — it fits before everything else."
            : "."}{" "}
          The rest of the solve was correct.
        </div>
      </Show>
      <Show when={props.d.kind === "inverted-case"}>
        <div class="diag-head bad">
          ↯ Step {(props.d.invertedStepIdx ?? 0) + 1} was executed <strong>inverted</strong> — its inverse
          would have solved the remaining cycle ({missingLabel()?.label}).
        </div>
      </Show>
      <Show when={props.d.kind === "small-mistake"}>
        <div class="diag-head bad">
          ↯ Mistake at move {props.d.atMoveIdx! + 1}:{" "}
          <Show when={props.d.played && props.d.shouldHave}>
            you turned <strong class="mono">{outerMoveToString(props.d.played!)}</strong> instead of{" "}
            <strong class="mono">{outerMoveToString(props.d.shouldHave!)}</strong>.
          </Show>
          <Show when={props.d.played && !props.d.shouldHave}>
            the <strong class="mono">{outerMoveToString(props.d.played!)}</strong> was one move too many.
          </Show>
          <Show when={!props.d.played && props.d.shouldHave}>
            a <strong class="mono">{outerMoveToString(props.d.shouldHave!)}</strong> was missing here.
          </Show>
        </div>
        <Show when={props.d.hypothetical}>
          <div class="diag-hypo">
            <div class="muted">
              With that one fix, the rest would have been
              {props.d.hypothetical!.solved ? " a correct, finished solve:" : ":"}
            </div>
            <ol class="recon-steps">
              <For each={props.d.hypothetical!.steps}>{(s) => <StepItem step={s} ghost />}</For>
            </ol>
          </div>
        </Show>
      </Show>
    </div>
  );
}

interface GhostRow {
  type: "ghost";
  prim: NonNullable<MistakeDiagnosis["missing"]>;
  note: string;
  setup: string | null;
}
type Row = { type: "step"; step: ReconstructionStep; idx: number } | GhostRow;

export function ReconstructionView(props: {
  rec: Reconstruction;
  title?: string;
  scramble?: string;
  moves?: { m: string; t: number }[];
}) {
  const maps = createMemo(() => makeOrientationMaps(settings.orientation));
  // older stored solves only carry the single diagnosis field
  const findings = createMemo<MistakeDiagnosis[]>(
    () => props.rec.findings ?? (props.rec.diagnosis ? [props.rec.diagnosis] : []),
  );
  const wrongIdxs = createMemo(() => {
    const out = new Set<number>();
    for (const f of findings()) {
      if (f.kind === "wrong-case" && f.wrongStepIdx !== undefined) out.add(f.wrongStepIdx);
      if (f.kind === "inverted-case" && f.invertedStepIdx !== undefined) out.add(f.invertedStepIdx);
    }
    return out;
  });

  /** setup sequence reproducing the state before move index i (for practice) */
  const setupTo = (moveIdx: number): string | null => {
    if (!props.scramble || !props.moves) return null;
    const prefix = props.moves.slice(0, moveIdx).map((m) => m.m);
    return `${props.scramble}${prefix.length ? "  +  " + prefix.join(" ") : ""}`;
  };

  const rows = createMemo<Row[]>(() => {
    const out: Row[] = props.rec.steps.map((step, idx) => ({ type: "step" as const, step, idx }));
    // inject ghost rows where a case should have happened, last position first
    const ghosts: { pos: number; row: GhostRow }[] = [];
    for (const f of findings()) {
      if (f.kind === "missing-case" && f.missing && f.insertAfterStepIdx !== undefined) {
        const pos = f.insertAfterStepIdx + 1;
        const moveIdx = props.rec.steps[pos]?.startIdx ?? props.rec.totalMoves;
        ghosts.push({
          pos,
          row: { type: "ghost", prim: f.missing, note: "should have happened here", setup: setupTo(moveIdx) },
        });
      }
      if (f.kind === "wrong-case" && f.shouldHaveBeen && f.wrongStepIdx !== undefined) {
        const moveIdx = props.rec.steps[f.wrongStepIdx]?.startIdx ?? 0;
        ghosts.push({
          pos: f.wrongStepIdx + 1,
          row: {
            type: "ghost",
            prim: f.shouldHaveBeen,
            note: "what the step above should have solved",
            setup: setupTo(moveIdx),
          },
        });
      }
    }
    ghosts.sort((a, b) => b.pos - a.pos);
    for (const g of ghosts) out.splice(g.pos, 0, g.row);
    return out;
  });

  const algCount = createMemo(() => props.rec.steps.filter((s) => s.kind === "case").length);

  return (
    <div class="recon card">
      <Show when={props.title}>
        <h3>
          {props.title}
          <Show when={algCount() > 0}>
            <span class="muted"> · {algCount()} algs</span>
          </Show>
        </h3>
      </Show>
      <Show when={props.scramble}>
        <div class="recon-scramble mono muted">{props.scramble}</div>
      </Show>
      <Show when={props.rec.steps.length > 0} fallback={<span class="muted">No moves were made.</span>}>
        <ol class="recon-steps">
          <For each={rows()}>
            {(row) =>
              row.type === "step" ? (
                <StepItem step={row.step} flagged={wrongIdxs().has(row.idx)} />
              ) : (
                <GhostCaseItem row={row} maps={maps()} />
              )
            }
          </For>
        </ol>
      </Show>
      <Show when={!props.rec.solved}>
        <div class="recon-dnf">
          <Show when={findings().length > 0} fallback={
            <Show
              when={props.rec.brokenFromIdx !== null && props.rec.brokenFromIdx < props.rec.totalMoves}
              fallback={<span>↯ solve incomplete — cube left unsolved.</span>}
            >
              <span>↯ from move {props.rec.brokenFromIdx! + 1} the moves no longer formed a valid case.</span>
            </Show>
          }>
            <For each={findings()}>{(d) => <DiagnosisView d={d} maps={maps()} />}</For>
          </Show>
          <Show when={props.rec.leftover}>
            <div class="muted recon-leftover">
              Left broken:{" "}
              {[
                props.rec.leftover!.corners.length
                  ? `corners ${props.rec.leftover!.corners.join(", ")}`
                  : null,
                props.rec.leftover!.edges.length ? `edges ${props.rec.leftover!.edges.join(", ")}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
}
