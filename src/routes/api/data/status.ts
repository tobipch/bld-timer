import type { APIEvent } from "@solidjs/start/server";
import { getDb } from "~/server/db";
import { getAuth, guestAllowed } from "~/server/auth";
import { json } from "~/server/api";

export async function GET(event: APIEvent) {
  const db = getDb();
  if (!db) return json({ db: false, guestAllowed: guestAllowed(), user: null });
  const auth = getAuth();
  const session = auth ? await auth.api.getSession({ headers: event.request.headers }) : null;
  return json({
    db: true,
    guestAllowed: guestAllowed(),
    user: session?.user ? { id: session.user.id, email: session.user.email, name: session.user.name } : null,
  });
}
