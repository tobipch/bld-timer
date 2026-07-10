/**
 * The user's BLD method, declared once (onboarding / settings). The judge
 * derives from this which next actions are valid at any cube state, so
 * solve checking is rule-driven instead of heuristic.
 */

export type CornerMethod = "3style" | "op" | "orozco";
export type EdgeMethod = "3style" | "op" | "m2" | "orozco";

export interface TechniqueProfile {
  cornerMethod: CornerMethod;
  edgeMethod: EdgeMethod;
  /** ECCE = memo edges,corners / execute corners,edges */
  execOrder: "corners-first" | "edges-first";
  /** parity handled by parking the last edge target (pseudo swap) */
  pseudoSwap: boolean;
  /** Last Target Corner Twist algs (3-style corners only) */
  ltct: boolean;
  /** floating buffers: buffers beyond the first may open new cycles */
  floating: boolean;
  /** Orozco helper stickers */
  orozcoCornerHelper: string;
  orozcoEdgeHelper: string;
  onboarded: boolean;
}

export function defaultProfile(): TechniqueProfile {
  return {
    cornerMethod: "3style",
    edgeMethod: "3style",
    execOrder: "corners-first",
    pseudoSwap: true,
    ltct: true,
    floating: true,
    orozcoCornerHelper: "UBL",
    orozcoEdgeHelper: "UB",
    onboarded: false,
  };
}

/** Conventional standard buffers per method. */
export function defaultBufferFor(kind: "corner" | "edge", method: CornerMethod | EdgeMethod): string {
  if (kind === "corner") {
    return method === "op" ? "UBL" : "UFR";
  }
  switch (method) {
    case "op":
      return "UR";
    case "m2":
      return "DF";
    default:
      return "UF";
  }
}
