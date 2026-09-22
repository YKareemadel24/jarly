import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

/**
 * Enumerations are real Postgres types rather than a `varchar` with a comment,
 * so a typo in an insert is rejected by the database instead of being stored and
 * discovered later by a reader that cannot interpret it.
 */
export const userRoleEnum = pgEnum("user_role", ["user", "admin"]);
export const jarKindEnum = pgEnum("jar_kind", ["goal", "habit"]);
export const entryDirectionEnum = pgEnum("entry_direction", [
  "deposit",
  "withdrawal",
]);

/**
 * Application identity, distinct from the account that authenticates.
 *
 * Supabase Auth owns credentials in its own `auth.users` table, whose ids are
 * UUIDs. Every table below references *this* table's integer id instead, which
 * is why the shared-jar domain never had to change when the provider did: a
 * user's jar membership is a number here regardless of who issued the token.
 * `supabaseUserId` is the link between the two, written on first sign-in.
 *
 * Columns use camelCase to match both the database fields and the generated
 * types; Postgres folds unquoted names to lower case, so Drizzle quotes them.
 */
export const users = pgTable("users", {
  /** Surrogate primary key, referenced by every other table's `userId`. */
  id: serial("id").primaryKey(),
  /** The `sub` claim of the account's Supabase access token. Unique per user. */
  supabaseUserId: uuid("supabaseUserId").notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: userRoleEnum("role").default("user").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
  /**
   * Stamped by the application rather than the database: Postgres has no
   * `ON UPDATE CURRENT_TIMESTAMP`, so writers set this explicitly.
   */
  updatedAt: timestamp("updatedAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
  lastSignedIn: timestamp("lastSignedIn", { withTimezone: true })
    .defaultNow()
    .notNull(),
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
export const sharedJars = pgTable(
  "shared_jars",
  {
    id: serial("id").primaryKey(),
    /** Owner's user id; the only account allowed to rename, retarget or delete. */
    ownerId: integer("ownerId").notNull(),
    /**
     * Device-local id the jar was shared from, or null for a jar created
     * directly as shared. Together with ownerId it makes a client-side retry
     * after a lost response reuse the same server jar instead of duplicating
     * the jar and its whole history.
     */
    sourceLocalId: varchar("sourceLocalId", { length: 100 }),
    name: varchar("name", { length: 120 }).notNull(),
    /** Emoji shown on the client jar. */
    icon: varchar("icon", { length: 16 }).notNull().default("🫙"),
    /** One of the six client accents; validated in the router. */
    accent: varchar("accent", { length: 16 }).notNull().default("ocean"),
    kind: jarKindEnum("kind").notNull().default("goal"),
    /** Integer minor units. */
    target: integer("target").notNull(),
    /** Target date carried over from the personal jar, if it had one. */
    deadline: varchar("deadline", { length: 40 }),
    /** Habit streak carried over from the personal jar. */
    streak: integer("streak"),
    /** ISO timestamp of the newest deposit, for client-side ordering. */
    lastDepositAt: varchar("lastDepositAt", { length: 40 }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    ownerIdx: index("shared_jars_owner_idx").on(table.ownerId),
    /**
     * Makes the conversion retry idempotent: one server jar per device-local jar.
     * The insert relying on this uses `ON CONFLICT DO NOTHING`, so a repeat is a
     * no-op rather than an error that would abort the enclosing transaction —
     * which is how Postgres behaves and how MySQL did not.
     */
    ownerSourceUnique: uniqueIndex("shared_jars_owner_source_unique").on(
      table.ownerId,
      table.sourceLocalId,
    ),
  }),
);

export type SharedJar = typeof sharedJars.$inferSelect;
export type InsertSharedJar = typeof sharedJars.$inferInsert;

/**
 * Membership. A user sees a shared jar only through a row here, which is what
 * makes the per-jar authorisation check in the router possible.
 */
export const sharedJarMembers = pgTable(
  "shared_jar_members",
  {
    id: serial("id").primaryKey(),
    jarId: integer("jarId").notNull(),
    userId: integer("userId").notNull(),
    /** Display name snapshot, so a jar still reads correctly if a user is renamed. */
    displayName: varchar("displayName", { length: 80 }).notNull(),
    joinedAt: timestamp("joinedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    jarUserUnique: uniqueIndex("shared_jar_members_jar_user_unique").on(
      table.jarId,
      table.userId,
    ),
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
export const sharedJarEntries = pgTable(
  "shared_jar_entries",
  {
    id: serial("id").primaryKey(),
    jarId: integer("jarId").notNull(),
    /** Author of the contribution; always the signed-in user, never trusted from input. */
    userId: integer("userId").notNull(),
    /** Integer minor units. Always positive; direction carries the sign. */
    amount: integer("amount").notNull(),
    direction: entryDirectionEnum("direction").notNull().default("deposit"),
    /** Manual deposit or scheduled recurring one; preserved on personal-jar import. */
    source: varchar("source", { length: 16 }).notNull().default("manual"),
    note: varchar("note", { length: 200 }),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
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
export const sharedJarInvites = pgTable(
  "shared_jar_invites",
  {
    id: serial("id").primaryKey(),
    jarId: integer("jarId").notNull(),
    /** Short, unguessable, URL-safe code. Unique, so a lookup is a point read. */
    token: varchar("token", { length: 32 }).notNull().unique(),
    /** Who minted it; used to show the owner their own outstanding invites. */
    createdBy: integer("createdBy").notNull(),
    /** Hard stop, so a leaked link does not work forever. */
    expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
    /** Zero means unlimited uses. */
    maxUses: integer("maxUses").notNull().default(0),
    uses: integer("uses").notNull().default(0),
    revoked: boolean("revoked").notNull().default(false),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    jarIdx: index("shared_jar_invites_jar_idx").on(table.jarId),
  }),
);

export type SharedJarInvite = typeof sharedJarInvites.$inferSelect;
export type InsertSharedJarInvite = typeof sharedJarInvites.$inferInsert;
