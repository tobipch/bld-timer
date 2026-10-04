import type { APIEvent } from "@solidjs/start/server";
import { eq } from "drizzle-orm";
import { schema } from "~/server/db";
import { handle, json, newId, requireUser } from "~/server/api";
import { DEFAULT_SESSION_NAME, isRetiredSession } from "~/lib/sessions";

export const GET = (event: APIEvent) =>
  handle(async () => {
    const { db, userId } = await requireUser(event.request);
    const shown = (
      await db.select().from(schema.timerSession).where(eq(schema.timerSession.userId, userId))
    )
      .filter((r) => !isRetiredSession(r.mode))
      .map((r) => ({ id: r.id, name: r.name, createdAt: r.createdAt }));
    if (shown.length > 0) return json(shown);

    // every account has somewhere to solve
    const first = { id: newId(), userId, name: DEFAULT_SESSION_NAME, createdAt: Date.now() };
    await db.insert(schema.timerSession).values(first);
    return json([{ id: first.id, name: first.name, createdAt: first.createdAt }]);
  });

export const POST = (event: APIEvent) =>
  handle(async () => {
    const { db, userId } = await requireUser(event.request);
    const body = (await event.request.json()) as { name?: string };
    const name = (body.name ?? "").trim();
    if (!name) return json({ error: "name required" }, 400);
    const row = { id: newId(), userId, name, createdAt: Date.now() };
    await db.insert(schema.timerSession).values(row);
    return json({ id: row.id, name: row.name, createdAt: row.createdAt });
  });
