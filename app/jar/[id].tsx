import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";

import { makeStyles } from "@/app/jar/jar-detail.styles";
import { ActionSheet } from "@/components/action-sheet";
import { CelebrationModal } from "@/components/celebration-modal";
import { DepositSheet } from "@/components/deposit-sheet";
import { EditJarSheet } from "@/components/edit-jar-sheet";
import { InviteSheet } from "@/components/invite-sheet";
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
import { isSharedJar } from "@/lib/shared-jars";
import { SUPPORTED_CURRENCIES, useSettings } from "@/lib/settings-store";

export default function JarDetail() {
  const colors = useColors();
  const accents = useJarAccents();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { id, action } = useLocalSearchParams<{
    id: string;
    action?: string;
  }>();
  const {
    jars,
    addEntry,
    archiveJar,
    editJar,
    contributeShared,
    deleteShared,
    leaveShared,
    remoteIdOf,
    shareExisting,
  } = useSavings();
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
  // Shared contributions are a network round-trip, so the sheet needs a busy state.
  const [busy, setBusy] = useState(false);
  // Sharing mints a link on demand; the sheet owns that whole flow.
  const [inviteVisible, setInviteVisible] = useState(false);
  // Confirming turns this personal jar into a shared one, which moves its
  // history to the server: worth one explicit confirmation before it happens.
  const [shareConfirm, setShareConfirm] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  // Leaving or deleting a shared jar moves membership on the server, so each
  // gets one explicit confirmation and a place to surface a failure.
  const [sharedAction, setSharedAction] = useState<"leave" | "delete" | null>(
    null,
  );
  const [sharedActionError, setSharedActionError] = useState<string | null>(
    null,
  );
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
  // A shared jar's balance is owned by the server: contributions go through the
  // API and local edit/archive affordances are hidden rather than silently no-op.
  const shared = isSharedJar(jar);
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

  const record = async () => {
    // A shared contribution is in flight; ignore the second tap.
    if (busy) return;
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

    // Shared jars are server-authoritative: the contribution is written through
    // the API and the jar is re-read, so a member who is not the owner cannot
    // drift their device out of sync with everyone else's.
    if (shared) {
      setBusy(true);
      try {
        await contributeShared(jar.id, value, chosen, note.trim() || undefined);
      } catch (problem) {
        feedback.error();
        setBusy(false);
        return setError(
          problem instanceof Error
            ? problem.message
            : "Could not save that contribution.",
        );
      }
      setBusy(false);
      feedback.success();
      setAmount("");
      setNote("");
      setError("");
      if (chosen === "withdrawal")
        setUndo({ jarId: jar.id, name: jar.name, amount: value });
      else setCoinKey((key) => key + 1);
      setDirection(null);
      return;
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
  const performUndo = async () => {
    if (!undo) return;
    // Compensating entry keeps an honest audit trail; milestones already hit are never re-triggered.
    // A shared jar has to write that compensation through the server, or the undo
    // would appear to succeed while leaving every other member's balance short.
    if (remoteIdOf(undo.jarId) !== undefined) {
      try {
        await contributeShared(
          undo.jarId,
          undo.amount,
          "deposit",
          "Withdrawal undone",
        );
      } catch {
        feedback.error();
        return;
      }
    } else {
      addEntry(undo.jarId, undo.amount, "deposit", "Withdrawal undone");
    }
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
  const openInvite = () => setInviteVisible(true);
  // Shared jars are managed by the server, so offer no local edit or archive
  // rather than buttons that would quietly do nothing. What the server does
  // own — inviting, leaving and deleting — is offered here instead.
  const options = () => setMenuVisible(true);
  const menuActions = shared
    ? [
        ...(jar.members?.some((member) => member.you && member.isOwner)
          ? [
              {
                label: "Invite people",
                detail: "Send a link that lets someone else join this jar.",
                icon: "person-add",
                onPress: openInvite,
              },
              {
                label: "Delete jar",
                detail: "Removes its balance and every entry for all members.",
                icon: "delete-outline",
                destructive: true,
                onPress: () => setSharedAction("delete"),
              },
            ]
          : [
              {
                label: "Leave jar",
                detail:
                  "The jar stays with the other members; your access ends.",
                icon: "logout",
                destructive: true,
                onPress: () => setSharedAction("leave"),
              },
            ]),
        { label: "Cancel", onPress: () => undefined },
      ]
    : [
        {
          label: "Save together",
          detail: "Share this jar with someone, keeping its history.",
          icon: "group-add",
          onPress: () => setShareConfirm(true),
        },
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
  // Turn this personal jar into a shared one, then open the invite sheet so the
  // next step — sending the link — is already on screen.
  const shareThisJar = async () => {
    if (sharing) return;
    setSharing(true);
    setShareError(null);
    try {
      await shareExisting(jar.id);
      feedback.success();
      setShareConfirm(false);
      setInviteVisible(true);
    } catch (problem) {
      setShareError(
        problem instanceof Error
          ? problem.message
          : "Could not share this jar.",
      );
    } finally {
      setSharing(false);
    }
  };
  // Leave and delete both move membership on the server; on success this
  // screen is looking at a jar that no longer exists for this account, so go
  // home. Failures land in an error sheet rather than vanishing silently.
  const runSharedAction = async (action: "leave" | "delete") => {
    try {
      if (action === "leave") await leaveShared(jar.id);
      else await deleteShared(jar.id);
      feedback.success();
      setSharedAction(null);
      router.replace("/(tabs)" as never);
    } catch (problem) {
      setSharedActionError(
        problem instanceof Error
          ? problem.message
          : action === "leave"
            ? "Could not leave this jar."
            : "Could not delete this jar.",
      );
    }
  };
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
                  setBusy(false);
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
              {/* Only the owner can withdraw from a shared jar (enforced
                  server-side); hiding the button keeps the UI honest. Personal
                  jars are always the owner's own. */}
              {remoteIdOf(jar.id) === undefined ||
              (jar.members ?? []).some(
                (member) => member.you && member.isOwner,
              ) ? (
                <Pressable
                  accessibilityLabel={`Withdraw from ${jar.name}`}
                  onPress={() => {
                    setBusy(false);
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
              ) : null}
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
            {jar.members && jar.members.length ? (
              <View style={styles.members}>
                <View style={styles.membersHead}>
                  <Text style={styles.membersLabel}>WHO IS SAVING</Text>
                  <Text style={styles.membersCount}>
                    {jar.members.length}{" "}
                    {jar.members.length === 1 ? "member" : "members"}
                  </Text>
                </View>
                {jar.members.map((member) => {
                  // Each member's bar is their share of what the jar holds, so a member
                  // who has put in nothing reads as empty rather than as a missing row.
                  const share =
                    jar.balance > 0
                      ? Math.max(
                          0,
                          Math.min(
                            100,
                            Math.round(
                              (member.contributed / jar.balance) * 100,
                            ),
                          ),
                        )
                      : 0;
                  return (
                    <View
                      key={member.id}
                      accessibilityLabel={`${member.name}${member.you ? ", you" : ""}. Contributed ${format(member.contributed)}.`}
                    >
                      <View style={styles.memberRow}>
                        <View
                          style={[
                            styles.memberAvatar,
                            { backgroundColor: accent },
                          ]}
                        >
                          <Text style={styles.memberInitial}>
                            {member.name.trim().charAt(0).toUpperCase() || "?"}
                          </Text>
                        </View>
                        <Text style={styles.memberName} numberOfLines={1}>
                          {member.name}
                          {member.you ? (
                            <Text style={styles.memberYou}> (you)</Text>
                          ) : null}
                        </Text>
                        <View style={{ flex: 1 }} />
                        <Text style={styles.memberAmount}>
                          {format(member.contributed)}
                        </Text>
                      </View>
                      <View style={styles.memberBarTrack}>
                        <View
                          style={[
                            styles.memberBarFill,
                            { width: `${share}%`, backgroundColor: accent },
                          ]}
                        />
                      </View>
                    </View>
                  );
                })}
                {jar.members.some((member) => member.you && member.isOwner) ? (
                  <Pressable
                    accessibilityLabel="Invite someone to this jar"
                    onPress={openInvite}
                    style={({ pressed }) => [
                      styles.inviteRow,
                      pressed && styles.pressed,
                    ]}
                  >
                    <MaterialIcons
                      name="person-add-alt"
                      size={17}
                      color={accent}
                    />
                    <Text style={[styles.inviteText, { color: accent }]}>
                      Invite someone
                    </Text>
                  </Pressable>
                ) : null}
                <Text style={styles.syncNote}>
                  Shared with everyone on this jar. Each contribution is saved
                  to your account, not just this device.
                </Text>
              </View>
            ) : null}
            {shared ? null : jar.recurring ? (
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
                    : item.who && item.who !== "You"
                      ? `${item.who} added`
                      : "Money added"
                  : item.who && item.who !== "You"
                    ? `${item.who} withdrew`
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
        onRecord={() => void record()}
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
        title={shared ? "Shared jar" : "Jar options"}
        message={
          shared
            ? "Anyone on this jar can add money, and its balance stays in sync across every member's device."
            : "Keep its history while removing it from your active goals."
        }
        actions={menuActions}
        onDismiss={() => setMenuVisible(false)}
      />
      <ActionSheet
        visible={shareConfirm}
        title="Share this jar?"
        message={`${jar.name} moves to your account so someone else can add to it. Its ${jar.entries.length} ${jar.entries.length === 1 ? "entry" : "entries"} and balance come with it, and you keep ownership. Personal jars on this device are never copied unless you share them.`}
        actions={[
          {
            label: sharing ? "Sharing…" : "Share it",
            icon: "group-add",
            onPress: () => void shareThisJar(),
          },
          { label: "Cancel", onPress: () => undefined },
        ]}
        onDismiss={() => {
          if (!sharing) {
            setShareConfirm(false);
            setShareError(null);
          }
        }}
      />
      <ActionSheet
        visible={sharedAction === "leave"}
        title="Leave this jar?"
        message="The jar and its history stay with the other members. Your membership ends, and coming back needs a new invite."
        actions={[
          {
            label: "Leave jar",
            icon: "logout",
            destructive: true,
            onPress: () => void runSharedAction("leave"),
          },
          { label: "Cancel", onPress: () => undefined },
        ]}
        onDismiss={() => setSharedAction(null)}
      />
      <ActionSheet
        visible={sharedAction === "delete"}
        title="Delete this jar?"
        message={`${jar.name}, its balance and every entry are removed for all members. This cannot be undone.`}
        actions={[
          {
            label: "Delete forever",
            icon: "delete-outline",
            destructive: true,
            onPress: () => void runSharedAction("delete"),
          },
          { label: "Cancel", onPress: () => undefined },
        ]}
        onDismiss={() => setSharedAction(null)}
      />
      {sharedActionError !== null ? (
        <ActionSheet
          visible
          title="Could not finish"
          message={sharedActionError}
          actions={[{ label: "Got it", onPress: () => undefined }]}
          onDismiss={() => setSharedActionError(null)}
        />
      ) : null}
      {shareError ? (
        <ActionSheet
          visible={shareError !== null}
          title="Could not share"
          message={shareError ?? ""}
          actions={[{ label: "Got it", onPress: () => undefined }]}
          onDismiss={() => setShareError(null)}
        />
      ) : null}
      <InviteSheet
        visible={inviteVisible}
        jarId={remoteIdOf(jar.id)}
        jarName={jar.name}
        accent={accent}
        onDismiss={() => setInviteVisible(false)}
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
