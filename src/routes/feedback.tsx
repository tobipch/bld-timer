import { createMemo, createSignal, For, Show } from "solid-js";
import { ReconstructionView } from "~/components/ReconstructionView";
import { SolveNotes } from "~/components/SolveNotes";
import { exportSolvesMarkdown, solvesWithFeedback } from "~/lib/export";
import { formatMs } from "~/lib/stats";
import { settings } from "~/state/settings";
import { useApp } from "~/state/app";

/**
 * Collected solve feedback: every solve with a note or confirmed finding,
 * exportable as one Markdown document containing everything needed to
 * reproduce and analyze the solves (scramble, raw timed moves, the parse,
 * findings and their confirmation state, the notes).
 */
export default function FeedbackPage() {
  const app = useApp();
  const [copied, setCopied] = createSignal(false);
  const noted = createMemo(() => solvesWithFeedback(app.solves()));

  const markdown = () => exportSolvesMarkdown(noted(), settings.letterScheme, settings.orientation);

  const download = () => {
    const blob = new Blob([markdown()], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bld-timer-feedback-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copy = async () => {
    await navigator.clipboard.writeText(markdown());
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div class="feedback-page">
      <div class="card stats-header">
        <h3 style={{ margin: 0 }}>Solve feedback ({noted().length})</h3>
        <span class="muted">notes and confirmed findings, newest first</span>
        <div class="feedback-actions">
          <button class="primary" disabled={noted().length === 0} onClick={download}>
            Download .md
          </button>
          <button disabled={noted().length === 0} onClick={() => void copy()}>
            {copied() ? "copied ✓" : "Copy to clipboard"}
          </button>
        </div>
      </div>

      <Show
        when={noted().length > 0}
        fallback={
          <div class="card muted">
            No feedback yet. On the timer page, select a solve, confirm findings that were diagnosed
            correctly, or write a note when the engine got it wrong.
          </div>
        }
      >
        <For each={noted()}>
          {(s) => (
            <details class="card feedback-entry">
              <summary>
                <span class={`mono tl-time ${s.result === "dnf" ? "bad" : ""}`}>
                  {s.result === "dnf" ? `DNF (${formatMs(s.totalMs)})` : formatMs(s.totalMs)}
                </span>
                <span class="muted"> · {new Date(s.startedAt).toLocaleString()}</span>
                <Show when={(s.confirmedFindings?.length ?? 0) > 0}>
                  <span class="good"> · {s.confirmedFindings!.length} finding(s) confirmed ✓</span>
                </Show>
                <Show when={s.note?.trim()}>
                  <div class="feedback-note-preview">{s.note}</div>
                </Show>
              </summary>
              <ReconstructionView
                rec={s.reconstruction}
                scramble={s.scramble}
                moves={s.moves}
                title={`memo ${formatMs(s.memoMs)} · exec ${formatMs(s.execMs)}`}
                feedback={{
                  confirmed: s.confirmedFindings ?? [],
                  onToggleFinding: (idx) => {
                    const cur = new Set(s.confirmedFindings ?? []);
                    if (cur.has(idx)) cur.delete(idx);
                    else cur.add(idx);
                    void app.setSolveFeedback(s.id, { confirmedFindings: [...cur].sort() });
                  },
                }}
              />
              <SolveNotes solve={s} />
            </details>
          )}
        </For>
      </Show>
    </div>
  );
}
