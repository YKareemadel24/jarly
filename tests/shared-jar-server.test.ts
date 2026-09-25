/**
 * Exercises the transactional shared-jar money paths — `contribute` and
 * `joinInvite` — end to end through a tRPC caller.
 *
 * `getDb` is stubbed rather than a live Postgres server, which nothing in this
 * workspace can start. What is exercised is everything except SQL itself:
 * router input validation, membership/ownership policy, the locked
 * transaction's validation order, idempotent joins, and use-count consumption.
 * The stub records writes and applies inserts to the fixture state, so a
 * post-write read-back sees exactly what committed.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const getDb = vi.fn<() => Promise<unknown>>();

vi.mock("../server/db", () => ({ getDb: () => getDb() }));

import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "../server/_core/context";
import { appRouter } from "../server/routers";
import {
  sharedJarEntries,
  sharedJarInvites,
  sharedJarMembers,
  sharedJars,
} from "../drizzle/schema";
import {
  sharedJarTotals,
  sharedJarTotalsFromAggregates,
} from "../shared/shared-jar";

const t = initTRPC.context<TrpcContext>().create({ transformer: superjson });

const now = new Date();
const owner = {
  id: 7,
  supabaseUserId: "00000000-0000-0000-0000-000000000007",
  name: "Owner",
  email: null,
  loginMethod: null,
  role: "user" as const,
  createdAt: now,
  updatedAt: now,
  lastSignedIn: now,
};
const mate = {
  ...owner,
  id: 9,
  name: "Mate",
  supabaseUserId: "00000000-0000-0000-0000-000000000009",
};
const stranger = {
  ...owner,
  id: 99,
  name: "Stranger",
  supabaseUserId: "00000000-0000-0000-0000-000000000099",
};

function callerFor(user: typeof owner | null) {
  return t.createCallerFactory(appRouter)({
    user,
    req: { headers: {} } as never,
    res: {} as never,
  });
}

type FixtureState = {
  jars: Record<string, unknown>[];
  members: Record<string, unknown>[];
  entries: Record<string, unknown>[];
  aggregates: Record<string, unknown>[];
  invites: Record<string, unknown>[];
};

function baseState(): FixtureState {
  return {
    jars: [
      {
        id: 42,
        ownerId: 7,
        sourceLocalId: null,
        name: "Trip",
        icon: "✈️",
        accent: "ocean",
        kind: "goal",
        target: 1000_00,
        deadline: null,
        streak: null,
        lastDepositAt: null,
        createdAt: now,
        updatedAt: now,
      },
    ],
    members: [
      { id: 1, jarId: 42, userId: 7, displayName: "Owner", joinedAt: now },
      { id: 2, jarId: 42, userId: 9, displayName: "Mate", joinedAt: now },
    ],
    entries: [
      {
        id: 1,
        jarId: 42,
        userId: 7,
        amount: 200_00,
        direction: "deposit",
        source: "manual",
        note: null,
        createdAt: now,
      },
    ],
    aggregates: [
      { jarId: 42, userId: 7, direction: "deposit", total: 200_00, count: 1 },
    ],
    invites: [
      {
        id: 5,
        jarId: 42,
        token: "B".repeat(22),
        createdBy: 7,
        expiresAt: new Date(now.getTime() + 86_400_000),
        maxUses: 1,
        uses: 0,
        revoked: false,
        createdAt: now,
      },
    ],
  };
}

/** Rows a select should answer with, by table (and by shape for entries). */
function rowsFor(
  state: FixtureState,
  table: unknown,
  fields: unknown,
): unknown[] {
  if (table === sharedJars) return state.jars;
  if (table === sharedJarMembers) return state.members;
  if (table === sharedJarInvites) return state.invites;
  // A field-ful select of entries is the aggregate; a bare one is the log.
  if (table === sharedJarEntries)
    return fields ? state.aggregates : state.entries;
  return [];
}

/**
 * Bound values of a drizzle condition, in order. `eq(col, x)` compiles to a
 * SQL object whose queryChunks end in a Param carrying x; `and()` nests those,
 * so a recursive walk recovers [jarId, userId] from the membership probe.
 */
function conditionValues(condition: unknown): unknown[] {
  const values: unknown[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    if ("value" in record && "encoder" in record) {
      values.push(record.value);
      return;
    }
    if (Array.isArray(record.queryChunks)) record.queryChunks.forEach(walk);
  };
  walk(condition);
  return values;
}

/** Rows for a where clause, honouring the membership probe's (jarId, userId). */
function rowsMatching(
  state: FixtureState,
  table: unknown,
  fields: unknown,
  condition: unknown,
): unknown[] {
  const rows = rowsFor(state, table, fields);
  if (table === sharedJarMembers && fields) {
    const [jarId, userId] = conditionValues(condition) as [number, number];
    return rows.filter(
      (m) =>
        (m as { jarId: number; userId: number }).jarId === jarId &&
        (m as { jarId: number; userId: number }).userId === userId,
    );
  }
  return rows;
}

/** A thenable that also carries the query-builder terminals the code chains. */
function chain(rows: unknown[]): Promise<unknown[]> {
  const promise = Promise.resolve(rows);
  return Object.assign(promise, {
    limit: () => Promise.resolve(rows),
    for: () => Promise.resolve(rows),
    groupBy: () => Promise.resolve(rows),
    orderBy: () => chain(rows),
  }) as Promise<unknown[]>;
}
function makeDb(state: FixtureState) {
  const recorded = {
    insertedEntries: [] as Record<string, unknown>[],
    insertedMembers: [] as Record<string, unknown>[],
    updatedInvites: [] as unknown[],
    // Tables passed to db.delete(); the stub cannot evaluate the where clause,
    // so tests assert which tables were targeted, not which rows.
    deletedTables: [] as unknown[],
  };

  const select = (fields?: unknown) => ({
    from: (table: unknown) => ({
      where: (condition?: unknown) =>
        chain(rowsMatching(state, table, fields, condition)),
    }),
  });

  const insert = (table: unknown) => ({
    values: (values: unknown) => {
      const rows = (Array.isArray(values) ? values : [values]) as Record<
        string,
        unknown
      >[];
      if (table === sharedJarEntries) {
        for (const value of rows) {
          const row: Record<string, unknown> = {
            id: 900 + state.entries.length,
            ...value,
          };
          state.entries.push(row);
          recorded.insertedEntries.push(row);
          // Keep the aggregate honest, so a post-write read-back sees the insert.
          const aggregate = state.aggregates.find(
            (a) =>
              a.jarId === row.jarId &&
              a.userId === row.userId &&
              a.direction === row.direction,
          ) as { total: number; count: number } | undefined;
          if (aggregate) {
            aggregate.total += row.amount as number;
            aggregate.count += 1;
          } else {
            state.aggregates.push({
              jarId: row.jarId,
              userId: row.userId,
              direction: row.direction,
              total: row.amount,
              count: 1,
            });
          }
        }
      }
      if (table === sharedJarMembers) {
        for (const value of rows) {
          state.members.push({ id: 800 + state.members.length, ...value });
          recorded.insertedMembers.push(value);
        }
      }
      const builder = {
        returning: () => Promise.resolve(state.entries.slice(-rows.length)),
      };
      return Object.assign(builder, { onConflictDoNothing: () => builder });
    },
  });

  const update = (table: unknown) => ({
    set: (values: unknown) => ({
      where: () => {
        if (table === sharedJarInvites) recorded.updatedInvites.push(values);
        return Promise.resolve();
      },
    }),
  });

  const remove = (table: unknown) => ({
    where: () => {
      recorded.deletedTables.push(table);
      return Promise.resolve();
    },
  });

  const db = {
    select,
    insert,
    update,
    delete: remove,
    transaction: async (work: (tx: unknown) => Promise<unknown>) =>
      work({ select, insert, update, delete: remove }),
  };
  return { db, recorded };
}

let state: FixtureState;
let recorded: ReturnType<typeof makeDb>["recorded"];

beforeEach(() => {
  state = baseState();
  const made = makeDb(state);
  recorded = made.recorded;
  getDb.mockReset().mockImplementation(async () => made.db);
});

describe("sharedJar.contribute", () => {
  it("applies a member deposit and returns updated totals", async () => {
    const result = await callerFor(mate).sharedJar.contribute({
      jarId: 42,
      amount: 50_00,
    });
    expect(recorded.insertedEntries).toHaveLength(1);
    expect(recorded.insertedEntries[0]).toMatchObject({
      jarId: 42,
      userId: 9,
      amount: 50_00,
      direction: "deposit",
    });
    // The read-back now sees the committed insert: 200 + 50.
    expect(result.totals.balance).toBe(250_00);
  });

  it("lets the owner withdraw within the balance", async () => {
    const result = await callerFor(owner).sharedJar.contribute({
      jarId: 42,
      amount: 80_00,
      direction: "withdrawal",
    });
    expect(recorded.insertedEntries[0]).toMatchObject({
      direction: "withdrawal",
      amount: 80_00,
    });
    expect(result.totals.balance).toBe(120_00);
  });

  it("forbids a non-owner member from withdrawing", async () => {
    await expect(
      callerFor(mate).sharedJar.contribute({
        jarId: 42,
        amount: 10_00,
        direction: "withdrawal",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(recorded.insertedEntries).toHaveLength(0);
  });

  it("rejects an owner withdrawal that would overdraw the jar", async () => {
    await expect(
      callerFor(owner).sharedJar.contribute({
        jarId: 42,
        amount: 500_00,
        direction: "withdrawal",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(recorded.insertedEntries).toHaveLength(0);
  });

  it("hides the jar from a non-member", async () => {
    await expect(
      callerFor(stranger).sharedJar.contribute({ jarId: 42, amount: 10_00 }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(recorded.insertedEntries).toHaveLength(0);
  });

  it("rejects an unauthenticated caller", async () => {
    await expect(
      callerFor(null).sharedJar.contribute({ jarId: 42, amount: 10_00 }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("sharedJar.joinInvite", () => {
  it("joins through an open invite and spends exactly one use", async () => {
    // Mate is not yet a member of this fixture's jar.
    state.members = state.members.filter((m) => m.userId !== 9);
    const result = await callerFor(mate).sharedJar.joinInvite({
      token: "B".repeat(22),
    });
    expect(result).toEqual({ jarId: 42, alreadyMember: false });
    expect(recorded.insertedMembers).toHaveLength(1);
    expect(recorded.updatedInvites).toHaveLength(1);
  });

  it("succeeds idempotently for an existing member without spending a use", async () => {
    const result = await callerFor(owner).sharedJar.joinInvite({
      token: "B".repeat(22),
    });
    expect(result).toEqual({ jarId: 42, alreadyMember: true });
    expect(recorded.insertedMembers).toHaveLength(0);
    expect(recorded.updatedInvites).toHaveLength(0);
  });

  it("rejects an expired invite", async () => {
    state.invites[0].expiresAt = new Date(now.getTime() - 1000);
    await expect(
      callerFor(stranger).sharedJar.joinInvite({ token: "B".repeat(22) }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("expired"),
    });
    expect(recorded.insertedMembers).toHaveLength(0);
  });

  it("rejects a used-up invite", async () => {
    state.invites[0].uses = 1;
    await expect(
      callerFor(stranger).sharedJar.joinInvite({ token: "B".repeat(22) }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("used"),
    });
    expect(recorded.insertedMembers).toHaveLength(0);
  });

  it("rejects an unknown token", async () => {
    state.invites = [];
    await expect(
      callerFor(stranger).sharedJar.joinInvite({ token: "C".repeat(22) }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects an unauthenticated caller", async () => {
    await expect(
      callerFor(null).sharedJar.joinInvite({ token: "B".repeat(22) }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("sharedJar.removeMember", () => {
  it("lets a member remove themself", async () => {
    await expect(
      callerFor(mate).sharedJar.removeMember({ jarId: 42, userId: 9 }),
    ).resolves.toEqual({ success: true });
    expect(recorded.deletedTables).toContain(sharedJarMembers);
  });

  it("lets the owner remove someone else", async () => {
    await expect(
      callerFor(owner).sharedJar.removeMember({ jarId: 42, userId: 9 }),
    ).resolves.toEqual({ success: true });
    expect(recorded.deletedTables).toContain(sharedJarMembers);
  });

  it("forbids a member from removing someone else", async () => {
    await expect(
      callerFor(mate).sharedJar.removeMember({ jarId: 42, userId: 7 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(recorded.deletedTables).toHaveLength(0);
  });

  it("refuses to let the owner leave; deleting is their exit", async () => {
    await expect(
      callerFor(owner).sharedJar.removeMember({ jarId: 42, userId: 7 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(recorded.deletedTables).toHaveLength(0);
  });

  it("hides the jar from a non-member", async () => {
    await expect(
      callerFor(stranger).sharedJar.removeMember({ jarId: 42, userId: 9 }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(recorded.deletedTables).toHaveLength(0);
  });

  it("rejects an unauthenticated caller", async () => {
    await expect(
      callerFor(null).sharedJar.removeMember({ jarId: 42, userId: 7 }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("sharedJar.remove", () => {
  it("lets the owner delete the jar and everything hanging off it", async () => {
    await expect(
      callerFor(owner).sharedJar.remove({ jarId: 42 }),
    ).resolves.toEqual({ success: true });
    expect(recorded.deletedTables).toEqual(
      expect.arrayContaining([sharedJarEntries, sharedJarMembers, sharedJars]),
    );
  });

  it("forbids a non-owner member from deleting it", async () => {
    await expect(
      callerFor(mate).sharedJar.remove({ jarId: 42 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(recorded.deletedTables).toHaveLength(0);
  });

  it("hides the jar from a non-member", async () => {
    await expect(
      callerFor(stranger).sharedJar.remove({ jarId: 42 }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(recorded.deletedTables).toHaveLength(0);
  });

  it("rejects an unauthenticated caller", async () => {
    await expect(
      callerFor(null).sharedJar.remove({ jarId: 42 }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("sharedJarTotalsFromAggregates", () => {
  it("agrees with the entry-by-entry derivation", () => {
    const jar = { target: 1000_00, ownerId: 7 };
    const members = [
      { userId: 7, displayName: "Owner" },
      { userId: 9, displayName: "Mate" },
    ];
    const entries = [
      {
        id: 1,
        userId: 7,
        amount: 200_00,
        direction: "deposit" as const,
        createdAt: now,
      },
      {
        id: 2,
        userId: 9,
        amount: 50_00,
        direction: "deposit" as const,
        createdAt: now,
      },
      {
        id: 3,
        userId: 7,
        amount: 30_00,
        direction: "withdrawal" as const,
        createdAt: now,
      },
    ];
    const aggregates = [
      { userId: 7, direction: "deposit" as const, total: 200_00, count: 1 },
      { userId: 9, direction: "deposit" as const, total: 50_00, count: 1 },
      { userId: 7, direction: "withdrawal" as const, total: 30_00, count: 1 },
    ];
    expect(sharedJarTotalsFromAggregates(jar, members, aggregates, 7)).toEqual(
      sharedJarTotals(jar, members, entries, 7),
    );
  });
});
