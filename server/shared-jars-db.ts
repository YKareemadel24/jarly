/**
 * Database access for shared jars.
 *
 * Every function here is scoped to a viewer: a shared jar is only ever visible
 * through a membership row, so authorisation lives next to the query rather than
 * being remembered at each call site.
 *
 * All money is integer minor units (cents), matching the client domain layer.
 */

import { and, eq, inArray, sql } from "drizzle-orm";

import {
  sharedJarEntries,
  sharedJarInvites,
  sharedJarMembers,
  sharedJars,
  type InsertSharedJar,
  type SharedJar,
  type SharedJarEntry,
  type SharedJarInvite,
  type SharedJarMember,
} from "../drizzle/schema";
import { getDb } from "./db";

export type SharedJarView = {
  jar: SharedJar;
  members: SharedJarMember[];
  entries: SharedJarEntry[];
};

/** True when `userId` is a member of `jarId`. */
export async function isMember(jarId: number, userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const rows = await db
    .select({ id: sharedJarMembers.id })
    .from(sharedJarMembers)
    .where(and(eq(sharedJarMembers.jarId, jarId), eq(sharedJarMembers.userId, userId)))
    .limit(1);
  return rows.length > 0;
}

/** Load one jar with its members and entries, or null when the viewer has no access. */
export async function getSharedJar(jarId: number, viewerId: number): Promise<SharedJarView | null> {
  const db = await getDb();
  if (!db) return null;

  const jars = await db.select().from(sharedJars).where(eq(sharedJars.id, jarId)).limit(1);
  const jar = jars[0];
  if (!jar) return null;

  const members = await db.select().from(sharedJarMembers).where(eq(sharedJarMembers.jarId, jarId));
  // Access is membership-based, not ownership-based: a member who did not create
  // the jar still reads it, a stranger never does.
  if (!members.some((member) => member.userId === viewerId)) return null;

  const entries = await db.select().from(sharedJarEntries).where(eq(sharedJarEntries.jarId, jarId));
  return { jar, members, entries };
}

/** Every shared jar the viewer belongs to. */
export async function listSharedJars(viewerId: number): Promise<SharedJarView[]> {
  const db = await getDb();
  if (!db) return [];

  const mine = await db.select({ jarId: sharedJarMembers.jarId }).from(sharedJarMembers).where(eq(sharedJarMembers.userId, viewerId));
  const ids = mine.map((row) => row.jarId);
  if (ids.length === 0) return [];

  const [jars, members, entries] = await Promise.all([
    db.select().from(sharedJars).where(inArray(sharedJars.id, ids)),
    db.select().from(sharedJarMembers).where(inArray(sharedJarMembers.jarId, ids)),
    db.select().from(sharedJarEntries).where(inArray(sharedJarEntries.jarId, ids)),
  ]);

  return jars.map((jar) => ({
    jar,
    members: members.filter((member) => member.jarId === jar.id),
    entries: entries.filter((entry) => entry.jarId === jar.id),
  }));
}

/** Create a jar and make the creator its first, owning member. */
export async function createSharedJar(input: InsertSharedJar, ownerName: string): Promise<SharedJar | null> {
  const db = await getDb();
  if (!db) return null;

  const result = await db.insert(sharedJars).values(input);
  const insertedId = Number(result[0].insertId);
  if (!Number.isInteger(insertedId) || insertedId <= 0) return null;

  await db.insert(sharedJarMembers).values({
    jarId: insertedId,
    userId: input.ownerId,
    displayName: ownerName,
  });

  const created = await db.select().from(sharedJars).where(eq(sharedJars.id, insertedId)).limit(1);
  return created[0] ?? null;
}

/** Add a member by account id. Returns false when the account does not exist or is already in. */
export async function addMember(jarId: number, userId: number, displayName: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  try {
    await db.insert(sharedJarMembers).values({ jarId, userId, displayName });
    return true;
  } catch {
    // The (jarId, userId) unique index turns a duplicate invite into a no-op.
    return false;
  }
}

export async function removeMember(jarId: number, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(sharedJarMembers).where(and(eq(sharedJarMembers.jarId, jarId), eq(sharedJarMembers.userId, userId)));
}

/** Append a contribution. `userId` is always the authenticated caller. */
export async function addSharedEntry(input: {
  jarId: number;
  userId: number;
  amount: number;
  direction: "deposit" | "withdrawal";
  note?: string;
}): Promise<SharedJarEntry | null> {
  const db = await getDb();
  if (!db) return null;

  const result = await db.insert(sharedJarEntries).values(input);
  const insertedId = Number(result[0].insertId);
  if (!Number.isInteger(insertedId) || insertedId <= 0) return null;

  const created = await db.select().from(sharedJarEntries).where(eq(sharedJarEntries.id, insertedId)).limit(1);
  return created[0] ?? null;
}

export async function updateSharedJar(
  jarId: number,
  input: Partial<Pick<SharedJar, "name" | "icon" | "accent" | "kind" | "target">>,
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  if (Object.keys(input).length === 0) return;
  await db.update(sharedJars).set(input).where(eq(sharedJars.id, jarId));
}

/** Delete a jar and everything hanging off it. Entries and members go first. */
export async function deleteSharedJar(jarId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(sharedJarEntries).where(eq(sharedJarEntries.jarId, jarId));
  await db.delete(sharedJarMembers).where(eq(sharedJarMembers.jarId, jarId));
  await db.delete(sharedJars).where(eq(sharedJars.id, jarId));
}

/* -------------------------------------------------------------------------- */
/* Invites                                                                     */
/* -------------------------------------------------------------------------- */

/** Store a freshly minted invite. Returns false when the token collided. */
export async function createInvite(input: {
  jarId: number;
  token: string;
  createdBy: number;
  expiresAt: Date;
  maxUses: number;
}): Promise<SharedJarInvite | null> {
  const db = await getDb();
  if (!db) return null;
  try {
    const result = await db.insert(sharedJarInvites).values({
      jarId: input.jarId,
      token: input.token,
      createdBy: input.createdBy,
      expiresAt: input.expiresAt,
      maxUses: input.maxUses,
    });
    const insertedId = Number(result[0].insertId);
    if (!Number.isInteger(insertedId) || insertedId <= 0) return null;
    const created = await db.select().from(sharedJarInvites).where(eq(sharedJarInvites.id, insertedId)).limit(1);
    return created[0] ?? null;
  } catch {
    // The unique token index turning a collision into a no-op is the point: the
    // router simply retries with a new token.
    return null;
  }
}

/** Point-read an invite by its token, regardless of whether it is still usable. */
export async function findInviteByToken(token: string): Promise<SharedJarInvite | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(sharedJarInvites).where(eq(sharedJarInvites.token, token)).limit(1);
  return rows[0];
}

/** Every invite minted for a jar, newest first. Owner-facing only. */
export async function listInvites(jarId: number): Promise<SharedJarInvite[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(sharedJarInvites).where(eq(sharedJarInvites.jarId, jarId));
  return rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/**
 * Count one use against an invite.
 *
 * Increment is expressed as `uses + 1` in SQL rather than read-modify-write, so
 * two people tapping the same link at the same moment cannot both consume the
 * last remaining use.
 */
export async function consumeInvite(inviteId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(sharedJarInvites)
    .set({ uses: sql`${sharedJarInvites.uses} + 1` })
    .where(eq(sharedJarInvites.id, inviteId));
}

export async function revokeInvite(inviteId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(sharedJarInvites).set({ revoked: true }).where(eq(sharedJarInvites.id, inviteId));
}

/** Read a jar row directly, for the public invite preview. No membership check. */
export async function findJarById(jarId: number): Promise<SharedJar | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(sharedJars).where(eq(sharedJars.id, jarId)).limit(1);
  return rows[0];
}

/** Number of members on a jar, so a preview can say "3 people are saving". */
export async function countMembers(jarId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db.select({ id: sharedJarMembers.id }).from(sharedJarMembers).where(eq(sharedJarMembers.jarId, jarId));
  return rows.length;
}

/** Look up an account by id so an invite can attach a display name. */
export async function findUserById(userId: number): Promise<{ id: number; name: string | null } | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.execute(sql`SELECT id, name FROM users WHERE id = ${userId} LIMIT 1`);
  const first = (rows as unknown as [{ id: number; name: string | null }[]])[0]?.[0];
  return first;
}