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

import { inviteStatus, validateContribution, type InviteStatus } from "../shared/shared-jar";
import {
  sharedJarEntries,
  sharedJarInvites,
  sharedJarMembers,
  sharedJars,
  users,
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

  // `RETURNING` hands back the generated id in the same round trip. Postgres
  // does not expose MySQL's `insertId` on the driver result.
  const inserted = await db.insert(sharedJars).values(input).returning({ id: sharedJars.id });
  const insertedId = inserted[0]?.id;
  if (!insertedId) return null;

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
  // The (jarId, userId) unique index turns a duplicate invite into a no-op. That
  // is expressed as a conflict clause rather than a caught error because in
  // Postgres an error aborts the whole enclosing transaction, so it could not be
  // swallowed here the way it was on MySQL.
  const inserted = await db
    .insert(sharedJarMembers)
    .values({ jarId, userId, displayName })
    .onConflictDoNothing({ target: [sharedJarMembers.jarId, sharedJarMembers.userId] })
    .returning({ id: sharedJarMembers.id });
  return inserted.length > 0;
}

export async function removeMember(jarId: number, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(sharedJarMembers).where(and(eq(sharedJarMembers.jarId, jarId), eq(sharedJarMembers.userId, userId)));
}

/** The result of a validated, atomically-applied contribution. */
export type ContributionOutcome =
  | { ok: true; entry: SharedJarEntry }
  | { ok: false; reason: "jar-missing" | "invalid"; message?: string };

/**
 * Append a contribution, validating it against the live balance atomically.
 *
 * The jar row is locked `FOR UPDATE` for the duration of the transaction, so a
 * concurrent contribution serialises behind this one instead of validating
 * against a balance this write is about to change — which is how two parallel
 * withdrawals could otherwise both pass the check and overdraw the jar.
 * `userId` is always the authenticated caller; membership is enforced by the
 * router before this runs.
 */
export async function contributeToJar(input: {
  jarId: number;
  userId: number;
  amount: number;
  direction: "deposit" | "withdrawal";
  note?: string;
}): Promise<ContributionOutcome | null> {
  const db = await getDb();
  if (!db) return null;

  return db.transaction(async (tx) => {
    const locked = await tx.select({ id: sharedJars.id }).from(sharedJars).where(eq(sharedJars.id, input.jarId)).for("update");
    if (!locked[0]) return { ok: false as const, reason: "jar-missing" as const };

    const entries = await tx.select().from(sharedJarEntries).where(eq(sharedJarEntries.jarId, input.jarId));
    let balance = 0;
    for (const entry of entries) {
      // Defensive, mirroring the shared aggregation: one bad row must not
      // corrupt the balance every reader derives.
      if (!Number.isInteger(entry.amount) || entry.amount <= 0) continue;
      balance += entry.direction === "deposit" ? entry.amount : -entry.amount;
    }

    const problem = validateContribution(input.amount, input.direction, balance);
    if (problem) return { ok: false as const, reason: "invalid" as const, message: problem };

    // The row comes straight back rather than being re-read: `RETURNING` makes
    // the insert and the read a single statement.
    const inserted = await tx
      .insert(sharedJarEntries)
      .values({
        jarId: input.jarId,
        userId: input.userId,
        amount: input.amount,
        direction: input.direction,
        note: input.note,
      })
      .returning();
    const entry = inserted[0];
    if (!entry) return { ok: false as const, reason: "jar-missing" as const };
    return { ok: true as const, entry };
  });
}

export async function updateSharedJar(
  jarId: number,
  input: Partial<Pick<SharedJar, "name" | "icon" | "accent" | "kind" | "target">>,
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  if (Object.keys(input).length === 0) return;
  // Postgres has no `ON UPDATE CURRENT_TIMESTAMP`, so the stamp is written here.
  await db.update(sharedJars).set({ ...input, updatedAt: new Date() }).where(eq(sharedJars.id, jarId));
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
    const inserted = await db
      .insert(sharedJarInvites)
      .values({
        jarId: input.jarId,
        token: input.token,
        createdBy: input.createdBy,
        expiresAt: input.expiresAt,
        maxUses: input.maxUses,
      })
      .returning();
    return inserted[0] ?? null;
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

/** The result of attempting to join a jar through an invite token. */
export type JoinOutcome =
  | { outcome: "joined"; jarId: number }
  | { outcome: "already-member"; jarId: number }
  | { outcome: "invalid-token" }
  | { outcome: "closed"; status: Exclude<InviteStatus, "open"> }
  | { outcome: "jar-missing" };

/**
 * Join a jar through an invite token, atomically.
 *
 * The invite row is locked `FOR UPDATE` for the whole transaction, so two
 * people tapping the same maxUses=1 link at the same moment cannot both get
 * in: the second waits on the lock, then re-reads the already-consumed invite
 * (Postgres re-evaluates the locked row's latest committed version). Membership
 * itself is idempotent — rejoining as an existing member succeeds without
 * spending a use.
 */
export async function joinJarViaInvite(input: {
  token: string;
  userId: number;
  displayName: string;
}): Promise<JoinOutcome | null> {
  const db = await getDb();
  if (!db) return null;

  return db.transaction(async (tx) => {
    const invites = await tx.select().from(sharedJarInvites).where(eq(sharedJarInvites.token, input.token)).for("update");
    const invite = invites[0];
    if (!invite) return { outcome: "invalid-token" } as const;

    // Already in? This succeeds even when the link is used up, so a second tap
    // by the person who consumed the last use is not an error.
    const membership = await tx
      .select({ id: sharedJarMembers.id })
      .from(sharedJarMembers)
      .where(and(eq(sharedJarMembers.jarId, invite.jarId), eq(sharedJarMembers.userId, input.userId)))
      .limit(1);
    if (membership[0]) return { outcome: "already-member", jarId: invite.jarId } as const;

    const status = inviteStatus(invite);
    if (status !== "open") return { outcome: "closed", status } as const;

    const jar = await tx.select({ id: sharedJars.id }).from(sharedJars).where(eq(sharedJars.id, invite.jarId)).limit(1);
    if (!jar[0]) return { outcome: "jar-missing" } as const;

    await tx
      .insert(sharedJarMembers)
      .values({ jarId: invite.jarId, userId: input.userId, displayName: input.displayName })
      .onConflictDoNothing({ target: [sharedJarMembers.jarId, sharedJarMembers.userId] });

    // Atomic increment rather than read-modify-write; with the row lock above
    // there is no interleaving to fear, but the SQL form keeps it honest.
    await tx
      .update(sharedJarInvites)
      .set({ uses: sql`${sharedJarInvites.uses} + 1` })
      .where(eq(sharedJarInvites.id, invite.id));

    return { outcome: "joined", jarId: invite.jarId } as const;
  });
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
  // Built through the query builder rather than raw SQL: `db.execute` returns a
  // driver-specific shape, and the query builder's row array is portable.
  const rows = await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
  return rows[0];
}

/* -------------------------------------------------------------------------- */
/* Personal jar conversion                                                     */
/* -------------------------------------------------------------------------- */

export type PersonalHistoryEntry = {
  amount: number;
  direction: "deposit" | "withdrawal";
  at: Date;
  note?: string;
  source?: "manual" | "recurring";
};

export type ImportPersonalJarInput = {
  ownerId: number;
  ownerName: string;
  /** Device-local id of the jar being shared, used to make retries idempotent. */
  sourceLocalId: string;
  name: string;
  icon: string;
  accent: string;
  kind: "goal" | "habit";
  target: number;
  createdAt: Date;
  deadline?: string;
  streak?: number;
  lastDepositAt?: string;
  /** Unrecorded opening balance, dated at the jar's creation. */
  openingAdjustment: number;
  entries: PersonalHistoryEntry[];
};

export type ImportedPersonalJar = {
  jarId: number;
  /** False when a previous attempt already created this jar. */
  created: boolean;
  entryCount: number;
};

/**
 * Move one personal jar's history onto the server in a single transaction.
 *
 * Either the jar, its opening adjustment, and every entry land together, or
 * nothing is written: a half-imported jar would show one member a balance the
 * other members' devices cannot reproduce. Re-importing the same
 * `sourceLocalId` returns the existing jar instead of duplicating history, so a
 * client that retries after a lost response is safe.
 */
export async function importPersonalJar(input: ImportPersonalJarInput): Promise<ImportedPersonalJar | null> {
  const db = await getDb();
  if (!db) return null;

  return db.transaction(async (tx) => {
    // Fast path: a retry arrives after the first attempt committed.
    const existing = await tx
      .select({ id: sharedJars.id })
      .from(sharedJars)
      .where(and(eq(sharedJars.ownerId, input.ownerId), eq(sharedJars.sourceLocalId, input.sourceLocalId)))
      .limit(1);
    if (existing[0]) {
      return { jarId: existing[0].id, created: false, entryCount: 0 };
    }

    // `ON CONFLICT DO NOTHING` rather than a caught error. In Postgres any error
    // aborts the surrounding transaction, so a duplicate-key exception could not
    // be recovered from here the way it was on MySQL — the whole import would
    // fail instead of quietly reusing the jar the first attempt made.
    const created = await tx
      .insert(sharedJars)
      .values({
        ownerId: input.ownerId,
        sourceLocalId: input.sourceLocalId,
        name: input.name,
        icon: input.icon,
        accent: input.accent,
        kind: input.kind,
        target: input.target,
        deadline: input.deadline,
        streak: input.streak,
        lastDepositAt: input.lastDepositAt,
        createdAt: input.createdAt,
      })
      .onConflictDoNothing({ target: [sharedJars.ownerId, sharedJars.sourceLocalId] })
      .returning({ id: sharedJars.id });

    const jarId = created[0]?.id;
    if (!jarId) {
      // A concurrent retry committed first. Its jar is the one to use, which is
      // what keeps a lost response harmless instead of duplicating history.
      const raced = await tx
        .select({ id: sharedJars.id })
        .from(sharedJars)
        .where(and(eq(sharedJars.ownerId, input.ownerId), eq(sharedJars.sourceLocalId, input.sourceLocalId)))
        .limit(1);
      if (!raced[0]) return null;
      return { jarId: raced[0].id, created: false, entryCount: 0 };
    }

    await tx.insert(sharedJarMembers).values({ jarId, userId: input.ownerId, displayName: input.ownerName });

    // The opening adjustment keeps the derived total equal to the balance the
    // owner actually has, even when early deposits were never logged.
    const rows: {
      jarId: number; userId: number; amount: number; direction: "deposit" | "withdrawal";
      note?: string; source?: "manual" | "recurring"; createdAt: Date;
    }[] = [];
    if (input.openingAdjustment > 0) {
      rows.push({
        jarId, userId: input.ownerId, amount: input.openingAdjustment, direction: "deposit",
        note: "Opening balance", source: "manual", createdAt: input.createdAt,
      });
    }
    for (const entry of input.entries) {
      rows.push({
        jarId, userId: input.ownerId, amount: entry.amount, direction: entry.direction,
        note: entry.note, source: entry.source ?? "manual", createdAt: entry.at,
      });
    }
    if (rows.length > 0) await tx.insert(sharedJarEntries).values(rows);

    return { jarId, created: true, entryCount: rows.length };
  });
}