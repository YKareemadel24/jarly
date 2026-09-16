import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { type ThemeColorPalette } from "@/constants/theme";
import { useColors } from "@/hooks/use-colors";
import { useJarAccents } from "@/hooks/use-jar-accents";
import { badges, type MonthTotal, monthlyDeposits } from "@/lib/savings-core";
import { percent, type Jar, useMoney, useSavings } from "@/lib/savings-store";

function Metric({ icon, label, value, styles, colors }: { icon: string; label: string; value: string; styles: ReturnType<typeof makeStyles>; colors: ThemeColorPalette }) {
  return <View style={styles.metric}><View style={styles.metricIcon}><MaterialIcons name={icon as never} size={18} color={colors.primary} /></View><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}

function MonthlyChart({ months, styles, colors, format }: { months: MonthTotal[]; styles: ReturnType<typeof makeStyles>; colors: ThemeColorPalette; format: (minor: number) => string }) {
  const peak = Math.max(1, ...months.map((m) => m.total));
  const any = months.some((m) => m.total > 0);
  return (
    <View style={styles.chart}>
      {any ? (
        <View style={styles.chartBars}>
          {months.map((m) => (
            <View key={m.label} style={styles.chartCol}>
              <Text style={styles.chartValue} numberOfLines={1}>{m.total > 0 ? format(m.total) : ""}</Text>
              <View style={[styles.chartBar, { height: Math.max(6, (m.total / peak) * 90), backgroundColor: m.total > 0 ? colors.primary : colors.border }]} />
              <Text style={styles.chartLabel}>{m.label}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.chartEmpty}>Deposits you make will fill these months in.</Text>
      )}
    </View>
  );
}

export default function InsightsScreen() {
  const colors = useColors();
  const accents = useJarAccents();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { jars, total } = useSavings();
  const format = useMoney();
  const active = useMemo(() => jars.filter((jar) => !jar.archived), [jars]);
  const completed = useMemo(() => active.filter((jar) => percent(jar) >= 100).length, [active]);
  const closest = useMemo(() => active.reduce<Jar | undefined>((best, jar) => (!best || percent(jar) > percent(best) ? jar : best), undefined), [active]);
  const streak = useMemo(() => active.reduce((best, jar) => Math.max(best, jar.streak ?? 0), 0), [active]);
  const depositCount = useMemo(() => active.reduce((count, jar) => count + jar.entries.filter((entry) => entry.direction === "deposit").length, 0), [active]);
  const months = useMemo(() => monthlyDeposits(active), [active]);
  const badgeList = useMemo(() => badges(active), [active]);
  const earnedCount = useMemo(() => badgeList.filter((badge) => badge.earned).length, [badgeList]);

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.kicker}>INSIGHTS</Text>
        <Text style={styles.title}>Progress, made{"\n"}clear.</Text>

        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <View>
              <Text style={styles.heroLabel}>TOTAL SAVED</Text>
              <Text style={styles.heroAmount}>{format(total)}</Text>
            </View>
            <View style={styles.heroIcon}><MaterialIcons name="auto-graph" size={23} color="#FFFDF9" /></View>
          </View>
          <Text style={styles.heroCopy}>{active.length ? `${active.length} active ${active.length === 1 ? "jar" : "jars"}, with every small deposit made visible.` : "Your progress will take shape as you begin saving."}</Text>
        </View>

        <Text style={styles.sectionLabel}>AT A GLANCE</Text>
        <View style={styles.metricGrid}>
          <Metric icon="track-changes" label="active jars" value={String(active.length)} styles={styles} colors={colors} />
          <Metric icon="emoji-events" label="completed" value={String(completed)} styles={styles} colors={colors} />
        </View>
        <View style={[styles.metricGrid, { marginTop: 10 }]}>
          <Metric icon="local-fire-department" label="best streak" value={streak ? `${streak} ${streak === 1 ? "day" : "days"}` : "—"} styles={styles} colors={colors} />
          <Metric icon="north" label="deposits added" value={String(depositCount)} styles={styles} colors={colors} />
        </View>

        <View style={styles.closest}>
          {closest ? (
            <>
              <View style={[styles.closestIcon, { backgroundColor: `${accents[closest.accent]}20` }]}><MaterialIcons name="flag" size={19} color={accents[closest.accent]} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.closestLabel}>CLOSEST GOAL</Text>
                <Text style={styles.closestTitle} numberOfLines={1}>{closest.name}</Text>
                <Text style={styles.closestCopy}>{format(Math.max(closest.target - closest.balance, 0))} to goal</Text>
                <View style={[styles.track, { marginTop: 8 }]}><View style={[styles.trackFill, { width: `${percent(closest)}%`, backgroundColor: accents[closest.accent] }]} /></View>
              </View>
              <Text style={[styles.closestPercent, { color: accents[closest.accent] }]}>{percent(closest)}%</Text>
            </>
          ) : (
            <>
              <View style={styles.closestIcon}><MaterialIcons name="lightbulb-outline" size={19} color={colors.primary} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.closestTitle}>Your progress starts small.</Text>
                <Text style={styles.closestCopy}>Create a jar, then let your next contribution be the first visible step.</Text>
              </View>
            </>
          )}
        </View>

        <Text style={styles.sectionLabel}>MONTHLY CONTRIBUTIONS</Text>
        <MonthlyChart months={months} styles={styles} colors={colors} format={format} />

        <Text style={styles.sectionLabel}>BADGES</Text>
        <View style={styles.badgeSummary}>
          <View style={styles.badgeSummaryRing}>
            <Text style={styles.badgeSummaryCount}>{earnedCount}</Text>
            <Text style={styles.badgeSummaryTotal}>of {badgeList.length}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.badgeSummaryTitle}>
              {earnedCount === 0
                ? "Your first badge is close."
                : earnedCount === badgeList.length
                  ? "Every badge earned."
                  : earnedCount >= badgeList.length / 2
                    ? "More than halfway."
                    : "Just getting started."}
            </Text>
            <Text style={styles.badgeSummaryCopy}>Milestones you reach simply by saving, one deposit at a time.</Text>
          </View>
        </View>
        <View style={styles.badgeGrid}>
          {badgeList.map((badge) => {
            const progress = badge.target > 0 ? Math.min(100, Math.round((badge.value / badge.target) * 100)) : 0;
            return (
              <View
                key={badge.id}
                accessibilityLabel={
                  badge.earned
                    ? `${badge.name}, earned. ${badge.description}.`
                    : `${badge.name}, locked. ${badge.description}. ${Math.min(badge.value, badge.target)} of ${badge.target}.`
                }
                style={[styles.badge, badge.earned && styles.badgeEarned]}
              >
                <View style={[styles.badgeGlyph, badge.earned && styles.badgeGlyphEarned]}>
                  <Text style={styles.badgeGlyphText}>{badge.earned ? badge.glyph : "🔒"}</Text>
                </View>
                <Text style={[styles.badgeName, badge.earned && { color: colors.foreground }]}>{badge.name}</Text>
                <Text style={styles.badgeDesc} numberOfLines={2}>{badge.description}</Text>
                {badge.earned ? (
                  <View style={styles.badgeEarnedTag}><MaterialIcons name="check" size={12} color={colors.success} /><Text style={styles.badgeEarnedTagText}>Earned</Text></View>
                ) : (
                  <View style={styles.badgeProgressTrack}>
                    <View style={[styles.badgeProgressFill, { width: `${progress}%` }]} />
                  </View>
                )}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const makeStyles = (c: ThemeColorPalette) => StyleSheet.create({
  content: { padding: 20, paddingBottom: 36 },
  kicker: { color: c.muted, fontSize: 10, letterSpacing: 1.4, fontWeight: "800", marginTop: 4 },
  title: { color: c.foreground, fontFamily: "Georgia", fontSize: 31, lineHeight: 36, marginTop: 7 },
  hero: { borderRadius: 27, backgroundColor: "#3B2D24", padding: 22, marginTop: 23, shadowColor: "#3B2D24", shadowOpacity: .18, shadowOffset: { width: 0, height: 10 }, shadowRadius: 16, elevation: 4 },
  heroTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  heroLabel: { color: "#E8D9C8", fontSize: 10, letterSpacing: 1.1, fontWeight: "800" },
  heroAmount: { color: "#FFFDF9", fontFamily: "Georgia", fontSize: 35, marginTop: 7, fontVariant: ["tabular-nums"] },
  heroIcon: { width: 41, height: 41, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,253,249,.17)" },
  heroCopy: { color: "#E8D9C8", fontSize: 13, lineHeight: 19, marginTop: 15, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(255,253,249,.22)" },
  sectionLabel: { color: c.muted, fontSize: 10, letterSpacing: 1.15, fontWeight: "800", marginTop: 27, marginBottom: 10 },
  metricGrid: { flexDirection: "row", gap: 10 },
  metric: { minHeight: 112, flex: 1, padding: 14, borderRadius: 20, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border },
  metricIcon: { width: 32, height: 32, borderRadius: 11, backgroundColor: `${c.primary}12`, alignItems: "center", justifyContent: "center" },
  metricValue: { color: c.foreground, fontFamily: "Georgia", fontSize: 22, marginTop: 11, fontVariant: ["tabular-nums"] },
  metricLabel: { color: c.muted, fontSize: 11, marginTop: 3 },
  closest: { marginTop: 18, minHeight: 83, borderRadius: 20, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, padding: 14, flexDirection: "row", alignItems: "center", gap: 11 },
  closestIcon: { width: 39, height: 39, borderRadius: 13, backgroundColor: `${c.primary}12`, alignItems: "center", justifyContent: "center" },
  closestLabel: { color: c.muted, fontSize: 9, letterSpacing: 1, fontWeight: "800" },
  closestTitle: { color: c.foreground, fontSize: 14, fontWeight: "800", marginTop: 3 },
  closestCopy: { color: c.muted, fontSize: 11, marginTop: 3 },
  closestPercent: { fontSize: 20, fontFamily: "Georgia", fontVariant: ["tabular-nums"] },
  track: { height: 5, backgroundColor: c.border, borderRadius: 99, overflow: "hidden", marginTop: 9 },
  trackFill: { height: "100%", borderRadius: 99 },
  chart: { borderRadius: 20, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, padding: 16 },
  chartBars: { flexDirection: "row", alignItems: "flex-end", height: 120, gap: 8 },
  chartCol: { flex: 1, alignItems: "center", justifyContent: "flex-end" },
  chartBar: { width: "70%", borderRadius: 6 },
  chartValue: { color: c.muted, fontSize: 9, fontWeight: "700", fontVariant: ["tabular-nums"], marginBottom: 4 },
  chartLabel: { color: c.muted, fontSize: 10, fontWeight: "700", marginTop: 6 },
  chartEmpty: { color: c.muted, fontSize: 12, textAlign: "center", paddingVertical: 22 },
  badgeSummary: { borderRadius: 20, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, padding: 16, flexDirection: "row", alignItems: "center", gap: 14 },
  badgeSummaryRing: { width: 58, height: 58, borderRadius: 29, borderWidth: 3, borderColor: c.primary, alignItems: "center", justifyContent: "center" },
  badgeSummaryCount: { color: c.foreground, fontFamily: "Georgia", fontSize: 19, fontVariant: ["tabular-nums"] },
  badgeSummaryTotal: { color: c.muted, fontSize: 9, fontWeight: "700" },
  badgeSummaryTitle: { color: c.foreground, fontSize: 14, fontWeight: "800" },
  badgeSummaryCopy: { color: c.muted, fontSize: 11, marginTop: 4, lineHeight: 15 },
  badgeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 10 },
  badge: { width: "47.8%", flexGrow: 1, minHeight: 128, borderRadius: 19, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, padding: 13 },
  badgeEarned: { borderColor: `${c.success}66` },
  badgeGlyph: { width: 36, height: 36, borderRadius: 12, backgroundColor: c.border, alignItems: "center", justifyContent: "center" },
  badgeGlyphEarned: { backgroundColor: `${c.warning}24` },
  badgeGlyphText: { fontSize: 17 },
  badgeName: { color: c.muted, fontSize: 12.5, fontWeight: "800", marginTop: 10 },
  badgeDesc: { color: c.muted, fontSize: 10.5, marginTop: 3, lineHeight: 14 },
  badgeProgressTrack: { height: 4, borderRadius: 999, backgroundColor: c.border, overflow: "hidden", marginTop: 9 },
  badgeProgressFill: { height: "100%", borderRadius: 999, backgroundColor: c.muted },
  badgeEarnedTag: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 9 },
  badgeEarnedTagText: { color: c.success, fontSize: 10.5, fontWeight: "800" },
});
