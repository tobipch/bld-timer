import { describe, expect, it } from "vitest";
import { isRetiredSession } from "./sessions";

describe("isRetiredSession", () => {
  it("hides edge-only and corner-only sessions", () => {
    expect(isRetiredSession("edges")).toBe(true);
    expect(isRetiredSession("corners")).toBe(true);
  });

  it("keeps full sessions and ones stored before modes existed", () => {
    expect(isRetiredSession("full")).toBe(false);
    expect(isRetiredSession(undefined)).toBe(false);
    expect(isRetiredSession(null)).toBe(false);
  });
});
