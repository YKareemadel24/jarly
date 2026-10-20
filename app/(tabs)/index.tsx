import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  View,
} from "react-native";
import { makeStyles } from "@/components/home.styles";
import { JarVessel } from "@/components/jar-vessel";
import { ScreenContainer } from "@/components/screen-container";
import { type ThemeColorPalette } from "@/constants/theme";
import { useColors } from "@/hooks/use-colors";
import { useJarAccents } from "@/hooks/use-jar-accents";
import {
  activeJars,
  deadlineCountdown,
  isUrgentDeadline,
  percent,
  type Accent,
  type Jar,
  useMoney,
  useSavings,
} from "@/lib/savings-store";
import { fromMinor, weeklyDelta } from "@/lib/savings-core";
import { useSettings } from "@/lib/settings-store";
import { jarReminders } from "@/lib/reminders";

function GoalCard({
  jar,
  styles,
  colors,
  accents,
  format,
}: {
  jar: Jar;
  styles: ReturnType<typeof makeStyles>;
  colors: ThemeColorPalette;
  accents: Record<Accent, string>;
  format: (minor: number) => string;
}) {
  const progress = percent(jar);
  const accent = accents[jar.accent];
  const countdown = deadlineCountdown(jar.deadline);
  const urgent = isUrgentDeadline(countdown);
  const meta =
    jar.kind === "habit" && jar.streak
      ? `${jar.streak}-day streak`
      : (countdown ?? "A goal in progress");
  const metaIcon =
    jar.kind === "habit" && jar.streak
      ? "local-fire-department"
      : countdown
        ? "calendar-today"
        : "flag";
  return (
    <View style={styles.goalCard}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${jar.name}. ${progress}% complete. ${format(jar.balance)} saved of ${format(jar.target)}.`}
        accessibilityHint="Double-tap to open. Use Add for a quick deposit."
        onPress={() => router.push(`/jar/${jar.id}` as never)}
        onLongPress={() =>
          router.push(`/jar/${jar.id}?action=deposit` as never)
        }
        delayLongPress={320}
        style={({ pressed }) => [styles.goalMain, pressed && styles.pressed]}
      >
        <View
          style={styles.goalVisual}
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
        >
          <JarVessel
            accent={accent}
            icon={jar.icon}
            progress={progress}
            size="small"
          />
        </View>
        <View style={styles.goalCopy}>
          <Text style={styles.goalName}>{jar.name}</Text>
          <Text style={styles.goalAmount}>{format(jar.balance)}</Text>
          <Text style={styles.goalTarget}>of {format(jar.target)} goal</Text>
          <View style={styles.goalProgress}>
            <View style={styles.track}>
              <View
                style={[
                  styles.trackFill,
                  { width: `${progress}%`, backgroundColor: accent },
                ]}
              />
            </View>
            <Text style={styles.goalPercent}>{progress}%</Text>
          </View>
        </View>
      </Pressable>
      <View style={styles.goalFooter}>
        <View style={styles.goalMeta}>
          <MaterialIcons
            name={metaIcon as never}
            size={16}
            color={urgent ? colors.warning : colors.muted}
          />
          <Text
            style={[
              styles.goalMetaText,
              urgent && { color: colors.foreground, fontWeight: "700" },
            ]}
          >
            {meta}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Add money to ${jar.name}`}
          accessibilityHint="Opens the deposit sheet."
          onPress={() => router.push(`/jar/${jar.id}?action=deposit` as never)}
          style={({ pressed }) => [
            styles.quickAddChip,
            { backgroundColor: `${accent}1F` },
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.quickAddChipText}>+ Add</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function HomeScreen() {
  const colors = useColors();
  const accents = useJarAccents();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { jars, ready, total } = useSavings();
  const { currency } = useSettings();
  const format = useMoney();
  const [remindersExpanded, setRemindersExpanded] = useState(false);
  const active = useMemo(() => activeJars(jars), [jars]);
  const inProgress = useMemo(
    () => active.filter((jar) => percent(jar) < 100),
    [active],
  );
  const completed = useMemo(
    () => active.filter((jar) => percent(jar) >= 100),
    [active],
  );
  const reminders = useMemo(
    () => jarReminders(active, new Date(), currency),
    [active, currency],
  );

  const weeklyDeltaValue = useMemo(() => weeklyDelta(active), [active]);

  if (!ready)
    return (
      <ScreenContainer className="items-center justify-center">
        <ActivityIndicator color={colors.primary} />
      </ScreenContainer>
    );

  return (
    <ScreenContainer>
      <FlatList
        data={inProgress}
        keyExtractor={(jar) => jar.id}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <>
            <View style={styles.header}>
              <View style={styles.headerCopy}>
                <Text style={styles.kicker}>SAVING JAR</Text>
                <Text style={styles.greeting}>
                  Give your goals{"\n"}somewhere to grow.
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open profile"
                onPress={() => router.push("/(tabs)/profile" as never)}
                style={({ pressed }) => [
                  styles.profileButton,
                  pressed && styles.pressed,
                ]}
              >
                <MaterialIcons
                  name="tune"
                  size={20}
                  color={colors.foreground}
                />
              </Pressable>
            </View>
            <View style={styles.balanceCard}>
              <View style={styles.balanceTop}>
                <Text
                  style={styles.balanceLabel}
                >{`YOU'VE SAVED · ${currency}`}</Text>
                <View style={styles.balanceMark}>
                  <MaterialIcons name="savings" size={18} color="#FFFDF9" />
                </View>
              </View>
              <Text
                style={styles.balanceValue}
                accessibilityLabel={`${format(total)} saved`}
              >
                {new Intl.NumberFormat(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                }).format(fromMinor(total))}
              </Text>
              <View style={styles.balanceBottom}>
                <Text style={styles.balanceNote}>
                  {active.length
                    ? `Across ${active.length} active ${active.length === 1 ? "jar" : "jars"}`
                    : "A home for every goal that matters"}
                </Text>
                {active.length ? (
                  <Text style={styles.balanceMomentum}>
                    {weeklyDeltaValue > 0
                      ? `+${format(weeklyDeltaValue)} this week`
                      : "Keep going"}
                  </Text>
                ) : null}
              </View>
            </View>
            {reminders.length ? (
              <View style={styles.remindersHeader}>
                <Text style={styles.remindersTitle}>Saving reminders</Text>
                <Text style={styles.remindersCount}>{reminders.length}</Text>
              </View>
            ) : null}
            {(remindersExpanded ? reminders : reminders.slice(0, 2)).map(
              (reminder) => (
                <Pressable
                  key={reminder.jar.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Add money to ${reminder.title}. ${reminder.detail}`}
                  accessibilityHint="Opens this jar's deposit sheet."
                  onPress={() =>
                    router.push(
                      `/jar/${reminder.jar.id}?action=deposit` as never,
                    )
                  }
                  style={({ pressed }) => [
                    styles.reminder,
                    pressed && styles.pressed,
                  ]}
                >
                  <View
                    style={[
                      styles.reminderIcon,
                      { backgroundColor: `${accents[reminder.jar.accent]}20` },
                    ]}
                  >
                    <MaterialIcons
                      name="notifications-active"
                      size={17}
                      color={accents[reminder.jar.accent]}
                    />
                  </View>
                  <View style={styles.reminderContent}>
                    <View style={styles.reminderHeading}>
                      <Text style={styles.reminderTitle}>{reminder.title}</Text>
                      <View style={styles.reminderAction}>
                        <Text style={styles.quickAddChipText}>+ Add</Text>
                      </View>
                    </View>
                    <Text style={styles.reminderCopy}>{reminder.detail}</Text>
                  </View>
                </Pressable>
              ),
            )}
            {reminders.length > 2 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: remindersExpanded }}
                onPress={() => setRemindersExpanded((expanded) => !expanded)}
                style={({ pressed }) => [
                  styles.remindersToggle,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.remindersToggleText}>
                  {remindersExpanded
                    ? "Show fewer reminders"
                    : `View all ${reminders.length} reminders`}
                </Text>
                <MaterialIcons
                  name={remindersExpanded ? "expand-less" : "expand-more"}
                  size={20}
                  color={colors.foreground}
                />
              </Pressable>
            ) : null}
            <View style={styles.sectionHeader}>
              <View style={styles.sectionCopy}>
                <Text style={styles.sectionTitle}>
                  {inProgress.length || !active.length
                    ? "Your jars"
                    : "All jars complete"}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Create a new jar"
                onPress={() => router.push("/jar/new" as never)}
                style={({ pressed }) => [
                  styles.newGoal,
                  pressed && styles.pressed,
                ]}
              >
                <MaterialIcons name="add" size={18} color={colors.background} />
                <Text style={styles.newGoalText}>New jar</Text>
              </Pressable>
            </View>
          </>
        }
        renderItem={({ item }) => (
          <GoalCard
            jar={item}
            styles={styles}
            colors={colors}
            accents={accents}
            format={format}
          />
        )}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        ListFooterComponent={
          completed.length ? (
            <View style={styles.completedBlock}>
              <View style={styles.completedHeader}>
                <MaterialIcons
                  name="verified"
                  size={15}
                  color={colors.success}
                />
                <Text style={styles.completedTitle}>Completed</Text>
                <Text style={styles.completedCount}>{completed.length}</Text>
              </View>
              {completed.map((jar) => (
                <GoalCard
                  key={jar.id}
                  jar={jar}
                  styles={styles}
                  colors={colors}
                  accents={accents}
                  format={format}
                />
              ))}
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <JarVessel
              accent={accents.amber}
              icon="star"
              progress={0}
              size="medium"
            />
            <Text style={styles.emptyTitle}>Make saving feel real.</Text>
            <Text style={styles.emptyCopy}>
              Create a jar for what matters, then let each small contribution
              show up.
            </Text>
            <Pressable
              onPress={() => router.push("/jar/new" as never)}
              style={({ pressed }) => [
                styles.primary,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.primaryText}>Create your first jar</Text>
              <MaterialIcons name="arrow-forward" size={18} color="#FFFDF9" />
            </Pressable>
          </View>
        }
      />
    </ScreenContainer>
  );
}
