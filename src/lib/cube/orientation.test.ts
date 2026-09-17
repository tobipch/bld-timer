import { describe, expect, it } from "vitest";
import { algToOuterMoves, formatToken, parseAlg, tokensToOuterMoves } from "./alg";
import { FACES } from "./geometry";
import { applyMoves, solvedState, statesEqual } from "./state";
import {
  ALL_COLORS,
  FACE_COLOR,
  holdFaceMap,
  IDENTITY_FACE_MAP,
  mapToken,
  validFrontColors,
} from "./orientation";

/** The 24 ways to hold a cube, as rotation sequences. */
const ROTATIONS = ["", "x", "x'", "x2", "z", "z'"].flatMap((a) =>
  ["", "y", "y'", "y2"].map((b) => `${a} ${b}`.trim()),
);

/** The scramble, in the held frame, as one string. */
function held(alg: string, topColor: string, frontColor: string): string {
  const map = holdFaceMap(topColor, frontColor)!;
  return parseAlg(alg)
    .map((t) => formatToken(mapToken(t, map)))
    .join(" ");
}

describe("holdFaceMap", () => {
  it("is the identity for the WCA orientation", () => {
    expect(holdFaceMap("white", "green")).toEqual(IDENTITY_FACE_MAP);
  });

  it("refuses a pair no orientation can produce", () => {
    expect(holdFaceMap("white", "white")).toBeNull();
    expect(holdFaceMap("white", "yellow")).toBeNull();
    expect(holdFaceMap("green", "blue")).toBeNull();
    expect(holdFaceMap("white", "chartreuse")).toBeNull();
  });

  it("puts the chosen colours up and front", () => {
    for (const top of ALL_COLORS) {
      for (const front of validFrontColors(top)) {
        const map = holdFaceMap(top, front)!;
        const upFace = FACES.find((f) => map[f] === "U")!;
        const frontFace = FACES.find((f) => map[f] === "F")!;
        expect(FACE_COLOR[upFace]).toBe(top);
        expect(FACE_COLOR[frontFace]).toBe(front);
      }
    }
  });

  it("agrees with the frame the alg translator derives for every orientation", () => {
    for (const rotation of ROTATIONS) {
      // the translator's frame goes the other way: held face -> cube face
      const { frame } = tokensToOuterMoves(parseAlg(rotation || "x4"));
      const map = holdFaceMap(FACE_COLOR[frame.U], FACE_COLOR[frame.F])!;
      expect(map).toBeTruthy();
      for (const f of FACES) expect(map[frame[f]]).toBe(f);
    }
  });

  it("is a bijection", () => {
    for (const top of ALL_COLORS) {
      for (const front of validFrontColors(top)) {
        const map = holdFaceMap(top, front)!;
        expect(new Set(FACES.map((f) => map[f])).size).toBe(6);
      }
    }
  });
});

describe("validFrontColors", () => {
  it("is the four colours next to the top one", () => {
    expect(validFrontColors("white").sort()).toEqual(["blue", "green", "orange", "red"]);
    expect(validFrontColors("green").sort()).toEqual(["orange", "red", "white", "yellow"]);
  });
});

describe("mapToken", () => {
  it("leaves everything alone in the WCA orientation", () => {
    const alg = "R U2 F' Lw M2 x y'";
    expect(held(alg, "white", "green")).toBe(alg);
  });

  it("renames the layers as the holder sees them", () => {
    // yellow up, green front: the cube is upside down, so U and D swap and
    // so do L and R, while F and B stay put
    expect(held("U", "yellow", "green")).toBe("D");
    expect(held("D2", "yellow", "green")).toBe("U2");
    expect(held("R'", "yellow", "green")).toBe("L'");
    expect(held("F", "yellow", "green")).toBe("F");
  });

  it("flips a slice that ends up on the other side of its axis", () => {
    // M follows L; held upside down the same middle layer follows R, so it
    // reads as M in the other direction
    expect(held("M", "yellow", "green")).toBe("M'");
    expect(held("M2", "yellow", "green")).toBe("M2");
    // E follows D, which is now U: same flip
    expect(held("E", "yellow", "green")).toBe("E'");
    // S follows F, which has not moved
    expect(held("S", "yellow", "green")).toBe("S");
  });

  it("moves a slice to another axis when the hold does", () => {
    // green up, white front puts the U/D axis where the F/B one was and the
    // other way round, so E and S trade places; both flip, because each
    // lands on the opposite side of the face its letter follows
    expect(held("E", "green", "white")).toBe("S'");
    expect(held("S", "green", "white")).toBe("E'");
  });

  /**
   * The real test: turning the displayed letters while holding the cube that
   * way has to leave the cube exactly where the original scramble would.
   * Rotating the cube emits no turns of its own, so prefixing the rotation is
   * the whole simulation of the holder. The turns themselves may come out in
   * a different order — a slice is reported as its two outer layers, and
   * those commute — so what has to match is the cube, not the move list.
   */
  it("produces the same physical scramble in every orientation", () => {
    const scrambles = [
      "R U2 F' L2 B D' R2 U L' F2 D2 B' R F U2 L D B2 R' U'",
      "L2 U2 L2 Rw' Dw",
      "F R U' M2 S E' x y2 Lw2 Dw'",
    ];
    for (const rotation of ROTATIONS) {
      const { frame } = tokensToOuterMoves(parseAlg(rotation || "x4"));
      const top = FACE_COLOR[frame.U];
      const front = FACE_COLOR[frame.F];
      for (const scramble of scrambles) {
        const display = held(scramble, top, front);
        const reached = applyMoves(solvedState(), algToOuterMoves(`${rotation} ${display}`.trim()));
        const wanted = applyMoves(solvedState(), algToOuterMoves(scramble));
        expect(statesEqual(reached, wanted)).toBe(true);
      }
    }
  });
});
