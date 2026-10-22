import { describe, expect, it } from "vitest";

import type { Jar } from "../lib/domain";
import { applyEntry, normaliseJar } from "../lib/domain/jar";
import { mergeTransferJars } from "../lib/transfer-merge";
import {
  decodeTransferFrames,
  encodeTransferFrames,
  type TransferSnapshot,
} from "../shared/transfer";

const jar: Jar = {
  id: "jar-a",
  name: "Trip",
  target: 10000,
  balance: 500,
  accent: "ocean",
  icon: "flight",
  kind: "goal",
  createdAt: "2026-01-01T00:00:00.000Z",
  milestonesHit: [],
  entries: [
    {
      id: "entry-a",
      amount: 500,
      direction: "deposit",
      at: "2026-01-02T00:00:00.000Z",
    },
  ],
};

const snapshot = (jars: Jar[]): TransferSnapshot => ({
  version: 1,
  exportedAt: "2026-01-03T00:00:00.000Z",
  currency: "USD",
  jars,
});

describe("transfer codec", () => {
  it("round-trips valid jars and their creation timestamp", () => {
    const decoded = decodeTransferFrames(encodeTransferFrames(snapshot([jar])));
    expect(decoded?.snapshot?.jars[0]).toMatchObject({
      id: jar.id,
      balance: 500,
      createdAt: jar.createdAt,
    });
  });

  it("rejects unsafe or fractional money before creating jars", () => {
    const invalid = { ...jar, balance: 1.5 } as Jar;
    const decoded = decodeTransferFrames(
      encodeTransferFrames(snapshot([invalid])),
    );
    expect(decoded?.snapshot).toBeUndefined();
    expect(decoded?.error).toBeDefined();
  });

  it("rejects frames from different transfer sessions", () => {
    const longJar = {
      ...jar,
      entries: Array.from({ length: 20 }, (_, index) => ({
        id: `entry-${index}`,
        amount: 25,
        direction: "deposit" as const,
        at: "2026-01-02T00:00:00.000Z",
        note: "x".repeat(80),
      })),
      balance: 500,
    };
    const first = encodeTransferFrames(snapshot([longJar]));
    const second = encodeTransferFrames(
      snapshot([{ ...longJar, name: "Other" }]),
    );
    expect(first.length).toBeGreaterThan(1);
    const decoded = decodeTransferFrames([first[0], ...second.slice(1)]);
    expect(decoded?.snapshot).toBeUndefined();
    expect(decoded?.error).toBeDefined();
  });

  it("rejects an unbounded frame count without iterating it", () => {
    expect(
      decodeTransferFrames(["JARLY1.abcdef.1.999999999999.x"]),
    ).toBeUndefined();
  });

  it("rejects duplicate jar IDs in one snapshot", () => {
    const decoded = decodeTransferFrames(
      encodeTransferFrames(snapshot([jar, { ...jar, name: "Duplicate" }])),
    );
    expect(decoded?.snapshot).toBeUndefined();
    expect(decoded?.error).toBeDefined();
  });

  it("preserves correction history, undo links, and personal reminders", () => {
    const audited: Jar = {
      ...jar,
      reminder: {
        enabled: true,
        hour: 18,
        minute: 30,
        weekdays: [1, 4],
        snoozedUntil: "2026-02-01T12:00:00.000Z",
      },
      entries: [
        {
          ...jar.entries[0],
          revisions: [
            {
              amount: 700,
              at: "2026-01-01T12:00:00.000Z",
              note: "Original",
              changedAt: "2026-01-02T12:00:00.000Z",
            },
          ],
        },
        {
          id: "reversal",
          amount: 500,
          direction: "withdrawal",
          at: "2026-01-03T00:00:00.000Z",
          undoOf: "entry-a",
        },
      ],
      balance: 0,
    };
    const restored = decodeTransferFrames(
      encodeTransferFrames(snapshot([audited])),
    )?.snapshot?.jars[0];
    expect(restored?.reminder).toEqual(audited.reminder);
    expect(restored?.entries[0]).toMatchObject({
      id: "entry-a",
      revisions: audited.entries[0].revisions,
    });
    expect(restored?.entries[1]).toMatchObject({
      id: "reversal",
      undoOf: "entry-a",
    });
  });

  it("rejects invalid reminder settings and fabricated undo history", () => {
    const invalidReminder = {
      ...jar,
      reminder: { enabled: true, hour: 25, minute: 0, weekdays: [1] },
    };
    expect(
      decodeTransferFrames(encodeTransferFrames(snapshot([invalidReminder])))
        ?.snapshot,
    ).toBeUndefined();
    const invalidUndo = {
      ...jar,
      entries: [{ ...jar.entries[0], undoOf: "missing" }],
    };
    expect(
      decodeTransferFrames(encodeTransferFrames(snapshot([invalidUndo])))
        ?.snapshot,
    ).toBeUndefined();
  });

  it("restores a migrated opening balance after later contributions", () => {
    const legacy = normaliseJar({ ...jar, balance: 5000, entries: [] });
    const updated = applyEntry(legacy, 2000, "deposit")!.jar;
    const restored = decodeTransferFrames(
      encodeTransferFrames(snapshot([updated])),
    )!.snapshot!.jars;
    const merged = mergeTransferJars([], restored);
    expect(merged.error).toBeUndefined();
    expect(merged.jars[0].balance).toBe(7000);
  });
});
