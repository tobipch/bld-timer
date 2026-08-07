import { describe, expect, it, vi } from "vitest";
import { cleanScramble, hasRedundantTurn } from "./scramble";

describe("hasRedundantTurn", () => {
  it("accepts a normal scramble", () => {
    expect(hasRedundantTurn("R U R' U' F2 D L2 B")).toBe(false);
  });

  it("accepts a wide-move suffix that does not touch the last move", () => {
    // Rw' is L' x': the L layer, and the scramble ends on B
    expect(hasRedundantTurn("L2 U2 B Rw' Dw")).toBe(false);
  });

  it("rejects a suffix that merges with the last move", () => {
    // the user's example: L2 then Rw' (= L' x') is really just L
    expect(hasRedundantTurn("L2 U2 L2 Rw' Dw")).toBe(true);
    // real ones seen from cubing.js
    expect(hasRedundantTurn("F' B' R L2 U R2 F B2 L2 F2 R D2 B2 R' F2 R L2 F2 B2 D L2 Rw'")).toBe(true);
    expect(hasRedundantTurn("U D2 L B2 R F2 D2 B2 F2 L2 F2 L' B2 D F2 R F' U L' B U Dw2")).toBe(true);
  });

  it("rejects a same-face pair anywhere, not only at the suffix", () => {
    expect(hasRedundantTurn("R U U' F")).toBe(true);
  });

  it("keeps an unparseable alg rather than judging it", () => {
    expect(hasRedundantTurn("nonsense!!")).toBe(false);
  });
});

describe("cleanScramble", () => {
  it("draws again until a scramble is clean", async () => {
    const generate = vi
      .fn()
      .mockResolvedValueOnce("L2 U2 L2 Rw'")
      .mockResolvedValueOnce("D R2 D Uw")
      .mockResolvedValueOnce("R U F Dw");
    expect(await cleanScramble(generate)).toBe("R U F Dw");
    expect(generate).toHaveBeenCalledTimes(3);
  });

  it("does not draw again when the first one is fine", async () => {
    const generate = vi.fn().mockResolvedValue("R U F Dw");
    expect(await cleanScramble(generate)).toBe("R U F Dw");
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("gives up after a bounded number of draws", async () => {
    const generate = vi.fn().mockResolvedValue("L2 U2 L2 Rw'");
    expect(await cleanScramble(generate, 3)).toBe("L2 U2 L2 Rw'");
    expect(generate).toHaveBeenCalledTimes(3);
  });
});
