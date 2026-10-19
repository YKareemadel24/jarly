import type { Jar } from "@/lib/domain";

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
    incoming.some((jar) => {
      if (jar.entries.length === 0) return false; // Older jars may have a starting balance without a ledger.
      const balance = jar.entries.reduce(
        (total, entry) =>
          total +
          (entry.direction === "deposit" ? entry.amount : -entry.amount),
        0,
      );
      return (
        !Number.isSafeInteger(balance) || balance < 0 || balance !== jar.balance
      );
    })
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
    const localDetails = {
      name: local.name,
      target: local.target,
      accent: local.accent,
      icon: local.icon,
      kind: local.kind,
      deadline: local.deadline,
      recurring: local.recurring,
      archived: local.archived,
    };
    const incomingDetails = {
      name: jar.name,
      target: jar.target,
      accent: jar.accent,
      icon: jar.icon,
      kind: jar.kind,
      deadline: jar.deadline,
      recurring: jar.recurring,
      archived: jar.archived,
    };
    if (JSON.stringify(localDetails) !== JSON.stringify(incomingDetails))
      return {
        ...unchanged,
        error: `Jar “${jar.name}” has conflicting settings. Resolve the copies before importing.`,
      };

    const sameEntry = (a: Jar["entries"][number], b: Jar["entries"][number]) =>
      a.amount === b.amount &&
      a.direction === b.direction &&
      a.at === b.at &&
      a.note === b.note &&
      a.source === b.source;
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
