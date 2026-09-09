import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router } from "expo-router";
import { useMemo } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";

import { JarVessel } from "@/components/jar-vessel";
import { ScreenContainer } from "@/components/screen-container";
import { Fonts, type ThemeColorPalette } from "@/constants/theme";
import { useColors } from "@/hooks/use-colors";
import { useJarAccents } from "@/hooks/use-jar-accents";
import { inkOnAccent } from "@/lib/jar-ink";
import { nextBestJarId } from "@/lib/savings-core";
import { deadlineCountdown, paceProjection, percent, type Accent, type Jar, useMoney, useSavings } from "@/lib/savings-store";

const WEEK_MS = 7 * 86_400_000;

function PacePill({ jar, styles, colors }: { jar: Jar; styles: ReturnType<typeof makeStyles>; colors: ThemeColorPalette }) {
  const pace = paceProjection(jar);
  if (pace.status === "no-deadline") return null;
  const label = pace.status === "funded" ? "Funded" : pace.status === "on-track" ? "On track" : pace.status === "behind" ? "Behind pace" : "Set a rhythm";
  const tone = pace.status === "behind" || pace.status === "no-pace" ? colors.warning : colors.success;
  return <View style={[styles.pacePill, { backgroundColor: `${tone}1F` }]}><Text style={[styles.paceText, { color: tone }]}>{label}</Text></View>;
}

function GoalCard({ jar, styles, colors, accents, format }: { jar: Jar; styles: ReturnType<typeof makeStyles>; colors: ThemeColorPalette; accents: Record<Accent, string>; format: (minor: number) => string }) {
  const progress = percent(jar);
  const accent = accents[jar.accent];
  const meta = jar.kind === "habit" && jar.streak ? `${jar.streak}-day streak` : deadlineCountdown(jar.deadline) ?? "No deadline";
  return <Pressable
    accessibilityLabel={`${jar.name}. ${progress}% complete. ${format(jar.balance)} saved of ${format(jar.target)}.`}
    accessibilityHint="Double-tap to open. Use Add for a quick deposit."
    onPress={() => router.push(`/jar/${jar.id}` as never)}
    style={({ pressed }) => [styles.goalCard, pressed && styles.pressed]}
  >
    <View style={styles.goalVisual}><JarVessel accent={accent} icon={jar.icon} progress={progress} size="small" label={`${progress}%`} /></View>
    <View style={styles.goalCopy}>
      <View style={styles.goalHeading}><Text numberOfLines={1} style={styles.goalName}>{jar.name}</Text><PacePill jar={jar} styles={styles} colors={colors} /></View>
      <Text style={styles.goalAmount}>{format(jar.balance)} <Text style={styles.goalTarget}>of {format(jar.target)}</Text></Text>
      <View style={styles.track}><View style={[styles.trackFill, { width: `${progress}%`, backgroundColor: accent }]} /></View>
      <Text style={styles.goalMeta}>{meta} · {progress}% funded</Text>
    </View>
    <Pressable
      accessibilityLabel={`Add money to ${jar.name}`}
      onPress={() => router.push(`/jar/${jar.id}?action=deposit` as never)}
      style={({ pressed }) => [styles.quickAddChip, { backgroundColor: `${accent}1F` }, pressed && styles.pressed]}
    ><Text style={[styles.quickAddChipText, { color: inkOnAccent(accent) }]}>+ Add</Text></Pressable>
  </Pressable>;
}

export default function HomeScreen() {
  const colors = useColors();
  const accents = useJarAccents();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { jars, ready, total } = useSavings();
  const format = useMoney();
  const active = useMemo(() => jars.filter((jar) => !jar.archived), [jars]);
  const inProgress = useMemo(() => active.filter((jar) => percent(jar) < 100), [active]);
  const completed = useMemo(() => active.filter((jar) => percent(jar) >= 100), [active]);
  const nextJar = useMemo(() => {
    const id = nextBestJarId(active);
    return active.find((jar) => jar.id === id);
  }, [active]);
  const weeklyDelta = useMemo(() => {
    const since = Date.now() - WEEK_MS;
    return active.reduce((sum, jar) => sum + jar.entries.reduce((subtotal, entry) =>
      entry.direction === "deposit" && new Date(entry.at).getTime() >= since ? subtotal + entry.amount : subtotal, 0), 0);
  }, [active]);

  if (!ready) return <ScreenContainer className="items-center justify-center"><ActivityIndicator color={colors.primary} /></ScreenContainer>;

  const nextPace = nextJar ? paceProjection(nextJar) : null;
  const behind = nextPace?.status === "behind";
  const actionTitle = nextJar ? behind ? `${nextJar.name} needs attention` : `${nextJar.name} is ${100 - percent(nextJar)}% from done` : "";
  const actionCopy = nextJar ? behind
    ? `${format(nextPace!.requiredPerWeekMinor)}/week keeps its deadline within reach.`
    : `${format(Math.max(nextJar.target - nextJar.balance, 0))} to go — a good next deposit helps.` : "";

  return <ScreenContainer>
    <FlatList
      data={inProgress}
      keyExtractor={(jar) => jar.id}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={<>
        <View style={styles.header}><View><Text style={styles.kicker}>SAVING JAR</Text><Text style={styles.greeting}>Give your goals{"\n"}somewhere to grow.</Text></View><Pressable accessibilityLabel="Open profile" onPress={() => router.push("/(tabs)/profile" as never)} style={({ pressed }) => [styles.profileButton, pressed && styles.pressed]}><MaterialIcons name="tune" size={20} color={colors.foreground} /></Pressable></View>
        <View style={styles.balanceCard}><Text style={styles.balanceLabel}>SAVED ACROSS {active.length} {active.length === 1 ? "JAR" : "JARS"}</Text><Text style={styles.balanceValue}>{format(total)}</Text><View style={styles.balanceBottom}><Text style={styles.balanceNote}>{weeklyDelta ? `+${format(weeklyDelta)} this week` : "Your next deposit starts the rhythm"}</Text><Text style={styles.balanceMomentum}>{completed.length} funded · {inProgress.length} active</Text></View></View>
        {nextJar ? <Pressable accessibilityLabel={`Add money to ${nextJar.name}`} onPress={() => router.push(`/jar/${nextJar.id}?action=deposit` as never)} style={({ pressed }) => [styles.nextAction, pressed && styles.pressed]}><View style={[styles.nextIcon, { backgroundColor: `${accents[nextJar.accent]}20` }]}><MaterialIcons name={behind ? "trending-up" : "auto-awesome"} size={18} color={accents[nextJar.accent]} /></View><View style={{ flex: 1 }}><Text style={styles.nextTitle} numberOfLines={1}>{actionTitle}</Text><Text style={styles.nextCopy}>{actionCopy}</Text></View><Text style={[styles.nextCta, { color: accents[nextJar.accent] }]}>{behind ? "Catch up" : "Add"}</Text></Pressable> : null}
        <View style={styles.sectionHeader}><View><Text style={styles.sectionTitle}>Your jars</Text><Text style={styles.sectionSub}>Tap to open · Add to save</Text></View><Pressable accessibilityLabel="Create a new jar" onPress={() => router.push("/jar/new" as never)} style={({ pressed }) => [styles.newGoal, pressed && styles.pressed]}><MaterialIcons name="add" size={18} color="#FFFDF9" /></Pressable></View>
      </>}
      renderItem={({ item }) => <GoalCard jar={item} styles={styles} colors={colors} accents={accents} format={format} />}
      ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
      ListFooterComponent={completed.length ? <View style={styles.completedBlock}><Text style={styles.completedTitle}>FUNDED · {completed.length}</Text>{completed.map((jar) => <View key={jar.id} style={{ marginTop: 10 }}><GoalCard jar={jar} styles={styles} colors={colors} accents={accents} format={format} /></View>)}</View> : null}
      ListEmptyComponent={<View style={styles.empty}><JarVessel accent={accents.amber} icon="star" progress={0} size="medium" /><Text style={styles.emptyTitle}>Make saving feel real.</Text><Text style={styles.emptyCopy}>Create a jar for what matters, then let each small contribution show up.</Text><Pressable onPress={() => router.push("/jar/new" as never)} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}><Text style={styles.primaryText}>Create your first jar</Text><MaterialIcons name="arrow-forward" size={18} color="#FFFDF9" /></Pressable></View>}
    />
    {nextJar ? <Pressable accessibilityLabel={`Add money to ${nextJar.name}`} onPress={() => router.push(`/jar/${nextJar.id}?action=deposit` as never)} style={({ pressed }) => [styles.quickAdd, pressed && styles.pressed]}><MaterialIcons name="add" size={23} color="#FFFDF9" /><Text style={styles.quickAddText}>Add money</Text></Pressable> : null}
  </ScreenContainer>;
}

const makeStyles = (c: ThemeColorPalette) => StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 104 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingTop: 4 },
  kicker: { color: c.muted, fontSize: 10, letterSpacing: 1.5, fontWeight: "800" },
  greeting: { color: c.foreground, fontFamily: Fonts.serif, fontSize: 29, lineHeight: 34, marginTop: 8 },
  profileButton: { width: 43, height: 43, borderRadius: 16, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center" },
  balanceCard: { backgroundColor: c.primary, padding: 22, borderRadius: 27, marginTop: 23, shadowColor: "#3B2D24", shadowOpacity: .22, shadowOffset: { width: 0, height: 12 }, shadowRadius: 18, elevation: 5 },
  balanceLabel: { color: "#E8D9C8", fontSize: 10, letterSpacing: 1.15, fontWeight: "800" },
  balanceValue: { color: "#FFFDF9", fontSize: 37, lineHeight: 46, marginTop: 8, fontFamily: Fonts.serif, fontWeight: "700", fontVariant: ["tabular-nums"] },
  balanceBottom: { marginTop: 15, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(255,253,249,.22)", flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  balanceNote: { color: "#E8D9C8", fontSize: 12, flex: 1 }, balanceMomentum: { color: "#FFFDF9", fontSize: 11, fontWeight: "800", fontVariant: ["tabular-nums"] },
  nextAction: { backgroundColor: c.surface, borderRadius: 18, borderWidth: 1, borderColor: c.border, marginTop: 13, padding: 13, flexDirection: "row", alignItems: "center", gap: 10 },
  nextIcon: { width: 39, height: 39, borderRadius: 13, alignItems: "center", justifyContent: "center" }, nextTitle: { color: c.foreground, fontSize: 13, fontWeight: "800" }, nextCopy: { color: c.muted, fontSize: 11, marginTop: 2 }, nextCta: { fontSize: 12, fontWeight: "800" },
  sectionHeader: { marginTop: 28, marginBottom: 13, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }, sectionTitle: { color: c.foreground, fontFamily: Fonts.serif, fontSize: 22 }, sectionSub: { color: c.muted, fontSize: 12, marginTop: 4 }, newGoal: { width: 37, height: 37, borderRadius: 13, backgroundColor: c.primary, alignItems: "center", justifyContent: "center" },
  goalCard: { minHeight: 114, backgroundColor: c.surface, borderRadius: 22, borderColor: c.border, borderWidth: 1, padding: 12, flexDirection: "row", alignItems: "center", gap: 10 }, goalVisual: { width: 77, alignItems: "center", justifyContent: "center" }, goalCopy: { flex: 1, alignSelf: "stretch", justifyContent: "center", paddingRight: 42 }, goalHeading: { flexDirection: "row", alignItems: "center", gap: 7 }, goalName: { color: c.foreground, flex: 1, fontSize: 15, fontWeight: "800" }, pacePill: { borderRadius: 999, paddingHorizontal: 7, paddingVertical: 3 }, paceText: { fontSize: 9, fontWeight: "800" }, goalAmount: { color: c.foreground, fontSize: 14, marginTop: 5, fontWeight: "700", fontVariant: ["tabular-nums"] }, goalTarget: { color: c.muted, fontWeight: "500" }, track: { height: 5, borderRadius: 999, backgroundColor: c.border, overflow: "hidden", marginTop: 10 }, trackFill: { height: "100%", borderRadius: 999 }, goalMeta: { color: c.muted, fontSize: 11, marginTop: 8 },
  completedBlock: { marginTop: 26 }, completedTitle: { color: c.muted, fontSize: 11, fontWeight: "800", letterSpacing: .9 },
  empty: { backgroundColor: c.surface, borderRadius: 26, padding: 26, alignItems: "center", borderWidth: 1, borderColor: c.border }, emptyTitle: { color: c.foreground, fontFamily: Fonts.serif, fontSize: 24, marginTop: 14 }, emptyCopy: { color: c.muted, fontSize: 13, lineHeight: 19, textAlign: "center", marginTop: 8, maxWidth: 275 }, primary: { backgroundColor: c.primary, minHeight: 52, borderRadius: 16, marginTop: 21, alignSelf: "stretch", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }, primaryText: { color: "#FFFDF9", fontSize: 14, fontWeight: "800" },
  quickAdd: { position: "absolute", bottom: 14, alignSelf: "center", backgroundColor: c.primary, minHeight: 51, paddingHorizontal: 19, borderRadius: 17, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, shadowColor: "#3B2D24", shadowOffset: { width: 0, height: 7 }, shadowOpacity: .24, shadowRadius: 12, elevation: 5 }, quickAddText: { color: "#FFFDF9", fontSize: 14, fontWeight: "800" }, quickAddChip: { position: "absolute", right: 12, top: "50%", marginTop: -16, borderRadius: 11, paddingHorizontal: 11, paddingVertical: 7 }, quickAddChipText: { fontSize: 12, fontWeight: "800" }, pressed: { opacity: .86, transform: [{ scale: .98 }] },
});
