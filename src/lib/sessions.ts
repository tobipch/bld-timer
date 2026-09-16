import { isScrambleMode, SCRAMBLE_MODES, type ScrambleMode } from "./scramble";

/**
 * Every mode needs a session to solve in, and the session list is older than
 * the modes are: an account that was already practising has one session with
 * no mode at all. Reading that as "full" and filling in whatever is missing
 * keeps the mode switch working — without it, clicking Edges or Corners has
 * nowhere to go and does nothing at all.
 */

/** A session stored before modes existed is a full-scramble session. */
export function sessionMode(mode: unknown): ScrambleMode {
  return isScrambleMode(mode) ? mode : "full";
}

/** Modes with no session yet, in their canonical order. */
export function missingModes(sessions: { mode: ScrambleMode }[]): ScrambleMode[] {
  return SCRAMBLE_MODES.filter((m) => !sessions.some((s) => s.mode === m));
}
