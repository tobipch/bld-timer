import type { APIEvent } from "@solidjs/start/server";
import { getAuth } from "~/server/auth";
import { getDbReady } from "~/server/db";

async function handle(event: APIEvent) {
  await getDbReady(); // auth tables must exist before better-auth touches them
  const auth = getAuth();
  if (!auth) return new Response("auth not configured (no DATABASE_URL)", { status: 503 });
  return auth.handler(event.request);
}

export const GET = handle;
export const POST = handle;
