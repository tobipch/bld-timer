import type { APIEvent } from "@solidjs/start/server";
import { asc, eq } from "drizzle-orm";
import { schema } from "~/server/db";
import { handle, json, newId, requireUser } from "~/server/api";
import type { DnfCategory } from "~/lib/storage/types";

export const GET = (event: APIEvent) =>
  handle(async () => {
    const { db, userId } = await requireUser(event.request);
    const rows = await db
      .select()
      .from(schema.dnfCategory)
      .where(eq(schema.dnfCategory.userId, userId))
      .orderBy(asc(schema.dnfCategory.sortIndex));
    return json(
      rows.map((r) => ({ id: r.id, name: r.name, color: r.color, sortIndex: r.sortIndex })),
    );
  });

export const POST = (event: APIEvent) =>
  handle(async () => {
    const { db, userId } = await requireUser(event.request);
    const body = (await event.request.json()) as Omit<DnfCategory, "id">;
    const name = (body.name ?? "").trim();
    if (!name) return json({ error: "name required" }, 400);
    const row = {
      id: newId(),
      name,
      color: body.color || "#6b7a8f",
      sortIndex: body.sortIndex ?? 0,
    };
    await db.insert(schema.dnfCategory).values({ ...row, userId });
    return json(row);
  });
