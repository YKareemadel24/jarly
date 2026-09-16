import { describe, expect, it, vi } from "vitest";

import {
  type SharedJarPayload,
  isSharedJar,
  mergeJars,
  remoteIdFromLocalId,
  sharedJarLocalId,
  sharedJarToJar,
} from "../lib/shared-jars";
import { type Jar } from "../lib/savings-core";

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: { getItem: vi.fn(), setItem: vi.fn(), multiGet: vi.fn() },
}));

const payload = (overrides: Partial<SharedJarPayload> = {}): SharedJarPayload => ({
  id: 7,
  name: "Japan 2027",
  icon: "🗾",
  accent: "berry",
  kind: "goal",
  target: 600_000,
  createdAt: "2026-01-05T00:00:00.000Z",
  balance: 218_000,
  totalDeposited: 218_000,
  progress: 36,
  depositCount: 2,
  members: [
    { userId: 1, displayName: "You", contributed: 124_000, you: true, isOwner: true },
    { userId: 2, displayName: "Mia", contributed: 94_000, you: false },
  ],
  ...overrides,
});

const localJar = (id: string): Jar => ({
  id,
  name: `Local ${id}`,
  balance: 100,
  target: 1000,
  accent: "mint",
  icon: "🫙",
  kind: "goal",
  createdAt: "2026-01-01T00:00:00.000Z",
  milestonesHit: [],
  entries: [],
});

describe("shared jar ids", () => {
  it("prefixes remote ids so they cannot collide with local jars", () => {
    expect(sharedJarLocalId(7)).toBe("shared-7");
  });

  it("round-trips a remote id", () => {
    expect(remoteIdFromLocalId(sharedJarLocalId(42))).toBe(42);
  });

  it("rejects ids that are not shared", () => {
    expect(remoteIdFromLocalId("jar-123")).toBeUndefined();
    expect(remoteIdFromLocalId("shared-abc")).toBeUndefined();
    expect(remoteIdFromLocalId("shared--5")).toBeUndefined();
    expect(remoteIdFromLocalId("shared-0")).toBeUndefined();
  });

  it("detects shared jars by remoteId", () => {
    expect(isSharedJar({ remoteId: "7" })).toBe(true);
    expect(isSharedJar({})).toBe(false);
    expect(isSharedJar({ remoteId: "" })).toBe(false);
  });
});

describe("sharedJarToJar", () => {
  it("carries the server-derived balance rather than recomputing it", () => {
    const jar = sharedJarToJar(payload());
    expect(jar.balance).toBe(218_000);
    expect(jar.remoteId).toBe("7");
    expect(jar.id).toBe("shared-7");
  });

  it("maps members with their shares and the viewer flag", () => {
    const jar = sharedJarToJar(payload());
    expect(jar.members).toHaveLength(2);
    expect(jar.members?.[0]).toEqual({ id: "1", name: "You", contributed: 124_000, you: true, isOwner: true });
    expect(jar.members?.[1]?.you).toBe(false);
    expect(jar.members?.[1]?.isOwner).toBeFalsy();
  });

  it("attributes entries to a member display name", () => {
    const jar = sharedJarToJar(
      payload({
        entries: [
          { id: 1, userId: 2, amount: 50_000, direction: "deposit", note: "Bonus", createdAt: "2026-02-01T00:00:00.000Z" },
          { id: 2, userId: 1, amount: 10_000, direction: "withdrawal", note: null, createdAt: new Date("2026-03-01T00:00:00.000Z") },
        ],
      }),
    );
    expect(jar.entries[0]).toMatchObject({ id: "shared-entry-1", amount: 50_000, direction: "deposit", who: "Mia", note: "Bonus" });
    expect(jar.entries[1]).toMatchObject({ direction: "withdrawal", who: "You" });
    expect(jar.entries[1]?.note).toBeUndefined();
  });

  it("normalises Date timestamps to ISO strings", () => {
    const jar = sharedJarToJar(payload({ createdAt: new Date("2026-01-05T00:00:00.000Z") }));
    expect(jar.createdAt).toBe("2026-01-05T00:00:00.000Z");
  });

  it("falls back to a valid accent when the server sends an unknown one", () => {
    expect(sharedJarToJar(payload({ accent: "chartreuse" })).accent).toBe("ocean");
    expect(sharedJarToJar(payload({ accent: "coral" })).accent).toBe("coral");
  });

  it("leaves entries empty when the list payload omits them", () => {
    expect(sharedJarToJar(payload()).entries).toEqual([]);
  });

  it("does not invent local milestones for a server jar", () => {
    expect(sharedJarToJar(payload()).milestonesHit).toEqual([]);
  });

  it("keeps a zero-balance shared jar representable", () => {
    const jar = sharedJarToJar(payload({ balance: 0, progress: 0, depositCount: 0 }));
    expect(jar.balance).toBe(0);
    expect(jar.entries).toEqual([]);
  });
});

describe("mergeJars", () => {
  it("keeps personal jars first and appends shared ones", () => {
    const merged = mergeJars([localJar("a")], [sharedJarToJar(payload())]);
    expect(merged.map((jar) => jar.id)).toEqual(["a", "shared-7"]);
  });

  it("returns the local list untouched when there are no shared jars", () => {
    const local = [localJar("a"), localJar("b")];
    expect(mergeJars(local, [])).toEqual(local);
  });

  it("never drops a jar when both lists are populated", () => {
    expect(mergeJars([localJar("a"), localJar("b")], [sharedJarToJar(payload()), sharedJarToJar(payload({ id: 8 }))])).toHaveLength(4);
  });
});