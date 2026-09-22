/**
 * Exercises `sharedJar.importPersonal` end to end through a tRPC caller.
 *
 * The repository boundary (`getDb`) is stubbed rather than a live Postgres
 * server, which nothing in this workspace can start. What is exercised is everything
 * except SQL itself: the router's input validation, the owner/retry policy, the
 * transaction's all-or-nothing ordering, and the opening-balance adjustment.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const transaction = vi.fn();
const getDb = vi.fn<() => Promise<{ transaction: unknown } | null>>(
  async () => ({ transaction }),
);

vi.mock("../server/db", () => ({ getDb: () => getDb() }));

import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "../server/_core/context";
import { appRouter } from "../server/routers";
import {
  openingAdjustment,
  type PersonalShareInput,
} from "../shared/personal-share";

const t = initTRPC.context<TrpcContext>().create({ transformer: superjson });

const now = new Date();
const user = {
  id: 7,
  supabaseUserId: "00000000-0000-0000-0000-000000000007",
  name: "Smoke",
  email: null,
  loginMethod: null,
  role: "user" as const,
  createdAt: now,
  updatedAt: now,
  lastSignedIn: now,
};

function caller() {
  return t.createCallerFactory(appRouter)({
    user: { ...user },
    req: { headers: {} } as never,
    res: {} as never,
  });
}

let calls: { table: unknown; values: unknown }[] = [];
let nextInsertId = 500;

/**
 * A transaction stub that records inserts and answers selects from `existing`.
 *
 * Inserts answer through `RETURNING` rather than MySQL's `insertId`, which is
 * how the production code reads a generated id now. `onConflictDoNothing` is
 * part of the chain on both the jar and membership inserts, so the builder has
 * to carry it as well.
 */
function resetTx(existing: unknown[] = []) {
  calls = [];
  transaction
    .mockReset()
    .mockImplementation(async (work: (tx: unknown) => Promise<unknown>) => {
      const insert = vi.fn().mockImplementation((table: unknown) => ({
        values: (values: unknown) => {
          calls.push({ table, values });
          const rows = [{ id: nextInsertId }];
          const builder = {
            returning: () => Promise.resolve(rows),
            onConflictDoNothing: () => builder,
          };
          return builder;
        },
      }));
      const tx = {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: () => Promise.resolve(existing),
            }),
          }),
        }),
        insert,
      };
      return work(tx);
    });
}

const snapshot = (
  overrides: Partial<PersonalShareInput> = {},
): PersonalShareInput => ({
  sourceLocalId: "jar-1",
  name: "Bike fund",
  icon: "🚲",
  accent: "mint",
  kind: "goal",
  target: 500_00,
  balance: 120_00,
  createdAt: "2026-02-01T00:00:00.000Z",
  milestonesHit: [25],
  entries: [
    {
      amount: 100_00,
      direction: "deposit",
      at: "2026-02-02T00:00:00.000Z",
      note: "start",
    },
    { amount: 30_00, direction: "withdrawal", at: "2026-02-03T00:00:00.000Z" },
    {
      amount: 50_00,
      direction: "deposit",
      at: "2026-02-04T00:00:00.000Z",
      source: "recurring",
    },
  ],
  ...overrides,
});

beforeEach(() => {
  nextInsertId = 500;
  resetTx();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("sharedJar.importPersonal", () => {
  it("creates the jar, its owner membership, and every entry in one transaction", async () => {
    const result = await caller().sharedJar.importPersonal(snapshot());
    expect(result).toEqual({ jarId: 500, created: true, entryCount: 3 });
    expect(transaction).toHaveBeenCalledTimes(1);
    // Three inserts: the jar row, the owner membership row, the entry batch.
    expect(calls).toHaveLength(3);
  });

  it("keeps each entry's amount, direction, note and original timestamp", async () => {
    await caller().sharedJar.importPersonal(snapshot());
    const entryInsert = calls[2].values as Record<string, unknown>[];
    expect(entryInsert).toHaveLength(3);
    expect(entryInsert[0]).toMatchObject({
      amount: 100_00,
      direction: "deposit",
      note: "start",
      source: "manual",
    });
    expect(entryInsert[1]).toMatchObject({
      amount: 30_00,
      direction: "withdrawal",
      source: "manual",
    });
    expect(entryInsert[2]).toMatchObject({
      amount: 50_00,
      source: "recurring",
    });
    // History dates travel intact rather than being reset to import time.
    expect((entryInsert[0].createdAt as Date).toISOString()).toBe(
      "2026-02-02T00:00:00.000Z",
    );
  });

  it("carries jar metadata, including the idempotency key", async () => {
    await caller().sharedJar.importPersonal(
      snapshot({ deadline: "2026-12-25", streak: 4 }),
    );
    const jarRow = calls[0].values as Record<string, unknown>;
    expect(jarRow).toMatchObject({
      ownerId: 7,
      sourceLocalId: "jar-1",
      name: "Bike fund",
      icon: "🚲",
      accent: "mint",
      kind: "goal",
      target: 500_00,
      deadline: "2026-12-25",
      streak: 4,
    });
    // The owner becomes the jar's first member, so authorisation works at once.
    const memberRow = calls[1].values as Record<string, unknown>;
    expect(memberRow).toMatchObject({
      jarId: 500,
      userId: 7,
      displayName: "Smoke",
    });
  });

  it("omits the opening contribution when history explains the balance", async () => {
    const explained = snapshot({ balance: 100_00 - 30_00 + 50_00 });
    const result = await caller().sharedJar.importPersonal(explained);
    expect(result).toEqual({ jarId: 500, created: true, entryCount: 3 });
    const rows = calls[2].values as unknown[];
    expect(rows).toHaveLength(3);
  });

  it("adds an explicit opening contribution for a legacy balance", async () => {
    // 150 − (100 − 30 + 50) = 30 of unexplained balance.
    const result = await caller().sharedJar.importPersonal(
      snapshot({ balance: 150_00 }),
    );
    expect(result).toEqual({ jarId: 500, created: true, entryCount: 4 });
    const rows = calls[2].values as Record<string, unknown>[];
    expect(rows[0]).toMatchObject({
      amount: 30_00,
      direction: "deposit",
      note: "Opening balance",
    });
    // Dated at the jar's creation so the ledger still reads in order.
    expect((rows[0].createdAt as Date).toISOString()).toBe(
      "2026-02-01T00:00:00.000Z",
    );
  });

  it("returns the existing jar on retry instead of duplicating history", async () => {
    resetTx([{ id: 321 }]);
    const result = await caller().sharedJar.importPersonal(snapshot());
    expect(result).toEqual({ jarId: 321, created: false, entryCount: 0 });
    expect(calls).toHaveLength(0);
  });

  it("rejects a snapshot whose history exceeds its balance", async () => {
    await expect(
      caller().sharedJar.importPersonal(snapshot({ balance: 10_00 })),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated caller", async () => {
    const anon = t.createCallerFactory(appRouter)({
      user: null,
      req: { headers: {} } as never,
      res: {} as never,
    });
    await expect(
      anon.sharedJar.importPersonal(snapshot()),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("surfaces a missing database as a precondition failure", async () => {
    getDb.mockResolvedValue(null);
    await expect(
      caller().sharedJar.importPersonal(snapshot()),
    ).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
    getDb.mockResolvedValue({ transaction });
  });

  it("fails cleanly when the jar insert returns no id", async () => {
    transaction.mockImplementation(
      async (work: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          select: () => ({
            from: () => ({
              where: () => ({ limit: () => Promise.resolve([]) }),
            }),
          }),
          insert: () => ({
            values: () => ({
              returning: () => Promise.resolve([]),
              onConflictDoNothing: () => ({
                returning: () => Promise.resolve([]),
              }),
            }),
          }),
        };
        return work(tx);
      },
    );
    await expect(
      caller().sharedJar.importPersonal(snapshot()),
    ).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
  });
});

describe("openingAdjustment", () => {
  it("never returns a negative adjustment for a consistent jar", () => {
    const input = snapshot();
    expect(openingAdjustment(input)).toBe(0);
  });
});
