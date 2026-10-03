import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({ Platform: { OS: "web" } }));

import { Platform } from "react-native";

import { getAuthRedirectUrl } from "../constants/oauth";

/** The mocked platform object is shared, so a test can move the app to native. */
const platform = Platform as unknown as { OS: string };

const servedFrom = (origin: string) =>
  vi.stubGlobal("window", { location: { origin } });

afterEach(() => {
  platform.OS = "web";
  vi.unstubAllGlobals();
});

describe("getAuthRedirectUrl", () => {
  it("returns to the app's own origin on web", () => {
    // supabase-js reads the session out of this URL itself, so it has to be a
    // page this app actually serves.
    servedFrom("https://jarly.app");
    expect(getAuthRedirectUrl()).toBe("https://jarly.app/oauth/callback");
  });

  it("honours a different landing path", () => {
    servedFrom("http://localhost:8081");
    expect(getAuthRedirectUrl("/join")).toBe("http://localhost:8081/join");
  });

  it("uses a bare scheme deep link on native", () => {
    // Expo Router reads a deep link's host and path as one route, so
    // `manussavingjar://oauth/callback` resolves to /oauth/callback while the
    // Metro-host prefix `Linking.createURL` adds in a dev build
    // (`manussavingjar://10.0.0.5:8081/oauth/callback`) resolves to an unknown
    // route and throws the sign-in code away with it.
    platform.OS = "ios";
    expect(getAuthRedirectUrl()).toBe("manussavingjar://oauth/callback");
    platform.OS = "android";
    expect(getAuthRedirectUrl()).toBe("manussavingjar://oauth/callback");
  });

  it("keeps the scheme pinned to the one app.config.ts registers", () => {
    // The two are derived from the bundle id independently; if they ever drift
    // the link silently opens nothing at all.
    platform.OS = "ios";
    expect(getAuthRedirectUrl()).toMatch(/^manussavingjar:\/\//);
  });
});
