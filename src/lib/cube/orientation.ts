import { FACES, ROTATION_FACE_MAPS, type Face } from "./geometry";
import type { AlgToken } from "./alg";

/**
 * Holding orientation.
 *
 * A smart cube reports turns in its own frame, which is fixed to the cube:
 * the white face is always U to the hardware, whatever way round you are
 * holding it. Scrambles are written in that same frame — the WCA convention
 * is white up, green front.
 *
 * Someone who solves with a different pair of colours up and front would
 * otherwise have to turn the cube into the WCA orientation to scramble it and
 * back again to solve it. Instead, the scramble is *displayed* in the frame
 * they hold the cube in: the letters change, the physical result does not.
 * Nothing else moves — the follower, the state tracking and the flow
 * measurement all stay in the cube's own frame, where the hardware speaks.
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

const faceOfColor = (color: string): Face | undefined =>
  (Object.keys(FACE_COLOR) as Face[]).find((f) => FACE_COLOR[f] === color);

export type FaceMap = Record<Face, Face>;

export const IDENTITY_FACE_MAP: FaceMap = { U: "U", D: "D", L: "L", R: "R", F: "F", B: "B" };

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

/** The 24 orientations, as maps from the cube's own frame to a held frame. */
function allOrientations(): FaceMap[] {
  const out: FaceMap[] = [];
  for (const [rot, times] of [
    [null, 0],
    ["x", 1],
    ["x", 3],
    ["x", 2],
    ["z", 1],
    ["z", 3],
  ] as const) {
    const first = rot ? applyRot(IDENTITY_FACE_MAP, rot, times) : IDENTITY_FACE_MAP;
    for (let y = 0; y < 4; y++) out.push(applyRot(first, "y", y));
  }
  return out;
}

/**
 * Where each face of the cube's own frame sits when the cube is held with
 * these colours up and front — which is also the letter the user would call
 * that face. Null when the two colours are the same or opposite, since no
 * orientation puts them both where they are asked to be.
 */
export function holdFaceMap(topColor: string, frontColor: string): FaceMap | null {
  const top = faceOfColor(topColor);
  const front = faceOfColor(frontColor);
  if (!top || !front) return null;
  return allOrientations().find((m) => m[top] === "U" && m[front] === "F") ?? null;
}

/** Colours that can face front for a given top colour (the four adjacent ones). */
export function validFrontColors(topColor: string): string[] {
  return ALL_COLORS.filter((c) => holdFaceMap(topColor, c) !== null);
}

/**
 * Which face a slice or a rotation follows, and which axis it lives on. A
 * rotation is named after the face it turns with (x follows R); a slice is
 * named after the outer layer it moves with (M follows L, E follows D,
 * S follows F).
 */
type Axis = "x" | "y" | "z";
const AXIS_OF: Record<Face, { axis: Axis; face: Face }> = {
  R: { axis: "x", face: "R" },
  L: { axis: "x", face: "L" },
  U: { axis: "y", face: "U" },
  D: { axis: "y", face: "D" },
  F: { axis: "z", face: "F" },
  B: { axis: "z", face: "B" },
};
const ROTATION_FOLLOWS: Record<string, Face> = { x: "R", y: "U", z: "F" };
const SLICE_FOLLOWS: Record<string, Face> = { M: "L", E: "D", S: "F" };
const ROTATION_OF_AXIS: Record<Axis, string> = { x: "x", y: "y", z: "z" };
const SLICE_OF_AXIS: Record<Axis, string> = { x: "M", y: "E", z: "S" };

/**
 * The same turn, named in the held frame.
 *
 * Outer and wide turns keep their amount: clockwise-seen-from-outside is the
 * same motion whichever way the cube is held. A slice or a rotation can flip,
 * because it is named after a face that may now be on the other side of its
 * axis.
 */
export function mapToken(token: AlgToken, map: FaceMap): AlgToken {
  if (token.kind === "outer" || token.kind === "wide") {
    return { ...token, base: map[token.base as Face] };
  }
  const follows = token.kind === "rotation" ? ROTATION_FOLLOWS[token.base] : SLICE_FOLLOWS[token.base];
  if (!follows) return token;
  const moved = AXIS_OF[map[follows]];
  const names = token.kind === "rotation" ? ROTATION_OF_AXIS : SLICE_OF_AXIS;
  const keeps = token.kind === "rotation" ? ROTATION_FOLLOWS : SLICE_FOLLOWS;
  const sameWay = moved.face === keeps[names[moved.axis]];
  return {
    ...token,
    base: names[moved.axis],
    amount: sameWay ? token.amount : (4 - token.amount) % 4,
  };
}
