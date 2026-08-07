import { createEffect, createRoot } from "solid-js";
import { createStore } from "solid-js/store";
import { defaultBuffers, type BufferConfig, defaultLetterScheme, type LetterScheme } from "~/lib/cube/speffz";
import { defaultProfile, type TechniqueProfile } from "~/lib/engine/profile";

export interface Settings {
  letterScheme: LetterScheme;
  /** rotation sequence like "x y"; derived from the color scheme choice */
  orientation: string;
  /** color scheme: which colors face up/front when solving */
  topColor: string;
  frontColor: string;
  buffers: BufferConfig;
  profile: TechniqueProfile;
  /** space hold before a solve starts; 0 = instant */
  holdMs: number;
  showRunningTime: boolean;
  showTimeDuringMemo: boolean;
  theme: "dark" | "light";
  sessionId: string | null;
  /** the default DNF categories have been created once */
  dnfSeeded: boolean;
}

const KEY = "bld-timer.settings";

function defaults(): Settings {
  return {
    letterScheme: defaultLetterScheme(),
    orientation: "",
    topColor: "white",
    frontColor: "green",
    buffers: defaultBuffers(),
    profile: defaultProfile(),
    holdMs: 0,
    showRunningTime: true,
    showTimeDuringMemo: true,
    theme: "dark",
    sessionId: null,
    dnfSeeded: false,
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
      profile: { ...d.profile, ...(parsed.profile ?? {}) },
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
