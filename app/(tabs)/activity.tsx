import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { EmptyState } from "@/components/empty-state";
import { JarVessel } from "@/components/jar-vessel";
import { ScreenContainer } from "@/components/screen-container";
import { Fonts, type ThemeColorPalette } from "@/constants/theme";
import { useColors } from "@/hooks/use-colors";
import { useJarAccents } from "@/hooks/use-jar-accents";
import { inkOnAccent } from "@/lib/jar-ink";
import { type Entry, type Jar, useMoney, useSavings } from "@/lib/savings-store";

type Row = { entry: Entry; jar: Jar };
type Group = { label: string; rows: Row[] };

function dayLabel(iso: string, now: Date): string {
  const date = new Date(iso);
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOf(now) - startOf(date)) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return date.toLocaleDateString(undefined, { weekday: "long" });
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: date.getFullYear() === now.getFullYear() ? undefined : "numeric" });
}

function ActivityRow({ row, styles, colors, accents, format }: { row: Row; styles: ReturnType<typeof makeStyles>; colors: ThemeColorPalette; accents: Record<string, string>; format: (minor: number) => string }) {
  const accent = accents[row.jar.accent];
  const isDeposit = row.entry.direction === "deposit";
  const title = isDeposit ? (row.entry.source === "recurring" ? "Scheduled deposit" : "Money added") : "Money withdrawn";
  const amountLabel = `${isDeposit ? "+" : "−"}${format(row.entry.amount)}`;
  return (
    <View style={styles.row} accessibilityLabel={`${title} into ${row.jar.name}. ${amountLabel}.`}>
      <View style={[styles.rowIcon, { backgroundColor: isDeposit ? `${accent}1D` : `${colors.error}17` }]}>
        <MaterialIcons name={isDeposit ? "add" : "remove"} size={18} color={isDeposit ? accent : colors.error} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{row.jar.name}</Text>
        <Text style={styles.rowMeta}>{title}{row.entry.note ? ` · ${row.entry.note}` : ""}</Text>
      </View>
      <Text style={[styles.rowAmount, { color: isDeposit ? inkOnAccent(accent) : colors.error }]}>{amountLabel}</Text>
    </View>
  );
}

export default function ActivityScreen() {
  const colors = useColors();
  const accents = useJarAccents();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { jars } = useSavings();
  const format = useMoney();
  const [filter, setFilter] = useState<"all" | "deposit" | "withdrawal">("all");

  const hasEntries = useMemo(() => jars.filter((jar) => !jar.archived).some((jar) => jar.entries.length > 0), [jars]);

  const groups = useMemo<Group[]>(() => {
    const now = new Date();
    const rows: Row[] = jars
      .filter((jar) => !jar.archived)
      .flatMap((jar) => jar.entries.map((entry) => ({ entry, jar })))
      .filter((row) => filter === "all" || row.entry.direction === filter)
      .sort((a, b) => b.entry.at.localeCompare(a.entry.at));
    const grouped: Group[] = [];
    for (const row of rows) {
      const label = dayLabel(row.entry.at, now);
      const last = grouped[grouped.length - 1];
      if (last && last.label === label) last.rows.push(row);
      else grouped.push({ label, rows: [row] });
    }
    return grouped;
  }, [jars, filter]);

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.kicker}>ACTIVITY</Text>
        <Text style={styles.title}>Every deposit,{`\n`}told simply.</Text>
        {hasEntries ? (
          <View style={styles.filterRow}>
            {(["all", "deposit", "withdrawal"] as const).map((option) => {
              const active = filter === option;
              const label = option === "all" ? "All" : option === "deposit" ? "Deposits" : "Withdrawals";
              return (
                <Pressable key={option} accessibilityLabel={`Show ${label.toLowerCase()}`} accessibilityState={{ selected: active }} onPress={() => setFilter(option)} style={({ pressed }) => [styles.chip, active && { backgroundColor: colors.primary, borderColor: colors.primary }, pressed && styles.pressed]}>
                  <Text style={[styles.chipText, active && { color: "#FFFDF9" }]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
        {groups.length === 0 ? (
          filter === "all" ? (
            <View style={styles.empty}>
              <JarVessel accent={accents.amber} icon="star" progress={0} size="medium" />
              <Text style={styles.emptyTitle}>Nothing saved yet.</Text>
              <Text style={styles.emptyCopy}>Your deposits will appear here.</Text>
            </View>
          ) : (
            <View style={{ marginTop: 26 }}>
              <EmptyState title="Nothing here yet." copy="Try a different filter to see more activity." ctaLabel="Show everything" onCta={() => setFilter("all")} />
            </View>
          )
        ) : (
          groups.map((group) => (
            <View key={group.label} style={styles.group}>
              <Text style={styles.groupLabel}>{group.label}</Text>
              <View style={styles.groupCard}>
                {group.rows.map((row, index) => (
                  <View key={row.entry.id}>
                    <ActivityRow row={row} styles={styles} colors={colors} accents={accents} format={format} />
                    {index < group.rows.length - 1 ? <View style={styles.divider} /> : null}
                  </View>
                ))}
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const makeStyles = (c: ThemeColorPalette) => StyleSheet.create({
  content: { padding: 20, paddingBottom: 108 },
  kicker: { color: c.muted, fontSize: 10, letterSpacing: 1.4, fontWeight: "800", marginTop: 4 },
  title: { color: c.foreground, fontFamily: Fonts.serif, fontSize: 31, lineHeight: 36, marginTop: 7 },
  empty: { backgroundColor: c.surface, borderRadius: 26, padding: 26, alignItems: "center", borderWidth: 1, borderColor: c.border, marginTop: 26 },
  emptyTitle: { color: c.foreground, fontFamily: Fonts.serif, fontSize: 22, marginTop: 14 },
  emptyCopy: { color: c.muted, fontSize: 13, lineHeight: 19, textAlign: "center", marginTop: 8 },
  filterRow: { flexDirection: "row", gap: 8, marginTop: 18 },
  chip: { minHeight: 44, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, alignItems: "center", justifyContent: "center" },
  chipText: { color: c.muted, fontSize: 12, fontWeight: "800" },
  pressed: { opacity: 0.86 },
  group: { marginTop: 24 },
  groupLabel: { color: c.muted, fontSize: 11, fontWeight: "800", letterSpacing: 0.9, marginBottom: 9 },
  groupCard: { backgroundColor: c.surface, borderRadius: 21, borderWidth: 1, borderColor: c.border, paddingHorizontal: 15, paddingVertical: 5 },
  row: { minHeight: 65, flexDirection: "row", alignItems: "center", gap: 11, paddingVertical: 8 },
  rowIcon: { width: 39, height: 39, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  rowTitle: { color: c.foreground, fontSize: 14, fontWeight: "800" },
  rowMeta: { color: c.muted, fontSize: 11, marginTop: 4 },
  rowAmount: { fontSize: 13, fontWeight: "800", fontVariant: ["tabular-nums"] },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: c.border, marginLeft: 50 },
});
