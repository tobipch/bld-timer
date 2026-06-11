import { createMemo, For, Show } from "solid-js";
import { outerMoveToString } from "~/lib/cube/alg";
import { humanizeMoves, humanizeMovesVerbatim } from "~/lib/cube/humanize";
import { describePrimitive, makeOrientationMaps } from "~/lib/engine/present";
import type { OrientationMaps } from "~/lib/engine/present";
import type { MistakeDiagnosis, Reconstruction, ReconstructionStep } from "~/lib/engine/reconstruct";
import { formatMs } from "~/lib/stats";
import { settings } from "~/state/settings";

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
  const d = describePrimitive(props.step.primitive!, settings.letterScheme, makeOrientationMaps(settings.orientation));
  return (
    <li
      class={`recon-step ${KIND_CLASS[d.kind] ?? ""}`}
      classList={{ ghost: props.ghost, "step-flagged": props.flagged }}
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

export function ReconstructionView(props: { rec: Reconstruction; title?: string; scramble?: string }) {
  const maps = createMemo(() => makeOrientationMaps(settings.orientation));
  const wrongIdx = () =>
    props.rec.diagnosis?.kind === "wrong-case"
      ? props.rec.diagnosis.wrongStepIdx
      : props.rec.diagnosis?.kind === "inverted-case"
        ? props.rec.diagnosis.invertedStepIdx
        : undefined;

  return (
    <div class="recon card">
      <Show when={props.title}>
        <h3>{props.title}</h3>
      </Show>
      <Show when={props.scramble}>
        <div class="recon-scramble mono muted">{props.scramble}</div>
      </Show>
      <Show when={props.rec.steps.length > 0} fallback={<span class="muted">No moves were made.</span>}>
        <ol class="recon-steps">
          <For each={props.rec.steps}>
            {(step, i) => <StepItem step={step} flagged={wrongIdx() === i()} />}
          </For>
        </ol>
      </Show>
      <Show when={!props.rec.solved}>
        <div class="recon-dnf">
          <Show when={props.rec.diagnosis} fallback={
            <Show
              when={props.rec.brokenFromIdx !== null && props.rec.brokenFromIdx < props.rec.totalMoves}
              fallback={<span>↯ solve incomplete — cube left unsolved.</span>}
            >
              <span>↯ from move {props.rec.brokenFromIdx! + 1} the moves no longer formed a valid case.</span>
            </Show>
          }>
            {(d) => <DiagnosisView d={d()} maps={maps()} />}
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
