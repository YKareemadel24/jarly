import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router } from "expo-router";
import { useMemo } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { JarVessel } from "@/components/jar-vessel";
import { ScreenContainer } from "@/components/screen-container";
import { type ThemeColorPalette } from "@/constants/theme";
import { useColors } from "@/hooks/use-colors";
import { useJarAccents } from "@/hooks/use-jar-accents";
import { deadlineCountdown, percent, type Accent, type Jar, useMoney, useSavings } from "@/lib/savings-store";
import { useSettings } from "@/lib/settings-store";
import { nextReminder } from "@/lib/reminders";

const WEEK_MS = 7 * 86_400_000;

/** Deadlines within two weeks read as urgent; meaning stays textual either way. */
function isUrgentDeadline(text: string | undefined): boolean {
  if (!text) return false;
  return /^(Due today|Past deadline|([1-9]|1[0-4]) days left)$/.test(text);
}

/** Smallest next-milestone money gap across jars, for the nudge row. */
function nextMilestoneNudge(jars: Jar[]): { jar: Jar; level: number; gapMinor: number } | undefined {
  let best: { jar: Jar; level: number; gapMinor: number } | undefined;
  for (const jar of jars) {
    if (jar.target <= 0) continue;
    const ratio = (jar.balance / jar.target) * 100;
    const level = [25, 50, 75, 100].find((candidate) => ratio < candidate);
    if (!level) continue;
    const gapMinor = Math.round((jar.target * level) / 100) - jar.balance;
    if (gapMinor <= 0) continue;
    if (!best || gapMinor < best.gapMinor) best = { jar, level, gapMinor };
  }
  return best;
}

function GoalCard({ jar, styles, colors, accents, format }: { jar: Jar; styles: ReturnType<typeof makeStyles>; colors: ThemeColorPalette; accents: Record<Accent, string>; format: (minor: number) => string }) {
  const progress = percent(jar);
  const accent = accents[jar.accent];
  const countdown = deadlineCountdown(jar.deadline);
  const urgent = isUrgentDeadline(countdown);
  const meta = jar.kind === "habit" && jar.streak
    ? `${jar.streak}-day streak`
    : countdown ?? "A goal in progress";
  const metaIcon = jar.kind === "habit" && jar.streak ? "local-fire-department" : countdown ? "calendar-today" : "flag";
  return (
    <Pressable
      accessibilityLabel={`${jar.name}. ${progress}% complete. ${format(jar.balance)} saved of ${format(jar.target)}.`}
      accessibilityHint="Double-tap to open. Use Add for a quick deposit."
      onPress={() => router.push(`/jar/${jar.id}` as never)}
      onLongPress={() => router.push(`/jar/${jar.id}?action=deposit` as never)}
      delayLongPress={320}
      style={({ pressed }) => [styles.goalCard, pressed && styles.pressed]}
    >
      <View style={styles.goalVisual}><JarVessel accent={accent} icon={jar.icon} progress={progress} size="small" label={`${progress}%`} /></View>
      <View style={styles.goalCopy}>
        <View style={styles.goalHeading}><Text numberOfLines={1} style={styles.goalName}>{jar.name}</Text><View style={[styles.pill, { backgroundColor: `${accent}1F` }]}><Text style={[styles.pillText, { color: accent }]}>{progress}%</Text></View></View>
        <Text style={styles.goalAmount}>{format(jar.balance)} <Text style={styles.goalTarget}>of {format(jar.target)}</Text></Text>
        <View style={styles.track}><View style={[styles.trackFill, { width: `${progress}%`, backgroundColor: accent }]} /></View>
        <View style={styles.goalMeta}>
          <MaterialIcons name={metaIcon as never} size={13} color={urgent ? colors.warning : colors.muted} />
          <Text style={[styles.goalMetaText, urgent && { color: colors.warning, fontWeight: "700" }]}>{meta}</Text>
        </View>
      </View>
      <Pressable
        accessibilityLabel={`Add money to ${jar.name}`}
        accessibilityHint="Opens the deposit sheet."
        onPress={() => router.push(`/jar/${jar.id}?action=deposit` as never)}
        style={({ pressed }) => [styles.quickAddChip, { backgroundColor: `${accent}1F` }, pressed && styles.pressed]}
      >
        <Text style={[styles.quickAddChipText, { color: accent }]}>+ Add</Text>
      </Pressable>
    </Pressable>
  );
}

export default function HomeScreen() {
  const colors = useColors();
  const accents = useJarAccents();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { jars, ready, total } = useSavings();
  const { remindersEnabled, currency } = useSettings();
  const format = useMoney();
  const active = useMemo(() => jars.filter((jar) => !jar.archived), [jars]);
  const inProgress = useMemo(() => active.filter((jar) => percent(jar) < 100), [active]);
  const completed = useMemo(() => active.filter((jar) => percent(jar) >= 100), [active]);
  const featured = inProgress[0] ?? active[0];
  const reminder = useMemo(() => (remindersEnabled ? nextReminder(active, new Date(), currency) : undefined), [remindersEnabled, active, currency]);

  const weeklyDelta = useMemo(() => {
    const since = Date.now() - WEEK_MS;
    return active.reduce(
      (sum, jar) => sum + jar.entries.reduce(
        (subtotal, entry) => entry.direction === "deposit" && new Date(entry.at).getTime() >= since ? subtotal + entry.amount : subtotal,
        0,
      ),
      0,
    );
  }, [active]);

  const nudge = useMemo(() => nextMilestoneNudge(active), [active]);

  if (!ready) return <ScreenContainer className="items-center justify-center"><ActivityIndicator color={colors.primary} /></ScreenContainer>;

  const startDeposit = () => featured ? router.push(`/jar/${featured.id}?action=deposit` as never) : router.push("/jar/new" as never);
  const quickAddLabel = featured ? `Add money to ${featured.name}` : "Create your first jar";
  return (
    <ScreenContainer>
      <FlatList
        data={inProgress}
        keyExtractor={(jar) => jar.id}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={<>
          <View style={styles.header}><View><Text style={styles.kicker}>SAVING JAR</Text><Text style={styles.greeting}>Give your goals{"\n"}somewhere to grow.</Text></View><Pressable accessibilityLabel="Open profile" onPress={() => router.push("/(tabs)/profile" as never)} style={({ pressed }) => [styles.profileButton, pressed && styles.pressed]}><MaterialIcons name="tune" size={20} color={colors.foreground} /></Pressable></View>
          <View style={styles.balanceCard}><View style={styles.balanceTop}><Text style={styles.balanceLabel}>{"YOU'VE SAVED"}</Text><View style={styles.balanceMark}><MaterialIcons name="savings" size={18} color="#FFFDF9" /></View></View><Text style={styles.balanceValue}>{format(total)}</Text><View style={styles.balanceBottom}><Text style={styles.balanceNote}>{active.length ? `Across ${active.length} active ${active.length === 1 ? "jar" : "jars"}` : "A home for every goal that matters"}</Text>{active.length ?             <Text style={styles.balanceMomentum}>{weeklyDelta > 0 ? `+${format(weeklyDelta)} this week` : "Keep going"}</Text> : null}</View></View>
          {nudge ? (
            <Pressable accessibilityLabel={`Add money to ${nudge.jar.name}: ${format(nudge.gapMinor)} from ${nudge.level} percent`} onPress={() => router.push(`/jar/${nudge.jar.id}?action=deposit` as never)} style={({ pressed }) => [styles.nudge, pressed && styles.pressed]}>
              <View style={[styles.nudgeIcon, { backgroundColor: `${accents[nudge.jar.accent]}20` }]}><MaterialIcons name="flag" size={17} color={accents[nudge.jar.accent]} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.nudgeTitle} numberOfLines={1}>{nudge.jar.name} is close</Text>
                <Text style={styles.nudgeCopy}>{format(nudge.gapMinor)} away from {nudge.level}% funded.</Text>
              </View>
              <MaterialIcons name="add-circle" size={21} color={accents[nudge.jar.accent]} />
            </Pressable>
          ) : null}
          {reminder ? (
            <Pressable accessibilityLabel={`Reminder: ${reminder.title}. ${reminder.detail}`} onPress={() => router.push(`/jar/${reminder.jar.id}?action=deposit` as never)} style={({ pressed }) => [styles.reminder, pressed && styles.pressed]}>
              <View style={[styles.reminderIcon, { backgroundColor: `${accents[reminder.jar.accent]}20` }]}><MaterialIcons name="notifications-active" size={17} color={accents[reminder.jar.accent]} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.reminderTitle} numberOfLines={1}>{reminder.title}</Text>
                <Text style={styles.reminderCopy}>{reminder.detail}</Text>
              </View>
              <MaterialIcons name="chevron-right" size={20} color={accents[reminder.jar.accent]} />
            </Pressable>
          ) : null}
          {featured ? <Pressable onPress={() => router.push(`/jar/${featured.id}` as never)} style={({ pressed }) => [styles.featured, pressed && styles.pressed]}><View style={styles.featuredCopy}><Text style={styles.featuredLabel}>NEXT UP</Text><Text style={styles.featuredName} numberOfLines={1}>{featured.name}</Text><Text style={styles.featuredText}>{format(Math.max(featured.target - featured.balance, 0))} to goal</Text><View style={[styles.featuredAction, { backgroundColor: `${accents[featured.accent]}24` }]}><Text style={[styles.featuredActionText, { color: accents[featured.accent] }]}>View jar</Text><MaterialIcons name="arrow-forward" size={15} color={accents[featured.accent]} /></View></View><JarVessel accent={accents[featured.accent]} icon={featured.icon} progress={percent(featured)} size="medium" /></Pressable> : null}
          <View style={styles.sectionHeader}><View><Text style={styles.sectionTitle}>{inProgress.length || !active.length ? "Your jars" : "All jars complete"}</Text><Text style={styles.sectionSub}>{inProgress.length || !active.length ? "Progress you can see and feel." : "Celebrate it — then dream up another one."}</Text></View><Pressable onPress={() => router.push("/jar/new" as never)} style={({ pressed }) => [styles.newGoal, pressed && styles.pressed]}><MaterialIcons name="add" size={18} color="#FFFDF9" /></Pressable></View>
        </>}
        renderItem={({ item }) => <GoalCard jar={item} styles={styles} colors={colors} accents={accents} format={format} />}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        ListFooterComponent={completed.length ? (
          <View style={styles.completedBlock}>
            <View style={styles.completedHeader}>
              <MaterialIcons name="verified" size={15} color={colors.success} />
              <Text style={styles.completedTitle}>Completed</Text>
              <Text style={styles.completedCount}>{completed.length}</Text>
            </View>
            {completed.map((jar) => <GoalCard key={jar.id} jar={jar} styles={styles} colors={colors} accents={accents} format={format} />)}
          </View>
        ) : null}
        ListEmptyComponent={<View style={styles.empty}><JarVessel accent={accents.amber} icon="star" progress={0} size="medium" /><Text style={styles.emptyTitle}>Make saving feel real.</Text><Text style={styles.emptyCopy}>Create a jar for what matters, then let each small contribution show up.</Text><Pressable onPress={() => router.push("/jar/new" as never)} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}><Text style={styles.primaryText}>Create your first jar</Text><MaterialIcons name="arrow-forward" size={18} color="#FFFDF9" /></Pressable></View>}
      />{active.length ? <Pressable accessibilityLabel={quickAddLabel} onPress={startDeposit} style={({ pressed }) => [styles.quickAdd, pressed && styles.pressed]}><MaterialIcons name="add" size={23} color="#FFFDF9" /><Text style={styles.quickAddText}>Add money</Text></Pressable> : null}
    </ScreenContainer>
  );
}

const makeStyles = (c: ThemeColorPalette) => StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 104 }, header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingTop: 4 }, kicker: { color: c.muted, fontSize: 10, letterSpacing: 1.5, fontWeight: "800" }, greeting: { color: c.foreground, fontFamily: "Georgia", fontSize: 29, lineHeight: 34, marginTop: 8 }, profileButton: { width: 43, height: 43, borderRadius: 16, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center" },
  balanceCard: { backgroundColor: "#3B2D24", padding: 22, borderRadius: 27, marginTop: 23, shadowColor: "#3B2D24", shadowOpacity: .22, shadowOffset: { width: 0, height: 12 }, shadowRadius: 18, elevation: 5 }, balanceTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, balanceLabel: { color: "#E8D9C8", fontSize: 10, letterSpacing: 1.15, fontWeight: "800" }, balanceMark: { width: 34, height: 34, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,253,249,.17)" }, balanceValue: { color: "#FFFDF9", fontSize: 37, lineHeight: 46, marginTop: 8, fontFamily: "Georgia", fontWeight: "700", fontVariant: ["tabular-nums"] }, balanceBottom: { marginTop: 15, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(255,253,249,.22)", flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, balanceNote: { color: "#E8D9C8", fontSize: 13 }, balanceMomentum: { color: "#FFFDF9", fontSize: 12, fontWeight: "800", fontVariant: ["tabular-nums"] },
  nudge: { backgroundColor: c.surface, borderRadius: 18, borderWidth: 1, borderColor: c.border, marginTop: 13, paddingVertical: 11, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 10 }, nudgeIcon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" }, nudgeTitle: { color: c.foreground, fontSize: 13, fontWeight: "800" }, nudgeCopy: { color: c.muted, fontSize: 11, marginTop: 2 },
  reminder: { backgroundColor: c.surface, borderRadius: 18, borderWidth: 1, borderColor: `${c.primary}55`, marginTop: 13, paddingVertical: 11, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 10 }, reminderIcon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" }, reminderTitle: { color: c.foreground, fontSize: 13, fontWeight: "800" }, reminderCopy: { color: c.muted, fontSize: 11, marginTop: 2 },
  featured: { backgroundColor: c.surface, borderRadius: 25, marginTop: 15, padding: 17, borderWidth: 1, borderColor: c.border, flexDirection: "row", overflow: "hidden", minHeight: 156, alignItems: "center" }, featuredCopy: { flex: 1, alignSelf: "stretch", justifyContent: "center", zIndex: 2 }, featuredLabel: { color: c.muted, fontSize: 10, letterSpacing: 1.1, fontWeight: "800" }, featuredName: { color: c.foreground, fontFamily: "Georgia", fontSize: 21, marginTop: 5 }, featuredText: { color: c.muted, fontSize: 13, marginTop: 5, fontVariant: ["tabular-nums"] }, featuredAction: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 5, borderRadius: 9, paddingHorizontal: 9, paddingVertical: 6, marginTop: 14 }, featuredActionText: { fontSize: 12, fontWeight: "800" },
  sectionHeader: { marginTop: 28, marginBottom: 13, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }, sectionTitle: { color: c.foreground, fontFamily: "Georgia", fontSize: 22 }, sectionSub: { color: c.muted, fontSize: 12, marginTop: 4 }, newGoal: { width: 37, height: 37, borderRadius: 13, backgroundColor: c.primary, alignItems: "center", justifyContent: "center" },
  goalCard: { minHeight: 114, backgroundColor: c.surface, borderRadius: 22, borderColor: c.border, borderWidth: 1, padding: 12, flexDirection: "row", alignItems: "center", gap: 10 }, goalVisual: { width: 77, alignItems: "center", justifyContent: "center" }, goalCopy: { flex: 1, alignSelf: "stretch", justifyContent: "center" }, goalHeading: { flexDirection: "row", alignItems: "center", gap: 7 }, goalName: { color: c.foreground, flex: 1, fontSize: 15, fontWeight: "800" }, pill: { borderRadius: 999, paddingHorizontal: 7, paddingVertical: 4 }, pillText: { fontSize: 10, fontWeight: "800" }, goalAmount: { color: c.foreground, fontSize: 14, marginTop: 5, fontWeight: "700", fontVariant: ["tabular-nums"] }, goalTarget: { color: c.muted, fontWeight: "500" }, track: { height: 5, borderRadius: 999, backgroundColor: c.border, overflow: "hidden", marginTop: 10 }, trackFill: { height: "100%", borderRadius: 999 }, goalMeta: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8 }, goalMetaText: { color: c.muted, fontSize: 11 },
  completedBlock: { marginTop: 26 }, completedHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 }, completedTitle: { color: c.muted, fontSize: 11, fontWeight: "800", letterSpacing: .9 }, completedCount: { color: c.muted, fontSize: 11, fontWeight: "800", backgroundColor: c.border, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 1, overflow: "hidden" },
  empty: { backgroundColor: c.surface, borderRadius: 26, padding: 26, alignItems: "center", borderWidth: 1, borderColor: c.border }, emptyTitle: { color: c.foreground, fontFamily: "Georgia", fontSize: 24, marginTop: 14 }, emptyCopy: { color: c.muted, fontSize: 13, lineHeight: 19, textAlign: "center", marginTop: 8, maxWidth: 275 }, primary: { backgroundColor: c.primary, minHeight: 52, borderRadius: 16, marginTop: 21, alignSelf: "stretch", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }, primaryText: { color: "#FFFDF9", fontSize: 14, fontWeight: "800" }, quickAdd: { position: "absolute", bottom: 14, alignSelf: "center", backgroundColor: "#3B2D24", minHeight: 51, paddingHorizontal: 19, borderRadius: 17, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, shadowColor: "#3B2D24", shadowOffset: { width: 0, height: 7 }, shadowOpacity: .24, shadowRadius: 12, elevation: 5 }, quickAddText: { color: "#FFFDF9", fontSize: 14, fontWeight: "800" }, quickAddChip: { borderRadius: 11, paddingHorizontal: 11, paddingVertical: 7, alignSelf: "center" }, quickAddChipText: { fontSize: 12, fontWeight: "800" }, pressed: { opacity: .86, transform: [{ scale: .98 }] },
});
