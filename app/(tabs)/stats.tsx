import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { type ThemeColorPalette } from "@/constants/theme";
import { useColors } from "@/hooks/use-colors";
import { useJarAccents } from "@/hooks/use-jar-accents";
import { dailyDepositTotals, weeklyDepositTotals } from "@/lib/savings-core";
import { paceProjection, percent, useMoney, useSavings } from "@/lib/savings-store";

function Metric({ icon, label, value, warning, styles, colors }: { icon: string; label: string; value: string; warning?: boolean; styles: ReturnType<typeof makeStyles>; colors: ThemeColorPalette }) {
  return <View style={[styles.metric, warning && { backgroundColor: `${colors.warning}10`, borderColor: `${colors.warning}55` }]}><MaterialIcons name={icon as never} size={17} color={warning ? colors.warning : colors.primary} /><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}

export default function InsightsScreen() {
  const colors = useColors();
  const accents = useJarAccents();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { jars } = useSavings();
  const format = useMoney();
  const active = useMemo(() => jars.filter((jar) => !jar.archived), [jars]);
  const total = active.reduce((sum, jar) => sum + jar.balance, 0);
  const weekly = useMemo(() => weeklyDepositTotals(active, 12), [active]);
  const daily = useMemo(() => dailyDepositTotals(active, 84), [active]);
  const peak = Math.max(...weekly, 1);
  const activeDays = daily.filter((amount) => amount > 0).length;
  const bestStreak = active.reduce((best, jar) => Math.max(best, jar.streak ?? 0), 0);
  const deposits = active.reduce((sum, jar) => sum + jar.entries.filter((entry) => entry.direction === "deposit").length, 0);
  const attention = active.filter((jar) => paceProjection(jar).status === "behind").length;
  const heatWeeks = Array.from({ length: 12 }, (_, week) => daily.slice(week * 7, week * 7 + 7));
  const dailyPeak = Math.max(...daily, 1);

  return <ScreenContainer><ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    <Text style={styles.kicker}>INSIGHTS</Text><Text style={styles.title}>Your saving, at a glance.</Text>
    <View style={styles.trendCard}><View style={styles.row}><View><Text style={styles.cardLabel}>LAST 12 WEEKS</Text><Text style={styles.trendTotal}>{format(weekly.reduce((sum, value) => sum + value, 0))}</Text></View><Text style={styles.average}>Avg {format(Math.round(weekly.reduce((sum, value) => sum + value, 0) / 12))}/wk</Text></View><View style={styles.bars}>{weekly.map((value, index) => <View key={index} style={styles.barColumn}><View style={[styles.bar, { height: Math.max(4, (value / peak) * 78), backgroundColor: index === weekly.length - 1 ? colors.primary : `${colors.primary}55` }]} /></View>)}</View><View style={styles.axis}><Text style={styles.axisText}>12w ago</Text><Text style={styles.axisText}>Now</Text></View></View>
    <View style={styles.consistency}><View style={styles.row}><View><Text style={styles.cardLabel}>CONSISTENCY</Text><Text style={styles.cardTitle}>{activeDays} saving days <Text style={styles.cardSub}>of 84</Text></Text></View><View style={[styles.streak, { backgroundColor: `${colors.warning}18` }]}><MaterialIcons name="local-fire-department" size={13} color={colors.warning} /><Text style={[styles.streakText, { color: colors.warning }]}>{bestStreak}d best</Text></View></View><View style={styles.heatmap}>{heatWeeks.map((week, weekIndex) => <View key={weekIndex} style={styles.heatWeek}>{week.map((amount, dayIndex) => { const ratio = amount / dailyPeak; const backgroundColor = amount === 0 ? colors.border : ratio < .25 ? "#CFE8DD" : ratio < .5 ? "#9AD3B9" : ratio < .8 ? "#5FB894" : colors.success; return <View key={dayIndex} accessibilityLabel={amount ? format(amount) : "No deposit"} style={[styles.heatDay, { backgroundColor }]} />; })}</View>)}</View><Text style={styles.heatCaption}>Each square is a day you made progress.</Text></View>
    <View style={styles.metricGrid}><Metric icon="savings" label="total saved" value={format(total)} styles={styles} colors={colors} /><Metric icon="north" label="deposits" value={String(deposits)} styles={styles} colors={colors} /></View><View style={[styles.metricGrid, { marginTop: 10 }]}><Metric icon="emoji-events" label="jars funded" value={`${active.filter((jar) => percent(jar) >= 100).length}/${active.length}`} styles={styles} colors={colors} /><Metric icon="priority-high" label="need attention" value={String(attention)} warning={attention > 0} styles={styles} colors={colors} /></View>
    <View style={styles.allocation}><Text style={styles.cardLabel}>WHERE YOUR MONEY SITS</Text><View style={styles.allocationBar}>{total > 0 ? active.filter((jar) => jar.balance > 0).map((jar) => <View key={jar.id} style={{ flex: jar.balance, backgroundColor: accents[jar.accent] }} />) : <View style={{ flex: 1, backgroundColor: colors.border }} />}</View>{[...active].sort((left, right) => right.balance - left.balance).map((jar) => <View key={jar.id} style={styles.allocationRow}><View style={[styles.dot, { backgroundColor: accents[jar.accent] }]} /><Text numberOfLines={1} style={styles.allocationName}>{jar.name}</Text><Text style={styles.allocationAmount}>{total ? `${Math.round((jar.balance / total) * 100)}% · ` : ""}{format(jar.balance)}</Text></View>)}</View>
  </ScrollView></ScreenContainer>;
}

const makeStyles = (c: ThemeColorPalette) => StyleSheet.create({
  content: { padding: 20, paddingBottom: 36 }, kicker: { color: c.muted, fontSize: 10, letterSpacing: 1.4, fontWeight: "800", marginTop: 4 }, title: { color: c.foreground, fontFamily: "Georgia", fontSize: 31, lineHeight: 36, marginTop: 7 },
  trendCard: { borderRadius: 26, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, padding: 18, marginTop: 22 }, row: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }, cardLabel: { color: c.muted, fontSize: 10, letterSpacing: 1.05, fontWeight: "800" }, trendTotal: { color: c.foreground, fontFamily: "Georgia", fontSize: 31, marginTop: 5, fontVariant: ["tabular-nums"] }, average: { color: c.success, fontSize: 11, fontWeight: "800", backgroundColor: `${c.success}15`, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999 }, bars: { height: 86, flexDirection: "row", alignItems: "flex-end", gap: 5, marginTop: 18 }, barColumn: { flex: 1, height: "100%", justifyContent: "flex-end", alignItems: "center" }, bar: { width: "65%", borderRadius: 4 }, axis: { flexDirection: "row", justifyContent: "space-between", marginTop: 7 }, axisText: { color: c.muted, fontSize: 10, fontWeight: "700" },
  consistency: { borderRadius: 22, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, padding: 16, marginTop: 11 }, cardTitle: { color: c.foreground, fontSize: 14, fontWeight: "800", marginTop: 5 }, cardSub: { color: c.muted, fontWeight: "500" }, streak: { flexDirection: "row", gap: 4, alignItems: "center", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 5 }, streakText: { fontSize: 10, fontWeight: "800" }, heatmap: { flexDirection: "row", gap: 3, marginTop: 15 }, heatWeek: { flex: 1, gap: 3 }, heatDay: { aspectRatio: 1, borderRadius: 3 }, heatCaption: { color: c.muted, fontSize: 10, marginTop: 9 },
  metricGrid: { flexDirection: "row", gap: 10, marginTop: 11 }, metric: { flex: 1, minHeight: 100, padding: 14, borderRadius: 20, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border }, metricValue: { color: c.foreground, fontFamily: "Georgia", fontSize: 21, marginTop: 9, fontVariant: ["tabular-nums"] }, metricLabel: { color: c.muted, fontSize: 11, marginTop: 3 },
  allocation: { borderRadius: 22, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, padding: 16, marginTop: 11 }, allocationBar: { height: 12, flexDirection: "row", overflow: "hidden", borderRadius: 999, marginTop: 12, gap: 2 }, allocationRow: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 11 }, dot: { width: 8, height: 8, borderRadius: 999 }, allocationName: { color: c.foreground, fontSize: 12, fontWeight: "700", flex: 1 }, allocationAmount: { color: c.muted, fontSize: 11, fontVariant: ["tabular-nums"] },
});
