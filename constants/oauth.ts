/**
 * Build-time configuration, and how the app reaches its own API server.
 *
 * Everything here is read from `EXPO_PUBLIC_*` variables, which Expo inlines
 * into the bundle, so nothing in this file may hold a secret. The Supabase
 * *publishable* key is the only Supabase credential a client ever sees; it is
 * safe to ship because it can only reach what row level security allows.
 */

import * as Linking from "expo-linking";
import * as ReactNative from "react-native";

const env = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? "",
  supabasePublishableKey:
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
  apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? "",
};

/** Supabase project URL, e.g. https://abcdefgh.supabase.co */
export const SUPABASE_URL = env.supabaseUrl;

/** Supabase publishable key (`sb_publishable_...`). Safe to ship. */
export const SUPABASE_PUBLISHABLE_KEY = env.supabasePublishableKey;

/**
 * Deep-link scheme the app registers.
 *
 * Derived from the bundle id exactly as `app.config.ts` derives it — the two
 * must agree, or a sign-in link emailed to a phone opens nothing at all.
 */
const bundleId = "com.app.savingjar";
const deepLinkScheme = `manus${bundleId.split(".").pop()?.replace(/^t/, "") ?? ""}`;

/** True when this build was given an explicit API base URL. */
export function isApiBaseUrlConfigured(): boolean {
  return Boolean(env.apiBaseUrl);
}

/** True once a Supabase project has been configured for this build. */
export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);
}

/** Port the API server binds to when `PORT` is unset (see server/_core/index.ts). */
export const DEFAULT_API_PORT = 3000;

/** Port Metro serves the app on, and therefore the one that is *not* the API. */
const METRO_PORT = "8081";

/**
 * Get the API base URL, deriving from current hostname if not set.
 * Metro runs on 8081, API server runs on 3000.
 * URL pattern: https://PORT-sandboxid.region.domain
 */
export function getApiBaseUrl(): string {
  // If API_BASE_URL is set, use it
  if (env.apiBaseUrl) {
    return env.apiBaseUrl.replace(/\/$/, "");
  }

  // On web, derive from current hostname by replacing port 8081 with 3000
  if (
    ReactNative.Platform.OS === "web" &&
    typeof window !== "undefined" &&
    window.location
  ) {
    const { protocol, hostname, port } = window.location;
    // Pattern: 8081-sandboxid.region.domain -> 3000-sandboxid.region.domain
    const apiHostname = hostname.replace(/^8081-/, "3000-");
    if (apiHostname !== hostname) {
      return `${protocol}//${apiHostname}`;
    }
    // Local development serves the app and the API from the same host, so only
    // the port differs. Falling through to a relative URL here would send every
    // request to Metro instead, which answers with an HTML/plain-text 404 rather
    // than a tRPC response. A page served on 80/443 keeps the relative URL, which
    // is what a same-origin reverse proxy in a deployment needs.
    if (port === METRO_PORT) {
      return `${protocol}//${hostname}:${DEFAULT_API_PORT}`;
    }
  }

  // Fallback to empty (will use relative URL)
  return "";
}

/**
 * Where Supabase should return someone after an emailed link or a third-party
 * sign-in.
 *
 * Web returns to the app's own origin, which supabase-js then reads the code
 * out of. Native returns through the app's deep link, which the callback route
 * handles. Both forms have to be listed under Authentication → URL
 * Configuration in the Supabase dashboard or the redirect is refused.
 */
export function getAuthRedirectUrl(path = "/oauth/callback"): string {
  if (
    ReactNative.Platform.OS === "web" &&
    typeof window !== "undefined" &&
    window.location?.origin
  ) {
    return `${window.location.origin}${path}`;
  }
  return Linking.createURL(path, { scheme: deepLinkScheme });
}
