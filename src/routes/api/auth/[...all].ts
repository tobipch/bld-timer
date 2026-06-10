import type { APIEvent } from "@solidjs/start/server";
import { getAuth } from "~/server/auth";

function handle(event: APIEvent) {
  const auth = getAuth();
  if (!auth) return new Response("auth not configured (no DATABASE_URL)", { status: 503 });
  return auth.handler(event.request);
}

export const GET = handle;
export const POST = handle;
