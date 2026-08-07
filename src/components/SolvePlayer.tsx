import { createEffect, createMemo, createSignal, For, on, onCleanup, onMount, Show } from "solid-js";
import { ReplayCube } from "./ReplayCube";
import { describePrimitive, letterFor, makeOrientationMaps } from "~/lib/engine/present";
import {
  buildReplay,
  corePrefix,
  displayPrefix,
  elapsedExecMs,
  toDisplayAlg,
  tpsAt,
  unsolvedSlots,
} from "~/lib/replay";
import { shortScrambleFor } from "~/lib/solver";
import { formatMs } from "~/lib/stats";
import type { SolveRecord } from "~/lib/storage/types";
import { settings } from "~/state/settings";

/**
 * Move-by-move replay of a solve — the tool for finding out where it went
 * wrong. Everything shown is measured, not guessed: the state after every
 * move, how long each move took and where the hands hesitated.
 */
export function SolvePlayer(props: { solve: SolveRecord }) {
  const model = createMemo(() => buildReplay(props.solve, settings.orientation));
  const maps = createMemo(() => makeOrientationMaps(settings.orientation));
  const count = () => model().moves.length;

  const [idx, setIdx] = createSignal(0);
  const [playing, setPlaying] = createSignal(false);
  const [speed, setSpeed] = createSignal(1);
  const [realTime, setRealTime] = createSignal(true);
  const [animate, setAnimate] = createSignal(false);

  // another solve selected: start over
  createEffect(
    on(
      () => props.solve.id,
      () => {
        setIdx(0);
        setPlaying(false);
        setAnimate(false);
      },
      { defer: true },
    ),
  );

  const seek = (to: number, opts?: { animate?: boolean }) => {
    const clamped = Math.max(0, Math.min(count(), to));
    setAnimate(opts?.animate ?? clamped === idx() + 1);
    setIdx(clamped);
  };

  const step = (delta: number) => {
    setPlaying(false);
    seek(idx() + delta, { animate: delta === 1 });
  };

  /** start of the burst before / after the current position */
  const jumpBurst = (dir: -1 | 1) => {
    setPlaying(false);
    const starts = model().bursts.map((b) => b.from);
    const here = idx();
    const target = dir === 1 ? starts.find((s) => s > here) : [...starts].reverse().find((s) => s < here);
    seek(target ?? (dir === 1 ? count() : 0), { animate: false });
  };

  // playback: one timeout per move, so the real rhythm of the solve survives
  createEffect(() => {
    if (!playing()) return;
    const i = idx();
    const m = model();
    if (i >= m.moves.length) {
      setPlaying(false);
      return;
    }
    const gap = realTime() ? (i === 0 ? 300 : m.moves[i].gapMs) : 300;
    const delay = Math.min(4000, Math.max(45, gap / speed()));
    const id = setTimeout(() => {
      setAnimate(true);
      setIdx(i + 1);
    }, delay);
    onCleanup(() => clearTimeout(id));
  });

  const togglePlay = () => {
    if (!playing() && idx() >= count()) setIdx(0);
    setPlaying((p) => !p);
  };

  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      switch (e.key) {
        case "ArrowRight":
          e.preventDefault();
          step(1);
          break;
        case "ArrowLeft":
          e.preventDefault();
          step(-1);
          break;
        case "ArrowUp":
          e.preventDefault();
          jumpBurst(-1);
          break;
        case "ArrowDown":
          e.preventDefault();
          jumpBurst(1);
          break;
        case "Home":
          e.preventDefault();
          setPlaying(false);
          seek(0, { animate: false });
          break;
        case "End":
          e.preventDefault();
          setPlaying(false);
          seek(count(), { animate: false });
          break;
        case " ":
          e.preventDefault();
          togglePlay();
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    onCleanup(() => window.removeEventListener("keydown", onKey));
  });

  /* ---- derived views ---- */

  const unsolved = createMemo(() => {
    const u = unsolvedSlots(model().states[idx()]);
    const scheme = settings.letterScheme;
    return {
      corners: u.corners.map((slot) => letterFor({ kind: "corner", slot, sticker: 0 }, scheme, maps())),
      edges: u.edges.map((slot) => letterFor({ kind: "edge", slot, sticker: 0 }, scheme, maps())),
    };
  });

  /** engine guesses, only used as navigation labels — never as a verdict */
  const guesses = createMemo(() =>
    (props.solve.reconstruction?.steps ?? [])
      .filter((s) => s.kind === "case" && s.primitive)
      .map((s) => ({
        from: s.startIdx,
        to: s.endIdx,
        label: describePrimitive(s.primitive!, settings.letterScheme, maps()).label,
      })),
  );

  const guessFor = (from: number, to: number) =>
    guesses()
      .filter((g) => g.from <= to && g.to >= from)
      .map((g) => g.label)
      .join(" · ");

  /** turning speed over the solve, scaled to the fastest patch of it */
  const peakTps = createMemo(() => Math.max(1, ...model().moves.map((m) => m.tps ?? 0)));

  const curve = createMemo(() => {
    const m = model();
    const w = Math.max(1, m.moves.length);
    const peak = peakTps();
    const pts: string[] = [];
    m.moves.forEach((mv, i) => {
      if (mv.tps === null) return;
      pts.push(`${((i + 1) / w) * 1000},${100 - (mv.tps / peak) * 100}`);
    });
    return pts.join(" ");
  });

  const atX = (i: number) => (i / Math.max(1, count())) * 1000;

  const onTimelineClick = (e: MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const f = (e.clientX - rect.left) / rect.width;
    setPlaying(false);
    seek(Math.round(f * count()), { animate: false });
  };

  /* ---- "put the cube back here" ---- */

  /*
   * Scramble + everything played so far grows past a hundred moves and is
   * useless to type in. The solver turns any position into a scramble-length
   * sequence reaching exactly the same state; results are cached per position
   * and computed shortly after the position settles, so scrubbing does not
   * queue up work. Below this the raw list is already scramble-length itself.
   */
  const RAW_LIMIT = 22;

  const longAlgHere = createMemo(() => displayPrefix(model(), idx()));
  const rawCount = () => corePrefix(model(), idx()).length;

  const [shortAlgs, setShortAlgs] = createSignal<Record<number, string>>({});
  const [busyIdx, setBusyIdx] = createSignal<number | null>(null);
  const [solverFailed, setSolverFailed] = createSignal(false);
  const [copied, setCopied] = createSignal(false);
  const inFlight = new Set<number>();

  const shortAlgHere = () => shortAlgs()[idx()];
  const reachAlg = () => shortAlgHere() ?? longAlgHere();
  const reachMoveCount = () => reachAlg().split(/\s+/).filter(Boolean).length;
  const shortening = () => busyIdx() === idx();

  // a new solve invalidates every cached scramble
  createEffect(
    on(
      () => props.solve.id,
      () => {
        setShortAlgs({});
        inFlight.clear();
      },
      { defer: true },
    ),
  );

  const shorten = async (i: number) => {
    if (shortAlgs()[i] !== undefined || inFlight.has(i)) return;
    inFlight.add(i);
    if (i === idx()) setBusyIdx(i);
    try {
      const raw = corePrefix(model(), i);
      const short = await shortScrambleFor(raw);
      if (!short) setSolverFailed(true);
      else if (short.length < raw.length)
        setShortAlgs((m) => ({ ...m, [i]: toDisplayAlg(model(), short, settings.orientation) }));
    } finally {
      inFlight.delete(i);
      if (busyIdx() === i) setBusyIdx(null);
    }
  };

  createEffect(() => {
    const i = idx();
    // never during playback: the position changes many times a second
    if (playing() || solverFailed() || shortAlgs()[i] !== undefined) return;
    if (rawCount() <= RAW_LIMIT) return;
    const id = setTimeout(() => void shorten(i), 250);
    onCleanup(() => clearTimeout(id));
  });

  // keep the current burst visible while playing
  let listEl!: HTMLDivElement;
  createEffect(() => {
    const active = listEl?.querySelector(".burst.active");
    active?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  });

  // on the execution clock, so the readout runs from 0 to the solve's exec time
  const elapsed = () => elapsedExecMs(model(), idx(), props.solve.execMs);
  const tps = createMemo(() => tpsAt(model(), idx(), props.solve.execMs));

  return (
    <div class="player">
      <div class="player-main">
        <ReplayCube
          setup={displayPrefix(model(), Math.max(0, idx() - 1))}
          move={idx() > 0 ? model().moves[idx() - 1].display : ""}
          animate={animate()}
          size={320}
        />

        <div class="player-readout">
          <span class="mono player-pos">
            {idx()}<span class="muted">/{count()}</span>
          </span>
          <span class="mono muted">{formatMs(elapsed())}</span>
          <span
            class="player-tps"
            title="Turns per second up to this point — at the end, the TPS of the whole solve"
          >
            <span class="mono">{tps() === null ? "—" : tps()!.toFixed(2)}</span>
            <span class="muted">tps</span>
          </span>
        </div>

        <div class="player-controls">
          <button title="Start (Home)" onClick={() => (setPlaying(false), seek(0, { animate: false }))}>
            ⏮
          </button>
          <button title="Previous move (←)" onClick={() => step(-1)}>
            ◀
          </button>
          <button class="primary play-btn" title="Play / pause (Space)" onClick={togglePlay}>
            {playing() ? "⏸" : "▶"}
          </button>
          <button title="Next move (→)" onClick={() => step(1)}>
            ▶
          </button>
          <button title="End (End)" onClick={() => (setPlaying(false), seek(count(), { animate: false }))}>
            ⏭
          </button>
          <label class="player-speed">
            <select value={speed()} onChange={(e) => setSpeed(Number(e.currentTarget.value))}>
              <For each={[0.25, 0.5, 1, 1.5, 2, 4]}>{(s) => <option value={s}>{s}×</option>}</For>
            </select>
          </label>
          <button
            classList={{ active: realTime() }}
            title="Play back with the timing recorded from the cube"
            onClick={() => setRealTime((r) => !r)}
          >
            {realTime() ? "real time" : "even tempo"}
          </button>
        </div>

        <div class="timeline" onClick={onTimelineClick} title="Click to jump. The curve is solved pieces; the marks are hesitations.">
          <svg viewBox="0 0 1000 100" preserveAspectRatio="none">
            <polyline class="tl-curve" points={curve()} vector-effect="non-scaling-stroke" />
            <For each={model().moves}>
              {(m, i) => (
                <Show when={m.pause}>
                  <line
                    class="tl-pause"
                    x1={atX(i())}
                    x2={atX(i())}
                    y1="0"
                    y2="100"
                    style={{ opacity: Math.min(0.9, 0.25 + m.gapMs / 3000) }}
                    vector-effect="non-scaling-stroke"
                  />
                </Show>
              )}
            </For>
            <line
              class="tl-head"
              x1={atX(idx())}
              x2={atX(idx())}
              y1="0"
              y2="100"
              vector-effect="non-scaling-stroke"
            />
          </svg>
          <div class="tl-legend muted">
            <span>
              <i class="sw-curve" /> turning speed (peak {peakTps().toFixed(1)} tps)
            </span>
            <span><i class="sw-pause" /> hesitation ≥ {formatMs(model().pauseThresholdMs)}</span>
          </div>
        </div>

      </div>

      <div class="player-side-col">
        <div class="player-state card">
          <h4>At this point</h4>
          <Show
            when={unsolved().corners.length + unsolved().edges.length > 0}
            fallback={<p class="good">Cube solved. 🎉</p>}
          >
            <div class="unsolved-row">
              <span class="muted">corners</span>
              <For each={unsolved().corners}>{(l) => <span class="piece-chip corner">{l}</span>}</For>
              <Show when={unsolved().corners.length === 0}>
                <span class="good">all solved</span>
              </Show>
            </div>
            <div class="unsolved-row">
              <span class="muted">edges</span>
              <For each={unsolved().edges}>{(l) => <span class="piece-chip edge">{l}</span>}</For>
              <Show when={unsolved().edges.length === 0}>
                <span class="good">all solved</span>
              </Show>
            </div>
          </Show>
          <div class="reach-row">
            <span class="muted">
              Reach this exact state from a solved cube{" "}
              <span class="mono">({reachMoveCount()} moves)</span>
            </span>
            <code class="mono reach-alg" classList={{ short: !!shortAlgHere() }}>
              {reachAlg() || "(solved)"}
            </code>
            <div class="reach-actions">
              <Show when={shortening()}>
                <span class="muted reach-busy">shortening…</span>
              </Show>
              <Show when={solverFailed() && !shortAlgHere() && rawCount() > RAW_LIMIT}>
                <button
                  onClick={() => {
                    setSolverFailed(false);
                    void shorten(idx());
                  }}
                  title="Find a scramble-length sequence that produces this state"
                >
                  shorten
                </button>
              </Show>
              <button
                disabled={!reachAlg()}
                onClick={() => {
                  void navigator.clipboard?.writeText(reachAlg());
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
              >
                {copied() ? "copied ✓" : "copy"}
              </button>
            </div>
          </div>
        </div>

        <div class="player-moves card" ref={listEl}>
        <h4>
          Solution <span class="muted">{count()} moves</span>
        </h4>
        <p class="muted player-hint">
          ← → step · ↑ ↓ jump between pauses · space plays. Groups are split where you paused.
        </p>
        <For each={model().bursts}>
          {(b, bi) => (
            <div class="burst" classList={{ active: idx() > b.from && idx() <= b.to + 1 }}>
              <div class="burst-head">
                <span class="burst-n muted mono">{bi() + 1}</span>
                <Show when={b.pauseBeforeMs > 0}>
                  <span class="burst-pause" title="pause before this group">
                    ⏸ {formatMs(b.pauseBeforeMs)}
                  </span>
                </Show>
                <span class="muted mono">{formatMs(b.durationMs)}</span>
                <span class="burst-tps mono" title="turning speed inside this group">
                  {b.tps === null ? "" : `${b.tps.toFixed(1)} tps`}
                </span>
                <Show when={guessFor(b.from, b.to)}>
                  {(g) => (
                    <span class="burst-guess muted" title="the engine's guess at what this was — not a verdict">
                      {g()}
                    </span>
                  )}
                </Show>
              </div>
              <div class="burst-moves">
                <For each={model().moves.slice(b.from, b.to + 1)}>
                  {(m, i) => {
                    const globalIdx = () => b.from + i();
                    return (
                      <button
                        class="move-chip mono"
                        classList={{
                          played: globalIdx() < idx(),
                          current: globalIdx() === idx() - 1,
                        }}
                        title={`move ${globalIdx() + 1} · ${formatMs(m.t)} · +${m.gapMs}ms`}
                        onClick={() => {
                          setPlaying(false);
                          seek(globalIdx() + 1, { animate: false });
                        }}
                      >
                        {m.display}
                      </button>
                    );
                  }}
                </For>
              </div>
            </div>
          )}
        </For>
        </div>
      </div>
    </div>
  );
}
