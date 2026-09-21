import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { getAuthRedirectUrl, isSupabaseConfigured } from "@/constants/oauth";
import { type ThemeColorPalette } from "@/constants/theme";
import { useAuth } from "@/hooks/use-auth";
import { useColors } from "@/hooks/use-colors";
import { feedback } from "@/lib/haptics";
import { getSupabase } from "@/lib/supabase";

type Mode = "signin" | "signup";

/**
 * Signing in.
 *
 * Only shared jars need an account, so this screen is reached deliberately —
 * from the invite screen or the account row — rather than being a wall in front
 * of the app. Everything a personal jar does stays available without it.
 *
 * Email and password are the whole of it. A third-party provider sign-in needs
 * a browser round trip and a redirect URL registered with the project, which is
 * a reasonable next step but not something the app has to have to be usable.
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
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const configured = isSupabaseConfigured();

  const submit = async () => {
    if (busy) return;
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
          : await supabase.auth.signInWithPassword({ email: address, password });

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
      setError(caught instanceof Error ? caught.message : "That did not work. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]} className="p-5">
      <View style={styles.header}>
        <Pressable accessibilityLabel="Close" onPress={() => router.back()} style={({ pressed }) => [styles.circle, pressed && styles.pressed]}>
          <MaterialIcons name="close" size={20} color={colors.foreground} />
        </Pressable>
      </View>

      <Text style={styles.eyebrow}>YOUR ACCOUNT</Text>
      <Text style={styles.title}>{mode === "signin" ? "Welcome\nback." : "Save it\ntogether."}</Text>
      <Text style={styles.copy}>
        Personal jars never need an account. Signing in is only for the jars you share, so everyone on them sees the same balance.
      </Text>

      {!configured ? (
        <View style={styles.problem}>
          <MaterialIcons name="cloud-off" size={20} color={colors.warning} />
          <Text style={styles.problemText}>
            This build has no Supabase project configured. Set EXPO_PUBLIC_SUPABASE_URL and
            EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, then restart the app.
          </Text>
        </View>
      ) : (
        <>
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

          {error ? <Text style={[styles.error, { color: colors.error }]}>{error}</Text> : null}
          {notice ? <Text style={styles.notice}>{notice}</Text> : null}

          <Pressable
            accessibilityLabel={mode === "signin" ? "Sign in" : "Create account"}
            disabled={busy}
            onPress={() => void submit()}
            style={({ pressed }) => [styles.primary, busy && styles.disabled, pressed && !busy && styles.pressed]}
          >
            {busy ? (
              <ActivityIndicator color="#FFFDF9" />
            ) : (
              <Text style={styles.primaryText}>{mode === "signin" ? "Sign in" : "Create account"}</Text>
            )}
          </Pressable>

          <Pressable
            onPress={() => {
              setMode(mode === "signin" ? "signup" : "signin");
              setError(null);
              setNotice(null);
            }}
            style={styles.secondary}
          >
            <Text style={styles.secondaryText}>
              {mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}
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
    circle: { width: 38, height: 38, borderRadius: 999, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, alignItems: "center", justifyContent: "center" },
    eyebrow: { color: c.muted, fontSize: 10, letterSpacing: 1.4, fontWeight: "800", marginTop: 18 },
    title: { color: c.foreground, fontFamily: "Georgia", fontSize: 31, lineHeight: 36, marginTop: 8 },
    copy: { color: c.muted, fontSize: 13.5, lineHeight: 20, marginTop: 10 },
    field: { marginTop: 20 },
    label: { color: c.muted, fontSize: 10, letterSpacing: 1.2, fontWeight: "800" },
    input: { marginTop: 7, minHeight: 50, borderRadius: 15, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, paddingHorizontal: 15, color: c.foreground, fontSize: 15 },
    primary: { minHeight: 52, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: c.primary, marginTop: 24 },
    primaryText: { color: "#FFFDF9", fontSize: 15, fontWeight: "800" },
    disabled: { opacity: 0.55 },
    secondary: { minHeight: 46, alignItems: "center", justifyContent: "center", marginTop: 6 },
    secondaryText: { color: c.muted, fontSize: 13, fontWeight: "700" },
    error: { fontSize: 12.5, fontWeight: "700", marginTop: 16, lineHeight: 18 },
    notice: { color: c.foreground, fontSize: 12.5, fontWeight: "700", marginTop: 16, lineHeight: 18 },
    problem: { flexDirection: "row", gap: 10, alignItems: "flex-start", marginTop: 24, borderRadius: 18, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, padding: 15 },
    problemText: { flex: 1, color: c.muted, fontSize: 12, lineHeight: 18 },
    pressed: { opacity: 0.86, transform: [{ scale: 0.98 }] },
  });