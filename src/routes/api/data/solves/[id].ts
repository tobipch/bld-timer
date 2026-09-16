import type { APIEvent } from "@solidjs/start/server";
import { and, eq } from "drizzle-orm";
import { schema } from "~/server/db";
import { handle, json, requireUser } from "~/server/api";
import type { SolvePatch } from "~/lib/storage/types";

export const DELETE = (event: APIEvent) =>
  handle(async () => {
    const { db, userId } = await requireUser(event.request);
    const id = event.params.id;
    await db.delete(schema.solve).where(and(eq(schema.solve.id, id), eq(schema.solve.userId, userId)));
    return json({ ok: true });
  });

export const PATCH = (event: APIEvent) =>
  handle(async () => {
    const { db, userId } = await requireUser(event.request);
    const id = event.params.id;
    const body = (await event.request.json()) as SolvePatch;
    if (body.result !== "ok" && body.result !== "dnf") return json({ error: "empty patch" }, 400);
    await db
      .update(schema.solve)
      .set({ result: body.result })
      .where(and(eq(schema.solve.id, id), eq(schema.solve.userId, userId)));
    return json({ ok: true });
  });
