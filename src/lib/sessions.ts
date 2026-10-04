/**
 * Edge-only and corner-only practice no longer exist. Their sessions are
 * still stored (nothing recorded gets destroyed), they are just not shown.
 */
export function isRetiredSession(mode: unknown): boolean {
  return mode === "edges" || mode === "corners";
}

/** The session every account starts with. */
export const DEFAULT_SESSION_NAME = "Main";
