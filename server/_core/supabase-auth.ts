/**
 * Supabase Auth verification for the API server.
 *
 * Supabase issues the access token and the client attaches it as a Bearer header
 * on every tRPC call — on web as much as on native. That is a deliberate
 * simplification: the previous provider needed a cookie on web and a stored
 * token on native, which meant the server had to support two ways of being told
 * who was calling. Now there is exactly one.
 *
 * Tokens are verified against the project's published JWKS with `jose`, which
 * this server already uses, so no Supabase SDK is pulled into the server bundle.
 * Signing keys rotate, so the key set is cached by `jose` rather than fetched
 * per request.
 *
 * The token authenticates *the account*; `resolveUser` maps it onto this app's
 * own integer user id, which every shared-jar table references.
 */

import { jwtVerify, createRemoteJWKSet } from "jose";
import type { Request } from "express";

import { UnauthorizedError } from "../../shared/_core/errors.js";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { ENV, supabaseJwksUrl } from "./env";

/** The claims this server actually reads out of an access token. */
type SupabaseClaims = {
  /** The account's UUID; `auth.users.id` in the Supabase project. */
  sub?: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
  app_metadata?: { provider?: string };
};

let keySet: ReturnType<typeof createRemoteJWKSet> | null = null;

/**
 * The cached JWKS client.
 *
 * Built lazily because the project URL is read from the environment, and a
 * module that throws on import would take the whole server down over a missing
 * variable that only matters once someone actually signs in.
 */
function getKeySet(): ReturnType<typeof createRemoteJWKSet> {
  if (keySet) return keySet;
  const url = supabaseJwksUrl();
  if (!url) {
    throw new Error(
      "SUPABASE_URL is not configured, so access tokens cannot be verified. Set it, or set SUPABASE_JWKS_URL explicitly.",
    );
  }
  keySet = createRemoteJWKSet(new URL(url));
  return keySet;
}

/** The Bearer token on a request, or undefined when there is not one. */
export function bearerToken(req: Request): string | undefined {
  const header = req.headers.authorization ?? req.headers.Authorization;
  if (typeof header !== "string") return undefined;
  const [scheme, ...rest] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer") return undefined;
  const token = rest.join(" ").trim();
  return token || undefined;
}

/**
 * Best available human name for an account, since Supabase leaves this to the
 * provider that signed the user up. Falls back to the local part of the email,
 * which is what the jar member list wants to show.
 */
function claimsDisplayName(claims: SupabaseClaims): string | null {
  const metadata = claims.user_metadata ?? {};
  for (const key of ["full_name", "name", "preferred_username"] as const) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  const local = (claims.email ?? "").split("@")[0]?.trim();
  return local || null;
}

/**
 * Verify the access token on a request and return the account it belongs to.
 *
 * Throws when there is no usable token; `createContext` turns that into a null
 * user so public procedures keep working.
 */
export async function authenticateRequest(req: Request): Promise<User> {
  const token = bearerToken(req);
  if (!token) throw UnauthorizedError("No session token was sent.");

  const issuer = ENV.supabaseUrl
    ? `${ENV.supabaseUrl.replace(/\/+$/, "")}/auth/v1`
    : undefined;

  let claims: SupabaseClaims;
  try {
    const { payload } = await jwtVerify(token, getKeySet(), {
      // Supabase signs user tokens for this audience and no other, so requiring
      // it rejects a token minted for a different purpose in the same project.
      audience: "authenticated",
      ...(issuer ? { issuer } : {}),
    });
    claims = payload as SupabaseClaims;
  } catch (error) {
    // The reason is logged but not returned: a caller learns only that the token
    // was not accepted, which keeps signature and expiry detail out of the API.
    console.warn(
      "[Auth] Rejected access token:",
      error instanceof Error ? error.message : error,
    );
    throw UnauthorizedError("That session token is not valid.");
  }

  const supabaseUserId = claims.sub;
  if (!supabaseUserId)
    throw UnauthorizedError("That session token has no user id.");

  const existing = await db.getUserBySupabaseId(supabaseUserId);
  if (existing) {
    // lastSignedIn is bookkeeping, not an audit log: stamping it on every
    // request would turn each API call into a database write. A coarse
    // granularity is plenty for "when was this account last around".
    const LAST_SEEN_GRANULARITY_MS = 15 * 60_000;
    if (
      Date.now() - existing.lastSignedIn.getTime() >
      LAST_SEEN_GRANULARITY_MS
    ) {
      await db.touchLastSignedIn(existing.id);
    }
    return existing;
  }

  // First time this account has been seen: create the row that other tables
  // reference. A concurrent request can win the race, in which case this returns
  // the row that request created rather than failing.
  const created = await db.upsertUser({
    supabaseUserId,
    name: claimsDisplayName(claims),
    email: claims.email ?? null,
    loginMethod: claims.app_metadata?.provider ?? null,
    lastSignedIn: new Date(),
  });

  if (!created)
    throw new Error(
      "The account could not be stored. Is the database configured?",
    );
  return created;
}
