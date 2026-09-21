import { useCallback, useEffect, useMemo, useState } from "react";

import { isSupabaseConfigured } from "@/constants/oauth";
import { getCurrentUser, signOut as endSession, toUser, type User } from "@/lib/_core/auth";
import { getSupabase } from "@/lib/supabase";

type UseAuthOptions = {
  autoFetch?: boolean;
};

/**
 * Who is signed in, kept in step with the session.
 *
 * `onAuthStateChange` is the source of events rather than polling: it fires on
 * sign-in, sign-out and every background token refresh, so a screen that gates
 * on `isAuthenticated` can never hold a stale answer — which matters most on the
 * invite screen, where being wrong means showing a dead end.
 *
 * The public shape is unchanged from the previous provider, so callers did not
 * have to change: `{ user, loading, error, isAuthenticated, refresh, logout }`.
 */
export function useAuth(options?: UseAuthOptions) {
  const { autoFetch = true } = options ?? {};
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setUser(null);
      setError(null);
      setLoading(false);
      return;
    }
    try {
      setError(null);
      setUser(await getCurrentUser());
    } catch (caught) {
      setError(caught instanceof Error ? caught : new Error("Could not read the session"));
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!autoFetch) {
      setLoading(false);
      return;
    }

    void refresh();
    // Nothing to subscribe to in an unconfigured build; the app is local-only.
    if (!isSupabaseConfigured()) return;

    const { data } = getSupabase().auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ? toUser(session.user) : null);
      setLoading(false);
    });

    return () => data.subscription.unsubscribe();
  }, [autoFetch, refresh]);

  const logout = useCallback(async () => {
    try {
      await endSession();
    } catch (caught) {
      console.error("[Auth] Sign-out failed:", caught);
    } finally {
      // Clear locally whatever the network did, so the UI reflects intent.
      setUser(null);
      setError(null);
    }
  }, []);

  const isAuthenticated = useMemo(() => Boolean(user), [user]);

  return {
    user,
    loading,
    error,
    isAuthenticated,
    refresh,
    logout,
  };
}