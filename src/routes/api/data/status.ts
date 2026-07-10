import type { APIEvent } from "@solidjs/start/server";
import { getDbReady } from "~/server/db";
import { getAuth, guestAllowed, wcaEnabled } from "~/server/auth";
import { json } from "~/server/api";

export async function GET(event: APIEvent) {
  let db = null;
  try {
    db = await getDbReady();
  } catch (e) {
    console.error("migration failed:", e);
    return json({
      db: false,
      guestAllowed: guestAllowed(),
      wca: wcaEnabled(),
      user: null,
      error: "db init failed",
    });
  }
  if (!db) return json({ db: false, guestAllowed: guestAllowed(), wca: wcaEnabled(), user: null });
  const auth = getAuth();
  const session = auth ? await auth.api.getSession({ headers: event.request.headers }) : null;
  return json({
    db: true,
    guestAllowed: guestAllowed(),
    wca: wcaEnabled(),
    user: session?.user ? { id: session.user.id, email: session.user.email, name: session.user.name } : null,
  });
}
