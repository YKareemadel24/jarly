import { beforeEach, describe, expect, it, vi } from "vitest";

import { createSharedJarApi, fetchSharedJars } from "../lib/shared-jar-api";

const mocks = vi.hoisted(() => {
  const listQuery = vi.fn();
  return {
    apiFetch: vi.fn(),
    createTRPCClient: vi.fn((_config: { links: unknown[] }) => ({
      sharedJar: { list: { query: listQuery } },
    })),
    getAccessToken: vi.fn(),
    getApiBaseUrl: vi.fn(),
    httpBatchLink: vi.fn(
      (options: {
        url: string;
        headers: () => Promise<Record<string, string>>;
        fetch: typeof fetch;
      }) => options,
    ),
    listQuery,
  };
});

vi.mock("@trpc/client", () => ({
  createTRPCClient: mocks.createTRPCClient,
  httpBatchLink: mocks.httpBatchLink,
}));
vi.mock("@/constants/oauth", () => ({
  getApiBaseUrl: mocks.getApiBaseUrl,
}));
vi.mock("@/lib/_core/auth", () => ({
  getAccessToken: mocks.getAccessToken,
}));
vi.mock("@/lib/api-transport", () => ({
  apiFetch: mocks.apiFetch,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listQuery.mockResolvedValue([]);
  mocks.getApiBaseUrl.mockReturnValue("https://default.example");
  mocks.getAccessToken.mockResolvedValue("default-token");
});

describe("shared-jar API compatibility exports", () => {
  it("keeps fetchSharedJars as a named function backed by the default API", async () => {
    mocks.listQuery.mockResolvedValueOnce([{ id: 42 }]);

    await expect(fetchSharedJars()).resolves.toEqual([{ id: 42 }]);

    const link = mocks.httpBatchLink.mock.calls[0]?.[0] as {
      url: string;
      headers: () => Promise<Record<string, string>>;
    };
    expect(link.url).toBe("https://default.example/api/trpc");
    await expect(link.headers()).resolves.toEqual({
      Authorization: "Bearer default-token",
    });
  });
});

describe("createSharedJarApi", () => {
  it("keeps the client lazy and uses every injected transport dependency", async () => {
    const injectedFetch = vi.fn();
    const getBaseUrl = vi.fn(() => "https://injected.example");
    const getToken = vi.fn(async () => "injected-token");
    const api = createSharedJarApi({
      getApiBaseUrl: getBaseUrl,
      getAccessToken: getToken,
      fetch: injectedFetch,
    });

    expect(getBaseUrl).not.toHaveBeenCalled();
    expect(mocks.createTRPCClient).not.toHaveBeenCalled();

    mocks.listQuery.mockResolvedValueOnce([{ id: 84 }]);
    await expect(api.fetchSharedJars()).resolves.toEqual([{ id: 84 }]);

    const clientConfig = mocks.createTRPCClient.mock.calls[0]?.[0];
    const link = mocks.httpBatchLink.mock.calls[0]?.[0] as {
      url: string;
      headers: () => Promise<Record<string, string>>;
      fetch: typeof fetch;
    };
    expect(clientConfig.links).toHaveLength(1);
    expect(link.url).toBe("https://injected.example/api/trpc");
    expect(link.fetch).toBe(injectedFetch);
    await expect(link.headers()).resolves.toEqual({
      Authorization: "Bearer injected-token",
    });
    expect(getBaseUrl).toHaveBeenCalledTimes(1);
    expect(getToken).toHaveBeenCalledTimes(1);
  });
});
