import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({ Platform: { OS: "web" } }));
vi.mock("expo-linking", () => ({ createURL: () => "exp://invite" }));

import { DEFAULT_API_PORT, getApiBaseUrl } from "../constants/oauth";

/** Pretend the app is being served from this origin by stubbing window.location. */
const servedFrom = (protocol: string, hostname: string, port: string) =>
  vi.stubGlobal("window", { location: { protocol, hostname, port, origin: `${protocol}//${hostname}` } });

afterEach(() => vi.unstubAllGlobals());

describe("getApiBaseUrl", () => {
  it("aims at the API port when Metro serves the app locally", () => {
    // Without this the client would post to Metro on 8081 and read its 404 page.
    servedFrom("http:", "localhost", "8081");
    expect(getApiBaseUrl()).toBe(`http://localhost:${DEFAULT_API_PORT}`);
  });

  it("keeps the host while swapping Metro's port, so a phone on the LAN still works", () => {
    servedFrom("http:", "192.168.1.20", "8081");
    expect(getApiBaseUrl()).toBe(`http://192.168.1.20:${DEFAULT_API_PORT}`);
  });

  it("swaps the sandbox subdomain's port instead of the port itself", () => {
    servedFrom("https:", "8081-abc.region.manus.computer", "");
    expect(getApiBaseUrl()).toBe("https://3000-abc.region.manus.computer");
  });

  it("stays same-origin for a deployment served on the standard port", () => {
    servedFrom("https:", "jarly.app", "");
    expect(getApiBaseUrl()).toBe("");
  });
});
