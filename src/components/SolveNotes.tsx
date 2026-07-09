import { createEffect, createSignal, Show } from "solid-js";
import type { SolveRecord } from "~/lib/storage/types";
import { useApp } from "~/state/app";

/**
 * Per-solve feedback note. Confirm individual findings on the review card
 * when the diagnosis was right; write a note when it wasn't (or when
 * something else needs saying). Collected on the Feedback page.
 */
export function SolveNotes(props: { solve: SolveRecord }) {
  const app = useApp();
  const [draft, setDraft] = createSignal(props.solve.note ?? "");
  const [savedAt, setSavedAt] = createSignal<number | null>(null);

  // switching to another solve loads its note
  createEffect(() => {
    setDraft(props.solve.note ?? "");
    setSavedAt(null);
  });

  const dirty = () => draft() !== (props.solve.note ?? "");
  const save = () => {
    if (!dirty()) return;
    void app.setSolveFeedback(props.solve.id, { note: draft() });
    setSavedAt(Date.now());
  };

  return (
    <div class="card solve-notes">
      <h3>Feedback note</h3>
      <p class="muted solve-notes-hint">
        If a finding above is right, mark it "correctly diagnosed". Write a note when the engine got it
        wrong or missed something — notes are collected on the Feedback page.
      </p>
      <textarea
        rows={3}
        placeholder="What did the engine get wrong or miss on this solve?"
        value={draft()}
        onInput={(e) => setDraft(e.currentTarget.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") save();
        }}
      />
      <div class="solve-notes-row">
        <button onClick={save} disabled={!dirty()}>
          Save note
        </button>
        <Show when={!dirty() && (savedAt() || props.solve.note)}>
          <span class="good">saved ✓</span>
        </Show>
      </div>
    </div>
  );
}
