import type { APIEvent } from "@solidjs/start/server";
import { and, eq } from "drizzle-orm";
import { schema } from "~/server/db";
import { handle, json, requireUser } from "~/server/api";

export const DELETE = (event: APIEvent) =>
  handle(async () => {
    const { db, userId } = await requireUser(event.request);
    const id = event.params.id;
    await db.delete(schema.solve).where(and(eq(schema.solve.id, id), eq(schema.solve.userId, userId)));
    return json({ ok: true });
  });
