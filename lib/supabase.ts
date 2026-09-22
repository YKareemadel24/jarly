/**
 * The one Supabase client.
 *
 * Created on demand rather than at import time so an app with no Supabase
 * project configured still runs: personal jars are local-only and must keep
 * working without an account, and a module-level throw would take the whole app
 * down over a variable that only matters once someone signs in.
 *
 * The key here is the *publishable* key. It is safe to ship because it only
 * reaches what the project's row level security allows; the secret key belongs
 * to the server and must never appear in an app bundle.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Platform } from "react-native";

import {
  isSupabaseConfigured,
  SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_URL,
} from "@/constants/oauth";

let client: SupabaseClient | null = null;

/** Raised whenever something reaches for Supabase in an unconfigured build. */
export const SUPABASE_NOT_CONFIGURED =
  "Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY.";

export function getSupabase(): SupabaseClient {
  if (!isSupabaseConfigured()) throw new Error(SUPABASE_NOT_CONFIGURED);
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        // Sessions survive a restart on every platform. AsyncStorage is used
        // rather than the secure store because it is backed by localStorage on
        // web and, more importantly, because SecureStore caps a value at 2048
        // bytes — a Supabase session can exceed that and would be truncated.
        storage: AsyncStorage,
        persistSession: true,
        autoRefreshToken: true,
        // On native, a provider sign-in returns through a deep link this app
        // handles itself, so supabase-js must not also try to parse the launch
        // URL. On web there is nothing else to do it, so let it.
        detectSessionInUrl: Platform.OS === "web",
        flowType: "pkce",
      },
    });
  }
  return client;
}
