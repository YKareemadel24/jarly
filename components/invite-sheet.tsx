import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";

import { QrCode } from "@/components/qr-code";
import { type ThemeColorPalette } from "@/constants/theme";
import { useColors } from "@/hooks/use-colors";
import { feedback } from "@/lib/haptics";
import { webInviteLink } from "@/lib/invite-links";
import { createInvite, listInvites, revokeInvite, type ListedInvite, type MintedInvite } from "@/lib/shared-jar-api";
import { INVITE_TTL_DAYS } from "@/shared/invite-token";

type Props = {
  visible: boolean;
  /** Server id of the jar being shared. */
  jarId: number | undefined;
  jarName: string;
  accent: string;
  onDismiss: () => void;
};

type Phase = "idle" | "minting" | "ready" | "error";

function expiryLabel(expiresAt: Date | string): string {
  const date = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  const days = Math.ceil((date.getTime() - Date.now()) / 86_400_000);
  if (days <= 0) return "expires today";
  if (days === 1) return "expires tomorrow";
  return `expires in ${days} days`;
}

/**
 * Sharing a jar.
 *
 * A link is minted on demand rather than kept in the jar row, so cancelling a
 * link that leaked is a real action rather than a lie. The QR is drawn on
 * device from the same string the link uses, which means the code and the link
 * can never disagree about what they point at.
 */
export function InviteSheet({ visible, jarId, jarName, accent, onDismiss }: Props) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [phase, setPhase] = useState<Phase>("idle");
  const [invite, setInvite] = useState<MintedInvite | null>(null);
  const [existing, setExisting] = useState<ListedInvite[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const link = useMemo(() => (invite ? webInviteLink(invite.token) : ""), [invite]);

  const refreshExisting = useCallback(() => {
    if (jarId === undefined) return;
    listInvites(jarId)
      .then(setExisting)
      .catch(() => setExisting([]));
  }, [jarId]);

  useEffect(() => {
    if (!visible) return;
    // Reset on open so a stale link from a previous visit is never shown as if
    // it were newly minted.
    setPhase("idle");
    setInvite(null);
    setError(null);
    refreshExisting();
  }, [visible, refreshExisting]);

  const mint = async () => {
    if (jarId === undefined || busy) return;
    setBusy(true);
    setPhase("minting");
    setError(null);
    try {
      const created = await createInvite(jarId);
      setInvite(created);
      setPhase("ready");
      feedback.success();
      refreshExisting();
    } catch (caught) {
      feedback.error();
      setPhase("error");
      setError(caught instanceof Error ? caught.message : "Could not create a link.");
    } finally {
      setBusy(false);
    }
  };

  const shareLink = async () => {
    if (!invite) return;
    feedback.tap();
    const url = webInviteLink(invite.token);
    try {
      await Share.share({ message: `Save "${jarName}" with me on Saving Jar: ${url}`, url });
    } catch {
      // A dismissed share sheet is not an error worth reporting.
    }
  };

  const cancelInvite = async (token: string) => {
    if (jarId === undefined) return;
    setBusy(true);
    try {
      await revokeInvite(jarId, token);
      if (invite?.token === token) {
        setInvite(null);
        setPhase("idle");
      }
      refreshExisting();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not cancel that link.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal transparent animationType="slide" visible={visible} onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.eyebrow}>SHARE THIS JAR</Text>
            <Pressable accessibilityLabel="Close" onPress={onDismiss} hitSlop={8}>
              <MaterialIcons name="close" size={20} color={colors.muted} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
            {phase !== "ready" ? (
              <>
                <Text style={styles.title}>Save it together.</Text>
                <Text style={styles.copy}>
                  Make a link for {jarName}. Whoever opens it can join and add to the same balance. You can cancel it at any time.
                </Text>
                <Pressable
                  disabled={busy || jarId === undefined}
                  onPress={mint}
                  style={({ pressed }) => [styles.primary, { backgroundColor: accent }, (busy || jarId === undefined) && styles.disabled, pressed && !busy && styles.pressed]}
                >
                  {phase === "minting" ? (
                    <ActivityIndicator color="#FFFDF9" />
                  ) : (
                    <>
                      <MaterialIcons name="link" size={19} color="#FFFDF9" />
                      <Text style={styles.primaryText}>Create a link</Text>
                    </>
                  )}
                </Pressable>
                <Text style={styles.fine}>Links last {INVITE_TTL_DAYS} days, and only people who open yours can join.</Text>
              </>
            ) : (
              <>
                <Text style={styles.title}>Show this code.</Text>
                <Text style={styles.copy}>They point their camera at it, or open the link you send.</Text>

                <View style={styles.qrWrap}>
                  <QrCode value={link} size={208} />
                </View>

                <View style={styles.linkBox}>
                  <Text numberOfLines={1} style={styles.linkText}>{link}</Text>
                </View>
                <Text style={styles.fine}>{invite ? expiryLabel(invite.expiresAt) : ""}</Text>

                <View style={styles.actions}>
                  <Pressable onPress={shareLink} style={({ pressed }) => [styles.primary, { backgroundColor: accent }, pressed && styles.pressed]}>
                    <MaterialIcons name="ios-share" size={18} color="#FFFDF9" />
                    <Text style={styles.primaryText}>Send the link</Text>
                  </Pressable>
                  <Pressable onPress={mint} disabled={busy} style={({ pressed }) => [styles.ghost, pressed && styles.pressed]}>
                    <MaterialIcons name="refresh" size={17} color={colors.foreground} />
                    <Text style={styles.ghostText}>Make a new one</Text>
                  </Pressable>
                </View>
              </>
            )}

            {error ? <Text style={[styles.error, { color: colors.error }]}>{error}</Text> : null}

            {existing.length > 0 ? (
              <View style={styles.existing}>
                <Text style={styles.existingLabel}>LINKS YOU HAVE MADE</Text>
                {existing.map((row) => (
                  <View key={row.token} style={styles.existingRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.existingState}>
                        {row.status === "open" ? "Active" : row.status === "expired" ? "Expired" : row.status === "used-up" ? "Used" : "Cancelled"}
                        {row.uses > 0 ? ` · ${row.uses} ${row.uses === 1 ? "join" : "joins"}` : ""}
                      </Text>
                      <Text style={styles.existingMeta}>{expiryLabel(row.expiresAt)}</Text>
                    </View>
                    {row.status === "open" ? (
                      <Pressable accessibilityLabel="Cancel this link" disabled={busy} onPress={() => void cancelInvite(row.token)} hitSlop={8}>
                        <Text style={[styles.cancelText, { color: colors.error }]}>Cancel</Text>
                      </Pressable>
                    ) : null}
                  </View>
                ))}
              </View>
            ) : null}

          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (c: ThemeColorPalette) =>
  StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: "rgba(28,22,18,.42)", justifyContent: "flex-end" },
    sheet: { maxHeight: "92%", backgroundColor: c.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, borderColor: c.border, paddingHorizontal: 20, paddingBottom: 28 },
    handle: { alignSelf: "center", width: 40, height: 4, borderRadius: 99, backgroundColor: c.border, marginTop: 10 },
    header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 14 },
    eyebrow: { color: c.muted, fontSize: 10, letterSpacing: 1.3, fontWeight: "800" },
    scroll: { paddingTop: 10, paddingBottom: 8 },
    title: { color: c.foreground, fontFamily: "Georgia", fontSize: 23, marginTop: 6 },
    copy: { color: c.muted, fontSize: 13, lineHeight: 19, marginTop: 8 },
    qrWrap: { alignSelf: "center", marginTop: 18, padding: 10, borderRadius: 20, backgroundColor: "#FFFDF9", borderWidth: 1, borderColor: c.border },
    linkBox: { marginTop: 14, borderRadius: 13, borderWidth: 1, borderColor: c.border, backgroundColor: c.background, paddingHorizontal: 13, paddingVertical: 11 },
    linkText: { color: c.foreground, fontSize: 11.5, fontWeight: "600" },
    actions: { marginTop: 16, gap: 9 },
    primary: { minHeight: 50, borderRadius: 15, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
    primaryText: { color: "#FFFDF9", fontSize: 14, fontWeight: "800" },
    ghost: { minHeight: 46, borderRadius: 15, borderWidth: 1, borderColor: c.border, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
    ghostText: { color: c.foreground, fontSize: 13, fontWeight: "800" },
    disabled: { opacity: 0.55 },
    fine: { color: c.muted, fontSize: 11, lineHeight: 16, marginTop: 10, textAlign: "center" },
    error: { fontSize: 12, fontWeight: "700", marginTop: 12 },
    existing: { marginTop: 22, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border, paddingTop: 14 },
    existingLabel: { color: c.muted, fontSize: 10, letterSpacing: 1.1, fontWeight: "800", marginBottom: 8 },
    existingRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
    existingState: { color: c.foreground, fontSize: 12.5, fontWeight: "800" },
    existingMeta: { color: c.muted, fontSize: 11, marginTop: 2 },
    cancelText: { fontSize: 12, fontWeight: "800" },
    pressed: { opacity: 0.86, transform: [{ scale: 0.98 }] },
  });