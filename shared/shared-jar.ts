/**
 * Pure shared-jar aggregation, importable from both the client and the server.
 *
 * Shared jars are the one part of the savings domain that lives in MySQL, so
 * the maths has to run on both sides: the server validates against it, and the
 * client renders from it. Keeping it here means there is exactly one definition
 * of "balance" and "who contributed what".
 *
 * Money is always an integer number of minor units (cents), never floats.
 */

export type SharedJarEntryRow = {
  id: number;
  userId: number;
  amount: number;
  direction: "deposit" | "withdrawal";
  note?: string | null;
  createdAt: Date | string;
};

export type SharedJarMemberRow = {
  userId: number;
  displayName: string;
};

export type SharedJarRow = {
  id: number;
  ownerId: number;
  name: string;
  icon: string;
  accent: string;
  kind: "goal" | "habit";
  target: number;
  createdAt: Date | string;
};

/** A member with their share of the jar worked out. */
export type SharedJarMemberTotals = {
  userId: number;
  displayName: string;
  /** Integer minor units this member has put in (withdrawals subtracted). */
  contributed: number;
  /** True for the member viewing the jar. */
  you: boolean;
  isOwner: boolean;
};

/** A shared jar with its derived figures. */
export type SharedJarTotals = {
  /** Integer minor units currently in the jar. */
  balance: number;
  /** Integer minor units deposited in total, before withdrawals. */
  totalDeposited: number;
  /** 0–100, clamped. */
  progress: number;
  depositCount: number;
  members: SharedJarMemberTotals[];
};

function timeOf(value: Date | string): number {
  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();
  return Number.isNaN(time) ? 0 : time;
}

/**
 * Derive a shared jar's balance and per-member totals from its append-only
 * entry log. Balances are summed rather than stored, so two devices reading the
 * same rows can never disagree about the total.
 */
export function sharedJarTotals(
  jar: Pick<SharedJarRow, "target" | "ownerId">,
  members: SharedJarMemberRow[],
  entries: SharedJarEntryRow[],
  viewerId?: number,
): SharedJarTotals {
  const byUser = new Map<number, number>();
  let balance = 0;
  let totalDeposited = 0;
  let depositCount = 0;

  for (const entry of entries) {
    // Defensive: a non-integer or non-positive amount should never have been
    // written, but one bad row must not corrupt every reader's balance.
    if (!Number.isInteger(entry.amount) || entry.amount <= 0) continue;

    if (entry.direction === "deposit") {
      balance += entry.amount;
      totalDeposited += entry.amount;
      depositCount += 1;
      byUser.set(entry.userId, (byUser.get(entry.userId) ?? 0) + entry.amount);
    } else {
      balance -= entry.amount;
      byUser.set(entry.userId, (byUser.get(entry.userId) ?? 0) - entry.amount);
    }
  }

  const memberTotals = members.map((member) => ({
    userId: member.userId,
    displayName: member.displayName,
    contributed: byUser.get(member.userId) ?? 0,
    you: viewerId !== undefined && member.userId === viewerId,
    isOwner: member.userId === jar.ownerId,
  }));

  // Highest contributor first, then stable by name so the list never jitters.
  memberTotals.sort((a, b) => b.contributed - a.contributed || a.displayName.localeCompare(b.displayName));

  const progress = jar.target > 0 ? Math.max(0, Math.min(100, Math.round((balance / jar.target) * 100))) : 0;

  return { balance, totalDeposited, progress, depositCount, members: memberTotals };
}

/**
 * Newest-first entries for display. Timestamps come back from MySQL as Date and
 * from superjson as strings, so normalise before comparing.
 */
export function orderEntriesNewestFirst<T extends { createdAt: Date | string }>(entries: T[]): T[] {
  return [...entries].sort((a, b) => timeOf(b.createdAt) - timeOf(a.createdAt));
}

/** Accents a shared jar may use — mirrors the client palette. */
export const SHARED_JAR_ACCENTS = ["coral", "amber", "mint", "ocean", "berry", "clay"] as const;

export type SharedJarAccent = (typeof SHARED_JAR_ACCENTS)[number];

/**
 * Validate a proposed contribution. Returns an error message, or null when the
 * request is acceptable. The amount is checked as an integer because the client
 * sends minor units and a float would silently round-trip badly.
 */
export function validateContribution(amount: number, direction: "deposit" | "withdrawal", balance: number): string | null {
  if (!Number.isInteger(amount)) return "Amount must be an integer number of minor units.";
  if (amount <= 0) return "Amount must be greater than zero.";
  if (direction === "withdrawal" && amount > balance) return "You cannot withdraw more than the jar holds.";
  return null;
}

/** Shape of an invite row, without pulling the whole Drizzle type in here. */
export type SharedJarInviteRow = {
  token: string;
  expiresAt: Date | string;
  maxUses: number;
  uses: number;
  revoked: boolean;
};

export type InviteStatus = "open" | "expired" | "used-up" | "revoked";

/** Why an invite can no longer be joined, or "open" when it still can. */
export function inviteStatus(invite: SharedJarInviteRow, now: Date = new Date()): InviteStatus {
  if (invite.revoked) return "revoked";
  if (timeOf(invite.expiresAt) <= now.getTime()) return "expired";
  if (invite.maxUses > 0 && invite.uses >= invite.maxUses) return "used-up";
  return "open";
}

/** Human explanation for a closed invite, so the join screen can be specific. */
export function inviteStatusMessage(status: Exclude<InviteStatus, "open">): string {
  switch (status) {
    case "expired":
      return "This invite has expired. Ask for a new link.";
    case "used-up":
      return "This invite has already been used. Ask for a new link.";
    case "revoked":
      return "This invite was cancelled. Ask for a new link.";
  }
}