import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";

import { makeStyles } from "@/components/jar-detail.styles";
import { ActionSheet } from "@/components/action-sheet";
import { CelebrationModal } from "@/components/celebration-modal";
import { DepositSheet } from "@/components/deposit-sheet";
import { EditJarSheet } from "@/components/edit-jar-sheet";
import { JarVessel } from "@/components/jar-vessel";
import { RecurringSheet } from "@/components/recurring-sheet";
import { ScreenContainer } from "@/components/screen-container";
import { Toast } from "@/components/toast";
import { useColors } from "@/hooks/use-colors";
import { useJarAccents } from "@/hooks/use-jar-accents";
import { feedback } from "@/lib/haptics";
import {
  type Accent,
  type QuickPreset,
  nextRecurringDate,
  percent,
  quickPresets,
  sanitizeAmountInput,
  toMinor,
  type Cadence,
  useMoney,
  useSavings,
} from "@/lib/savings-store";
import { SUPPORTED_CURRENCIES, useSettings } from "@/lib/settings-store";

export default function JarDetail() {
  const colors = useColors();
  const accents = useJarAccents();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { id, action } = useLocalSearchParams<{
    id: string;
    action?: string;
  }>();
  const { jars, addEntry, archiveJar, editJar } = useSavings();
  const format = useMoney();
  const { currency } = useSettings();
  const currencySymbol =
    SUPPORTED_CURRENCIES.find((c) => c.code === currency)?.symbol ?? "$";
  const jar = jars.find((item) => item.id === id);
  const [direction, setDirection] = useState<"deposit" | "withdrawal" | null>(
    null,
  );
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [celebration, setCelebration] = useState<{
    level: number;
    progress: number;
  } | null>(null);
  const [recurringVisible, setRecurringVisible] = useState(false);
  const [recurringAmount, setRecurringAmount] = useState("");
  const [cadence, setCadence] = useState<Cadence>("weekly");
  const [editVisible, setEditVisible] = useState(false);
  const [editName, setEditName] = useState("");
  const [editTarget, setEditTarget] = useState("");
  const [coinKey, setCoinKey] = useState(0);
  const [menuVisible, setMenuVisible] = useState(false);
  // A withdrawal stays reversible for a few seconds instead of demanding a confirm dialog.
  const [undo, setUndo] = useState<{
    jarId: string;
    name: string;
    amount: number;
  } | null>(null);
  // Quick deposits derived from this jar's own state: neaten the balance, land on
  // the next milestone, follow the jar's own pace, or repeat the last deposit.
  const presets: QuickPreset[] = useMemo(
    () => (jar ? quickPresets(jar, new Date(), currency) : []),
    // jar identity is replaced whenever any deposit lands, so the suggestions refresh with it.
    [jar, currency],
  );
  // Deep-link action should auto-open the deposit sheet once per mount only,
  // not again on every re-focus of the params.
  const actionConsumed = useRef(false);
  useEffect(() => {
    if (action === "deposit" && !actionConsumed.current) {
      actionConsumed.current = true;
      setDirection("deposit");
    }
  }, [action]);
  if (!jar)
    return (
      <ScreenContainer className="items-center justify-center">
        <Text style={{ color: colors.muted }}>
          This jar is no longer available.
        </Text>
      </ScreenContainer>
    );
  const progress = percent(jar);
  const accent = accents[jar.accent as Accent] ?? accents.ocean;
  const remaining = Math.max(jar.target - jar.balance, 0);
  const amountMinor = toMinor(sanitizeAmountInput(amount));
  const withdrawPreview =
    direction === "withdrawal" && amountMinor
      ? Math.max(jar.balance - amountMinor, 0)
      : null;
  const depositPreview =
    direction === "deposit" && amountMinor ? jar.balance + amountMinor : null;
  const depositPreviewPct =
    depositPreview !== null
      ? percent({ ...jar, balance: depositPreview })
      : null;
  const applyPreset = (minor: number) => {
    feedback.tap();
    setAmount((minor / 100).toFixed(2));
    setError("");
  };

  const record = () => {
    const value = amountMinor;
    const chosen = direction ?? "deposit";
    if (!value || value <= 0) {
      feedback.error();
      return setError("Enter an amount greater than zero.");
    }
    if (chosen === "withdrawal" && value > jar.balance) {
      feedback.error();
      return setError(
        `You can withdraw up to ${format(jar.balance)} from this jar.`,
      );
    }

    const reached = addEntry(jar.id, value, chosen, note.trim() || undefined);
    if (reached) feedback.milestone();
    else if (chosen === "withdrawal") feedback.medium();
    else feedback.success();
    setAmount("");
    setNote("");
    setError("");
    if (chosen === "withdrawal")
      setUndo({ jarId: jar.id, name: jar.name, amount: value });
    else setCoinKey((key) => key + 1);
    setDirection(null);
    // Snapshot the progress at celebration time so the overlay stays truthful
    // even if the jar changes underneath it.
    if (reached)
      setCelebration({
        level: reached,
        progress: percent({ ...jar, balance: jar.balance + value }),
      });
  };
  const performUndo = () => {
    if (!undo) return;
    // Compensating entry keeps an honest audit trail; milestones already hit are never re-triggered.
    addEntry(undo.jarId, undo.amount, "deposit", "Withdrawal undone");
    feedback.success();
    setUndo(null);
  };
  const saveRecurring = () => {
    const value = toMinor(sanitizeAmountInput(recurringAmount));
    if (!value || value <= 0) return setError("Enter a recurring amount.");
    const previous = jar.recurring;
    editJar(jar.id, {
      recurring: {
        amount: value,
        cadence,
        paused: false,
        nextDate: nextRecurringDate({ previous, amount: value, cadence }),
      },
    });
    setRecurringAmount("");
    setError("");
    setRecurringVisible(false);
  };
  const toggleRecurringPause = () => {
    if (!jar.recurring) return;
    editJar(jar.id, {
      recurring: { ...jar.recurring, paused: !jar.recurring.paused },
    });
    setRecurringVisible(false);
  };
  const openEdit = () => {
    setEditName(jar.name);
    setEditTarget(String(jar.target > 0 ? jar.target / 100 : ""));
    setEditVisible(true);
  };
  const saveEdit = () => {
    const name = editName.trim();
    const target = toMinor(sanitizeAmountInput(editTarget));
    if (!name || !target || target <= 0)
      return setError("Add a name and a target greater than zero.");
    editJar(jar.id, { name, target });
    setError("");
    setEditVisible(false);
  };
  const options = () => setMenuVisible(true);
  const menuActions = [
    {
      label: "Edit jar",
      detail: "Rename it or change its target.",
      icon: "edit",
      onPress: openEdit,
    },
    {
      label: "Archive jar",
      detail: "Hide it from your active goals, keeping its history.",
      icon: "archive",
      onPress: () => {
        archiveJar(jar.id);
        router.replace("/(tabs)" as never);
      },
    },
    { label: "Cancel", onPress: () => undefined },
  ];
  const nextOccurrence =
    jar.recurring?.nextDate && !jar.recurring.paused
      ? new Date(jar.recurring.nextDate).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        })
      : null;
  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <FlatList
        data={jar.entries}
        keyExtractor={(entry) => entry.id}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <>
            <View style={styles.header}>
              <Pressable
                accessibilityLabel="Go back"
                onPress={() => router.back()}
                style={({ pressed }) => [
                  styles.circle,
                  pressed && styles.pressed,
                ]}
              >
                <MaterialIcons
                  name="arrow-back"
                  size={20}
                  color={colors.foreground}
                />
              </Pressable>
              <Text style={styles.headerName} numberOfLines={1}>
                {jar.name}
              </Text>
              <Pressable
                accessibilityLabel="Jar options"
                onPress={options}
                style={({ pressed }) => [
                  styles.circle,
                  pressed && styles.pressed,
                ]}
              >
                <MaterialIcons
                  name="more-horiz"
                  size={22}
                  color={colors.foreground}
                />
              </Pressable>
            </View>
            <View
              accessibilityLabel={`${jar.name}. ${progress}% complete. ${format(jar.balance)} saved of ${format(jar.target)}.`}
              style={[styles.hero, { backgroundColor: `${accent}12` }]}
            >
              <JarVessel
                accent={accent}
                icon={jar.icon}
                progress={progress}
                size="large"
                label={`${progress}%`}
                coinDropKey={coinKey}
              />
              <Text style={styles.heroName}>{jar.name}</Text>
              <Text style={[styles.heroProgress, { color: accent }]}>
                {progress}% complete
              </Text>
              <Text style={styles.amount}>{format(jar.balance)}</Text>
              <Text style={styles.of}>saved of {format(jar.target)}</Text>
              {jar.deadline ? (
                <View style={styles.deadline}>
                  <MaterialIcons
                    name="calendar-today"
                    size={13}
                    color={colors.muted}
                  />
                  <Text style={styles.deadlineText}>
                    Target: {jar.deadline}
                  </Text>
                </View>
              ) : null}
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${progress}%`, backgroundColor: accent },
                  ]}
                />
              </View>
              <Text style={styles.remaining}>
                {remaining > 0
                  ? `${format(remaining)} to goal`
                  : "Your goal is fully funded"}
              </Text>
            </View>
            <View style={styles.statRow}>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>REMAINING</Text>
                <Text style={styles.statValue}>{format(remaining)}</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>DEPOSITS</Text>
                <Text style={styles.statValue}>
                  {
                    jar.entries.filter((entry) => entry.direction === "deposit")
                      .length
                  }
                </Text>
              </View>
            </View>
            <View style={styles.actions}>
              <Pressable
                accessibilityLabel={`Deposit into ${jar.name}`}
                onPress={() => {
                  setError("");
                  setDirection("deposit");
                }}
                style={({ pressed }) => [
                  styles.deposit,
                  pressed && styles.pressed,
                ]}
              >
                <MaterialIcons name="add" size={20} color="#FFFDF9" />
                <Text style={styles.depositText}>Deposit</Text>
              </Pressable>
              <Pressable
                accessibilityLabel={`Withdraw from ${jar.name}`}
                onPress={() => {
                  setError("");
                  setDirection("withdrawal");
                }}
                style={({ pressed }) => [
                  styles.withdraw,
                  pressed && styles.pressed,
                ]}
              >
                <MaterialIcons
                  name="remove"
                  size={20}
                  color={colors.foreground}
                />
                <Text style={styles.withdrawText}>Withdraw</Text>
              </Pressable>
            </View>
            {jar.kind === "habit" && jar.streak ? (
              <View style={[styles.streak, { backgroundColor: `${accent}14` }]}>
                <MaterialIcons
                  name="local-fire-department"
                  size={20}
                  color={accent}
                />
                <Text style={styles.streakText}>
                  {jar.streak}-day saving streak
                </Text>
                <Text style={styles.streakNote}>Small deposits count.</Text>
              </View>
            ) : null}
            {jar.recurring ? (
              <View style={styles.recurringCard}>
                <View
                  style={[
                    styles.recurringIcon,
                    { backgroundColor: `${accent}20` },
                  ]}
                >
                  <MaterialIcons name="repeat" size={19} color={accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.recurringLabel}>SCHEDULED SAVING</Text>
                  <Text style={styles.recurringValue}>
                    {format(jar.recurring.amount)} every {jar.recurring.cadence}
                  </Text>
                  <Text style={styles.recurringNote}>
                    {jar.recurring.paused
                      ? "Currently paused"
                      : nextOccurrence
                        ? `Next deposit: ${nextOccurrence}`
                        : "A gentle rhythm for this jar"}
                  </Text>
                </View>
                <Pressable
                  accessibilityLabel="Edit recurring deposit"
                  onPress={() => {
                    setRecurringAmount("");
                    setRecurringVisible(true);
                  }}
                >
                  <Text style={[styles.editText, { color: accent }]}>Edit</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                onPress={() => setRecurringVisible(true)}
                style={({ pressed }) => [
                  styles.buildHabit,
                  pressed && styles.pressed,
                ]}
              >
                <View
                  style={[
                    styles.recurringIcon,
                    { backgroundColor: `${accent}18` },
                  ]}
                >
                  <MaterialIcons name="repeat" size={19} color={accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.buildTitle}>Build the habit</Text>
                  <Text style={styles.buildCopy}>
                    Set up a recurring deposit.
                  </Text>
                </View>
                <MaterialIcons
                  name="chevron-right"
                  size={22}
                  color={colors.muted}
                />
              </Pressable>
            )}
            <View style={styles.activityHeader}>
              <View>
                <Text style={styles.activityTitle}>Activity</Text>
                <Text style={styles.activitySub}>
                  Every contribution tells the story.
                </Text>
              </View>
            </View>
          </>
        }
        renderItem={({ item }) => (
          <View style={styles.entry}>
            <View
              style={[
                styles.entryIcon,
                {
                  backgroundColor:
                    item.direction === "deposit"
                      ? `${accent}1D`
                      : `${colors.error}17`,
                },
              ]}
            >
              <MaterialIcons
                name={item.direction === "deposit" ? "south" : "north"}
                size={18}
                color={item.direction === "deposit" ? accent : colors.error}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.entryTitle}>
                {item.direction === "deposit"
                  ? item.source === "recurring"
                    ? "Scheduled deposit"
                    : "Money added"
                  : "Money withdrawn"}
              </Text>
              <Text style={styles.entryMeta}>
                {new Date(item.at).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
                {item.note ? ` · ${item.note}` : ""}
              </Text>
            </View>
            <Text
              accessibilityLabel={`${item.direction === "deposit" ? "Added" : "Withdrew"} ${format(item.amount)}`}
              style={[
                styles.entryAmount,
                { color: item.direction === "deposit" ? accent : colors.error },
              ]}
            >
              {item.direction === "deposit" ? "+" : "−"}
              {format(item.amount)}
            </Text>
          </View>
        )}
        ItemSeparatorComponent={() => <View style={styles.divider} />}
        ListEmptyComponent={
          <Text style={styles.empty}>
            Your first contribution will appear here.
          </Text>
        }
      />
      <DepositSheet
        direction={direction}
        jarName={jar.name}
        jarBalance={jar.balance}
        currencySymbol={currencySymbol}
        amount={amount}
        note={note}
        error={error}
        presets={presets}
        accent={accent}
        withdrawPreview={withdrawPreview}
        depositPreview={depositPreview}
        depositPreviewPct={depositPreviewPct}
        format={format}
        onAmountChange={(raw) => {
          setAmount(sanitizeAmountInput(raw));
          setError("");
        }}
        onNoteChange={setNote}
        onApplyPreset={applyPreset}
        onRecord={record}
        onDismiss={() => {
          setDirection(null);
          setError("");
        }}
      />
      <RecurringSheet
        visible={recurringVisible}
        currentAmountMinor={jar.recurring?.amount}
        currentPaused={jar.recurring?.paused ?? false}
        amount={recurringAmount}
        cadence={cadence}
        error={error}
        currencySymbol={currencySymbol}
        accent={accent}
        onAmountChange={(raw) => {
          setRecurringAmount(sanitizeAmountInput(raw));
          setError("");
        }}
        onCadenceChange={setCadence}
        onSave={saveRecurring}
        onTogglePause={toggleRecurringPause}
        onDismiss={() => {
          setRecurringVisible(false);
          setError("");
        }}
      />
      <EditJarSheet
        visible={editVisible}
        name={editName}
        target={editTarget}
        kind={jar.kind}
        error={error}
        currencySymbol={currencySymbol}
        accent={accent}
        onNameChange={setEditName}
        onTargetChange={(raw) => {
          setEditTarget(sanitizeAmountInput(raw));
          setError("");
        }}
        onKindChange={(kind) => editJar(jar.id, { kind })}
        onSave={saveEdit}
        onDismiss={() => {
          setEditVisible(false);
          setError("");
        }}
      />
      <ActionSheet
        visible={menuVisible}
        title="Jar options"
        message="Keep its history while removing it from your active goals."
        actions={menuActions}
        onDismiss={() => setMenuVisible(false)}
      />
      <CelebrationModal
        visible={celebration !== null}
        level={celebration?.level ?? null}
        progress={celebration?.progress ?? progress}
        accent={accent}
        icon={jar.icon}
        jarName={jar.name}
        onDismiss={() => setCelebration(null)}
      />
      <Toast
        visible={undo !== null}
        message={`${format(undo?.amount ?? 0)} withdrawn from ${undo?.name ?? "your jar"}`}
        actionLabel="Undo"
        onAction={performUndo}
        onDismiss={() => setUndo(null)}
      />
    </ScreenContainer>
  );
}
