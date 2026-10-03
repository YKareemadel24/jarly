import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { signInWithOAuth, openURL } = vi.hoisted(() => ({
  signInWithOAuth: vi.fn(),
  openURL: vi.fn(),
}));

vi.mock("react-native", () => ({ Platform: { OS: "web" } }));
vi.mock("expo-linking", () => ({ openURL }));
vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({ auth: { signInWithOAuth } }),
}));

import { Platform } from "react-native";

// constants/oauth.ts reads the environment once, at import time, so these have
// to be in place before the module under test is pulled in.
process.env.EXPO_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";

const { explainProviderError, startProviderSignIn } =
  await import("../lib/oauth-signin");

const platform = Platform as unknown as { OS: string };
const AUTHORIZE_URL =
  "https://project.supabase.co/auth/v1/authorize?provider=google";

beforeEach(() => {
  signInWithOAuth.mockReset();
  openURL.mockReset();
  platform.OS = "web";
});

afterEach(() => vi.unstubAllGlobals());

describe("startProviderSignIn", () => {
  it("sends the page itself to the provider on web", async () => {
    vi.stubGlobal("window", { location: { origin: "https://jarly.app" } });
    signInWithOAuth.mockResolvedValue({
      data: { provider: "google", url: AUTHORIZE_URL },
      error: null,
    });

    const outcome = await startProviderSignIn("google");

    expect(outcome).toEqual({ status: "redirecting" });
    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: "https://jarly.app/oauth/callback" },
    });
    // supabase-js navigates; opening a window on top of that would strand the
    // session in a tab the callback route never sees.
    expect(openURL).not.toHaveBeenCalled();
  });

  it("opens the provider in the system browser on native", async () => {
    platform.OS = "ios";
    signInWithOAuth.mockResolvedValue({
      data: { provider: "google", url: AUTHORIZE_URL },
      error: null,
    });
    openURL.mockResolvedValue(true);

    const outcome = await startProviderSignIn("google");

    expect(outcome).toEqual({ status: "opened" });
    // The redirect stays in the app's own scheme so the deep link comes back to
    // /oauth/callback, which is the only place the code is exchanged.
    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: "manussavingjar://oauth/callback",
        skipBrowserRedirect: true,
      },
    });
    expect(openURL).toHaveBeenCalledWith(AUTHORIZE_URL);
  });

  it("fails rather than opening nothing when no address comes back", async () => {
    platform.OS = "android";
    signInWithOAuth.mockResolvedValue({ data: { url: null }, error: null });

    const outcome = await startProviderSignIn("google");

    expect(outcome.status).toBe("failed");
    expect(openURL).not.toHaveBeenCalled();
  });

  it("points at the dashboard switch when the provider is not enabled", async () => {
    signInWithOAuth.mockResolvedValue({
      data: { url: null },
      error: new Error("Unsupported provider: provider is not enabled"),
    });

    const outcome = await startProviderSignIn("google");

    expect(outcome.status).toBe("failed");
    if (outcome.status !== "failed") throw new Error("expected a failure");
    expect(outcome.message).toContain("Authentication → Sign In / Providers");
  });

  it("reports a network failure instead of throwing at the screen", async () => {
    signInWithOAuth.mockRejectedValue(new Error("Network request failed"));

    const outcome = await startProviderSignIn("google");

    expect(outcome).toEqual({
      status: "failed",
      message: "Network request failed",
    });
  });
});

describe("explainProviderError", () => {
  it("leaves an unrelated message exactly as Supabase wrote it", () => {
    expect(explainProviderError("Network request failed")).toBe(
      "Network request failed",
    );
  });
});
