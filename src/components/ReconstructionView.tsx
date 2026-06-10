import { createMemo, For, Show } from "solid-js";
import { outerMovesToString } from "~/lib/cube/alg";
import { describePrimitive, makeOrientationMaps } from "~/lib/engine/present";
import type { Reconstruction } from "~/lib/engine/reconstruct";
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

export function ReconstructionView(props: { rec: Reconstruction; title?: string }) {
  const maps = createMemo(() => makeOrientationMaps(settings.orientation));

  return (
    <div class="recon card">
      <Show when={props.title}>
        <h3>{props.title}</h3>
      </Show>
      <Show when={props.rec.steps.length > 0} fallback={<span class="muted">No moves were made.</span>}>
        <ol class="recon-steps">
          <For each={props.rec.steps}>
            {(step) => {
              if (step.kind === "unknown") {
                return (
                  <li class="recon-step step-unknown">
                    <span class="step-kind">?</span>
                    <span class="step-label">
                      {step.moves.length} moves not forming any case
                    </span>
                    <span class="step-moves mono">{outerMovesToString(step.moves)}</span>
                  </li>
                );
              }
              const d = describePrimitive(step.primitive!, settings.letterScheme, maps());
              return (
                <li class={`recon-step ${KIND_CLASS[d.kind] ?? ""}`}>
                  <span class="step-kind">{d.kind}</span>
                  <span class="step-label">{d.label}</span>
                  <span class="step-moves mono">{outerMovesToString(step.moves)}</span>
                  <Show when={step.kind === "case"}>
                    <span class="step-times mono muted">
                      rec {formatMs(step.recogMs)} · exec {formatMs(step.execMs)}
                    </span>
                  </Show>
                </li>
              );
            }}
          </For>
        </ol>
      </Show>
      <Show when={!props.rec.solved}>
        <div class="recon-dnf">
          <Show
            when={props.rec.brokenFromIdx !== null && props.rec.brokenFromIdx < props.rec.totalMoves}
            fallback={<span>↯ solve incomplete — cube left unsolved.</span>}
          >
            <span>↯ from move {props.rec.brokenFromIdx! + 1} the moves no longer formed a valid case.</span>
          </Show>
          <Show when={props.rec.leftover}>
            <span class="muted">
              {" "}
              Left broken:{" "}
              {[
                props.rec.leftover!.corners.length
                  ? `corners ${props.rec.leftover!.corners.join(", ")}`
                  : null,
                props.rec.leftover!.edges.length ? `edges ${props.rec.leftover!.edges.join(", ")}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </Show>
        </div>
      </Show>
    </div>
  );
}
