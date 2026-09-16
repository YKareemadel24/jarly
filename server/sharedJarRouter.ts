/**
 * tRPC router for shared jars.
 *
 * Authorisation model: a shared jar is reachable only through a membership row.
 * The owner may rename/retarget/delete and manage members; every member may
 * contribute. Contribution author ids always come from the authenticated
 * context, never from client input.
 *
 * Invites are a second, narrower door: a bearer token grants exactly one thing,
 * membership of exactly one jar. It never reveals the jar's balance, entries or
 * members until the recipient has actually joined, and `previewInvite` exposes
 * only what someone needs to decide whether to tap Accept.
 */

import { randomBytes } from "node:crypto";

import { TRPCError } from "@trpc/server";

import { z } from "zod";

import { INVITE_ALPHABET, INVITE_TOKEN_LENGTH, INVITE_TTL_DAYS } from "../shared/invite-token";
import {
  SHARED_JAR_ACCENTS,
  inviteStatus,
  inviteStatusMessage,
  sharedJarTotals,
  validateContribution,
} from "../shared/shared-jar";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import {
  addMember,
  addSharedEntry,
  consumeInvite,
  countMembers,
  createInvite,
  createSharedJar,
  deleteSharedJar,
  findInviteByToken,
  findJarById,
  findUserById,
  getSharedJar,
  isMember,
  listInvites,
  listSharedJars,
  removeMember,
  revokeInvite,
  updateSharedJar,
} from "./shared-jars-db";

/** Money crosses the wire as integer minor units. */
const amountSchema = z.number().int().positive().max(1_000_000_000);

const accentSchema = z.enum(SHARED_JAR_ACCENTS);

const jarIdSchema = z.number().int().positive();

function requireDb<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Shared jars need a database connection." });
  }
  return value;
}

const inviteTokenSchema = z.string().trim().min(8).max(64);

/**
 * Mint a token from the ambiguity-free alphabet. `randomBytes` is rejection
 * sampled rather than modulo-biased, so every character is equally likely.
 */
function newInviteToken(): string {
  const bytes = randomBytes(INVITE_TOKEN_LENGTH * 2);
  let token = "";
  for (let index = 0; index < bytes.length && token.length < INVITE_TOKEN_LENGTH; index += 1) {
    const byte = bytes[index];
    // Discard the bytes above the largest whole multiple of the alphabet that
    // still fits in a byte. Folding the rest with `%` would make the first few
    // characters slightly likelier than the others; throwing those bytes away
    // keeps every character equally probable.
    if (byte >= INVITE_ALPHABET.length * Math.floor(256 / INVITE_ALPHABET.length)) continue;
    token += INVITE_ALPHABET[byte % INVITE_ALPHABET.length];
  }
  // Astronomically unlikely, but a short read must not produce a short token.
  while (token.length < INVITE_TOKEN_LENGTH) {
    token += INVITE_ALPHABET[Math.floor(Math.random() * INVITE_ALPHABET.length)];
  }
  return token;
}

function inviteExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + INVITE_TTL_DAYS * 86_400_000);
}


/** Live member count and owner name, used by both the preview and the join reply. */
async function jarSummary(jarId: number) {
  const jar = await findJarById(jarId);
  if (!jar) return undefined;
  const [owner, members] = await Promise.all([findUserById(jar.ownerId), countMembers(jarId)]);
  return { jar, ownerName: owner?.name ?? null, members };
}

export const sharedJarRouter = router({
  /** Every shared jar the caller belongs to, with derived balances and member shares. */
  list: protectedProcedure.query(async ({ ctx }) => {
    const views = await listSharedJars(ctx.user.id);
    return views.map((view) => ({
      ...view.jar,
      ...sharedJarTotals(view.jar, view.members, view.entries, ctx.user.id),
    }));
  }),

  /** One jar, or NOT_FOUND when the caller is not a member. */
  get: protectedProcedure.input(z.object({ jarId: jarIdSchema })).query(async ({ ctx, input }) => {
    const view = await getSharedJar(input.jarId, ctx.user.id);
    if (!view) {
      throw new TRPCError({ code: "NOT_FOUND", message: "That shared jar is not available to you." });
    }
    return {
      ...view.jar,
      ...sharedJarTotals(view.jar, view.members, view.entries, ctx.user.id),
      entries: view.entries,
    };
  }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().trim().min(1).max(120),
        icon: z.string().trim().min(1).max(16).default("🫙"),
        accent: accentSchema.default("ocean"),
        kind: z.enum(["goal", "habit"]).default("goal"),
        target: amountSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const created = requireDb(
        await createSharedJar({ ...input, ownerId: ctx.user.id }, ctx.user.name ?? "You"),
      );
      return created;
    }),

  /** Contribute. Withdrawals are validated against the live derived balance. */
  contribute: protectedProcedure
    .input(
      z.object({
        jarId: jarIdSchema,
        amount: amountSchema,
        direction: z.enum(["deposit", "withdrawal"]).default("deposit"),
        note: z.string().trim().max(200).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const view = await getSharedJar(input.jarId, ctx.user.id);
      if (!view) {
        throw new TRPCError({ code: "NOT_FOUND", message: "That shared jar is not available to you." });
      }

      // Recompute server-side; never trust a client-supplied balance.
      const totals = sharedJarTotals(view.jar, view.members, view.entries, ctx.user.id);
      const problem = validateContribution(input.amount, input.direction, totals.balance);
      if (problem) {
        throw new TRPCError({ code: "BAD_REQUEST", message: problem });
      }

      const entry = requireDb(
        await addSharedEntry({
          jarId: input.jarId,
          userId: ctx.user.id,
          amount: input.amount,
          direction: input.direction,
          note: input.note,
        }),
      );

      const refreshed = await getSharedJar(input.jarId, ctx.user.id);
      return {
        entry,
        totals: refreshed ? sharedJarTotals(refreshed.jar, refreshed.members, refreshed.entries, ctx.user.id) : totals,
      };
    }),

  /** Owner-only: rename, retarget, restyle. */
  update: protectedProcedure
    .input(
      z.object({
        jarId: jarIdSchema,
        name: z.string().trim().min(1).max(120).optional(),
        icon: z.string().trim().min(1).max(16).optional(),
        accent: accentSchema.optional(),
        kind: z.enum(["goal", "habit"]).optional(),
        target: amountSchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const view = await getSharedJar(input.jarId, ctx.user.id);
      if (!view) {
        throw new TRPCError({ code: "NOT_FOUND", message: "That shared jar is not available to you." });
      }
      if (view.jar.ownerId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only the jar's owner can change it." });
      }
      const { jarId, ...changes } = input;
      await updateSharedJar(jarId, changes);
      return { success: true } as const;
    }),

  /** Owner-only: add a member by account id. */
  addMember: protectedProcedure
    .input(z.object({ jarId: jarIdSchema, userId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const view = await getSharedJar(input.jarId, ctx.user.id);
      if (!view) {
        throw new TRPCError({ code: "NOT_FOUND", message: "That shared jar is not available to you." });
      }
      if (view.jar.ownerId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only the jar's owner can invite people." });
      }
      if (input.userId === ctx.user.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "You are already on this jar." });
      }
      if (!(await isMember(input.jarId, input.userId))) {
        const account = await findUserById(input.userId);
        if (!account) {
          throw new TRPCError({ code: "NOT_FOUND", message: "No account with that id." });
        }
        await addMember(input.jarId, input.userId, account.name ?? `Member ${account.id}`);
      }
      return { success: true } as const;
    }),

  /** Owner-only: remove someone else; any member may remove themselves. */
  removeMember: protectedProcedure
    .input(z.object({ jarId: jarIdSchema, userId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const view = await getSharedJar(input.jarId, ctx.user.id);
      if (!view) {
        throw new TRPCError({ code: "NOT_FOUND", message: "That shared jar is not available to you." });
      }
      const removingSelf = input.userId === ctx.user.id;
      if (!removingSelf && view.jar.ownerId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only the jar's owner can remove other people." });
      }
      await removeMember(input.jarId, input.userId);
      return { success: true } as const;
    }),

  /** Owner-only, and destructive. */
  remove: protectedProcedure.input(z.object({ jarId: jarIdSchema })).mutation(async ({ ctx, input }) => {
    const view = await getSharedJar(input.jarId, ctx.user.id);
    if (!view) {
      throw new TRPCError({ code: "NOT_FOUND", message: "That shared jar is not available to you." });
    }
    if (view.jar.ownerId !== ctx.user.id) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Only the jar's owner can delete it." });
    }
    await deleteSharedJar(input.jarId);
    return { success: true } as const;
  }),

  /* ---------------------------------------------------------------------- */
  /* Invites                                                                */
  /* ---------------------------------------------------------------------- */

  /**
   * Owner-only: mint a fresh invite link for a jar.
   *
   * Returns the bare token rather than a URL: only the client knows whether the
   * recipient should get a web link or an app deep link, so the client builds
   * the string it will actually show.
   */
  createInvite: protectedProcedure
    .input(
      z.object({
        jarId: jarIdSchema,
        /** Zero (the default) means the link can be used by anyone who gets it. */
        maxUses: z.number().int().min(0).max(500).default(0),
        /** Override the default lifetime, in days. */
        expiresInDays: z.number().int().min(1).max(365).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const view = await getSharedJar(input.jarId, ctx.user.id);
      if (!view) {
        throw new TRPCError({ code: "NOT_FOUND", message: "That shared jar is not available to you." });
      }
      if (view.jar.ownerId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only the jar's owner can invite people." });
      }

      const expiresAt = input.expiresInDays
        ? new Date(Date.now() + input.expiresInDays * 86_400_000)
        : inviteExpiry();

      // A unique-index collision is the only realistic failure, and a fresh
      // token makes it vanish. Three attempts is beyond generous.
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const created = await createInvite({
          jarId: input.jarId,
          token: newInviteToken(),
          createdBy: ctx.user.id,
          expiresAt,
          maxUses: input.maxUses,
        });
        if (created) {
          return {
            token: created.token,
            expiresAt: created.expiresAt,
            maxUses: created.maxUses,
            uses: created.uses,
          };
        }
      }
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Could not create an invite just now. Try again." });
    }),

  /** Owner-only: every invite ever minted for this jar, newest first. */
  listInvites: protectedProcedure.input(z.object({ jarId: jarIdSchema })).query(async ({ ctx, input }) => {
    const view = await getSharedJar(input.jarId, ctx.user.id);
    if (!view) {
      throw new TRPCError({ code: "NOT_FOUND", message: "That shared jar is not available to you." });
    }
    if (view.jar.ownerId !== ctx.user.id) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Only the jar's owner can see its invites." });
    }
    const invites = await listInvites(input.jarId);
    return invites.map((invite) => ({
      token: invite.token,
      status: inviteStatus(invite),
      expiresAt: invite.expiresAt,
      maxUses: invite.maxUses,
      uses: invite.uses,
      createdAt: invite.createdAt,
    }));
  }),

  /** Owner-only: cancel a link that has already been sent. */
  revokeInvite: protectedProcedure
    .input(z.object({ jarId: jarIdSchema, token: inviteTokenSchema }))
    .mutation(async ({ ctx, input }) => {
      const view = await getSharedJar(input.jarId, ctx.user.id);
      if (!view) {
        throw new TRPCError({ code: "NOT_FOUND", message: "That shared jar is not available to you." });
      }
      if (view.jar.ownerId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only the jar's owner can cancel an invite." });
      }
      const invite = await findInviteByToken(input.token);
      if (!invite || invite.jarId !== input.jarId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "That invite no longer exists." });
      }
      await revokeInvite(invite.id);
      return { success: true } as const;
    }),

  /**
   * Public: what someone sees before they accept.
   *
   * Deliberately thin — the jar's name, look and member count, and the inviter's
   * name. No balance, no entries, no member list. A leaked token should tell a
   * stranger almost nothing, and nothing at all about anyone's money.
   */
  previewInvite: publicProcedure.input(z.object({ token: inviteTokenSchema })).query(async ({ input }) => {
    const invite = await findInviteByToken(input.token);
    if (!invite) {
      return { ok: false as const, reason: "missing" as const, message: "That invite link is not valid." };
    }

    const status = inviteStatus(invite);
    if (status !== "open") {
      return { ok: false as const, reason: status, message: inviteStatusMessage(status) };
    }

    const summary = await jarSummary(invite.jarId);
    if (!summary) {
      return { ok: false as const, reason: "missing" as const, message: "That jar no longer exists." };
    }

    return {
      ok: true as const,
      jar: {
        name: summary.jar.name,
        icon: summary.jar.icon,
        accent: summary.jar.accent,
        kind: summary.jar.kind,
        target: summary.jar.target,
      },
      members: summary.members,
      inviterName: summary.ownerName,
    };
  }),

  /**
   * Join a jar through an invite token.
   *
   * Idempotent by design: someone who taps the same link twice, or who was
   * already invited by account id, ends up a member rather than seeing an error.
   * Only a genuinely new membership consumes a use.
   */
  joinInvite: protectedProcedure.input(z.object({ token: inviteTokenSchema })).mutation(async ({ ctx, input }) => {
    const invite = await findInviteByToken(input.token);
    if (!invite) {
      throw new TRPCError({ code: "NOT_FOUND", message: "That invite link is not valid." });
    }

    // Already in? Re-read the status so a used-up link still succeeds for the
    // person who used it, instead of failing on their second tap.
    if (await isMember(invite.jarId, ctx.user.id)) {
      return { jarId: invite.jarId, alreadyMember: true } as const;
    }

    const status = inviteStatus(invite);
    if (status !== "open") {
      throw new TRPCError({ code: "BAD_REQUEST", message: inviteStatusMessage(status) });
    }

    const summary = await jarSummary(invite.jarId);
    if (!summary) {
      throw new TRPCError({ code: "NOT_FOUND", message: "That jar no longer exists." });
    }

    await addMember(invite.jarId, ctx.user.id, ctx.user.name ?? `Member ${ctx.user.id}`);
    await consumeInvite(invite.id);

    return { jarId: invite.jarId, alreadyMember: false } as const;
  }),
});