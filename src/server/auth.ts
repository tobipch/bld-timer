import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { genericOAuth } from "better-auth/plugins";
import { getDb, schema, type Db } from "./db";

export function wcaEnabled(): boolean {
  return !!(process.env.WCA_CLIENT_ID && process.env.WCA_CLIENT_SECRET);
}

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
    account: {
      accountLinking: {
        enabled: true,
        // WCA verifies its emails, so a WCA login with the same address as
        // an existing email/password account links to it instead of failing
        // with account_not_linked
        trustedProviders: ["wca"],
        // ...and the *local* account does not have to be verified either.
        // better-auth checks both sides; this app has no email verification
        // flow at all, so every password account has emailVerified = false
        // and linking could otherwise never succeed. The trade-off: whoever
        // registered an address first owns it, and a WCA login with that
        // address joins that account.
        requireLocalEmailVerified: false,
      },
    },
    plugins: wcaEnabled()
      ? [
          genericOAuth({
            config: [
              {
                providerId: "wca",
                clientId: process.env.WCA_CLIENT_ID!,
                clientSecret: process.env.WCA_CLIENT_SECRET!,
                authorizationUrl: "https://www.worldcubeassociation.org/oauth/authorize",
                tokenUrl: "https://www.worldcubeassociation.org/oauth/token",
                scopes: ["public", "email"],
                async getUserInfo(tokens) {
                  const res = await fetch("https://www.worldcubeassociation.org/api/v0/me", {
                    headers: { Authorization: `Bearer ${tokens.accessToken}` },
                  });
                  if (!res.ok) return null;
                  const { me } = (await res.json()) as {
                    me: {
                      id: number;
                      name: string;
                      email?: string;
                      wca_id?: string | null;
                      avatar?: { url?: string };
                    };
                  };
                  if (!me) return null;
                  return {
                    id: String(me.id),
                    name: me.name,
                    // WCA only shares the email with the "email" scope; the
                    // fallback keeps accounts working without it
                    email: me.email ?? `${me.wca_id ?? me.id}@users.worldcubeassociation.org`,
                    emailVerified: true,
                    image: me.avatar?.url,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                  };
                },
              },
            ],
          }),
        ]
      : [],
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
