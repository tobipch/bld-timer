import { createEffect, createRoot } from "solid-js";
import { createStore } from "solid-js/store";
import { defaultBuffers, defaultLetterScheme, type BufferConfig, type LetterScheme } from "~/lib/cube/speffz";

export interface Settings {
  letterScheme: LetterScheme;
  /** rotation sequence like "x y"; empty = white top, green front */
  orientation: string;
  buffers: BufferConfig;
  /** space hold before a solve starts; 0 = instant */
  holdMs: number;
  showRunningTime: boolean;
  showTimeDuringMemo: boolean;
  theme: "dark" | "light";
  sessionId: string | null;
}

const KEY = "bld-timer.settings";

function defaults(): Settings {
  return {
    letterScheme: defaultLetterScheme(),
    orientation: "",
    buffers: defaultBuffers(),
    holdMs: 0,
    showRunningTime: true,
    showTimeDuringMemo: true,
    theme: "dark",
    sessionId: null,
  };
}

function load(): Settings {
  if (typeof localStorage === "undefined") return defaults();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults();
    const parsed = JSON.parse(raw);
    const d = defaults();
    return {
      ...d,
      ...parsed,
      letterScheme: {
        corners: { ...d.letterScheme.corners, ...(parsed.letterScheme?.corners ?? {}) },
        edges: { ...d.letterScheme.edges, ...(parsed.letterScheme?.edges ?? {}) },
      },
      buffers: {
        edges: parsed.buffers?.edges ?? d.buffers.edges,
        corners: parsed.buffers?.corners ?? d.buffers.corners,
      },
    };
  } catch {
    return defaults();
  }
}

export const { settings, setSettings, resetLetterScheme } = createRoot(() => {
  const [settings, setSettings] = createStore<Settings>(load());

  createEffect(() => {
    // touch everything for the deep persist
    const snapshot = JSON.stringify(settings);
    if (typeof localStorage !== "undefined") localStorage.setItem(KEY, snapshot);
    if (typeof document !== "undefined") {
      document.documentElement.dataset.theme = settings.theme;
    }
  });

  const resetLetterScheme = () => setSettings("letterScheme", defaultLetterScheme());

  return { settings, setSettings, resetLetterScheme };
});
