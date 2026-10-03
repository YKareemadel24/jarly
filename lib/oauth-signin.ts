/**
 * Starting a sign-in with someone else's account.
 *
 * Google is the only provider offered, but nothing below is Google-specific
 * beyond the button that calls it: Supabase owns the provider list, and the
 * account that comes back is the same shape whichever one was used.
 *
 * The two platforms finish differently, which is why this hand-off reports an
 * outcome instead of a session. On **web** the browser itself leaves for the
 * provider and returns to `/oauth/callback`, where supabase-js reads the
 * session straight out of the URL. On **native** there is no page to return to,
 * so the provider is opened in the system browser and the person re-enters the
 * app through its own deep link, which the same callback route completes by
 * exchanging the code. Neither platform finishes the sign-in here.
 *
 * That indirection is the point: one callback route owns the exchange, so the
 * emailed-link flow and the provider flow cannot drift apart.
 */

import * as Linking from "expo-linking";
import { Platform } from "react-native";

import { getAuthRedirectUrl, isSupabaseConfigured } from "@/constants/oauth";
import { getSupabase } from "@/lib/supabase";

/** A provider this build offers. The same one has to be enabled in Supabase. */
export type ProviderId = "google";

/**
 * What happened when the sign-in was started.
 *
 * - `redirecting` — web only; the page is on its way to the provider and this
 *   code will not run again.
 * - `opened` — native only; the provider is open in the browser and the app is
 *   waiting to be re-entered through its deep link.
 * - `unavailable` — no Supabase project in this build.
 * - `failed` — the provider refused the request; `message` is worth showing.
 */
export type ProviderSignInOutcome =
  | { status: "redirecting" }
  | { status: "opened" }
  | { status: "unavailable"; message: string }
  | { status: "failed"; message: string };

const NOT_CONFIGURED = "This build has no Supabase project configured.";

/**
 * Supabase's own wording is accurate but assumes you know where to look, so the
 * one error people actually hit — a provider left off in the dashboard — gets
 * the location of the switch appended to it.
 */
export function explainProviderError(message: string): string {
  if (/not enabled|unsupported provider/i.test(message)) {
    return `${message} Turn the provider on under Authentication → Sign In / Providers in the Supabase dashboard.`;
  }
  return message;
}

/**
 * Hand the browser to `provider` and let it bring the person back.
 *
 * Resolves as soon as the browser has been handed over — the sign-in itself
 * lands on `/oauth/callback`.
 */
export async function startProviderSignIn(
  provider: ProviderId,
): Promise<ProviderSignInOutcome> {
  if (!isSupabaseConfigured()) {
    return { status: "unavailable", message: NOT_CONFIGURED };
  }

  const redirectTo = getAuthRedirectUrl();

  try {
    const supabase = getSupabase();

    if (Platform.OS === "web") {
      // supabase-js navigates the page here, so the success branch below is
      // only ever reached if the provider was refused before any of that.
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo },
      });
      return error
        ? { status: "failed", message: explainProviderError(error.message) }
        : { status: "redirecting" };
    }

    // On native the redirect has to be caught by the app's own scheme, so the
    // library is asked for the address rather than allowed to open it.
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error) {
      return { status: "failed", message: explainProviderError(error.message) };
    }
    if (!data?.url) {
      return {
        status: "failed",
        message: "The provider did not return an address to sign in at.",
      };
    }

    await Linking.openURL(data.url);
    return { status: "opened" };
  } catch (caught) {
    return {
      status: "failed",
      message:
        caught instanceof Error && caught.message
          ? explainProviderError(caught.message)
          : "That sign-in could not be started. Try again.",
    };
  }
}
