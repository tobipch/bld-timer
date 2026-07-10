import { ROTATION_FACE_MAPS, type Face, FACES } from "../cube/geometry";

/**
 * Color-scheme orientation: instead of rotation strings, users pick which
 * color faces up and front when they solve; the equivalent rotation from
 * white-top/green-front (WCA) is derived.
 */

export const FACE_COLOR: Record<Face, string> = {
  U: "white",
  D: "yellow",
  F: "green",
  B: "blue",
  R: "red",
  L: "orange",
};

export const COLOR_HEX: Record<string, string> = {
  white: "#f5f5f5",
  yellow: "#ffd500",
  green: "#00a651",
  blue: "#0051ba",
  red: "#d32f2f",
  orange: "#ff8f00",
};

export const ALL_COLORS = Object.values(FACE_COLOR);

const faceOfColor = (color: string): Face =>
  (Object.keys(FACE_COLOR) as Face[]).find((f) => FACE_COLOR[f] === color)!;

type FaceMap = Record<Face, Face>;
const ID: FaceMap = { U: "U", D: "D", L: "L", R: "R", F: "F", B: "B" };

function applyRot(map: FaceMap, rot: "x" | "y" | "z", times: number): FaceMap {
  let out = map;
  for (let i = 0; i < times; i++) {
    const m = ROTATION_FACE_MAPS[rot];
    const next = {} as FaceMap;
    for (const f of FACES) next[m[f]] = out[f];
    out = next;
  }
  return out;
}

const FIRST_STAGE: [string, FaceMap][] = [
  ["", ID],
  ["x", applyRot(ID, "x", 1)],
  ["x'", applyRot(ID, "x", 3)],
  ["x2", applyRot(ID, "x", 2)],
  ["z", applyRot(ID, "z", 1)],
  ["z'", applyRot(ID, "z", 3)],
];
const SECOND_STAGE: [string, "y" | null, number][] = [
  ["", null, 0],
  ["y", "y", 1],
  ["y'", "y", 3],
  ["y2", "y", 2],
];

/**
 * Rotation tokens taking the WCA orientation to top/front colors, or null
 * when the combination is impossible (same or opposite faces).
 */
export function orientationFromColors(topColor: string, frontColor: string): string | null {
  const top = faceOfColor(topColor);
  const front = faceOfColor(frontColor);
  if (!top || !front) return null;
  for (const [t1, m1] of FIRST_STAGE) {
    for (const [t2, rot, times] of SECOND_STAGE) {
      const m = rot ? applyRot(m1, rot, times) : m1;
      // m[f] = where face f's stickers end up; we need top's face at U etc.
      if (m[top] === "U" && m[front] === "F") {
        return `${t1} ${t2}`.trim();
      }
    }
  }
  return null;
}

/** Colors that can face front for a given top color (adjacent faces). */
export function validFrontColors(topColor: string): string[] {
  return ALL_COLORS.filter((c) => c !== topColor && orientationFromColors(topColor, c) !== null);
}
