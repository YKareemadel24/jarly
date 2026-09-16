/**
 * Vanilla tRPC client for shared jars.
 *
 * The savings provider sits above `trpc.Provider` in the tree, so it cannot use
 * the React hooks. This talks to the same router through a plain client instead,
 * reusing the identical auth transport as `lib/trpc.ts`.
 *
 * Shared jars are the only savings data that syncs; every call here is scoped
 * server-side to jars the caller is a member of.
 */

import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";

import { getApiBaseUrl } from "@/constants/oauth";
import * as Auth from "@/lib/_core/auth";
import type { SharedJarPayload } from "@/lib/shared-jars";
import type { InviteStatus } from "@/shared/shared-jar";
import type { SharedJarAccent } from "@/shared/shared-jar";
import type { AppRouter } from "@/server/routers";

/** Fields a caller may set when creating or editing a shared jar. */
export type SharedJarFields = {
  name: string;
  icon: string;
  accent: SharedJarAccent;
  kind: "goal" | "habit";
  target: number;
};

type Client = ReturnType<typeof createTRPCClient<AppRouter>>;

let client: Client | null = null;

function getClient(): Client {
  if (!client) {
    client = createTRPCClient<AppRouter>({
      links: [
        httpBatchLink({
          url: `${getApiBaseUrl()}/api/trpc`,
          transformer: superjson,
          async headers() {
            const token = await Auth.getSessionToken();
            return token ? { Authorization: `Bearer ${token}` } : {};
          },
          fetch(url, options) {
            return fetch(url, { ...options, credentials: "include" });
          },
        }),
      ],
    });
  }
  return client;
}

/**
 * Every shared jar the caller belongs to.
 *
 * A signed-out or offline caller surfaces as a rejection; the store treats that
 * as "no shared jars" so personal jars keep working regardless.
 */
export async function fetchSharedJars(): Promise<SharedJarPayload[]> {
  return (await getClient().sharedJar.list.query()) as unknown as SharedJarPayload[];
}

/** Create a shared jar owned by the caller. Returns the new remote id. */
export async function createSharedJar(input: SharedJarFields): Promise<number> {
  const created = await getClient().sharedJar.create.mutate(input);
  return created.id;
}

/** Contribute to a shared jar. `amount` is integer minor units. */
export async function contributeToSharedJar(input: {
  jarId: number;
  amount: number;
  direction?: "deposit" | "withdrawal";
  note?: string;
}): Promise<void> {
  await getClient().sharedJar.contribute.mutate(input);
}

/** Owner-only: invite a member by account id. */
export async function inviteToSharedJar(jarId: number, userId: number): Promise<void> {
  await getClient().sharedJar.addMember.mutate({ jarId, userId });
}

/** Owner-only: rename, retarget, restyle. */
export async function updateSharedJar(
  jarId: number,
  changes: Partial<SharedJarFields>,
): Promise<void> {
  await getClient().sharedJar.update.mutate({ jarId, ...changes });
}

/** Owner-only, destructive. */
export async function deleteSharedJar(jarId: number): Promise<void> {
  await getClient().sharedJar.remove.mutate({ jarId });
}

/* -------------------------------------------------------------------------- */
/* Invites                                                                     */
/* -------------------------------------------------------------------------- */

/** What an invite link looks like to the person holding it. */
export type InvitePreview =
  | { ok: false; reason: "missing" | "expired" | "used-up" | "revoked"; message: string }
  | {
      ok: true;
      jar: { name: string; icon: string; accent: string; kind: "goal" | "habit"; target: number };
      members: number;
      inviterName: string | null;
    };

/** A minted invite, as the owner sees it in the share sheet. */
export type MintedInvite = { token: string; expiresAt: Date; maxUses: number; uses: number };

/** An invite the owner has already sent, for the management list. */
export type ListedInvite = {
  token: string;
  status: InviteStatus;
  expiresAt: Date;
  maxUses: number;
  uses: number;
  createdAt: Date;
};

/** Owner-only: mint a new invite link for a jar. */
export async function createInvite(jarId: number, options?: { maxUses?: number; expiresInDays?: number }): Promise<MintedInvite> {
  const created = await getClient().sharedJar.createInvite.mutate({
    jarId,
    maxUses: options?.maxUses ?? 0,
    expiresInDays: options?.expiresInDays,
  });
  return created as unknown as MintedInvite;
}

/** Owner-only: every invite minted for this jar. */
export async function listInvites(jarId: number): Promise<ListedInvite[]> {
  return (await getClient().sharedJar.listInvites.query({ jarId })) as unknown as ListedInvite[];
}

/** Owner-only: cancel an invite that has already been sent. */
export async function revokeInvite(jarId: number, token: string): Promise<void> {
  await getClient().sharedJar.revokeInvite.mutate({ jarId, token });
}

/**
 * Public: what the holder of a link sees before accepting.
 *
 * Runs without a session so the join screen can show the jar's name before the
 * recipient signs in, which is usually the moment they decide to.
 */
export async function previewInvite(token: string): Promise<InvitePreview> {
  return (await getClient().sharedJar.previewInvite.query({ token })) as unknown as InvitePreview;
}

/** Join a jar through an invite token. Idempotent for existing members. */
export async function joinInvite(token: string): Promise<{ jarId: number; alreadyMember: boolean }> {
  return (await getClient().sharedJar.joinInvite.mutate({ token })) as unknown as {
    jarId: number;
    alreadyMember: boolean;
  };
}

