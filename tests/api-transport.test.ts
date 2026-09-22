import { afterEach, describe, expect, it, vi } from "vitest";
import { API_UNREACHABLE_MESSAGE, apiFetch } from "../lib/api-transport";

/** Minimal stand-in for the parts of Response the transport touches. */
const response = (init: {
  ok: boolean;
  contentType?: string | null;
  body?: string;
}) =>
  ({
    ok: init.ok,
    status: init.ok ? 200 : 404,
    headers: {
      get: (name: string) =>
        name.toLowerCase() === "content-type"
          ? (init.contentType ?? null)
          : null,
    },
    text: async () => init.body ?? "",
  }) as unknown as Response;

afterEach(() => vi.unstubAllGlobals());

describe("apiFetch", () => {
  it.each(["Failed to fetch", "Network request failed", "fetch failed"])(
    "explains a network failure (%s) without retrying a mutation",
    async (message) => {
      const fetchMock = vi.fn().mockRejectedValue(new TypeError(message));
      vi.stubGlobal("fetch", fetchMock);
      await expect(
        apiFetch("http://localhost:3000/api/trpc/sharedJar.importPersonal", {
          method: "POST",
        }),
      ).rejects.toThrow(API_UNREACHABLE_MESSAGE);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it("preserves deliberate cancellation", async () => {
    const controller = new AbortController();
    controller.abort();
    const error = new DOMException("The operation was aborted", "AbortError");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(error));
    await expect(
      apiFetch("/api/trpc/sharedJar.list", { signal: controller.signal }),
    ).rejects.toBe(error);
  });

  it("passes a tRPC JSON error through so its error code still reaches the caller", async () => {
    const json = response({
      ok: false,
      contentType: "application/json; charset=utf-8",
      body: '{"error":{}}',
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json));
    await expect(apiFetch("/api/trpc/sharedJar.list")).resolves.toBe(json);
  });

  it("turns a bundler's plain-text 404 into a message that names the real problem", async () => {
    // What Metro answers for /api/trpc when the client aimed at the app's own origin.
    const notFound = response({
      ok: false,
      contentType: "text/plain",
      body: "Not found",
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(notFound));
    await expect(
      apiFetch("http://localhost:8081/api/trpc/sharedJar.importPersonal"),
    ).rejects.toThrow(API_UNREACHABLE_MESSAGE);
  });

  it("passes a successful response through untouched", async () => {
    const ok = response({ ok: true });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok));
    await expect(apiFetch("/api/trpc/sharedJar.list")).resolves.toBe(ok);
  });

  it("passes the caller's init through untouched — auth is a Bearer header, so no cookie credentials are added", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    await apiFetch("/api/trpc/sharedJar.list", { method: "POST" });
    expect(fetchMock).toHaveBeenCalledWith("/api/trpc/sharedJar.list", {
      method: "POST",
    });
  });
});
