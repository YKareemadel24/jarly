import {
  applyEntry,
  effectiveEntries,
  type Entry,
  type EntryRevision,
  type Jar,
} from "./jar";
import { parseDeadline } from "./insights";

export type EntryCorrection = Pick<Entry, "amount" | "at" | "note">;

function validDate(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 40 &&
    Number.isFinite(Date.parse(value)) &&
    Boolean(parseDeadline(value.slice(0, 10)))
  );
}

export function isValidEntryRevision(value: unknown): value is EntryRevision {
  if (!value || typeof value !== "object") return false;
  const revision = value as EntryRevision;
  return (
    Number.isSafeInteger(revision.amount) &&
    revision.amount > 0 &&
    validDate(revision.at) &&
    validDate(revision.changedAt) &&
    (revision.note === undefined ||
      (typeof revision.note === "string" && revision.note.length <= 500))
  );
}

export function validEntryAudit(entries: Entry[]): boolean {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  if (byId.size !== entries.length) return false;
  const reversed = new Set<string>();
  return entries.every((entry) => {
    if (
      typeof entry.id !== "string" ||
      !entry.id ||
      entry.id.length > 256 ||
      (entry.revisions !== undefined &&
        (!Array.isArray(entry.revisions) ||
          entry.revisions.length > 1000 ||
          !entry.revisions.every(isValidEntryRevision)))
    )
      return false;
    if (entry.undoOf === undefined) return true;
    if (typeof entry.undoOf !== "string" || reversed.has(entry.undoOf))
      return false;
    const original = byId.get(entry.undoOf);
    if (
      !original ||
      original.undoOf ||
      original.id === entry.id ||
      original.amount !== entry.amount ||
      original.direction === entry.direction ||
      Date.parse(original.at) > Date.parse(entry.at)
    )
      return false;
    reversed.add(entry.undoOf);
    return true;
  });
}

function withHabitHistory(jar: Jar): Jar {
  if (jar.kind !== "habit") return jar;
  const deposits = effectiveEntries(jar.entries).filter(
    (entry) => entry.direction === "deposit",
  );
  const days = new Set(
    deposits.map((entry) => {
      const date = new Date(entry.at);
      return (
        Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) /
        86_400_000
      );
    }),
  );
  let streak = 0;
  const latest = deposits.reduce<Entry | undefined>(
    (last, entry) =>
      !last || Date.parse(entry.at) > Date.parse(last.at) ? entry : last,
    undefined,
  );
  if (latest) {
    const date = new Date(latest.at);
    let day =
      Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) /
      86_400_000;
    while (days.has(day--)) streak += 1;
  }
  return { ...jar, streak, lastDepositAt: latest?.at };
}

/** Keep the original opening balance and ensure every historical withdrawal remains funded. */
export function validTransactionHistory(
  jar: Pick<Jar, "balance" | "entries" | "openingBalance">,
  entries: Entry[] = jar.entries,
): boolean {
  const maximum = BigInt(Number.MAX_SAFE_INTEGER);
  if (
    !Number.isSafeInteger(jar.balance) ||
    jar.balance < 0 ||
    jar.entries.some(
      (entry) =>
        !Number.isSafeInteger(entry.amount) ||
        entry.amount <= 0 ||
        !validDate(entry.at) ||
        (entry.direction !== "deposit" && entry.direction !== "withdrawal"),
    )
  )
    return false;
  let balance = BigInt(jar.balance);
  for (const entry of jar.entries)
    balance -=
      BigInt(entry.amount) * (entry.direction === "deposit" ? 1n : -1n);
  if (balance < 0n || balance > maximum) return false;
  if (
    jar.openingBalance !== undefined &&
    (!Number.isSafeInteger(jar.openingBalance) ||
      jar.openingBalance < 0 ||
      BigInt(jar.openingBalance) !== balance)
  )
    return false;
  for (const entry of [...entries]
    .reverse()
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))) {
    balance +=
      BigInt(entry.amount) * (entry.direction === "deposit" ? 1n : -1n);
    if (balance < 0n || balance > maximum) return false;
  }
  return true;
}

export function correctEntry(
  jar: Jar,
  entryId: string,
  input: EntryCorrection,
  now: Date = new Date(),
): Jar | null {
  const entry = jar.entries.find((item) => item.id === entryId);
  if (
    !entry ||
    entry.undoOf ||
    jar.entries.some((item) => item.undoOf === entryId) ||
    (entry.revisions?.length ?? 0) >= 1000 ||
    !Number.isSafeInteger(input.amount) ||
    input.amount <= 0 ||
    !validDate(input.at) ||
    Date.parse(input.at) > now.getTime() ||
    (input.note !== undefined &&
      (typeof input.note !== "string" || input.note.length > 500))
  )
    return null;
  const at = new Date(input.at).toISOString();
  const note = input.note?.trim() || undefined;
  if (
    entry.amount === input.amount &&
    Date.parse(entry.at) === Date.parse(at) &&
    entry.note === note
  )
    return jar;
  const balance =
    jar.balance +
    (input.amount - entry.amount) * (entry.direction === "deposit" ? 1 : -1);
  if (!Number.isSafeInteger(balance) || balance < 0) return null;
  const entries = jar.entries
    .map((item) =>
      item.id !== entryId
        ? item
        : {
            ...item,
            amount: input.amount,
            at,
            note,
            revisions: [
              ...(item.revisions ?? []),
              {
                amount: item.amount,
                at: item.at,
                note: item.note,
                changedAt: now.toISOString(),
              },
            ],
          },
    )
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  if (!validTransactionHistory(jar, entries)) return null;
  return withHabitHistory({ ...jar, balance, entries });
}

export function undoEntry(
  jar: Jar,
  entryId: string,
  now: Date = new Date(),
): Jar | null {
  const entry = jar.entries.find((item) => item.id === entryId);
  if (
    !entry ||
    entry.undoOf ||
    !validDate(entry.at) ||
    !Number.isFinite(now.getTime()) ||
    Date.parse(entry.at) > now.getTime() ||
    jar.entries.some((item) => item.undoOf === entryId)
  )
    return null;
  const applied = applyEntry(
    jar,
    entry.amount,
    entry.direction === "deposit" ? "withdrawal" : "deposit",
    entry.direction === "deposit" ? "Deposit undone" : "Withdrawal undone",
    "manual",
    now,
  );
  if (!applied) return null;
  const entries = applied.jar.entries.map((item, index) =>
    index === 0 ? { ...item, undoOf: entryId } : item,
  );
  if (!validTransactionHistory(applied.jar, entries)) return null;
  return withHabitHistory({
    ...applied.jar,
    entries,
    milestonesHit: jar.milestonesHit,
  });
}
