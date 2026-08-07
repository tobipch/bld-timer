import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { DEFAULT_DNF_CATEGORIES } from "~/lib/dnf";
import { useApp } from "~/state/app";

const NEW_COLORS = ["#4da3ff", "#c77dff", "#e8a13c", "#7ee081", "#e25d5d", "#3ad0d0", "#f2d14e"];

const hintFor = (name: string) => DEFAULT_DNF_CATEGORIES.find((c) => c.name === name)?.hint ?? "";

/**
 * "Why did this one fail?" — one click (or one number key) per DNF. Fast
 * enough to do between solves, which is the only way the numbers stay honest.
 */
export function DnfPicker(props: {
  solveId: string;
  current: string | null | undefined;
  /** 1–9 select a category while this picker is the active prompt */
  hotkeys?: boolean;
  onPicked?: () => void;
}) {
  const app = useApp();
  const [adding, setAdding] = createSignal(false);
  const [name, setName] = createSignal("");

  const pick = (id: string | null) => {
    void app.setDnfCategory(props.solveId, id);
    props.onPicked?.();
  };

  onMount(() => {
    if (!props.hotkeys) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const n = Number(e.key);
      if (!Number.isInteger(n) || n < 1) return;
      const cat = app.dnfCategories()[n - 1];
      if (!cat) return;
      e.preventDefault();
      pick(cat.id);
    };
    window.addEventListener("keydown", onKey);
    onCleanup(() => window.removeEventListener("keydown", onKey));
  });

  return (
    <div class="dnf-picker">
      <div class="dnf-chips">
        <For each={app.dnfCategories()}>
          {(c, i) => (
            <button
              class="dnf-chip"
              classList={{ picked: props.current === c.id }}
              style={{ "--chip": c.color }}
              title={hintFor(c.name)}
              onClick={() => pick(props.current === c.id ? null : c.id)}
            >
              <Show when={props.hotkeys && i() < 9}>
                <kbd>{i() + 1}</kbd>
              </Show>
              {c.name}
            </button>
          )}
        </For>
        <Show
          when={adding()}
          fallback={
            <button class="dnf-chip dnf-add" onClick={() => setAdding(true)}>
              + new
            </button>
          }
        >
          <form
            class="dnf-new"
            onSubmit={(e) => {
              e.preventDefault();
              const n = name().trim();
              if (!n) return setAdding(false);
              const color = NEW_COLORS[app.dnfCategories().length % NEW_COLORS.length];
              void app.addDnfCategory(n, color).then((cat) => cat && pick(cat.id));
              setName("");
              setAdding(false);
            }}
          >
            <input
              autofocus
              placeholder="category name"
              value={name()}
              onInput={(e) => setName(e.currentTarget.value)}
              onKeyDown={(e) => e.key === "Escape" && setAdding(false)}
            />
            <button class="primary" type="submit">
              Add
            </button>
          </form>
        </Show>
      </div>
    </div>
  );
}
