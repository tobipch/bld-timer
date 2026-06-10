import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { getDb, schema, type Db } from "./db";

function createAuth(db: Db) {
  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
      },
    }),
    emailAndPassword: {
      enabled: true,
    },
  });
}

let cached: ReturnType<typeof createAuth> | null | undefined;

/** better-auth instance, or null when no database is configured. */
export function getAuth() {
  if (cached !== undefined) return cached;
  const db = getDb();
  cached = db ? createAuth(db) : null;
  return cached;
}

export const GUEST_USER_ID = "guest-default-user";

export function guestAllowed(): boolean {
  return process.env.ALLOW_GUEST_FALLBACK !== "false";
}

/**
 * Resolve the acting user for a request: the better-auth session user, or
 * the shared default user when guest fallback is enabled.
 * Returns null when unauthenticated and guests are disabled.
 */
export async function resolveUserId(request: Request): Promise<{ id: string; guest: boolean } | null> {
  const auth = getAuth();
  if (auth) {
    const session = await auth.api.getSession({ headers: request.headers });
    if (session?.user) return { id: session.user.id, guest: false };
  }
  if (!guestAllowed()) return null;
  await ensureGuestUser();
  return { id: GUEST_USER_ID, guest: true };
}

async function ensureGuestUser() {
  const db = getDb();
  if (!db) return;
  await db
    .insert(schema.user)
    .values({
      id: GUEST_USER_ID,
      name: "Guest",
      email: "guest@bld-timer.local",
      emailVerified: false,
    })
    .onConflictDoNothing();
}
