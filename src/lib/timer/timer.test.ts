import { describe, expect, it } from "vitest";
import { algToOuterMoves, invertOuterMoves } from "../cube/alg";
import { buffersFromNames } from "../engine/classify";
import { defaultBuffers } from "../cube/speffz";
import { ScrambleFollower } from "./follow";
import { TimerMachine } from "./machine";

const bufs = defaultBuffers();
const buffers = buffersFromNames(bufs.corners, bufs.edges);

describe("ScrambleFollower", () => {
  it("tracks progress through a plain scramble", () => {
    const f = new ScrambleFollower("R U2 F'");
    expect(f.display().tokens.map((t) => t.status)).toEqual(["current", "pending", "pending"]);
    f.onMove({ face: "R", amount: 1 });
    expect(f.display().tokens.map((t) => t.status)).toEqual(["done", "current", "pending"]);
    f.onMove({ face: "U", amount: 1 }); // half of U2
    expect(f.display().partial).toBe(true);
    expect(f.display().corrections).toEqual([]);
    f.onMove({ face: "U", amount: 1 });
    f.onMove({ face: "F", amount: 3 });
    expect(f.isDone).toBe(true);
  });

  it("collects corrections for wrong moves and clears them when undone", () => {
    const f = new ScrambleFollower("R U");
    f.onMove({ face: "F", amount: 1 });
    expect(f.display().corrections).toEqual(["F'"]);
    f.onMove({ face: "D", amount: 1 });
    expect(f.display().corrections).toEqual(["D'", "F'"]);
    f.onMove({ face: "D", amount: 3 });
    f.onMove({ face: "F", amount: 3 });
    expect(f.display().corrections).toEqual([]);
    f.onMove({ face: "R", amount: 1 });
    f.onMove({ face: "U", amount: 1 });
    expect(f.isDone).toBe(true);
  });

  it("matches a 3BLD scramble with a wide-move orientation suffix", () => {
    const f = new ScrambleFollower("R U Rw2 Uw'");
    // Rw2 is reported as L2, then Uw' as U' through the x2-shifted frame? No:
    // the translation is exactly what tokensToOuterMoves yields — feed that.
    for (const m of algToOuterMoves("R U Rw2 Uw'")) f.onMove(m);
    expect(f.isDone).toBe(true);
  });
});

describe("TimerMachine", () => {
  function readyMachine(scramble = "R U") {
    const m = new TimerMachine(buffers);
    m.connect();
    m.setScramble(scramble);
    for (const mv of algToOuterMoves(scramble)) m.onCubeMove(mv, 0, 0);
    expect(m.phase).toBe("ready");
    return m;
  }

  it("runs a successful solve through memo and exec", () => {
    const m = readyMachine("R U");
    m.trigger(1000); // memo starts
    expect(m.phase).toBe("memo");
    // undo the scramble = solve it (U' R')
    const solution = invertOuterMoves(algToOuterMoves("R U"));
    m.onCubeMove(solution[0], 6000, 6000);
    expect(m.phase).toBe("exec");
    m.onCubeMove(solution[1], 6400, 6400);
    expect(m.phase).toBe("exec"); // solved but the timer keeps running
    m.trigger(7000);
    expect(m.phase).toBe("done");
    const o = m.lastOutcome!;
    expect(o.result).toBe("ok");
    expect(o.memoMs).toBe(5000);
    expect(o.execMs).toBe(1000);
    expect(o.totalMs).toBe(6000);
  });

  it("space during exec with an unsolved cube is a DNF", () => {
    const m = readyMachine("R U");
    m.trigger(1000);
    m.onCubeMove({ face: "U", amount: 3 }, 2000, 2000); // only half the solution
    m.trigger(3000);
    expect(m.lastOutcome!.result).toBe("dnf");
    expect(m.lastOutcome!.reconstruction.solved).toBe(false);
  });

  it("space during memo is a DNF without execution", () => {
    const m = readyMachine();
    m.trigger(1000);
    m.trigger(4000);
    const o = m.lastOutcome!;
    expect(o.result).toBe("dnf");
    expect(o.memoMs).toBe(3000);
    expect(o.execMs).toBe(0);
    expect(o.moves).toHaveLength(0);
  });

  it("turning the cube in ready drops back to scrambling", () => {
    const m = readyMachine();
    m.onCubeMove({ face: "F", amount: 1 }, 0, 0);
    expect(m.phase).toBe("scrambling");
    expect(m.snapshot().follower!.display().corrections).toEqual(["F'"]);
    m.onCubeMove({ face: "F", amount: 3 }, 0, 0);
    // undoing the stray move re-arms ready
    expect(m.phase).toBe("ready");
  });

  it("after a DNF the next solve waits for the cube to be solved again", () => {
    const m = readyMachine("R U");
    m.trigger(1000);
    m.onCubeMove({ face: "U", amount: 3 }, 2000, 2000);
    m.trigger(3000);
    m.setScramble("F2 D");
    m.nextSolve();
    expect(m.phase).toBe("awaitSolved");
    m.onCubeMove({ face: "R", amount: 3 }, 4000, 4000); // now physically solved
    expect(m.phase).toBe("scrambling");
    expect(m.snapshot().scramble).toBe("F2 D");
  });

  it("after a success the next scramble starts immediately", () => {
    const m = readyMachine("R U");
    m.trigger(1000);
    for (const mv of invertOuterMoves(algToOuterMoves("R U"))) m.onCubeMove(mv, 2000, 2000);
    m.trigger(3000);
    m.setScramble("L D2");
    m.nextSolve();
    expect(m.phase).toBe("scrambling");
  });
});
