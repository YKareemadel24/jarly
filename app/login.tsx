import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { GoogleMark } from "@/components/google-mark";
import { ScreenContainer } from "@/components/screen-container";
import { getAuthRedirectUrl, isSupabaseConfigured } from "@/constants/oauth";
import { type ThemeColorPalette } from "@/constants/theme";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { feedback } from "@/lib/haptics";
import { startProviderSignIn } from "@/lib/oauth-signin";
import { getSupabase } from "@/lib/supabase";

type Mode = "signin" | "signup";

/**
 * Signing in.
 *
 * Only shared jars need an account, so this screen is reached deliberately —
 * from the invite screen or the account row — rather than being a wall in front
 * of the app. Everything a personal jar does stays available without it.
 *
 * Two ways in, and the screen never has to know which one suits somebody:
 * Google covers a first visit and a return visit alike — Supabase creates the
 * account if the address is new and signs it in if it is not — while email and
 * password stay for anyone who would rather not involve a third party.
 *
 * Neither path finishes here. Google's browser round trip lands on
 * `/oauth/callback`; the email path either returns a session directly or, with
 * confirmation switched on, waits for an emailed link that lands there too.
 */
export default function LoginScreen() {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  // autoFetch is off: this screen is mounted precisely when nobody is signed in
  // yet, and it only needs `refresh` to re-read the session after signing in.
  const { refresh } = useAuth({ autoFetch: false });

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [providerBusy, setProviderBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Kept apart from the email path's pair so each message sits under the
  // control that produced it rather than under whichever one is lower down.
  const [providerError, setProviderError] = useState<string | null>(null);
  const [providerNotice, setProviderNotice] = useState<string | null>(null);

  const configured = isSupabaseConfigured();
  const busyWithAnything = busy || providerBusy;

  /**
   * Google, on either platform.
   *
   * Nothing here waits for a session: on web the page leaves for Google, and on
   * native the browser owns the round trip while the deep link brings the app
   * back to `/oauth/callback`, which finishes the exchange. So this only has to
   * report whether the hand-off itself worked.
   */
  const continueWithGoogle = async () => {
    if (busyWithAnything) return;
    feedback.tap();
    setProviderBusy(true);
    setProviderError(null);
    setProviderNotice(null);

    const outcome = await startProviderSignIn("google");

    if (outcome.status === "redirecting") return; // The page is on its way out.

    setProviderBusy(false);

    if (outcome.status === "opened") {
      // The app is about to go to the background, so say what happens next
      // rather than leaving the button looking like it did nothing.
      setProviderNotice(
        "Finish signing in with Google in your browser — we'll bring you straight back.",
      );
      return;
    }

    feedback.error();
    setProviderError(outcome.message);
  };

  const submit = async () => {
    if (busyWithAnything) return;
    const address = email.trim();
    if (!address || !password) {
      setError("Enter your email and password.");
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const supabase = getSupabase();
      const result =
        mode === "signup"
          ? await supabase.auth.signUp({
              email: address,
              password,
              options: { emailRedirectTo: getAuthRedirectUrl() },
            })
          : await supabase.auth.signInWithPassword({
              email: address,
              password,
            });

      if (result.error) throw result.error;

      // With email confirmation switched on, a sign-up succeeds without
      // returning a session: the person has to open the emailed link first.
      // Saying so is better than appearing to have done nothing at all.
      if (!result.data.session) {
        setNotice("Almost there — open the link we emailed you, then sign in.");
        return;
      }

      feedback.success();
      await refresh();
      router.replace("/(tabs)" as never);
    } catch (caught) {
      feedback.error();
      setError(
        caught instanceof Error
          ? caught.message
          : "That did not work. Try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]} className="p-5">
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Close"
          onPress={() => router.back()}
          style={({ pressed }) => [styles.circle, pressed && styles.pressed]}
        >
          <MaterialIcons name="close" size={20} color={colors.foreground} />
        </Pressable>
      </View>

      <Text style={styles.eyebrow}>YOUR ACCOUNT</Text>
      <Text style={styles.title}>
        {mode === "signin" ? "Welcome\nback." : "Save it\ntogether."}
      </Text>
      <Text style={styles.copy}>
        Personal jars never need an account. Signing in is only for the jars you
        share, so everyone on them sees the same balance.
      </Text>

      {!configured ? (
        <View style={styles.problem}>
          <MaterialIcons name="cloud-off" size={20} color={colors.warning} />
          <Text style={styles.problemText}>
            This build has no Supabase project configured. Set
            EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
            then restart the app.
          </Text>
        </View>
      ) : (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Continue with Google"
            accessibilityHint="Opens Google to sign in, or to create the account if you are new"
            disabled={busyWithAnything}
            onPress={() => void continueWithGoogle()}
            style={({ pressed }) => [
              styles.google,
              busyWithAnything && styles.disabled,
              pressed && !busyWithAnything && styles.pressed,
            ]}
          >
            {providerBusy ? (
              <ActivityIndicator color={colors.foreground} />
            ) : (
              <>
                <GoogleMark size={18} />
                <Text style={styles.googleText}>Continue with Google</Text>
              </>
            )}
          </Pressable>

          {/* One button, both errands: Supabase creates the account when the
              address is new and signs it in when it is not, so the label stays
              "Continue" and this line says the rest. */}
          <Text style={styles.googleNote}>
            {mode === "signin"
              ? "New here? This sets the account up as it signs you in."
              : "Been here before? This signs you back into that account."}
          </Text>

          {providerError ? (
            <Text style={[styles.error, { color: colors.error }]}>
              {providerError}
            </Text>
          ) : null}
          {providerNotice ? (
            <Text style={styles.notice}>{providerNotice}</Text>
          ) : null}

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>OR USE AN EMAIL</Text>
            <View style={styles.dividerLine} />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>EMAIL</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              inputMode="email"
              style={styles.input}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>PASSWORD</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="At least 6 characters"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              style={styles.input}
            />
          </View>

          {error ? (
            <Text style={[styles.error, { color: colors.error }]}>{error}</Text>
          ) : null}
          {notice ? <Text style={styles.notice}>{notice}</Text> : null}

          <Pressable
            accessibilityLabel={
              mode === "signin" ? "Sign in" : "Create account"
            }
            disabled={busyWithAnything}
            onPress={() => void submit()}
            style={({ pressed }) => [
              styles.primary,
              busyWithAnything && styles.disabled,
              pressed && !busyWithAnything && styles.pressed,
            ]}
          >
            {busy ? (
              <ActivityIndicator color="#FFFDF9" />
            ) : (
              <Text style={styles.primaryText}>
                {mode === "signin" ? "Sign in" : "Create account"}
              </Text>
            )}
          </Pressable>

          <Pressable
            onPress={() => {
              setMode(mode === "signin" ? "signup" : "signin");
              setError(null);
              setNotice(null);
              setProviderError(null);
              setProviderNotice(null);
            }}
            style={styles.secondary}
          >
            <Text style={styles.secondaryText}>
              {mode === "signin"
                ? "New here? Create an account with a password"
                : "Already have an account? Sign in"}
            </Text>
          </Pressable>
        </>
      )}
    </ScreenContainer>
  );
}

const makeStyles = (c: ThemeColorPalette) =>
  StyleSheet.create({
    header: { flexDirection: "row", justifyContent: "flex-end" },
    circle: {
      width: 38,
      height: 38,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    eyebrow: {
      color: c.muted,
      fontSize: 10,
      letterSpacing: 1.4,
      fontWeight: "800",
      marginTop: 18,
    },
    title: {
      color: c.foreground,
      fontFamily: "Georgia",
      fontSize: 31,
      lineHeight: 36,
      marginTop: 8,
    },
    copy: { color: c.muted, fontSize: 13.5, lineHeight: 20, marginTop: 10 },
    google: {
      minHeight: 52,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      marginTop: 26,
    },
    googleText: { color: c.foreground, fontSize: 15, fontWeight: "800" },
    googleNote: {
      color: c.muted,
      fontSize: 11.5,
      lineHeight: 17,
      marginTop: 9,
      textAlign: "center",
    },
    divider: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginTop: 22,
    },
    dividerLine: {
      flex: 1,
      height: StyleSheet.hairlineWidth,
      backgroundColor: c.border,
    },
    dividerText: {
      color: c.muted,
      fontSize: 9.5,
      letterSpacing: 1.1,
      fontWeight: "800",
    },
    field: { marginTop: 20 },
    label: {
      color: c.muted,
      fontSize: 10,
      letterSpacing: 1.2,
      fontWeight: "800",
    },
    input: {
      marginTop: 7,
      minHeight: 50,
      borderRadius: 15,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      paddingHorizontal: 15,
      color: c.foreground,
      fontSize: 15,
    },
    primary: {
      minHeight: 52,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.primary,
      marginTop: 24,
    },
    primaryText: { color: "#FFFDF9", fontSize: 15, fontWeight: "800" },
    disabled: { opacity: 0.55 },
    secondary: {
      minHeight: 46,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 6,
    },
    secondaryText: { color: c.muted, fontSize: 13, fontWeight: "700" },
    error: { fontSize: 12.5, fontWeight: "700", marginTop: 16, lineHeight: 18 },
    notice: {
      color: c.foreground,
      fontSize: 12.5,
      fontWeight: "700",
      marginTop: 16,
      lineHeight: 18,
    },
    problem: {
      flexDirection: "row",
      gap: 10,
      alignItems: "flex-start",
      marginTop: 24,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      padding: 15,
    },
    problemText: { flex: 1, color: c.muted, fontSize: 12, lineHeight: 18 },
    pressed: { opacity: 0.86, transform: [{ scale: 0.98 }] },
  });
