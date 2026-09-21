/**
 * Sharing a jar that already exists on this device.
 *
 * A personal jar carries history that the server has never seen, so becoming
 * shared is a migration rather than a fresh start: the snapshot below carries
 * the jar's whole entry log, and the server replays it into the shared
 * contribution ledger. Two rules govern it:
 *
 * - History is never silently dropped. If it does not fit in one request, the
 *   caller is told so rather than receiving a quietly shorter jar.
 * - The conversion is idempotent per local jar. A retry after a lost response
   reuses the jar created by the first attempt instead of duplicating history.
 */

import { z } from "zod";

import { SHARED_JAR_ACCENTS } from "./shared-jar";

const amount = z.number().int().min(0).max(1_000_000_000);

/** Kept inside a sane, portable range; Postgres timestamptz itself is far wider. */
const date = z.string().refine((value) => {
  const time = Date.parse(value);
  return Number.isFinite(time) && time >= Date.UTC(1970, 0, 2) && time < Date.UTC(2100, 0, 1);
}, "History date is outside the supported range.");

export const personalShareSchema = z.object({
  /** The device-local id, so a retry finds the jar this request already made. */
  sourceLocalId: z.string().min(1).max(100),
  name: z.string().trim().min(1).max(120),
  icon: z.string().min(1).max(64),
  accent: z.enum(SHARED_JAR_ACCENTS),
  kind: z.enum(["goal", "habit"]),
  target: amount,
  balance: amount,
  createdAt: date,
  deadline: z.string().max(40).optional(),
  streak: z.number().int().nonnegative().optional(),
  lastDepositAt: date.optional(),
  milestonesHit: z.array(z.number().int()).max(100),
  entries: z
    .array(
      z.object({
        amount: amount.positive(),
        direction: z.enum(["deposit", "withdrawal"]),
        at: date,
        note: z.string().max(200).optional(),
        source: z.enum(["manual", "recurring"]).optional(),
      }),
    )
    .max(2000, "This jar has too much history to share in one request."),
});

export type PersonalShareInput = z.infer<typeof personalShareSchema>;

/**
 * The part of the balance that recorded history does not explain.
 *
 * Older jars were created before every deposit was logged, so their balance can
 * exceed what their entries sum to. That remainder becomes an explicit opening
 * contribution dated at the jar's creation, keeping the shared log's derived
 * total equal to the balance the owner actually has.
 */
export function openingAdjustment(snapshot: {
  balance: number;
  entries: { amount: number; direction: string }[];
}): number {
  return (
    snapshot.balance -
    snapshot.entries.reduce(
      (total, entry) => total + (entry.direction === "deposit" ? entry.amount : -entry.amount),
      0,
    )
  );
}

/** Shape a local jar into the request the conversion endpoint accepts. */
export function personalSharePayload(jar: {
  id: string;
  name: string;
  target: number;
  balance: number;
  accent: string;
  icon: string;
  kind: string;
  createdAt: string;
  deadline?: string;
  streak?: number;
  lastDepositAt?: string;
  milestonesHit: number[];
  entries: { amount: number; direction: string; at: string; note?: string; source?: string }[];
}): PersonalShareInput {
  return {
    sourceLocalId: jar.id,
    name: jar.name,
    icon: jar.icon,
    accent: (SHARED_JAR_ACCENTS as readonly string[]).includes(jar.accent)
      ? (jar.accent as PersonalShareInput["accent"])
      : "ocean",
    kind: jar.kind === "habit" ? "habit" : "goal",
    target: jar.target,
    balance: jar.balance,
    createdAt: jar.createdAt,
    deadline: jar.deadline,
    streak: jar.streak,
    lastDepositAt: jar.lastDepositAt,
    milestonesHit: jar.milestonesHit,
    entries: jar.entries.map((entry) => ({
      amount: entry.amount,
      direction: entry.direction === "withdrawal" ? "withdrawal" : "deposit",
      at: entry.at,
      note: entry.note,
      source: entry.source === "recurring" ? "recurring" : undefined,
    })),
  };
}

/**
 * Swap one device-local jar for its server-backed version once the server has
 * confirmed the history landed. Anything already shared is left as it is, so a
 * stale local copy can never shadow the authoritative jar.
 */
export function replaceWithShared(
  jars: { id: string }[],
  sourceLocalId: string,
  shared: { id: string },
): { id: string }[] {
  const index = jars.findIndex((jar) => jar.id === sourceLocalId);
  if (index === -1) return jars;
  const next = [...jars];
  next[index] = shared as never;
  return next;
}
