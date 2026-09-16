import { boolean, index, int, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Shared jars — the only savings data that leaves the device.
 *
 * Personal jars stay entirely in AsyncStorage; a jar becomes server-backed only
 * when its owner explicitly shares it. Balances are stored as integer minor
 * units (cents) exactly like the client domain layer, never floats.
 */
export const sharedJars = mysqlTable(
  "shared_jars",
  {
    id: int("id").autoincrement().primaryKey(),
    /** Owner's user id; the only account allowed to rename, retarget or delete. */
    ownerId: int("ownerId").notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    /** Emoji shown on the client jar. */
    icon: varchar("icon", { length: 16 }).notNull().default("🫙"),
    /** One of the six client accents; validated in the router. */
    accent: varchar("accent", { length: 16 }).notNull().default("ocean"),
    kind: mysqlEnum("kind", ["goal", "habit"]).notNull().default("goal"),
    /** Integer minor units. */
    target: int("target").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    ownerIdx: index("shared_jars_owner_idx").on(table.ownerId),
  }),
);

export type SharedJar = typeof sharedJars.$inferSelect;
export type InsertSharedJar = typeof sharedJars.$inferInsert;

/**
 * Membership. A user sees a shared jar only through a row here, which is what
 * makes the per-jar authorisation check in the router possible.
 */
export const sharedJarMembers = mysqlTable(
  "shared_jar_members",
  {
    id: int("id").autoincrement().primaryKey(),
    jarId: int("jarId").notNull(),
    userId: int("userId").notNull(),
    /** Display name snapshot, so a jar still reads correctly if a user is renamed. */
    displayName: varchar("displayName", { length: 80 }).notNull(),
    joinedAt: timestamp("joinedAt").defaultNow().notNull(),
  },
  (table) => ({
    jarUserUnique: uniqueIndex("shared_jar_members_jar_user_unique").on(table.jarId, table.userId),
    userIdx: index("shared_jar_members_user_idx").on(table.userId),
  }),
);

export type SharedJarMember = typeof sharedJarMembers.$inferSelect;
export type InsertSharedJarMember = typeof sharedJarMembers.$inferInsert;

/**
 * Contributions to a shared jar. This is an append-only log: balances are
 * derived by summing it, so two devices can never drift out of sync the way
 * two independently-incremented counters would.
 */
export const sharedJarEntries = mysqlTable(
  "shared_jar_entries",
  {
    id: int("id").autoincrement().primaryKey(),
    jarId: int("jarId").notNull(),
    /** Author of the contribution; always the signed-in user, never trusted from input. */
    userId: int("userId").notNull(),
    /** Integer minor units. Always positive; direction carries the sign. */
    amount: int("amount").notNull(),
    direction: mysqlEnum("direction", ["deposit", "withdrawal"]).notNull().default("deposit"),
    note: varchar("note", { length: 200 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    jarIdx: index("shared_jar_entries_jar_idx").on(table.jarId),
  }),
);

export type SharedJarEntry = typeof sharedJarEntries.$inferSelect;
export type InsertSharedJarEntry = typeof sharedJarEntries.$inferInsert;

/**
 * Invite links for shared jars.
 *
 * An invite is a bearer token rather than a recipient id: the owner does not
 * have to know who they are inviting, or whether that person has an account
 * yet. A token is expiring and revocable, and is consumed by joining rather
 * than by being read, so a forwarded link cannot silently add a stranger.
 */
export const sharedJarInvites = mysqlTable(
  "shared_jar_invites",
  {
    id: int("id").autoincrement().primaryKey(),
    jarId: int("jarId").notNull(),
    /** Short, unguessable, URL-safe code. Unique, so a lookup is a point read. */
    token: varchar("token", { length: 32 }).notNull().unique(),
    /** Who minted it; used to show the owner their own outstanding invites. */
    createdBy: int("createdBy").notNull(),
    /** Hard stop, so a leaked link does not work forever. */
    expiresAt: timestamp("expiresAt").notNull(),
    /** Zero means unlimited uses. */
    maxUses: int("maxUses").notNull().default(0),
    uses: int("uses").notNull().default(0),
    revoked: boolean("revoked").notNull().default(false),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    jarIdx: index("shared_jar_invites_jar_idx").on(table.jarId),
  }),
);

export type SharedJarInvite = typeof sharedJarInvites.$inferSelect;
export type InsertSharedJarInvite = typeof sharedJarInvites.$inferInsert;
