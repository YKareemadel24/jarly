import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { JarVessel } from "@/components/jar-vessel";
import { ScreenContainer } from "@/components/screen-container";
import { type ThemeColorPalette } from "@/constants/theme";
import { getLoginUrl } from "@/constants/oauth";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { useJarAccents } from "@/hooks/use-jar-accents";
import { feedback } from "@/lib/haptics";
import { useMoney, useSavings } from "@/lib/savings-store";
import { previewInvite, type InvitePreview } from "@/lib/shared-jar-api";
import { inviteTokenFromInput } from "@/shared/invite-token";

type Phase = "loading" | "preview" | "joining" | "joined" | "error";

/**
 * Accepting a shared jar.
 *
 * Reached from a link or a scanned QR code, so it has to work for someone who
 * is not signed in yet: the preview is public and shows only the jar's name and
 * look, and the sign-in step happens after they have decided to join rather than
 * before. The token itself is never rendered — it is a bearer credential and
 * anything on screen ends up in a screenshot.
 */
export default function JoinScreen() {
  const colors = useColors();
  const accents = useJarAccents();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const format = useMoney();
  const params = useLocalSearchParams<{ token?: string; t?: string }>();
  const { joinShared } = useSavings();
  const { isAuthenticated, loading: authLoading } = useAuth({ autoFetch: true });

  // The token arrives as `?t=` from a web link, but a `/join/CODE` path reaches
  // expo-router as `token` instead. Parse either, and go through the shared
  // parser so a whole pasted URL works the same as a tapped one.
  const token = useMemo(
    () => inviteTokenFromInput(params.t ?? params.token ?? ""),
    [params.t, params.token],
  );

  const [phase, setPhase] = useState<Phase>("loading");
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!token) {
      setPhase("error");
      setMessage("That invite link is not valid. Ask for a new one.");
      return;
    }
    setPhase("loading");
    previewInvite(token)
      .then((result) => {
        setPreview(result);
        if (result.ok) {
          setPhase("preview");
        } else {
          setPhase("error");
          setMessage(result.message);
        }
      })
      .catch(() => {
        setPhase("error");
        setMessage("Could not reach the server. Check your connection and try again.");
      });
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const accept = async () => {
    if (!token || busy) return;
    setBusy(true);
    setPhase("joining");
    try {
      const localId = await joinShared(token);
      feedback.success();
      setPhase("joined");
      setMessage("You are in.");
      // Land on the jar itself, which is the thing they just agreed to join.
      setTimeout(() => router.replace(`/jar/${localId}` as never), 650);
    } catch (error) {
      feedback.error();
      setPhase("error");
      setMessage(error instanceof Error ? error.message : "Could not join this jar.");
    } finally {
      setBusy(false);
    }
  };

  const openSignIn = () => {
    feedback.tap();
    const url = getLoginUrl();
    if (typeof window !== "undefined" && typeof (window as { location?: Location }).location !== "undefined") {
      (window as unknown as { location: { href: string } }).location.href = url;
      return;
    }
    // Native: the callback reopens the app through the deep link, which returns
    // to this same screen with the token still in the URL.
    void import("expo-linking").then((Linking) => Linking.openURL(url));
  };

  const accent = preview?.ok ? (accents[preview.jar.accent as keyof typeof accents] ?? accents.ocean) : accents.ocean;

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]} className="p-5">
      <View style={styles.header}>
        <Pressable accessibilityLabel="Go back" onPress={() => router.replace("/(tabs)" as never)} style={({ pressed }) => [styles.circle, pressed && styles.pressed]}>
          <MaterialIcons name="close" size={20} color={colors.foreground} />
        </Pressable>
      </View>

      {phase === "loading" ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.quiet}>Checking this invite…</Text>
        </View>
      ) : null}

      {phase === "error" ? (
        <View style={styles.center}>
          <View style={[styles.icon, { backgroundColor: `${colors.error}18` }]}>
            <MaterialIcons name="link-off" size={26} color={colors.error} />
          </View>
          <Text style={styles.title}>This link did not work.</Text>
          <Text style={styles.copy}>{message ?? "Ask the person who sent it for a new one."}</Text>
          <Pressable onPress={() => router.replace("/(tabs)" as never)} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
            <Text style={styles.primaryText}>Back to my jars</Text>
          </Pressable>
        </View>
      ) : null}

      {preview?.ok && (phase === "preview" || phase === "joining" || phase === "joined") ? (
        <View style={styles.body}>
          <Text style={styles.eyebrow}>YOU ARE INVITED</Text>
          <Text style={styles.title}>Save it together.</Text>
          <Text style={styles.copy}>
            {preview.inviterName ? `${preview.inviterName} added you to a shared jar.` : "You have been added to a shared jar."}
          </Text>

          <View style={[styles.card, { backgroundColor: `${accent}12`, borderColor: `${accent}44` }]}>
            <JarVessel accent={accent} icon={preview.jar.icon} progress={0} size="medium" />
            <Text style={styles.jarName}>{preview.jar.name}</Text>
            <Text style={styles.jarMeta}>
              {format(preview.jar.target)} goal · {preview.members} {preview.members === 1 ? "person" : "people"} saving
            </Text>
          </View>

          <Text style={styles.note}>
            Everyone on this jar adds to the same balance, and it stays in step on every device they sign in on.
          </Text>

          {phase === "joined" ? (
            <View style={styles.done}>
              <MaterialIcons name="check-circle" size={19} color={accent} />
              <Text style={[styles.doneText, { color: accent }]}>Joined. Opening the jar…</Text>
            </View>
          ) : !isAuthenticated && !authLoading ? (
            <>
              <Pressable onPress={openSignIn} style={({ pressed }) => [styles.primary, { backgroundColor: colors.primary }, pressed && styles.pressed]}>
                <Text style={styles.primaryText}>Sign in to join</Text>
              </Pressable>
              <Text style={styles.fine}>A shared jar lives on your account, so it needs a sign-in. Personal jars do not.</Text>
            </>
          ) : (
            <Pressable disabled={busy || authLoading} onPress={accept} style={({ pressed }) => [styles.primary, { backgroundColor: accent }, (busy || authLoading) && styles.disabled, pressed && !busy && styles.pressed]}>
              <Text style={styles.primaryText}>{phase === "joining" ? "Joining…" : "Join this jar"}</Text>
            </Pressable>
          )}

          <Pressable onPress={() => router.replace("/(tabs)" as never)} style={styles.secondary}>
            <Text style={styles.secondaryText}>Not now</Text>
          </Pressable>
        </View>
      ) : null}
    </ScreenContainer>
  );
}

const makeStyles = (c: ThemeColorPalette) =>
  StyleSheet.create({
    header: { flexDirection: "row", justifyContent: "flex-end" },
    circle: { width: 38, height: 38, borderRadius: 999, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, alignItems: "center", justifyContent: "center" },
    center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingBottom: 40 },
    body: { flex: 1, paddingTop: 8 },
    eyebrow: { color: c.muted, fontSize: 10, letterSpacing: 1.4, fontWeight: "800" },
    title: { color: c.foreground, fontFamily: "Georgia", fontSize: 30, lineHeight: 35, marginTop: 8 },
    copy: { color: c.muted, fontSize: 13.5, lineHeight: 20, marginTop: 8, maxWidth: 320, textAlign: "center" },
    quiet: { color: c.muted, fontSize: 13 },
    card: { marginTop: 24, borderRadius: 26, borderWidth: 1, padding: 20, alignItems: "center" },
    jarName: { color: c.foreground, fontFamily: "Georgia", fontSize: 21, marginTop: 14, textAlign: "center" },
    jarMeta: { color: c.muted, fontSize: 12, marginTop: 6, fontWeight: "700" },
    note: { color: c.muted, fontSize: 12, lineHeight: 18, marginTop: 18 },
    icon: { width: 58, height: 58, borderRadius: 20, alignItems: "center", justifyContent: "center" },
    primary: { minHeight: 52, borderRadius: 16, alignItems: "center", justifyContent: "center", marginTop: 20 },
    primaryText: { color: "#FFFDF9", fontSize: 15, fontWeight: "800" },
    disabled: { opacity: 0.55 },
    secondary: { minHeight: 46, alignItems: "center", justifyContent: "center", marginTop: 6 },
    secondaryText: { color: c.muted, fontSize: 13, fontWeight: "700" },
    done: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 22 },
    doneText: { fontSize: 14, fontWeight: "800" },
    fine: { color: c.muted, fontSize: 11, lineHeight: 16, marginTop: 10 },
    pressed: { opacity: 0.86, transform: [{ scale: 0.98 }] },
  });