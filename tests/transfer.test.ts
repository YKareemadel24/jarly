import { describe, expect, it } from "vitest";

import type { Jar } from "../lib/domain";
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
});
