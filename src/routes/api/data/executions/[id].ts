import type { APIEvent } from "@solidjs/start/server";
import { and, eq } from "drizzle-orm";
import { schema } from "~/server/db";
import { handle, json, requireUser } from "~/server/api";

export const DELETE = (event: APIEvent) =>
  handle(async () => {
    const { db, userId } = await requireUser(event.request);
    const id = event.params.id;
    await db
      .delete(schema.algExecution)
      .where(and(eq(schema.algExecution.id, id), eq(schema.algExecution.userId, userId)));
    return json({ ok: true });
  });
