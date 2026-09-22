import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { InsertUser, users, type User } from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: PostgresJsDatabase | null = null;

/**
 * Lazily create the Drizzle instance so local tooling can run without a DB.
 *
 * `prepare: false` is required when DATABASE_URL points at Supabase's shared
 * pooler in transaction mode: prepared statements belong to a connection, and
 * the pooler hands each query to whichever backend happens to be free.
 */
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      const client = postgres(process.env.DATABASE_URL, { prepare: false });
      _db = drizzle(client);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

/** Columns a sign-in may refresh. Kept narrow so a caller cannot widen its own role. */
type UserPatch = Partial<
  Pick<
    InsertUser,
    "name" | "email" | "loginMethod" | "role" | "lastSignedIn" | "updatedAt"
  >
>;

/**
 * Insert the account behind a Supabase user id, or update the row it already has.
 *
 * Returns the stored row so a caller does not have to read it back. The account
 * id is the only required field: everything else arrives from the token and may
 * legitimately be absent, so a later sign-in that carries a name fills in a row
 * that a first sign-in could only create blank rather than blanking what is there.
 */
export async function upsertUser(user: InsertUser): Promise<User | null> {
  if (!user.supabaseUserId) {
    throw new Error("User supabaseUserId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return null;
  }

  try {
    const values: InsertUser = {
      supabaseUserId: user.supabaseUserId,
    };
    const updateSet: UserPatch = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (isOwnerEmail(user.email)) {
      values.role = "admin";
      updateSet.role = "admin";
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }
    // Postgres has no `ON UPDATE CURRENT_TIMESTAMP`, so every write stamps this.
    updateSet.updatedAt = new Date();

    const rows = await db
      .insert(users)
      .values(values)
      .onConflictDoUpdate({ target: users.supabaseUserId, set: updateSet })
      .returning();

    return rows[0] ?? null;
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

/** True when `email` is the configured owner, who is granted the admin role. */
function isOwnerEmail(email: string | null | undefined): boolean {
  if (!ENV.ownerEmail || !email) return false;
  return email.trim().toLowerCase() === ENV.ownerEmail.trim().toLowerCase();
}

export async function getUserBySupabaseId(
  supabaseUserId: string,
): Promise<User | undefined> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db
    .select()
    .from(users)
    .where(eq(users.supabaseUserId, supabaseUserId))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

/**
 * Record that an account was just seen.
 *
 * Kept separate from `upsertUser` so a returning caller does not rewrite the
 * name and email fields on every request. A failure here is cosmetic, so it is
 * swallowed rather than allowed to fail the request that triggered it.
 */
export async function touchLastSignedIn(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db
      .update(users)
      .set({ lastSignedIn: new Date(), updatedAt: new Date() })
      .where(eq(users.id, userId));
  } catch (error) {
    console.warn("[Database] Failed to record sign-in:", error);
  }
}
