import { boolean, index, integer, jsonb, pgTable, text, timestamp, bigint } from "drizzle-orm/pg-core";

/* ---- better-auth managed tables (standard shape for the drizzle adapter) ---- */

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/* ---- app tables ---- */

export const timerSession = pgTable(
  "timer_session",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
  },
  (t) => [index("timer_session_user_idx").on(t.userId)],
);

export const dnfCategory = pgTable(
  "dnf_category",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull(),
    sortIndex: integer("sort_index").notNull(),
  },
  (t) => [index("dnf_category_user_idx").on(t.userId)],
);

export const solve = pgTable(
  "solve",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    sessionId: text("session_id")
      .notNull()
      .references(() => timerSession.id, { onDelete: "cascade" }),
    startedAt: bigint("started_at", { mode: "number" }).notNull(),
    result: text("result").notNull(), // "ok" | "dnf"
    totalMs: integer("total_ms").notNull(),
    memoMs: integer("memo_ms").notNull(),
    execMs: integer("exec_ms").notNull(),
    scramble: text("scramble").notNull(),
    moves: jsonb("moves").notNull(),
    reconstruction: jsonb("reconstruction").notNull(),
    // no FK: deleting a category clears the tag explicitly, so a solve is
    // never held hostage by its category
    dnfCategoryId: text("dnf_category_id"),
    note: text("note"),
    confirmedFindings: jsonb("confirmed_findings"),
  },
  (t) => [index("solve_user_idx").on(t.userId), index("solve_session_idx").on(t.sessionId)],
);

export const algExecution = pgTable(
  "alg_execution",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    solveId: text("solve_id")
      .notNull()
      .references(() => solve.id, { onDelete: "cascade" }),
    sessionId: text("session_id").notNull(),
    at: bigint("at", { mode: "number" }).notNull(),
    caseKey: text("case_key").notNull(),
    primitive: jsonb("primitive").notNull(),
    moves: text("moves").notNull(),
    execMs: integer("exec_ms").notNull(),
    recogMs: integer("recog_ms").notNull(),
  },
  (t) => [index("alg_execution_user_idx").on(t.userId), index("alg_execution_case_idx").on(t.userId, t.caseKey)],
);
