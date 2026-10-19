import type { Entry, Jar } from "@/lib/savings-core";

export type ActivityRowData = { entry: Entry; jar: Jar };
export type ActivitySection = { title: string; data: ActivityRowData[] };

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
): ActivitySection[] {
  const rows = jars
    .filter((jar) => !jar.archived)
    .flatMap((jar) => jar.entries.map((entry) => ({ entry, jar })))
    .sort((a, b) => b.entry.at.localeCompare(a.entry.at));
  const sections: ActivitySection[] = [];
  for (const row of rows) {
    const title = dayLabel(row.entry.at, now);
    const last = sections.at(-1);
    if (last?.title === title) last.data.push(row);
    else sections.push({ title, data: [row] });
  }
  return sections;
}
