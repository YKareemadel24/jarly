/**
 * Building and reading invite links.
 *
 * An invite has to be openable from three different places: a browser on a
 * desktop, a messaging app on a phone, and the app itself via its deep link.
 * Rather than scatter that logic across screens, every link is built here from
 * one token, and every inbound string is parsed by the shared token module.
 */

import * as Linking from "expo-linking";
import { Platform } from "react-native";

import { getApiBaseUrl } from "@/constants/oauth";
import { INVITE_PARAM, INVITE_PATH, inviteUrl } from "@/shared/invite-token";

/**
 * Public origin a web link should point at.
 *
 * There is no server-rendered page behind this yet, so it defaults to whatever
 * origin the API is served from — the same host the app is reached on. Set
 * EXPO_PUBLIC_APP_URL to a real marketing domain when one exists.
 */
export function inviteWebBase(): string {
  const configured = process.env.EXPO_PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/+$/, "");

  const api = getApiBaseUrl();
  if (api) return api.replace(/\/+$/, "");

  if (Platform.OS === "web" && typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return "";
}

/** A link a browser can open. */
export function webInviteLink(token: string): string {
  const base = inviteWebBase();
  if (base) return inviteUrl(base, token);
  // With no known origin there is nothing honest to render, so fall back to the
  // app deep link, which at least works for a recipient who has the app.
  return deepInviteLink(token);
}

/** A link that opens the installed app directly. */
export function deepInviteLink(token: string): string {
  return Linking.createURL(`${INVITE_PATH}?${INVITE_PARAM}=${token}`);
}