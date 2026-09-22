import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Text, View } from "react-native";

import { Redirect } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { ThemedView } from "@/components/themed-view";
import { isSupabaseConfigured } from "@/constants/oauth";
import { getSupabase, SUPABASE_NOT_CONFIGURED } from "@/lib/supabase";

/** `id` is a Postgres `bigint`, which can arrive as a number or a string. */
type Instrument = { id: number | string; name: string };

type Status = "loading" | "ready" | "error";

/**
 * A read straight through Supabase into a table, used to prove the wiring works.
 *
 * Deliberately the smallest thing that can fail informatively: it reads one
 * public table and renders every row. There is no client for this data in
 * `lib/savings-store.tsx` and no domain logic — jars are the app's real model,
 * and this route exists only to answer "is Supabase actually reachable from this
 * build?" without going through the sign-in flow first.
 *
 * Reached at /dev/instruments, alongside /dev/theme-lab.
 */
export default function InstrumentsScreen() {
  // Development tool: never reachable in a release build.
  if (!__DEV__) return <Redirect href="/" />;
  return <InstrumentsInner />;
}

function InstrumentsInner() {
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      // A build with no Supabase project is a legitimate state rather than a
      // fault: every personal jar works with no backend at all. Saying that is
      // more useful than surfacing a fetch failure.
      if (!isSupabaseConfigured()) {
        if (cancelled) return;
        setError(SUPABASE_NOT_CONFIGURED);
        setStatus("error");
        return;
      }

      const { data, error: failure } = await getSupabase()
        .from("instruments")
        .select("id,name")
        .order("id");

      // The screen can unmount while the request is in flight (a fast back tap),
      // and setting state afterwards would warn.
      if (cancelled) return;

      if (failure) {
        setError(failure.message);
        setStatus("error");
        return;
      }

      setInstruments((data ?? []) as Instrument[]);
      setStatus("ready");
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]} className="p-5">
      <Text className="text-[10px] font-extrabold tracking-widest text-muted">
        DEV CHECK
      </Text>
      <Text
        className="mt-2 text-3xl leading-9 text-foreground"
        style={{ fontFamily: "Georgia" }}
      >
        Instruments
      </Text>
      <Text className="mt-2 text-sm leading-5 text-muted">
        Rows read live from the <Text className="font-bold">instruments</Text>{" "}
        table through the publishable key.
      </Text>

      <ThemedView className="mt-5 flex-1">
        {status === "loading" ? (
          <View className="flex-1 items-center justify-center gap-3 pb-16">
            <ActivityIndicator />
            <Text className="text-sm text-muted">Reading from Supabase…</Text>
          </View>
        ) : null}

        {status === "error" ? (
          <View className="mt-4 rounded-2xl border border-border bg-surface p-4">
            <Text className="text-xs font-extrabold tracking-wider text-error">
              COULD NOT LOAD
            </Text>
            <Text className="mt-2 text-sm leading-5 text-foreground">
              {error}
            </Text>
            <Text className="mt-3 text-xs leading-4 text-muted">
              If the table is missing, run the instruments SQL in the Supabase
              SQL editor. If the build has no keys, set SUPABASE_URL and
              SUPABASE_PUBLISHABLE_KEY in .env and restart Expo.
            </Text>
          </View>
        ) : null}

        {status === "ready" && instruments.length === 0 ? (
          <Text className="mt-4 text-sm text-muted">
            The table is reachable but empty. Insert a row — the policy allows
            reads only.
          </Text>
        ) : null}

        {status === "ready" && instruments.length > 0 ? (
          <FlatList
            data={instruments}
            // String() rather than .toString() so a bigint that arrived as a
            // number and one that arrived as a string both key the same way.
            keyExtractor={(item) => String(item.id)}
            className="mt-2"
            ItemSeparatorComponent={() => <View className="h-px bg-border" />}
            renderItem={({ item }) => (
              <View className="flex-row items-center justify-between py-3">
                <Text className="text-base text-foreground">{item.name}</Text>
                <Text className="text-xs text-muted">#{String(item.id)}</Text>
              </View>
            )}
          />
        ) : null}
      </ThemedView>
    </ScreenContainer>
  );
}
