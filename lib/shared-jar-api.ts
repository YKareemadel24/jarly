/**
 * Vanilla tRPC client for shared jars.
 *
 * The savings provider sits above `trpc.Provider` in the tree, so it cannot use
 * the React hooks. This talks to the same router through a plain client instead,
 * reusing the identical auth transport as `lib/trpc.ts`.
 *
 * Shared jars are the only savings data that syncs; every call here is scoped
 * server-side to jars the caller is a member of.
 *
 * The transport is built by `createSharedJarApi`, whose dependencies (base URL,
 * token provider, fetch) can be replaced — that is how tests exercise the API
 * without touching module state. The named exports at the bottom delegate to a
 * lazily-built default instance, so existing importers are unaffected.
 */

import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";

import { getApiBaseUrl } from "@/constants/oauth";
import { apiFetch } from "@/lib/api-transport";
import { getAccessToken } from "@/lib/_core/auth";
import type { SharedJarPayload } from "@/lib/shared-jars";
import type { PersonalShareInput } from "@/shared/personal-share";
import type { InviteStatus, SharedJarAccent } from "@/shared/shared-jar";
import type { AppRouter } from "@/server/routers";

/** Fields a caller may set when creating or editing a shared jar. */
export type SharedJarFields = {
  name: string;
  icon: string;
  accent: SharedJarAccent;
  kind: "goal" | "habit";
  target: number;
};

/** What an invite link looks like to the person holding it. */
export type InvitePreview =
  | {
      ok: false;
      reason: "missing" | "expired" | "used-up" | "revoked";
      message: string;
    }
  | {
      ok: true;
      jar: {
        name: string;
        icon: string;
        accent: string;
        kind: "goal" | "habit";
        target: number;
      };
      members: number;
      inviterName: string | null;
    };

/** A minted invite, as the owner sees it in the share sheet. */
export type MintedInvite = {
  token: string;
  expiresAt: Date;
  maxUses: number;
  uses: number;
};

/** An invite the owner has already sent, for the management list. */
export type ListedInvite = {
  token: string;
  status: InviteStatus;
  expiresAt: Date;
  maxUses: number;
  uses: number;
  createdAt: Date;
};

/** Injectable transport pieces, so tests can point the API anywhere. */
export type SharedJarApiConfig = {
  /** Where the tRPC endpoint lives; defaults to `getApiBaseUrl()`. */
  getApiBaseUrl?: () => string;
  /** Resolves the bearer token per request. Defaults to the stored Supabase token. */
  getAccessToken?: () => Promise<string | null>;
  /** The fetch implementation for the transport. Defaults to `apiFetch`. */
  fetch?: typeof fetch;
};

/** Every shared-jar operation, bound to one transport. */
export type SharedJarApi = ReturnType<typeof createSharedJarApi>;

/**
 * Build a shared-jar API client.
 *
 * The client itself is created lazily on first call (createTRPCClient is cheap
 * but the base URL may depend on build-time env that is unset in tests), and
 * every dependency — base URL, token, fetch — can be replaced for tests.
 */
export function createSharedJarApi(config: SharedJarApiConfig = {}) {
  const resolveBaseUrl = config.getApiBaseUrl ?? getApiBaseUrl;
  const resolveToken = config.getAccessToken ?? getAccessToken;
  const doFetch = config.fetch ?? apiFetch;

  type Client = ReturnType<typeof createTRPCClient<AppRouter>>;
  let client: Client | null = null;

  function getClient(): Client {
    if (!client) {
      client = createTRPCClient<AppRouter>({
        links: [
          httpBatchLink({
            url: `${resolveBaseUrl()}/api/trpc`,
            transformer: superjson,
            async headers() {
              // Same Bearer-token transport as lib/trpc.ts, so the vanilla
              // client used above the React tree talks to the API exactly as
              // the hooks do.
              const token = await resolveToken();
              return token ? { Authorization: `Bearer ${token}` } : {};
            },
            fetch: doFetch,
          }),
        ],
      });
    }
    return client;
  }

  return {
    /**
     * Every shared jar the caller belongs to.
     *
     * A signed-out or offline caller surfaces as a rejection; the store treats
     * that as "no shared jars" so personal jars keep working regardless.
     */
    async fetchSharedJars(): Promise<SharedJarPayload[]> {
      return (await getClient().sharedJar.list.query()) as unknown as SharedJarPayload[];
    },

    /** Create a shared jar owned by the caller. Returns the new remote id. */
    async createSharedJar(input: SharedJarFields): Promise<number> {
      const created = await getClient().sharedJar.create.mutate(input);
      return created.id;
    },

    /** Contribute to a shared jar. `amount` is integer minor units. */
    async contributeToSharedJar(input: {
      jarId: number;
      amount: number;
      direction?: "deposit" | "withdrawal";
      note?: string;
    }): Promise<void> {
      await getClient().sharedJar.contribute.mutate(input);
    },

    /** Owner-only: invite a member by account id. */
    async inviteToSharedJar(jarId: number, userId: number): Promise<void> {
      await getClient().sharedJar.addMember.mutate({ jarId, userId });
    },

    /** Owner-only: rename, retarget, restyle. */
    async updateSharedJar(
      jarId: number,
      changes: Partial<SharedJarFields>,
    ): Promise<void> {
      await getClient().sharedJar.update.mutate({ jarId, ...changes });
    },

    /** Owner-only, destructive. */
    async deleteSharedJar(jarId: number): Promise<void> {
      await getClient().sharedJar.remove.mutate({ jarId });
    },

    /**
     * Remove your own membership from a shared jar (`userId` must be the
     * caller's own account id; the server rejects anything else). The jar and
     * its history stay with the remaining members, and coming back needs a new
     * invite.
     */
    async leaveSharedJar(jarId: number, userId: number): Promise<void> {
      await getClient().sharedJar.removeMember.mutate({ jarId, userId });
    },

    /**
     * Turn a device-local jar into a shared one, sending its complete history.
     *
     * Returns the server jar id. Safe to call again after a lost response: the
     * server recognises the same `sourceLocalId` and returns the jar it already
     * created rather than duplicating the history.
     */
    async importPersonalJar(
      snapshot: PersonalShareInput,
    ): Promise<{ jarId: number; created: boolean; entryCount: number }> {
      return (await getClient().sharedJar.importPersonal.mutate(
        snapshot,
      )) as unknown as {
        jarId: number;
        created: boolean;
        entryCount: number;
      };
    },

    /* ---------------------------------------------------------------------- */
    /* Invites                                                                */
    /* ---------------------------------------------------------------------- */

    /** Owner-only: mint a new invite link for a jar. */
    async createInvite(
      jarId: number,
      options?: { maxUses?: number; expiresInDays?: number },
    ): Promise<MintedInvite> {
      const created = await getClient().sharedJar.createInvite.mutate({
        jarId,
        maxUses: options?.maxUses ?? 0,
        expiresInDays: options?.expiresInDays,
      });
      return created as unknown as MintedInvite;
    },

    /** Owner-only: every invite minted for this jar. */
    async listInvites(jarId: number): Promise<ListedInvite[]> {
      return (await getClient().sharedJar.listInvites.query({
        jarId,
      })) as unknown as ListedInvite[];
    },

    /** Owner-only: cancel an invite that has already been sent. */
    async revokeInvite(jarId: number, token: string): Promise<void> {
      await getClient().sharedJar.revokeInvite.mutate({ jarId, token });
    },

    /**
     * Public: what the holder of a link sees before accepting.
     *
     * Runs without a session so the join screen can show the jar's name before
     * the recipient signs in, which is usually the moment they decide to.
     */
    async previewInvite(token: string): Promise<InvitePreview> {
      return (await getClient().sharedJar.previewInvite.query({
        token,
      })) as unknown as InvitePreview;
    },

    /** Join a jar through an invite token. Idempotent for existing members. */
    async joinInvite(
      token: string,
    ): Promise<{ jarId: number; alreadyMember: boolean }> {
      return (await getClient().sharedJar.joinInvite.mutate({
        token,
      })) as unknown as {
        jarId: number;
        alreadyMember: boolean;
      };
    },
  };
}

let defaultApi: SharedJarApi | null = null;

/** The shared API instance the app uses; built lazily so env reads stay at call time. */
function getDefaultApi(): SharedJarApi {
  if (!defaultApi) defaultApi = createSharedJarApi();
  return defaultApi;
}

/* Compatibility exports: existing store and UI callers use these names. */
export function fetchSharedJars(): Promise<SharedJarPayload[]> {
  return getDefaultApi().fetchSharedJars();
}

export function createSharedJar(input: SharedJarFields): Promise<number> {
  return getDefaultApi().createSharedJar(input);
}

export function contributeToSharedJar(input: {
  jarId: number;
  amount: number;
  direction?: "deposit" | "withdrawal";
  note?: string;
}): Promise<void> {
  return getDefaultApi().contributeToSharedJar(input);
}

export function inviteToSharedJar(
  jarId: number,
  userId: number,
): Promise<void> {
  return getDefaultApi().inviteToSharedJar(jarId, userId);
}

export function updateSharedJar(
  jarId: number,
  changes: Partial<SharedJarFields>,
): Promise<void> {
  return getDefaultApi().updateSharedJar(jarId, changes);
}

export function deleteSharedJar(jarId: number): Promise<void> {
  return getDefaultApi().deleteSharedJar(jarId);
}

export function leaveSharedJar(jarId: number, userId: number): Promise<void> {
  return getDefaultApi().leaveSharedJar(jarId, userId);
}

export function importPersonalJar(
  snapshot: PersonalShareInput,
): Promise<{ jarId: number; created: boolean; entryCount: number }> {
  return getDefaultApi().importPersonalJar(snapshot);
}

export function createInvite(
  jarId: number,
  options?: { maxUses?: number; expiresInDays?: number },
): Promise<MintedInvite> {
  return getDefaultApi().createInvite(jarId, options);
}

export function listInvites(jarId: number): Promise<ListedInvite[]> {
  return getDefaultApi().listInvites(jarId);
}

export function revokeInvite(jarId: number, token: string): Promise<void> {
  return getDefaultApi().revokeInvite(jarId, token);
}

export function previewInvite(token: string): Promise<InvitePreview> {
  return getDefaultApi().previewInvite(token);
}

export function joinInvite(
  token: string,
): Promise<{ jarId: number; alreadyMember: boolean }> {
  return getDefaultApi().joinInvite(token);
}
