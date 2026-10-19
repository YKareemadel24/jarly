import { describe, expect, it } from "vitest";

import {
  loadPersistedJars,
  persistJars,
  type KeyValueStorage,
} from "../lib/savings-storage";
import type { Jar } from "../lib/domain";

const jar: Jar = {
  id: "one",
  name: "One",
  target: 100,
  balance: 0,
  accent: "ocean",
  icon: "flight",
  kind: "goal",
  createdAt: "2026-01-01T00:00:00.000Z",
  milestonesHit: [],
  entries: [],
};

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  const storage: KeyValueStorage = {
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => void values.set(key, value),
  };
  return { storage, values };
}

describe("savings storage", () => {
  it("honors an intentionally empty current store over older data", async () => {
    const { storage } = memoryStorage({
      "saving-jar:v3": "[]",
      "saving-jar:v3:backup": JSON.stringify([jar]),
      "saving-jar:v2": JSON.stringify([jar]),
    });
    await expect(loadPersistedJars(storage)).resolves.toMatchObject({
      jars: [],
      writable: true,
    });
  });

  it("recovers from the valid backup before a stale legacy store", async () => {
    const backup = { ...jar, balance: 500 };
    const legacy = { ...jar, balance: 100 };
    const { storage } = memoryStorage({
      "saving-jar:v3": "not-json",
      "saving-jar:v3:backup": JSON.stringify([backup]),
      "saving-jar:v2": JSON.stringify([legacy]),
    });
    const recovered = await loadPersistedJars(storage);
    expect(recovered.jars[0]?.balance).toBe(500);
  });

  it("serializes overlapping writes and retains the latest snapshot", async () => {
    const { storage: base, values } = memoryStorage({ "saving-jar:v3": "[]" });
    let releaseFirst!: () => void;
    let firstStarted!: () => void;
    const firstWriteBlocked = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const firstWriteStarted = new Promise<void>((resolve) => {
      firstStarted = resolve;
    });
    const storage: KeyValueStorage = {
      ...base,
      setItem: async (key, value) => {
        if (key === "saving-jar:v3" && JSON.parse(value)[0].balance === 100) {
          firstStarted();
          await firstWriteBlocked;
        }
        await base.setItem(key, value);
      },
    };
    const older = persistJars(storage, [{ ...jar, balance: 100 }]);
    await firstWriteStarted;
    const newer = persistJars(storage, [{ ...jar, balance: 200 }]);
    releaseFirst();
    await Promise.all([older, newer]);
    expect(JSON.parse(values.get("saving-jar:v3") ?? "[]")[0].balance).toBe(
      200,
    );
  });

  it("does not copy corrupt current data over a valid backup", async () => {
    const good = JSON.stringify([{ ...jar, balance: 500 }]);
    const { storage, values } = memoryStorage({
      "saving-jar:v3": "broken",
      "saving-jar:v3:backup": good,
    });
    await persistJars(storage, [{ ...jar, balance: 700 }]);
    expect(values.get("saving-jar:v3:backup")).toBe(good);
  });

  it("rejects unsafe persisted money and uses a valid backup", async () => {
    const unsafe = JSON.stringify([
      { ...jar, balance: Number.MAX_SAFE_INTEGER + 1 },
    ]);
    const good = JSON.stringify([{ ...jar, balance: 500 }]);
    const { storage } = memoryStorage({
      "saving-jar:v3": unsafe,
      "saving-jar:v3:backup": good,
    });
    const recovered = await loadPersistedJars(storage);
    expect(recovered.jars[0]?.balance).toBe(500);
  });
});
