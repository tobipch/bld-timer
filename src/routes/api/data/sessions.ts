import type { APIEvent } from "@solidjs/start/server";
import { eq } from "drizzle-orm";
import { schema } from "~/server/db";
import { handle, json, newId, requireUser } from "~/server/api";

export const GET = (event: APIEvent) =>
  handle(async () => {
    const { db, userId } = await requireUser(event.request);
    let rows = await db.select().from(schema.timerSession).where(eq(schema.timerSession.userId, userId));
    if (rows.length === 0) {
      const first = { id: newId(), userId, name: "Session 1", createdAt: Date.now() };
      await db.insert(schema.timerSession).values(first);
      rows = [first];
    }
    return json(rows.map((r) => ({ id: r.id, name: r.name, createdAt: r.createdAt })));
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
