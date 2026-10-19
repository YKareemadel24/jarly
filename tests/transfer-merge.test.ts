import { describe, expect, it } from "vitest";

import type { Jar } from "../lib/domain";
import { mergeTransferJars } from "../lib/transfer-merge";

const entry = (id: string, amount: number): Jar["entries"][number] => ({
  id,
  amount,
  direction: "deposit",
  at: "2026-01-02T00:00:00.000Z",
});

const jar = (entries: Jar["entries"], balance: number): Jar => ({
  id: "jar-a",
  name: "Trip",
  target: 10000,
  balance,
  accent: "ocean",
  icon: "flight",
  kind: "goal",
  createdAt: "2026-01-01T00:00:00.000Z",
  milestonesHit: [],
  entries,
});

describe("transfer merge", () => {
  it("rejects a currency mismatch without changing local jars", () => {
    const local = [jar([], 0)];
    expect(mergeTransferJars(local, [], "EUR", "USD")).toMatchObject({
      error: expect.any(String),
      jars: local,
    });
  });

  it("rejects divergent histories instead of replacing local entries", () => {
    const local = [jar([entry("local", 20)], 20)];
    const incoming = [jar([entry("remote", 30)], 30)];
    expect(mergeTransferJars(local, incoming, "USD", "USD")).toMatchObject({
      error: expect.any(String),
      jars: local,
    });
  });

  it("updates only when incoming history contains the local history", () => {
    const local = [jar([entry("old", 20)], 50)];
    const incoming = [jar([entry("new", 30), entry("remote-old", 20)], 50)];
    const result = mergeTransferJars(local, incoming, "USD", "USD");
    expect(result.updated).toBe(1);
    expect(result.jars[0]?.entries).toHaveLength(2);
  });

  it("rejects an aggregate balance outside safe integer precision", () => {
    const result = mergeTransferJars(
      [],
      [
        { ...jar([], 0), id: "one", balance: Number.MAX_SAFE_INTEGER },
        { ...jar([], 0), id: "two", balance: 1 },
      ],
      "USD",
      "USD",
    );
    expect(result.error).toBeDefined();
    expect(result.jars).toEqual([]);
  });

  it("rejects an incoming balance that contradicts its entry history", () => {
    const incoming = jar([entry("deposit", 20)], 30);
    expect(mergeTransferJars([], [incoming], "USD", "USD")).toMatchObject({
      error: expect.any(String),
      jars: [],
    });
  });
});
