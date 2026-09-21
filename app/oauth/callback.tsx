import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedView } from "@/components/themed-view";
import { isSupabaseConfigured } from "@/constants/oauth";
import { getSupabase } from "@/lib/supabase";

type Status = "working" | "done" | "failed";

/**
 * Where a sign-in link lands.
 *
 * Two different things arrive here. On web, supabase-js has already traded the
 * code in the URL for a session by the time this renders, because the client is
 * created with `detectSessionInUrl` — so the session is simply read. On native
 * there is no URL for it to read, and the code has to be exchanged explicitly.
 * Both paths therefore end in the same place: look for a session, and exchange
 * the code only when there is not one yet.
 */
export default function AuthCallback() {
  const params = useLocalSearchParams<{ code?: string; error?: string; error_description?: string }>();
  const [status, setStatus] = useState<Status>("working");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const settle = (next: Status, detail: string | null = null) => {
      if (cancelled) return;
      setStatus(next);
      setMessage(detail);
    };

    const complete = async () => {
      if (params.error || params.error_description) {
        settle("failed", params.error_description ?? params.error ?? "That link is no longer valid.");
        return;
      }
      if (!isSupabaseConfigured()) {
        settle("failed", "This build has no Supabase project configured.");
        return;
      }

      const supabase = getSupabase();
      try {
        const { data } = await supabase.auth.getSession();
        if (!data.session) {
          if (!params.code) {
            settle("failed", "That link is missing the code it needs. Ask for a new one.");
            return;
          }
          const exchanged = await supabase.auth.exchangeCodeForSession(params.code);
          if (exchanged.error) throw exchanged.error;
        }
        settle("done");
        setTimeout(() => router.replace("/(tabs)" as never), 700);
      } catch (error) {
        settle("failed", error instanceof Error ? error.message : "Sign-in could not be completed.");
      }
    };

    void complete();
    return () => {
      cancelled = true;
    };
  }, [params.code, params.error, params.error_description]);

  return (
    <SafeAreaView className="flex-1" edges={["top", "bottom", "left", "right"]}>
      <ThemedView className="flex-1 items-center justify-center gap-4 p-5">
        {status === "working" ? (
          <>
            <ActivityIndicator size="large" />
            <Text className="mt-4 text-base leading-6 text-center text-foreground">Finishing sign-in…</Text>
          </>
        ) : null}

        {status === "done" ? (
          <Text className="text-base leading-6 text-center text-foreground">You are signed in. Opening your jars…</Text>
        ) : null}

        {status === "failed" ? (
          <>
            <Text className="mb-2 text-xl font-bold leading-7 text-error">Sign-in failed</Text>
            <Text className="text-base leading-6 text-center text-foreground">{message}</Text>
            <Pressable accessibilityLabel="Back to sign in" onPress={() => router.replace("/login" as never)} className="mt-4">
              <Text className="text-base font-bold text-primary">Try signing in again</Text>
            </Pressable>
          </>
        ) : null}
      </ThemedView>
    </SafeAreaView>
  );
}