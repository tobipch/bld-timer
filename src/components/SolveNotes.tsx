import { createEffect, createSignal, on, Show } from "solid-js";
import type { SolveRecord } from "~/lib/storage/types";
import { useApp } from "~/state/app";

/** Per-solve note: what actually went wrong, in your own words. */
export function SolveNotes(props: { solve: SolveRecord }) {
  const app = useApp();
  const [draft, setDraft] = createSignal(props.solve.note ?? "");
  const [savedAt, setSavedAt] = createSignal<number | null>(null);

  createEffect(
    on(
      () => props.solve.id,
      () => {
        setDraft(props.solve.note ?? "");
        setSavedAt(null);
      },
      { defer: true },
    ),
  );

  const dirty = () => draft() !== (props.solve.note ?? "");
  const save = () => {
    if (!dirty()) return;
    void app.updateSolve(props.solve.id, { note: draft() });
    setSavedAt(Date.now());
  };

  return (
    <div class="solve-notes">
      <textarea
        rows={2}
        placeholder="Note — e.g. “swapped the last two edge targets”"
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
