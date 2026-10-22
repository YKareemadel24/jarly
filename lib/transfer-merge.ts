import type { Jar } from "@/lib/domain";
import { validTransactionHistory } from "@/lib/domain/transactions";

function jarSettings(jar: Jar) {
  return {
    name: jar.name,
    target: jar.target,
    accent: jar.accent,
    icon: jar.icon,
    kind: jar.kind,
    deadline: jar.deadline || undefined,
    recurring: jar.recurring
      ? {
          amount: jar.recurring.amount,
          cadence: jar.recurring.cadence,
          nextDate: jar.recurring.nextDate,
          paused: Boolean(jar.recurring.paused),
        }
      : undefined,
    reminder: jar.reminder
      ? {
          enabled: jar.reminder.enabled,
          hour: jar.reminder.hour,
          minute: jar.reminder.minute,
          weekdays: [...jar.reminder.weekdays].sort(),
          snoozedUntil: jar.reminder.snoozedUntil,
        }
      : undefined,
    openingBalance:
      jar.openingBalance ?? (jar.entries.length === 0 ? jar.balance : 0),
    archived: Boolean(jar.archived),
  };
}

export function mergeTransferJars(
  current: Jar[],
  incoming: Jar[],
  sourceCurrency?: string,
  currentCurrency?: string,
): {
  jars: Jar[];
  added: number;
  updated: number;
  skipped: number;
  error?: string;
} {
  const unchanged = { jars: current, added: 0, updated: 0, skipped: 0 };
  if (sourceCurrency && currentCurrency && sourceCurrency !== currentCurrency)
    return {
      ...unchanged,
      error: "Change your currency to match this transfer before importing.",
    };
  if (new Set(incoming.map((jar) => jar.id)).size !== incoming.length)
    return { ...unchanged, error: "This transfer contains duplicate jars." };
  if (
    incoming.some(
      (jar) =>
        !validTransactionHistory({
          ...jar,
          openingBalance:
            jar.openingBalance ?? (jar.entries.length === 0 ? jar.balance : 0),
        }),
    )
  )
    return {
      ...unchanged,
      error:
        "This transfer contains a balance that does not match its history.",
    };

  const localById = new Map(current.map((jar) => [jar.id, jar]));
  const next = [...current];
  let added = 0;
  let updated = 0;
  let skipped = 0;

  for (const jar of incoming) {
    const local = localById.get(jar.id);
    if (!local) {
      next.push(jar);
      added += 1;
      continue;
    }
    if (JSON.stringify(jarSettings(local)) !== JSON.stringify(jarSettings(jar)))
      return {
        ...unchanged,
        error: `Jar “${jar.name}” has conflicting settings. Resolve the copies before importing.`,
      };

    const sameEntry = (a: Jar["entries"][number], b: Jar["entries"][number]) =>
      a.amount === b.amount &&
      a.direction === b.direction &&
      a.at === b.at &&
      a.note === b.note &&
      (a.source ?? "manual") === (b.source ?? "manual") &&
      a.undoOf === b.undoOf &&
      JSON.stringify(a.revisions ?? []) === JSON.stringify(b.revisions ?? []);
    const localSuffix =
      jar.entries.length >= local.entries.length &&
      local.entries.every((entry, index) =>
        sameEntry(
          entry,
          jar.entries[jar.entries.length - local.entries.length + index],
        ),
      );
    const incomingSuffix =
      local.entries.length >= jar.entries.length &&
      jar.entries.every((entry, index) =>
        sameEntry(
          entry,
          local.entries[local.entries.length - jar.entries.length + index],
        ),
      );
    if (!localSuffix && !incomingSuffix)
      return {
        ...unchanged,
        error: `Jar “${jar.name}” has different contribution histories. No jars were imported.`,
      };

    if (jar.entries.length > local.entries.length && localSuffix) {
      const index = next.findIndex((item) => item.id === jar.id);
      next[index] = { ...jar, createdAt: local.createdAt };
      updated += 1;
    } else if (jar.entries.length < local.entries.length && incomingSuffix) {
      skipped += 1;
    } else if (jar.balance === local.balance) {
      skipped += 1;
    } else {
      return {
        ...unchanged,
        error: `Jar “${jar.name}” has a balance that does not match its history.`,
      };
    }
  }

  const activeTotal = next
    .filter((jar) => !jar.archived)
    .reduce((total, jar) => total + jar.balance, 0);
  if (!Number.isSafeInteger(activeTotal))
    return {
      ...unchanged,
      error: "This transfer exceeds the safe savings total.",
    };
  return { jars: next, added, updated, skipped };
}
