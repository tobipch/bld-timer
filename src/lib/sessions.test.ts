import { describe, expect, it } from "vitest";
import { missingModes, sessionMode } from "./sessions";

describe("sessionMode", () => {
  it("keeps a real mode and reads anything else as full", () => {
    expect(sessionMode("edges")).toBe("edges");
    expect(sessionMode("corners")).toBe("corners");
    // a session stored before modes existed
    expect(sessionMode(undefined)).toBe("full");
    expect(sessionMode(null)).toBe("full");
    expect(sessionMode("nonsense")).toBe("full");
  });
});

describe("missingModes", () => {
  it("is every mode when there are no sessions", () => {
    expect(missingModes([])).toEqual(["full", "edges", "corners"]);
  });

  it("is what an account that only ever had one session is missing", () => {
    expect(missingModes([{ mode: "full" }])).toEqual(["edges", "corners"]);
  });

  it("is empty once every mode has somewhere to solve", () => {
    expect(missingModes([{ mode: "corners" }, { mode: "full" }, { mode: "edges" }])).toEqual([]);
  });

  it("does not care how many sessions share a mode", () => {
    expect(missingModes([{ mode: "full" }, { mode: "full" }, { mode: "edges" }])).toEqual(["corners"]);
  });
});
