import { getDbReady, type Db } from "./db";
import { resolveUserId } from "./auth";

export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Resolve db + acting user or throw an ApiError the route turns into a response. */
export async function requireUser(request: Request): Promise<{ db: Db; userId: string; guest: boolean }> {
  const db = await getDbReady();
  if (!db) throw new ApiError(503, "no database configured");
  const u = await resolveUserId(request);
  if (!u) throw new ApiError(401, "login required");
  return { db, userId: u.id, guest: u.guest };
}

export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ApiError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: "internal error" }, 500);
  }
}

export const newId = () => crypto.randomUUID();
