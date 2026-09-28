import "@/global.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";
import { Platform } from "react-native";
import "@/lib/_core/nativewind-pressable";
import { ThemeProvider, useThemeContext } from "@/lib/theme-provider";
import { SavingsProvider } from "@/lib/savings-store";
import { SettingsProvider } from "@/lib/settings-store";
import { LockScreen } from "@/components/lock-screen";
import { NotificationResync } from "@/components/notification-resync";
import {
  SafeAreaFrameContext,
  SafeAreaInsetsContext,
  SafeAreaProvider,
  initialWindowMetrics,
} from "react-native-safe-area-context";
import type { EdgeInsets, Rect } from "react-native-safe-area-context";

import { trpc, createTRPCClient } from "@/lib/trpc";
import {
  isApiBaseUrlConfigured,
  isSupabaseConfigured,
} from "@/constants/oauth";
import { initErrorReporting } from "@/lib/error-reporting";

const DEFAULT_WEB_INSETS: EdgeInsets = { top: 0, right: 0, bottom: 0, left: 0 };
const DEFAULT_WEB_FRAME: Rect = { x: 0, y: 0, width: 0, height: 0 };

function SavingJarStatusBar() {
  const { colorScheme } = useThemeContext();
  return <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />;
}

export const unstable_settings = {
  anchor: "(tabs)",
};

export default function RootLayout() {
  const initialInsets = initialWindowMetrics?.insets ?? DEFAULT_WEB_INSETS;
  const initialFrame = initialWindowMetrics?.frame ?? DEFAULT_WEB_FRAME;

  // The web preview container used to push safe-area insets in over postMessage.
  // That was specific to one embedder; a real browser reports nothing and the
  // provider's own metrics are correct, so the values are simply fixed here.
  const insets: EdgeInsets = initialWindowMetrics?.insets ?? initialInsets;
  const frame: Rect = initialWindowMetrics?.frame ?? initialFrame;

  // Create clients once and reuse them
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Disable automatic refetching on window focus for mobile
            refetchOnWindowFocus: false,
            // Retry failed requests once
            retry: 1,
          },
        },
      }),
  );
  const [trpcClient] = useState(() => createTRPCClient());

  // Install the global uncaught-error hook once the layout mounts.
  useEffect(() => {
    initErrorReporting();
  }, []);

  // Fail loudly, once, when a build is missing configuration it cannot recover
  // from at runtime — much easier to diagnose than a silent "no shared jars".
  useEffect(() => {
    if (Platform.OS !== "web" && !__DEV__ && !isApiBaseUrlConfigured()) {
      console.error(
        "[config] EXPO_PUBLIC_API_BASE_URL is not set: release native builds cannot derive the API address, so sign-in and shared jars will fail.",
      );
    }
    if (__DEV__ && !isSupabaseConfigured()) {
      console.warn(
        "[config] Supabase is not configured: sign-in and shared jars are disabled; personal jars keep working offline.",
      );
    }
  }, []);

  // Ensure minimum 8px padding for top and bottom on mobile
  const providerInitialMetrics = useMemo(() => {
    const metrics = initialWindowMetrics ?? {
      insets: initialInsets,
      frame: initialFrame,
    };
    return {
      ...metrics,
      insets: {
        ...metrics.insets,
        top: Math.max(metrics.insets.top, 16),
        bottom: Math.max(metrics.insets.bottom, 12),
      },
    };
  }, [initialInsets, initialFrame]);

  const content = (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          {/* Default to hiding native headers so raw route segments don't appear (e.g. "(tabs)", "products/[id]"). */}
          {/* If a screen needs the native header, explicitly enable it and set a human title via Stack.Screen options. */}
          {/* in order for ios apps tab switching to work properly, use presentation: "fullScreenModal" for login page, whenever you decide to use presentation: "modal*/}
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
            {/* Where a sign-in link or an external provider returns to. */}
            <Stack.Screen name="oauth/callback" />
            {/* Reached from the invite screen and the account row. */}
            <Stack.Screen name="login" />
            {/* An invite link opens the app on this screen, signed in or not. */}
            <Stack.Screen name="join" />
            <Stack.Screen name="transfer/index" />
            <Stack.Screen name="transfer/send" />
            <Stack.Screen name="transfer/receive" />
          </Stack>
          <SavingJarStatusBar />
          <LockScreen />
          <NotificationResync />
        </QueryClientProvider>
      </trpc.Provider>
    </GestureHandlerRootView>
  );

  const shouldOverrideSafeArea = Platform.OS === "web";

  if (shouldOverrideSafeArea) {
    return (
      <ThemeProvider>
        <SafeAreaProvider initialMetrics={providerInitialMetrics}>
          <SafeAreaFrameContext.Provider value={frame}>
            <SafeAreaInsetsContext.Provider value={insets}>
              <SavingsProvider>
                <SettingsProvider>{content}</SettingsProvider>
              </SavingsProvider>
            </SafeAreaInsetsContext.Provider>
          </SafeAreaFrameContext.Provider>
        </SafeAreaProvider>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <SafeAreaProvider initialMetrics={providerInitialMetrics}>
        <SavingsProvider>
          <SettingsProvider>{content}</SettingsProvider>
        </SavingsProvider>
      </SafeAreaProvider>
    </ThemeProvider>
  );
}
