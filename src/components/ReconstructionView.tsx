import { createMemo, createSignal, For, Show } from "solid-js";
import { algToOuterMoves, invertOuterMoves, outerMoveFromString, outerMoveToString } from "~/lib/cube/alg";
import { humanizeMoves, humanizeMovesVerbatim } from "~/lib/cube/humanize";
import type { OuterMove } from "~/lib/cube/state";
import {
  describeContinuation,
  describePrimitive,
  makeOrientationMaps,
} from "~/lib/engine/present";
import type { OrientationMaps } from "~/lib/engine/present";
import type { MistakeDiagnosis, Reconstruction, ReconstructionStep } from "~/lib/engine/reconstruct";
import { formatMs } from "~/lib/stats";
import { settings } from "~/state/settings";
import { useApp } from "~/state/app";
import { CubeReplay } from "./CubeReplay";

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

interface ReplayTarget {
  setup: string;
  alg: string;
}

function ReplayButton(props: { onClick: () => void }) {
  return (
    <button class="replay-btn" title="Replay on the 3D cube from this exact state" onClick={props.onClick}>
      ▶
    </button>
  );
}

function JumpButton(props: { onClick: () => void; busy?: boolean }) {
  return (
    <button
      class="replay-btn jump-btn"
      title="Turns that bring your cube to this point, from where it is right now"
      onClick={props.onClick}
    >
      {props.busy ? "…" : "→"}
    </button>
  );
}

function StepItem(props: {
  step: ReconstructionStep;
  ghost?: boolean;
  flagged?: boolean;
  broken?: boolean;
  /** an earlier step in this phase already went wrong: this is its consequence */
  followUp?: boolean;
  /** this is the first thing that went wrong, and more followed from it */
  hasFollowUps?: boolean;
  onReplay?: () => void;
  onJump?: () => void;
  jumpBusy?: boolean;
}) {
  if (props.step.kind === "unknown") {
    return (
      <li
        class="recon-step step-unknown"
        classList={{ ghost: props.ghost, "step-flagged": props.broken || props.flagged }}
      >
        <span class="step-kind">?</span>
        <span class="step-label">{props.step.moves.length} moves not forming any case</span>
        <span class="step-moves mono">{humanizeMovesVerbatim(props.step.moves, settings.orientation)}</span>
        <Show when={props.onReplay}>
          <ReplayButton onClick={props.onReplay!} />
        </Show>
        <Show when={props.onJump}>
          <JumpButton onClick={props.onJump!} busy={props.jumpBusy} />
        </Show>
        <Show when={props.broken}>
          <span class="bad step-flag">⟵ solve breaks down from here</span>
        </Show>
        <Show when={props.flagged && !props.broken}>
          <span class="bad step-flag">⟵ derailed the cube</span>
        </Show>
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
        <Show when={props.onReplay}>
          <ReplayButton onClick={props.onReplay!} />
        </Show>
      </li>
    );
  }
  const maps = makeOrientationMaps(settings.orientation);
  const d = describePrimitive(props.step.primitive!, settings.letterScheme, maps);
  // once a phase is off plan, every later warning in it is a consequence —
  // reporting them again buries the one mistake that actually happened
  const suspicious = () => props.step.progress?.suspicious && !props.ghost && !props.followUp;
  const suboptimal = () => props.step.progress?.suboptimal && !props.ghost && !props.followUp;
  const fullMoves = () =>
    props.step.setupMoves
      ? [...props.step.setupMoves, ...props.step.moves, ...invertOuterMoves(props.step.setupMoves)]
      : props.step.moves;
  return (
    <li
      class={`recon-step step-case ${KIND_CLASS[d.kind] ?? ""}`}
      classList={{ ghost: props.ghost, "step-flagged": props.flagged || suspicious() }}
    >
      <div class="step-row1">
        <span class="step-kind">{d.kind}</span>
        <span class="step-letters">{d.label}</span>
        <Show when={props.flagged}>
          <span class="bad step-flag">⟵ wrong</span>
        </Show>
        <span class="step-times mono muted">
          rec {formatMs(props.step.recogMs)} · exec {formatMs(props.step.execMs)}
        </span>
        <Show when={props.onReplay}>
          <ReplayButton onClick={props.onReplay!} />
        </Show>
        <Show when={props.onJump}>
          <JumpButton onClick={props.onJump!} busy={props.jumpBusy} />
        </Show>
      </div>
      <div class="step-row2 mono muted">
        {humanizeMoves(fullMoves(), settings.orientation)}
        <Show when={props.step.setupMoves}>
          <span> (shared setup)</span>
        </Show>
      </div>
      <Show when={suspicious() || suboptimal()}>
        <div class="step-suspicion warn">
          ⚠{" "}
          {suspicious()
            ? (props.step.progress!.reason ?? "solved no piece")
            : `solved only ${props.step.progress!.newlySolved} piece — a full pair was available`}
          <Show when={props.step.progress!.suggestion}>
            {" — "}
            {describeContinuation(props.step.progress!.suggestion!, settings.letterScheme, maps)}
          </Show>
          <Show when={props.hasFollowUps}>
            <span class="muted"> · everything after this in the phase follows from it</span>
          </Show>
        </div>
      </Show>
    </li>
  );
}

interface GhostRow {
  type: "ghost";
  prim: NonNullable<MistakeDiagnosis["missing"]>;
  note: string;
  setup: string | null;
  moveIdx: number;
}
type Row = { type: "step"; step: ReconstructionStep; idx: number } | GhostRow;

function GhostCaseItem(props: { row: GhostRow; maps: OrientationMaps; onReplay?: () => void }) {
  const d = () => describePrimitive(props.row.prim, settings.letterScheme, props.maps);
  return (
    <li
      class={`recon-step ghost-case ${KIND_CLASS[d().kind] ?? ""}`}
      title={props.row.setup ? `Setup to practice this spot:\n${props.row.setup}` : undefined}
    >
      <span class="step-kind">{d().kind}</span>
      <span class="step-label">{d().label}</span>
      <Show when={props.onReplay}>
        <ReplayButton onClick={props.onReplay!} />
      </Show>
      <span class="warn step-flag">⟵ {props.row.note}</span>
    </li>
  );
}

function DiagnosisView(props: {
  d: MistakeDiagnosis;
  index: number;
  maps: OrientationMaps;
  confirmed?: number[];
  onToggleFinding?: (idx: number) => void;
}) {
  const missingLabel = () =>
    props.d.missing ? describePrimitive(props.d.missing, settings.letterScheme, props.maps) : null;
  const shouldLabel = () =>
    props.d.shouldHaveBeen
      ? describePrimitive(props.d.shouldHaveBeen, settings.letterScheme, props.maps)
      : null;
  const isConfirmed = () => props.confirmed?.includes(props.index) ?? false;

  return (
    <div class="diagnosis">
      <div class="diag-row">
        <div class="diag-head bad">
          <Show when={props.d.kind === "wrong-case"}>
            ↯ Step {props.d.wrongStepIdx! + 1} was the wrong case
            {props.d.invertedExecution ? " — you executed exactly the inverse of what was needed" : ""}. It
            should have solved: <strong>{shouldLabel()?.kind}</strong> {shouldLabel()?.label}. Everything
            else was correct.
          </Show>
          <Show when={props.d.kind === "missing-case"}>
            ↯ One case was never solved: <strong>{missingLabel()?.kind}</strong> {missingLabel()?.label}
            {props.d.insertAfterStepIdx !== undefined
              ? props.d.insertAfterStepIdx! >= 0
                ? ` — it fits after step ${props.d.insertAfterStepIdx! + 1}.`
                : " — it fits before everything else."
              : "."}{" "}
            The rest of the solve was correct.
          </Show>
          <Show when={props.d.kind === "inverted-case"}>
            ↯ Step {(props.d.invertedStepIdx ?? 0) + 1} was executed <strong>inverted</strong> — its inverse
            would have solved the remaining cycle ({missingLabel()?.label}).
          </Show>
          <Show when={props.d.kind === "stray-block"}>
            ↯ The unrecognized moves at step {props.d.wrongStepIdx! + 1} derailed the cube — everything you
            executed after them was consistent with the state before, so that block was likely the only
            real mistake.
          </Show>
          <Show when={props.d.kind === "small-mistake"}>
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
          </Show>
        </div>
        <Show when={props.onToggleFinding}>
          <button
            class="confirm-btn"
            classList={{ on: isConfirmed() }}
            title="Feedback: the engine diagnosed this correctly"
            onClick={() => props.onToggleFinding!(props.index)}
          >
            {isConfirmed() ? "✓ correctly diagnosed" : "correctly diagnosed?"}
          </button>
        </Show>
      </div>
      <Show when={props.d.kind === "small-mistake" && props.d.hypothetical}>
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
    </div>
  );
}

export function ReconstructionView(props: {
  rec: Reconstruction;
  title?: string;
  scramble?: string;
  moves?: { m: string; t: number }[];
  feedback?: { confirmed: number[]; onToggleFinding: (idx: number) => void };
  /** errors-first view: full solution folded away (default on the timer page) */
  compact?: boolean;
}) {
  const app = useApp();
  const maps = createMemo(() => makeOrientationMaps(settings.orientation));
  const [replay, setReplay] = createSignal<ReplayTarget | null>(null);
  // older stored solves only carry the single diagnosis field
  const findings = createMemo<MistakeDiagnosis[]>(
    () => props.rec.findings ?? (props.rec.diagnosis ? [props.rec.diagnosis] : []),
  );
  const wrongIdxs = createMemo(() => {
    const out = new Set<number>();
    for (const f of findings()) {
      if (f.kind === "wrong-case" && f.wrongStepIdx !== undefined) out.add(f.wrongStepIdx);
      if (f.kind === "stray-block" && f.wrongStepIdx !== undefined) out.add(f.wrongStepIdx);
      if (f.kind === "inverted-case" && f.invertedStepIdx !== undefined) out.add(f.invertedStepIdx);
    }
    return out;
  });

  const rawMoves = createMemo<OuterMove[]>(() => {
    try {
      return (props.moves ?? []).map((m) => outerMoveFromString(m.m));
    } catch {
      return [];
    }
  });
  const canReplay = () => !!props.scramble && rawMoves().length > 0;
  /** user-frame alg (orientation prefix + translated moves) from a raw span */
  const userAlg = (ms: OuterMove[]) => humanizeMovesVerbatim(ms, settings.orientation);
  const setupFor = (moveIdx: number) =>
    [settings.orientation.trim(), props.scramble, userAlg(rawMoves().slice(0, moveIdx))]
      .filter(Boolean)
      .join(" ");
  const replaySpan = (startIdx: number, endIdxExcl?: number) =>
    setReplay({
      setup: setupFor(startIdx),
      alg: userAlg(rawMoves().slice(startIdx, endIdxExcl)),
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
          row: {
            type: "ghost",
            prim: f.missing,
            note: "should have happened here",
            setup: setupTo(moveIdx),
            moveIdx,
          },
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
            moveIdx,
          },
        });
      }
    }
    ghosts.sort((a, b) => b.pos - a.pos);
    for (const g of ghosts) out.splice(g.pos, 0, g.row);
    return out;
  });

  const algCount = createMemo(() => props.rec.steps.filter((s) => s.kind === "case").length);
  const compact = () => props.compact ?? false;

  /**
   * Group the solve into its natural phases so the list reads like the
   * solver thinks: edges, corners, then the finish (parity/LTCT/twists/
   * flips). Fumbles and unknown blocks stay with the phase they occurred in.
   */
  const groups = createMemo(() => {
    const catOf = (row: Row): "Edges" | "Corners" | "Finish" | null => {
      const prim = row.type === "step" ? row.step.primitive : row.prim;
      if (!prim) return null; // unknown: stays with the current group
      switch (prim.type) {
        case "edgeComm":
          return "Edges";
        case "cornerComm":
          return "Corners";
        case "parity":
        case "ltct":
        case "twist":
        case "flip":
          return "Finish";
        default:
          return null; // noop
      }
    };
    const out: { name: string; rows: Row[]; cases: number; ms: number }[] = [];
    let current: (typeof out)[number] | null = null;
    for (const row of rows()) {
      const cat = catOf(row);
      if (cat && (!current || current.name !== cat)) {
        current = { name: cat, rows: [], cases: 0, ms: 0 };
        out.push(current);
      }
      if (!current) {
        current = { name: "Start", rows: [], cases: 0, ms: 0 };
        out.push(current);
      }
      current.rows.push(row);
      if (row.type === "step") {
        current.ms += row.step.recogMs + row.step.execMs;
        if (row.step.kind === "case") current.cases++;
      }
    }
    // a phase consisting only of ghosts never happened — the finding above
    // already says what is missing, a "Finish · 0 cases" header only adds noise
    return out.filter((g) => g.rows.some((r) => r.type === "step"));
  });

  /** move index of the primary error, for "bring your cube back there" */
  const errorMoveIdx = createMemo<number | null>(() => {
    if (props.rec.solved) return null;
    const f = findings()[0];
    const steps = props.rec.steps;
    if (f) {
      switch (f.kind) {
        case "small-mistake":
          return f.atMoveIdx ?? null;
        case "wrong-case":
        case "stray-block":
          return f.wrongStepIdx !== undefined ? (steps[f.wrongStepIdx]?.startIdx ?? null) : null;
        case "inverted-case":
          return f.invertedStepIdx !== undefined ? (steps[f.invertedStepIdx]?.startIdx ?? null) : null;
        case "missing-case":
          return f.insertAfterStepIdx !== undefined
            ? (steps[f.insertAfterStepIdx + 1]?.startIdx ?? props.rec.totalMoves)
            : null;
      }
    }
    return props.rec.brokenFromIdx !== null && props.rec.brokenFromIdx < props.rec.totalMoves
      ? props.rec.brokenFromIdx
      : null;
  });

  /*
   * Getting the cube to a given moment of the solve. Expressed as plain
   * algebra: undo the turns that led from a solved cube to the one in your
   * hands, then apply scramble + the moves up to that point. The solver
   * shortens the result to scramble length.
   *
   * Reading the live cube state matters — the earlier version assumed the
   * cube still sat in the solve's end state, but the timer makes you solve it
   * before the next scramble, so by the time anyone reads this it does not.
   */
  const [jump, setJump] = createSignal<{ moveIdx: number; alg: string; fromSolved: boolean } | null>(null);
  const [jumpBusy, setJumpBusy] = createSignal<number | null>(null);

  const jumpTo = async (moveIdx: number) => {
    setJumpBusy(moveIdx);
    try {
      const { pathBetween, shortScrambleFor } = await import("~/lib/solver");
      let scrambleMoves: OuterMove[] = [];
      try {
        scrambleMoves = algToOuterMoves(props.scramble ?? "");
      } catch {
        scrambleMoves = [];
      }
      // without a connected cube there is no state to start from, so the
      // answer is the honest one: from a solved cube
      const from = app.cube() ? app.machine.movesSinceSolved() : [];
      const path = pathBetween(from, [...scrambleMoves, ...rawMoves().slice(0, moveIdx)]);
      const short = await shortScrambleFor(path);
      setJump({
        moveIdx,
        alg: userAlg(short ?? path),
        fromSolved: from.length === 0,
      });
    } finally {
      setJumpBusy(null);
    }
  };

  /**
   * Only the first thing that went wrong in a phase is reported. Once the
   * cube is off plan every later comm is measured against a state that should
   * never have existed, so its warning says nothing new.
   */
  const followUps = createMemo(() => {
    const consequences = new Set<number>();
    const leads = new Set<number>();
    const seen = new Map<string, number>();
    for (const g of groups()) {
      for (const row of g.rows) {
        if (row.type !== "step") continue;
        const p = row.step.progress;
        if (!p?.suspicious && !p?.suboptimal) continue;
        const lead = seen.get(g.name);
        if (lead === undefined) seen.set(g.name, row.idx);
        else {
          consequences.add(row.idx);
          leads.add(lead);
        }
      }
    }
    return { consequences, leads };
  });

  /** the unknown step where the solve falls apart, marked inline */
  const brokenStepIdx = createMemo(() => {
    if (props.rec.solved || findings().length > 0 || props.rec.brokenFromIdx === null) return -1;
    return props.rec.steps.findIndex(
      (s) => s.kind === "unknown" && s.endIdx >= props.rec.brokenFromIdx!,
    );
  });

  /** off-plan, flagged or broken steps, surfaced in the compact view */
  const problemRows = createMemo(() =>
    props.rec.steps
      .map((step, idx) => ({ type: "step" as const, step, idx }))
      .filter(
        (r) =>
          ((r.step.progress?.suspicious || r.step.progress?.suboptimal) &&
            !followUps().consequences.has(r.idx)) ||
          wrongIdxs().has(r.idx) ||
          brokenStepIdx() === r.idx,
      ),
  );

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
      <Show when={replay()}>
        {(r) => (
          <div class="replay-panel">
            <button class="tl-del replay-close" title="Close replay" onClick={() => setReplay(null)}>
              ×
            </button>
            <CubeReplay setup={r().setup} alg={r().alg} />
          </div>
        )}
      </Show>
      <Show when={!props.rec.solved}>
        <div class="recon-dnf">
          <Show when={findings().length > 0} fallback={
            <Show when={brokenStepIdx() < 0}>
              <span>↯ solve incomplete — cube left unsolved.</span>
            </Show>
          }>
            <For each={findings()}>
              {(d, i) => (
                <DiagnosisView
                  d={d}
                  index={i()}
                  maps={maps()}
                  confirmed={props.feedback?.confirmed}
                  onToggleFinding={props.feedback?.onToggleFinding}
                />
              )}
            </For>
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
          <Show when={errorMoveIdx() !== null && canReplay()}>
            <div class="back-path">
              <button
                disabled={jumpBusy() !== null}
                onClick={() => void jumpTo(errorMoveIdx()!)}
              >
                {jumpBusy() === errorMoveIdx() ? "computing…" : "Bring my cube to just before the mistake"}
              </button>
            </div>
          </Show>
        </div>
      </Show>
      <Show when={compact() && problemRows().length > 0}>
        <div class="recon-problems">
          <div class="recon-group-head">
            <span class="recon-group-name bad">Problems</span>
          </div>
          <ol class="recon-steps">
            <For each={problemRows()}>
              {(row) => (
                <>
                  <StepItem
                    step={row.step}
                    flagged={wrongIdxs().has(row.idx)}
                    broken={brokenStepIdx() === row.idx}
                    followUp={followUps().consequences.has(row.idx)}
                    hasFollowUps={followUps().leads.has(row.idx)}
                    onReplay={
                      canReplay() ? () => replaySpan(row.step.startIdx, row.step.endIdx + 1) : undefined
                    }
                    onJump={canReplay() ? () => void jumpTo(row.step.startIdx) : undefined}
                    jumpBusy={jumpBusy() === row.step.startIdx}
                  />
              <Show when={jump()?.moveIdx === row.step.startIdx ? jump() : null}>
                {(j) => (
                  <li class="jump-row">
                    <span class="muted">
                      {j().fromSolved ? "From a solved cube" : "From your cube as it is now"}, apply:
                    </span>
                    <strong class="mono jump-alg">{j().alg || "(you are already there)"}</strong>
                    <button
                      class="jump-copy"
                      onClick={() => void navigator.clipboard?.writeText(j().alg)}
                      title="Copy"
                    >
                      copy
                    </button>
                    <button class="jump-copy" onClick={() => setJump(null)} title="Hide">
                      ×
                    </button>
                  </li>
                )}
              </Show>
                </>
              )}
            </For>
          </ol>
        </div>
      </Show>
      <Show when={props.rec.steps.length > 0} fallback={<span class="muted">No moves were made.</span>}>
        <details class="recon-solution" open={!compact()}>
          <summary class="muted">
            {compact() ? "Show full solution" : "Solution"} · {algCount()} algs
          </summary>
          <For each={groups()}>
            {(g) => (
              <section class="recon-group">
                <div class="recon-group-head">
                  <span class="recon-group-name">{g.name}</span>
                  <span class="muted">
                    {g.cases} case{g.cases === 1 ? "" : "s"} · {formatMs(g.ms)}
                  </span>
                </div>
                <ol class="recon-steps">
                  <For each={g.rows}>
                    {(row) =>
                      row.type === "step" ? (
                        <>
                          <StepItem
                            step={row.step}
                            flagged={wrongIdxs().has(row.idx)}
                            broken={brokenStepIdx() === row.idx}
                            followUp={followUps().consequences.has(row.idx)}
                            hasFollowUps={followUps().leads.has(row.idx)}
                            onReplay={
                              canReplay()
                                ? () => replaySpan(row.step.startIdx, row.step.endIdx + 1)
                                : undefined
                            }
                            onJump={canReplay() ? () => void jumpTo(row.step.startIdx) : undefined}
                            jumpBusy={jumpBusy() === row.step.startIdx}
                          />
              <Show when={jump()?.moveIdx === row.step.startIdx ? jump() : null}>
                {(j) => (
                  <li class="jump-row">
                    <span class="muted">
                      {j().fromSolved ? "From a solved cube" : "From your cube as it is now"}, apply:
                    </span>
                    <strong class="mono jump-alg">{j().alg || "(you are already there)"}</strong>
                    <button
                      class="jump-copy"
                      onClick={() => void navigator.clipboard?.writeText(j().alg)}
                      title="Copy"
                    >
                      copy
                    </button>
                    <button class="jump-copy" onClick={() => setJump(null)} title="Hide">
                      ×
                    </button>
                  </li>
                )}
              </Show>
                        </>
                      ) : (
                        <GhostCaseItem
                          row={row}
                          maps={maps()}
                          onReplay={canReplay() ? () => replaySpan(row.moveIdx) : undefined}
                        />
                      )
                    }
                  </For>
                </ol>
              </section>
            )}
          </For>
        </details>
      </Show>
    </div>
  );
}
