import { describe, expect, it } from "vitest";

import {
  createBackup,
  parseBackup,
  previewBackup,
  MAX_BACKUP_BYTES,
} from "../lib/backup";
import type { Jar } from "../lib/domain";
import { encodeTransferFrames } from "../shared/transfer";

const jar: Jar = {
  id: "trip",
  name: "Trip",
  target: 500,
  balance: 500,
  accent: "ocean",
  icon: "flight",
  kind: "goal",
  createdAt: "2026-01-01T00:00:00.000Z",
  milestonesHit: [100],
  archived: true,
  entries: [
    {
      id: "deposit",
      amount: 500,
      direction: "deposit",
      at: "2026-01-02T00:00:00.000Z",
      note: "Saved",
    },
  ],
};
const frames = (jars: Jar[], currency = "USD") =>
  encodeTransferFrames({
    version: 1,
    exportedAt: "2026-01-03T00:00:00.000Z",
    currency,
    jars,
  });

describe("file backups", () => {
  it("recognizes an unchanged local jar after optional flags round-trip", () => {
    const local: Jar = {
      ...jar,
      archived: undefined,
      recurring: {
        amount: 100,
        cadence: "weekly",
        nextDate: "2026-02-01",
        paused: false,
      },
    };
    const backup = parseBackup(createBackup(frames([local])));
    const result = previewBackup(backup, [local], "USD");
    expect(result.skipped).toBe(1);
    expect(result.error).toBeUndefined();
  });
  it("round-trips an empty backup with its currency and date", () => {
    const backup = parseBackup(createBackup(frames([])));
    expect(backup.snapshot.jars).toEqual([]);
    expect(backup.snapshot.currency).toBe("USD");
    expect(backup.snapshot.exportedAt).toBe("2026-01-03T00:00:00.000Z");
    expect(backup.summary).toMatchObject({
      jars: 0,
      entries: 0,
      totalMinor: "0",
    });
  });

  it("includes archived, completed and empty jars and preserves the original frames", () => {
    const original = frames([
      jar,
      { ...jar, id: "empty", balance: 0, entries: [], archived: false },
    ]);
    const backup = parseBackup(createBackup(original));
    expect(backup.frames).toEqual(original);
    expect(backup.snapshot.jars[0]).toMatchObject({
      archived: true,
      balance: 500,
      milestonesHit: [100],
    });
    expect(backup.summary).toEqual({
      jars: 2,
      entries: 1,
      archived: 1,
      totalMinor: "500",
    });
  });

  it.each([
    "not JSON",
    "null",
    "{}",
    JSON.stringify({ format: "jarly-backup", version: 2, frames: [] }),
    JSON.stringify({ format: "jarly-backup", version: 1, frames: ["no"] }),
  ])("rejects malformed or future content: %s", (text) => {
    expect(() => parseBackup(text)).toThrow();
  });

  it("rejects oversized content before parsing it", () => {
    expect(() => parseBackup(" ".repeat(MAX_BACKUP_BYTES + 1))).toThrow(
      /large/i,
    );
  });

  it("rejects stray invalid frames instead of silently ignoring damage", () => {
    const text = JSON.stringify({
      format: "jarly-backup",
      version: 1,
      frames: [...frames([]), "damaged frame"],
    });
    expect(() => parseBackup(text)).toThrow();
  });

  it("totals archived jars exactly when their combined balances exceed safe numbers", () => {
    const large = { ...jar, balance: Number.MAX_SAFE_INTEGER, entries: [] };
    const backup = parseBackup(
      createBackup(frames([large, { ...large, id: "other" }])),
    );
    expect(backup.summary.totalMinor).toBe("18014398509481982");
  });

  it("rejects missing frames, missing currency, and altered balances", () => {
    expect(() => createBackup(frames([jar]).slice(1))).toThrow();
    expect(() =>
      createBackup(
        encodeTransferFrames({
          version: 1,
          exportedAt: "2026-01-03T00:00:00.000Z",
          jars: [],
        }),
      ),
    ).toThrow(/currency/i);
    expect(() =>
      parseBackup(
        JSON.stringify({
          format: "jarly-backup",
          version: 1,
          frames: frames([{ ...jar, balance: 400 }]),
        }),
      ),
    ).toThrow(/balance/i);
  });

  it("previews an atomic merge and safely skips repeated restores", () => {
    const backup = parseBackup(createBackup(frames([jar])));
    const local = { ...jar, id: "local", entries: [] };
    const first = previewBackup(backup, [local], "USD");
    expect(first).toMatchObject({ added: 1, updated: 0, skipped: 0 });
    expect(first.jars).toHaveLength(2);
    const second = previewBackup(backup, first.jars, "USD");
    expect(second).toMatchObject({ added: 0, updated: 0, skipped: 1 });
    expect(second.jars[1].archived).toBe(true);
    expect(second.jars[1].balance).toBe(500);
  });

  it("refuses currency or history conflicts without changing local jars", () => {
    const backup = parseBackup(createBackup(frames([jar])));
    expect(previewBackup(backup, [], "EUR").error).toMatch(/currency/i);
    const local = [
      { ...jar, entries: [{ ...jar.entries[0], note: "Different" }] },
    ];
    const result = previewBackup(backup, local, "USD");
    expect(result.error).toBeDefined();
    expect(result.jars).toBe(local);
  });
});
