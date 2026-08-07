import type { APIEvent } from "@solidjs/start/server";
import { and, eq } from "drizzle-orm";
import { schema } from "~/server/db";
import { handle, json, requireUser } from "~/server/api";

export const PATCH = (event: APIEvent) =>
  handle(async () => {
    const { db, userId } = await requireUser(event.request);
    const id = event.params.id;
    const body = (await event.request.json()) as { name?: string; color?: string; sortIndex?: number };
    const patch: { name?: string; color?: string; sortIndex?: number } = {};
    if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim();
    if (typeof body.color === "string") patch.color = body.color;
    if (typeof body.sortIndex === "number") patch.sortIndex = body.sortIndex;
    if (Object.keys(patch).length === 0) return json({ error: "empty patch" }, 400);
    await db
      .update(schema.dnfCategory)
      .set(patch)
      .where(and(eq(schema.dnfCategory.id, id), eq(schema.dnfCategory.userId, userId)));
    return json({ ok: true });
  });

export const DELETE = (event: APIEvent) =>
  handle(async () => {
    const { db, userId } = await requireUser(event.request);
    const id = event.params.id;
    // untag first so no solve keeps pointing at a category that is gone
    await db
      .update(schema.solve)
      .set({ dnfCategoryId: null })
      .where(and(eq(schema.solve.dnfCategoryId, id), eq(schema.solve.userId, userId)));
    await db
      .delete(schema.dnfCategory)
      .where(and(eq(schema.dnfCategory.id, id), eq(schema.dnfCategory.userId, userId)));
    return json({ ok: true });
  });
