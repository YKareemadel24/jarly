import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "@/server/routers";
import { getApiBaseUrl } from "@/constants/oauth";
import { apiFetch } from "@/lib/api-transport";
import { getAccessToken } from "@/lib/_core/auth";

/**
 * tRPC React client for type-safe API calls.
 *
 * IMPORTANT (tRPC v11): The `transformer` must be inside `httpBatchLink`,
 * NOT at the root createClient level. This ensures client and server
 * use the same serialization format (superjson).
 */
export const trpc = createTRPCReact<AppRouter>();

/**
 * Creates the tRPC client with proper configuration.
 * Call this once in your app's root layout.
 */
export function createTRPCClient() {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: `${getApiBaseUrl()}/api/trpc`,
        // tRPC v11: transformer MUST be inside httpBatchLink, not at root
        transformer: superjson,
        async headers() {
          // Every platform authenticates identically now: the Supabase access
          // token travels as a Bearer header. Web no longer depends on a cookie
          // being set by a separate endpoint first.
          const token = await getAccessToken();
          return token ? { Authorization: `Bearer ${token}` } : {};
        },
        // Custom fetch turns a non-tRPC error page (a bundler 404, a static
        // host, a proxy) into a message worth reading.
        fetch: apiFetch,
      }),
    ],
  });
}
