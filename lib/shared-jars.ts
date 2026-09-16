/**
 * Maps server-backed shared jars into the client's local `Jar` shape.
 *
 * This is what lets one jar list hold both kinds of jar: personal jars live in
 * AsyncStorage, shared jars come from the server, and every screen can treat
 * them identically. A jar carrying `remoteId` is server-authoritative — its
 * balance and entries are read from the API rather than recomputed locally.
 */

import type { Accent, Entry, Jar, JarMember } from "@/lib/savings-core";

const ACCENTS: Accent[] = ["coral", "amber", "mint", "ocean", "berry", "clay"];

/** Local id prefix so a shared jar can never collide with a device-local one. */
export const SHARED_ID_PREFIX = "shared-";

export function sharedJarLocalId(remoteId: number | string): string {
  return `${SHARED_ID_PREFIX}${remoteId}`;
}

export function isSharedJar(jar: Pick<Jar, "remoteId">): boolean {
  return typeof jar.remoteId === "string" && jar.remoteId.length > 0;
}

/** Parse the remote id back out of a local shared-jar id. */
export function remoteIdFromLocalId(localId: string): number | undefined {
  if (!localId.startsWith(SHARED_ID_PREFIX)) return undefined;
  const parsed = Number(localId.slice(SHARED_ID_PREFIX.length));
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function toAccent(value: string): Accent {
  return ACCENTS.includes(value as Accent) ? (value as Accent) : "ocean";
}

function toIso(value: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

/** A member row as the sharedJar router returns it. */
export type SharedJarMemberPayload = {
  userId: number;
  displayName: string;
  contributed: number;
  you: boolean;
  isOwner?: boolean;
};

/** An entry row as the sharedJar router returns it. */
export type SharedJarEntryPayload = {
  id: number;
  userId: number;
  amount: number;
  direction: "deposit" | "withdrawal";
  note?: string | null;
  createdAt: Date | string;
};

/** The sharedJar.list / sharedJar.get payload shape. */
export type SharedJarPayload = {
  id: number;
  name: string;
  icon: string;
  accent: string;
  kind: "goal" | "habit";
  target: number;
  createdAt: Date | string;
  balance: number;
  totalDeposited: number;
  progress: number;
  depositCount: number;
  members: SharedJarMemberPayload[];
  entries?: SharedJarEntryPayload[];
};

function toMembers(members: SharedJarMemberPayload[]): JarMember[] {
  return members.map((member) => ({
    id: String(member.userId),
    name: member.displayName,
    contributed: member.contributed,
    you: member.you,
    isOwner: member.isOwner,
  }));
}

function toEntries(entries: SharedJarEntryPayload[], members: SharedJarMemberPayload[]): Entry[] {
  const nameById = new Map(members.map((member) => [member.userId, member.displayName]));
  return entries.map((entry) => ({
    id: `shared-entry-${entry.id}`,
    amount: entry.amount,
    direction: entry.direction,
    note: entry.note ?? undefined,
    at: toIso(entry.createdAt),
    source: "manual" as const,
    who: nameById.get(entry.userId),
  }));
}

/**
 * Project a server shared jar into a local `Jar`. The balance comes straight
 * from the server's derived total so the client never disagrees with it.
 */
export function sharedJarToJar(payload: SharedJarPayload): Jar {
  return {
    id: sharedJarLocalId(payload.id),
    remoteId: String(payload.id),
    name: payload.name,
    icon: payload.icon,
    accent: toAccent(payload.accent),
    kind: payload.kind,
    target: payload.target,
    balance: payload.balance,
    createdAt: toIso(payload.createdAt),
    // Shared jars have no device-local streaks, milestones or recurrence; the
    // server derives progress and every member sees the same numbers.
    milestonesHit: [],
    members: toMembers(payload.members),
    entries: payload.entries ? toEntries(payload.entries, payload.members) : [],
  };
}

/** Merge personal (device-local) jars with server-backed shared jars. */
export function mergeJars(local: Jar[], shared: Jar[]): Jar[] {
  return [...local, ...shared];
}