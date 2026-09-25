import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createSharedRefresh,
  isSharedAuthFailure,
} from "../lib/shared-refresh";
import { FALLBACK_JAR_ICON, jarIconRender } from "../lib/jar-icon";

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
afterEach(() => vi.useRealTimers());

describe("shared refresh", () => {
  it("polls only in foreground and refreshes immediately on reactivation", async () => {
    vi.useFakeTimers();
    let active = true;
    const fetch = vi.fn().mockResolvedValue([]);
    const controller = createSharedRefresh({
      fetch,
      active: () => active,
      receive: vi.fn(),
      failed: vi.fn(),
      busy: vi.fn(),
    });
    controller.foreground();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetch).toHaveBeenCalledTimes(2);
    active = false;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetch).toHaveBeenCalledTimes(2);
    active = true;
    controller.foreground();
    expect(fetch).toHaveBeenCalledTimes(3);
    controller.dispose();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("awaits data and ignores an older response that arrives last", async () => {
    const old = deferred<number>();
    const newer = deferred<number>();
    const receive = vi.fn();
    const busy = vi.fn();
    const fetch = vi
      .fn()
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(newer.promise);
    const controller = createSharedRefresh({
      fetch,
      receive,
      busy,
      failed: vi.fn(),
      active: () => true,
    });
    const first = controller.refresh();
    const second = controller.refresh();
    newer.resolve(50);
    await second;
    expect(receive).toHaveBeenLastCalledWith(50);
    old.resolve(20);
    await first;
    expect(receive).toHaveBeenCalledTimes(1);
    expect(busy).toHaveBeenLastCalledWith(false);
    controller.dispose();
  });

  it("keeps cached data on network failure but clears it on auth rejection", async () => {
    let cache = [50];
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockRejectedValueOnce({ data: { code: "UNAUTHORIZED" } })
      .mockResolvedValueOnce([70]);
    const controller = createSharedRefresh({
      fetch,
      active: () => true,
      busy: vi.fn(),
      receive: (value: number[]) => {
        cache = value;
      },
      failed: (error) => {
        if (isSharedAuthFailure(error)) cache = [];
      },
    });
    await controller.refresh();
    expect(cache).toEqual([50]);
    await controller.refresh();
    expect(cache).toEqual([]);
    await controller.refresh();
    expect(cache).toEqual([70]);
    controller.dispose();
  });

  it("does not update state after disposal", async () => {
    const pending = deferred<number>();
    const receive = vi.fn();
    const controller = createSharedRefresh({
      fetch: () => pending.promise,
      receive,
      failed: vi.fn(),
      busy: vi.fn(),
      active: () => true,
    });
    const work = controller.refresh();
    controller.dispose();
    pending.resolve(42);
    await work;
    expect(receive).not.toHaveBeenCalled();
  });

  it("backs off after failures and resumes once a fetch succeeds", async () => {
    vi.useFakeTimers();
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue([]);
    const controller = createSharedRefresh({
      fetch,
      active: () => true,
      receive: vi.fn(),
      failed: vi.fn(),
      busy: vi.fn(),
    });
    await controller.refresh();
    expect(fetch).toHaveBeenCalledTimes(1);
    // First failure backs off for two intervals (10s -> 20s): neither a
    // foreground hook nor the 10s tick may fetch inside that window.
    controller.foreground();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetch).toHaveBeenCalledTimes(1);
    // The tick at 20s runs and succeeds, clearing the backoff so normal
    // polling resumes at the very next interval.
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetch).toHaveBeenCalledTimes(3);
    controller.dispose();
  });
});

describe("jarIconRender", () => {
  it("treats printable-ASCII names as MaterialIcons glyphs", () => {
    expect(jarIconRender("flight")).toEqual({ kind: "font", name: "flight" });
    expect(jarIconRender(" laptop-mac ")).toEqual({
      kind: "font",
      name: "laptop-mac",
    });
  });

  it("renders emoji icons as text instead of a blank font glyph", () => {
    expect(jarIconRender("🫙")).toEqual({ kind: "text", text: "🫙" });
    expect(jarIconRender("✈️")).toEqual({ kind: "text", text: "✈️" });
  });

  it("falls back to the jar emoji when the icon is empty or blank", () => {
    expect(jarIconRender("")).toEqual({
      kind: "text",
      text: FALLBACK_JAR_ICON,
    });
    expect(jarIconRender("   ")).toEqual({
      kind: "text",
      text: FALLBACK_JAR_ICON,
    });
  });
});
