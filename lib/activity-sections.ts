import type { Entry, Jar } from "@/lib/savings-core";

export type ActivityRowData = { entry: Entry; jar: Jar };
export type ActivitySection = { title: string; data: ActivityRowData[] };
export type ActivityFilters = {
  jarId?: string;
  direction?: "all" | Entry["direction"];
  range?: "all" | "7days" | "30days";
};

function dayLabel(iso: string, now: Date): string {
  const date = new Date(iso);
  const day = (value: Date) =>
    Math.floor(
      Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()) /
        86_400_000,
    );
  const diffDays = day(now) - day(date);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7)
    return date.toLocaleDateString(undefined, { weekday: "long" });
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: date.getFullYear() === now.getFullYear() ? undefined : "numeric",
  });
}

export function activitySections(
  jars: Jar[],
  now: Date = new Date(),
  filters: ActivityFilters = {},
): ActivitySection[] {
  const days =
    filters.range === "7days" ? 7 : filters.range === "30days" ? 30 : undefined;
  const since =
    days === undefined
      ? undefined
      : new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate() - days + 1,
        ).getTime();
  const until = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
  ).getTime();
  const rows = jars
    .filter(
      (jar) => !jar.archived && (!filters.jarId || jar.id === filters.jarId),
    )
    .flatMap((jar) => jar.entries.map((entry) => ({ entry, jar })))
    .filter(({ entry }) => {
      if (
        filters.direction &&
        filters.direction !== "all" &&
        entry.direction !== filters.direction
      )
        return false;
      const at = new Date(entry.at).getTime();
      return since === undefined || (at >= since && at < until);
    })
    .sort(
      (a, b) => new Date(b.entry.at).getTime() - new Date(a.entry.at).getTime(),
    );
  const sections: ActivitySection[] = [];
  for (const row of rows) {
    const title = dayLabel(row.entry.at, now);
    const last = sections.at(-1);
    if (last?.title === title) last.data.push(row);
    else sections.push({ title, data: [row] });
  }
  return sections;
}
