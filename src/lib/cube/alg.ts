import { ROTATION_FACE_MAPS, type Face, FACES } from "./geometry";
import type { OuterMove } from "./state";

/**
 * Alg parsing and translation.
 *
 * Algorithms may contain outer moves (R U2 F'), rotations (x y z), slices
 * (M E S), wide moves (Rw / r), and commutator/conjugate notation
 * ([A, B] = A B A' B', [A: B] = A B A').
 *
 * For state tracking everything is translated to the outer moves a gyro-less
 * smart cube would actually report: slices and wide moves shift the core, so
 * e.g. a physical M is reported as R L' and all subsequent letters are
 * re-interpreted through the shifted frame — exactly like the real hardware.
 */

export interface AlgToken {
  kind: "outer" | "rotation" | "slice" | "wide";
  base: string; // U D L R F B x y z M E S (wide uses the outer face letter)
  amount: number; // 1..3 effective, signed handled at parse time
}

const TOKEN_RE = /^([UDLRFB]w?|[udlrfb]|[MES]|[xyz])(\d*)('?)$/;

/** Two moves written without a space, like "DU'" (= D U') or "UD2" (= U D2). */
const COMBINED_RE = /^([UDLRFB])([UDLRFB])(\d*)('?)$/;

function parseCombined(raw: string): AlgToken[] | null {
  const m = COMBINED_RE.exec(raw);
  if (!m) return null;
  const [, a, b, num, prime] = m;
  return [parseToken(a), parseToken(b + (num ?? "") + (prime ?? ""))];
}

function parseToken(raw: string): AlgToken {
  const m = TOKEN_RE.exec(raw);
  if (!m) throw new Error(`unrecognized move token: "${raw}"`);
  let [, letter, num, prime] = m;
  let amount = num ? parseInt(num, 10) : 1;
  if (prime) amount = -amount;
  amount = ((amount % 4) + 4) % 4;

  let kind: AlgToken["kind"];
  let base: string;
  if (letter.length === 2 && letter[1] === "w") {
    kind = "wide";
    base = letter[0];
  } else if (letter >= "a" && letter <= "z" && "udlrfb".includes(letter)) {
    kind = "wide";
    base = letter.toUpperCase();
  } else if ("MES".includes(letter)) {
    kind = "slice";
    base = letter;
  } else if ("xyz".includes(letter)) {
    kind = "rotation";
    base = letter;
  } else {
    kind = "outer";
    base = letter;
  }
  return { kind, base, amount };
}

function invertTokens(tokens: AlgToken[]): AlgToken[] {
  return tokens
    .slice()
    .reverse()
    .map((t) => ({ ...t, amount: (4 - t.amount) % 4 }));
}

/**
 * Parse an alg string with optional [A: B] / [A, B] notation into a flat
 * token list. Throws on malformed input.
 */
export function parseAlg(input: string): AlgToken[] {
  // parentheses are visual grouping only
  const spaced = input.replace(/[()]/g, " ").replace(/([[\]:,])/g, " $1 ");
  const words = spaced.split(/\s+/).filter((w) => w.length > 0);
  let pos = 0;

  function parseSeq(stop: Set<string>): AlgToken[] {
    const out: AlgToken[] = [];
    while (pos < words.length && !stop.has(words[pos])) {
      const w = words[pos];
      if (w === "[") {
        pos++;
        const a = parseSeq(new Set([":", ",", "]"]));
        const sep = words[pos];
        if (sep === ":") {
          pos++;
          const b = parseSeq(new Set(["]"]));
          expect("]");
          out.push(...a, ...b, ...invertTokens(a));
        } else if (sep === ",") {
          pos++;
          const b = parseSeq(new Set(["]"]));
          expect("]");
          out.push(...a, ...b, ...invertTokens(a), ...invertTokens(b));
        } else if (sep === "]") {
          // plain grouping brackets: [A B C]
          pos++;
          out.push(...a);
        } else {
          throw new Error("expected ':' or ',' in bracket group");
        }
      } else if (w === "]" || w === ":" || w === ",") {
        throw new Error(`unexpected "${w}"`);
      } else {
        const combined = parseCombined(w);
        const ts = combined ?? [parseToken(w)];
        for (const t of ts) if (t.amount !== 0) out.push(t);
        pos++;
      }
    }
    return out;
  }

  function expect(w: string) {
    if (words[pos] !== w) throw new Error(`expected "${w}"`);
    pos++;
  }

  const seq = parseSeq(new Set());
  if (pos !== words.length) throw new Error("trailing input");
  return seq;
}

type FaceMap = Record<Face, Face>;

const ID_MAP: FaceMap = { U: "U", D: "D", L: "L", R: "R", F: "F", B: "B" };

/** After rotation r (face map m), the new frame is newFrame[m[f]] = oldFrame[f]. */
function rotateFrame(frame: FaceMap, rot: "x" | "y" | "z", amount: number): FaceMap {
  let out = frame;
  const m = ROTATION_FACE_MAPS[rot];
  const n = ((amount % 4) + 4) % 4;
  for (let k = 0; k < n; k++) {
    const next = {} as FaceMap;
    for (const f of FACES) next[m[f]] = out[f];
    out = next;
  }
  return out;
}

/** Per-slice behaviour: reported outer moves (per +1 amount) and core rotation. */
const SLICE_DEF: Record<string, { moves: [Face, number][]; rot: "x" | "y" | "z"; rotAmount: number }> = {
  // M follows L: core rotates x', R and L' are reported.
  M: { moves: [["R", 1], ["L", -1]], rot: "x", rotAmount: -1 },
  // E follows D: core rotates y', U and D' are reported.
  E: { moves: [["U", 1], ["D", -1]], rot: "y", rotAmount: -1 },
  // S follows F: core rotates z, F' and B are reported.
  S: { moves: [["F", -1], ["B", 1]], rot: "z", rotAmount: 1 },
};

const WIDE_DEF: Record<string, { move: [Face, number]; rot: "x" | "y" | "z"; rotAmount: number }> = {
  R: { move: ["L", 1], rot: "x", rotAmount: 1 },
  L: { move: ["R", 1], rot: "x", rotAmount: -1 },
  U: { move: ["D", 1], rot: "y", rotAmount: 1 },
  D: { move: ["U", 1], rot: "y", rotAmount: -1 },
  F: { move: ["B", 1], rot: "z", rotAmount: 1 },
  B: { move: ["F", 1], rot: "z", rotAmount: -1 },
};

function normAmount(n: number): 1 | 2 | 3 | 0 {
  return (((n % 4) + 4) % 4) as 0 | 1 | 2 | 3;
}

/**
 * Translate a token list into the outer moves a smart cube would report.
 * Returns the moves and the net frame map (logical face -> core face).
 */
export function tokensToOuterMoves(tokens: AlgToken[]): { moves: OuterMove[]; frame: FaceMap } {
  let frame: FaceMap = { ...ID_MAP };
  const out: OuterMove[] = [];

  const emit = (logicalFace: Face, amount: number) => {
    const a = normAmount(amount);
    if (a === 0) return;
    out.push({ face: frame[logicalFace], amount: a });
  };

  for (const t of tokens) {
    if (t.amount === 0) continue;
    if (t.kind === "outer") {
      emit(t.base as Face, t.amount);
    } else if (t.kind === "rotation") {
      frame = rotateFrame(frame, t.base as "x" | "y" | "z", t.amount);
    } else if (t.kind === "slice") {
      const def = SLICE_DEF[t.base];
      const signed = t.amount === 3 ? -1 : t.amount; // 1, 2 or -1
      for (const [f, dir] of def.moves) emit(f, dir * signed);
      frame = rotateFrame(frame, def.rot, def.rotAmount * signed);
    } else {
      const def = WIDE_DEF[t.base];
      const signed = t.amount === 3 ? -1 : t.amount;
      emit(def.move[0], def.move[1] * signed);
      frame = rotateFrame(frame, def.rot, def.rotAmount * signed);
    }
  }
  return { moves: out, frame };
}

/** Convenience: parse an alg string and translate to reported outer moves. */
export function algToOuterMoves(alg: string): OuterMove[] {
  return tokensToOuterMoves(parseAlg(alg)).moves;
}

export function outerMoveFromString(s: string): OuterMove {
  const t = parseToken(s.trim());
  if (t.kind !== "outer" || t.amount === 0) throw new Error(`not an outer move: "${s}"`);
  return { face: t.base as Face, amount: t.amount as 1 | 2 | 3 };
}

export function outerMoveToString(m: OuterMove): string {
  return m.face + (m.amount === 2 ? "2" : m.amount === 3 ? "'" : "");
}

export function outerMovesToString(moves: OuterMove[]): string {
  return moves.map(outerMoveToString).join(" ");
}

export function invertOuterMoves(moves: OuterMove[]): OuterMove[] {
  return moves
    .slice()
    .reverse()
    .map((m) => ({ face: m.face, amount: ((4 - m.amount) % 4) as 1 | 2 | 3 }));
}

/** Merge adjacent same-face moves and drop no-ops (for correction display). */
export function simplifyOuterMoves(moves: OuterMove[]): OuterMove[] {
  const out: OuterMove[] = [];
  for (const m of moves) {
    const last = out[out.length - 1];
    if (last && last.face === m.face) {
      const a = normAmount(last.amount + m.amount);
      if (a === 0) out.pop();
      else last.amount = a;
    } else {
      out.push({ ...m });
    }
  }
  return out;
}
