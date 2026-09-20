import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const control = sqliteTable("control", {
  id: integer("id").primaryKey(),
  secret: text("secret").notNull(),
  lease: text("lease").notNull().default(""),
  leaseUntil: integer("lease_until").notNull().default(0),
  models: text("models").notNull().default("[]"),
});
export const entries = sqliteTable("entries", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
export const rateLimits = sqliteTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  expires: integer("expires").notNull(),
});
