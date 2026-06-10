/**
 * Piece-level cube geometry, all in the cube's intrinsic ("core") frame:
 * centers never move. Smart cubes without gyro report every physical turn
 * (including slices/wide turns) as outer-layer turns relative to the core,
 * so this frame is exactly what the move stream describes.
 *
 * Conventions (Kociemba-compatible):
 * - Corner slots listed with their sticker faces in clockwise order starting
 *   from the U/D face. co[slot] = o means: piece sticker i sits at slot
 *   sticker position (i + o) mod 3.
 * - Edge slots listed as (reference, other) where reference is U/D for
 *   U/D-layer edges and F/B for E-slice edges. eo analogous, mod 2.
 */

export type Face = "U" | "D" | "L" | "R" | "F" | "B";
export const FACES: Face[] = ["U", "D", "L", "R", "F", "B"];

export const CORNER_SLOTS = [
  "UFR",
  "UFL",
  "UBL",
  "UBR",
  "DFR",
  "DFL",
  "DBL",
  "DBR",
] as const;
export type CornerSlot = (typeof CORNER_SLOTS)[number];

export const EDGE_SLOTS = [
  "UR",
  "UF",
  "UL",
  "UB",
  "DR",
  "DF",
  "DB",
  "DL",
  "FR",
  "FL",
  "BL",
  "BR",
] as const;
export type EdgeSlot = (typeof EDGE_SLOTS)[number];

/** Sticker faces of each corner slot, clockwise starting at the U/D face. */
const CORNER_FACES: Record<CornerSlot, [Face, Face, Face]> = {
  UFR: ["U", "R", "F"],
  UFL: ["U", "F", "L"],
  UBL: ["U", "L", "B"],
  UBR: ["U", "B", "R"],
  DFR: ["D", "F", "R"],
  DFL: ["D", "L", "F"],
  DBL: ["D", "B", "L"],
  DBR: ["D", "R", "B"],
};

/** Sticker faces of each edge slot: (reference face, other face). */
const EDGE_FACES: Record<EdgeSlot, [Face, Face]> = {
  UR: ["U", "R"],
  UF: ["U", "F"],
  UL: ["U", "L"],
  UB: ["U", "B"],
  DR: ["D", "R"],
  DF: ["D", "F"],
  DB: ["D", "B"],
  DL: ["D", "L"],
  FR: ["F", "R"],
  FL: ["F", "L"],
  BL: ["B", "L"],
  BR: ["B", "R"],
};

/**
 * Sticker name as used in Speffz-style schemes: the face the sticker is on,
 * followed by the other faces of the piece. cornerStickerName(slot, i) is the
 * name of sticker position i of that slot.
 */
export function cornerStickerName(slot: number, sticker: number): string {
  const faces = CORNER_FACES[CORNER_SLOTS[slot]];
  const on = faces[sticker];
  const others = CORNER_SLOTS[slot].split("").filter((f) => f !== on);
  return on + others.join("");
}

export function edgeStickerName(slot: number, sticker: number): string {
  const faces = EDGE_FACES[EDGE_SLOTS[slot]];
  return sticker === 0 ? faces[0] + faces[1] : faces[1] + faces[0];
}

/** Look up (slot, sticker) from a sticker name like "RDF" or "LU". */
export function cornerStickerByName(name: string): { slot: number; sticker: number } | null {
  for (let s = 0; s < 8; s++)
    for (let i = 0; i < 3; i++) if (cornerStickerName(s, i) === name) return { slot: s, sticker: i };
  return null;
}

export function edgeStickerByName(name: string): { slot: number; sticker: number } | null {
  for (let s = 0; s < 12; s++)
    for (let i = 0; i < 2; i++) if (edgeStickerName(s, i) === name) return { slot: s, sticker: i };
  return null;
}

/**
 * A permutation step: dst slot receives the content of srcPerm[dst], with
 * oriDelta[dst] added to its orientation.
 */
export interface PermStep {
  cornerSrc: number[];
  cornerDelta: number[];
  edgeSrc: number[];
  edgeDelta: number[];
}

type FaceMap = Record<Face, Face>;

const Y_MAP: FaceMap = { U: "U", D: "D", F: "L", L: "B", B: "R", R: "F" };
const X_MAP: FaceMap = { R: "R", L: "L", F: "U", U: "B", B: "D", D: "F" };
const Z_MAP: FaceMap = { F: "F", B: "B", U: "R", R: "D", D: "L", L: "U" };

function invertMap(m: FaceMap): FaceMap {
  const out = {} as FaceMap;
  for (const f of FACES) out[m[f]] = f;
  return out;
}

function canonicalCorner(faces: Face[]): number {
  const set = new Set(faces);
  for (let s = 0; s < 8; s++) {
    if (CORNER_FACES[CORNER_SLOTS[s]].every((f) => set.has(f))) return s;
  }
  throw new Error(`no corner slot for faces ${faces.join("")}`);
}

function canonicalEdge(faces: Face[]): number {
  const set = new Set(faces);
  for (let s = 0; s < 12; s++) {
    if (EDGE_FACES[EDGE_SLOTS[s]].every((f) => set.has(f))) return s;
  }
  throw new Error(`no edge slot for faces ${faces.join("")}`);
}

/**
 * Build the permutation step performed by applying a face map to a set of
 * slots (a layer for face turns, everything for whole-cube rotations).
 * Physical turns preserve the clockwise sticker order, so the sticker-index
 * shift is constant per slot; this is asserted.
 */
function buildStep(map: FaceMap, affects: (faces: Face[]) => boolean): PermStep {
  const cornerSrc = [0, 1, 2, 3, 4, 5, 6, 7];
  const cornerDelta = [0, 0, 0, 0, 0, 0, 0, 0];
  const edgeSrc = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  const edgeDelta = edgeSrc.map(() => 0);

  for (let s = 0; s < 8; s++) {
    const faces = CORNER_FACES[CORNER_SLOTS[s]];
    if (!affects(faces)) continue;
    const dst = canonicalCorner(faces.map((f) => map[f]));
    const dstFaces = CORNER_FACES[CORNER_SLOTS[dst]];
    let delta = -1;
    for (let i = 0; i < 3; i++) {
      const j = dstFaces.indexOf(map[faces[i]]);
      const d = (j - i + 3) % 3;
      if (delta === -1) delta = d;
      else if (delta !== d) throw new Error("corner sticker order not preserved");
    }
    cornerSrc[dst] = s;
    cornerDelta[dst] = delta;
  }

  for (let s = 0; s < 12; s++) {
    const faces = EDGE_FACES[EDGE_SLOTS[s]];
    if (!affects(faces)) continue;
    const dst = canonicalEdge(faces.map((f) => map[f]));
    const dstFaces = EDGE_FACES[EDGE_SLOTS[dst]];
    const j = dstFaces.indexOf(map[faces[0]]);
    edgeSrc[dst] = s;
    edgeDelta[dst] = j;
  }

  return { cornerSrc, cornerDelta, edgeSrc, edgeDelta };
}

const layer = (face: Face) => (faces: Face[]) => faces.includes(face);
const all = () => true;

/** Quarter-turn steps for the six outer moves, in the core frame. */
export const MOVE_STEPS: Record<Face, PermStep> = {
  U: buildStep(Y_MAP, layer("U")),
  D: buildStep(invertMap(Y_MAP), layer("D")),
  R: buildStep(X_MAP, layer("R")),
  L: buildStep(invertMap(X_MAP), layer("L")),
  F: buildStep(Z_MAP, layer("F")),
  B: buildStep(invertMap(Z_MAP), layer("B")),
};

/**
 * Whole-cube rotation steps. NOT used for state tracking (the core frame has
 * no rotations) — used to remap stickers/slots for the user's orientation
 * setting and to translate rotation-containing algs.
 */
export const ROTATION_STEPS: Record<"x" | "y" | "z", PermStep> = {
  x: buildStep(X_MAP, all),
  y: buildStep(Y_MAP, all),
  z: buildStep(Z_MAP, all),
};

/** Face maps for rotations, used by the alg translator. */
export const ROTATION_FACE_MAPS: Record<"x" | "y" | "z", FaceMap> = {
  x: X_MAP,
  y: Y_MAP,
  z: Z_MAP,
};
