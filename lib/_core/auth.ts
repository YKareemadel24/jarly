/**
 * Session access for the app.
 *
 * Supabase owns the session: it stores it, refreshes it, and knows when it
 * expires. This module is the thin typed seam everything else reads through, so
 * screens never import supabase-js directly and an unconfigured or signed-out
 * app degrades to "no account" instead of throwing.
 *
 * `User` deliberately mirrors the shape the app already had (rather than
 * exposing a raw Supabase user) so the invite screen and the account row did not
 * have to be rewritten around a provider change that is not their concern.
 */

import type { User as SupabaseUser } from "@supabase/supabase-js";

import { isSupabaseConfigured } from "@/constants/oauth";
import { getSupabase } from "@/lib/supabase";

/** The signed-in account, as the rest of the app expects to see it. */
export type User = {
  /** Supabase account id (a uuid). */
  id: string;
  email: string | null;
  name: string | null;
  /** How they signed in — "email", "google", … — when the provider says. */
  loginMethod: string | null;
  lastSignedIn: string;
};

/** Project a Supabase user onto the shape the app renders. */
export function toUser(account: SupabaseUser): User {
  const metadata = (account.user_metadata ?? {}) as Record<string, unknown>;
  const fullName = [metadata.full_name, metadata.name].find(
    (value): value is string =>
      typeof value === "string" && value.trim().length > 0,
  );
  const provider =
    (account.app_metadata as { provider?: string } | undefined)?.provider ??
    null;

  return {
    id: account.id,
    email: account.email ?? null,
    name: fullName?.trim() ?? account.email?.split("@")[0] ?? null,
    loginMethod: provider,
    lastSignedIn: account.last_sign_in_at ?? new Date().toISOString(),
  };
}

/**
 * The access token to send as a Bearer header, or null when signed out.
 *
 * Read from the stored session rather than the network: this runs on every API
 * call, and the server verifies the token itself, so a stale value here only
 * means the call is rejected — never that it is trusted.
 */
export async function getAccessToken(): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const { data, error } = await getSupabase().auth.getSession();
    if (error || !data.session) return null;
    return data.session.access_token;
  } catch {
    // A storage failure must not break the request; it just means no account.
    return null;
  }
}

/**
 * The signed-in account, read from the stored session.
 *
 * Local and offline-friendly on purpose. Screens use this to decide what to
 * show; the API server is what actually enforces identity.
 */
export async function getCurrentUser(): Promise<User | null> {
  if (!isSupabaseConfigured()) return null;
  const { data, error } = await getSupabase().auth.getSession();
  if (error || !data.session) return null;
  return toUser(data.session.user);
}

/** Clear the stored session. There is no server-side session of ours to end. */
export async function signOut(): Promise<void> {
  if (!isSupabaseConfigured()) return;
  await getSupabase().auth.signOut();
}
