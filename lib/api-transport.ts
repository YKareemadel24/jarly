/**
 * The one HTTP transport every tRPC client uses.
 *
 * tRPC parses each response as JSON, so a reply that did not come from the API
 * server at all — a bundler's 404 page, a static host, a proxy — reaches the
 * user as `Unexpected token 'N', "Not found" is not valid JSON` instead of the
 * misconfiguration it actually is. A non-JSON *error* response is therefore
 * translated into a message that names the real problem, while successful
 * responses and tRPC's own JSON errors pass through untouched so their codes
 * (and the `error.data.code` checks built on them) keep working.
 */

/** Shown whenever a request was answered by something that is not the API. */
export const API_UNREACHABLE_MESSAGE =
  "Could not reach the Saving Jar server. Check that the API server is running, then try again.";

/**
 * Structurally identical to tRPC's own `FetchEsque`, so this can be dropped
 * straight into any `httpBatchLink({ fetch })` option.
 */
export async function apiFetch(
  input: RequestInfo | URL | string,
  init?: RequestInit,
): Promise<Response> {
  // Auth travels as a Bearer header on every platform; the server sets no
  // cookies, so no `credentials` option is needed here.
  let response: Response;
  try {
    response = await fetch(input, init);
  } catch (error) {
    // An unreachable server (or a browser-blocked request) produces no Response
    // at all. Keep intentional cancellations intact, but explain network failures
    // instead of exposing the browser's opaque "Failed to fetch" message.
    if (init?.signal?.aborted || (error instanceof Error && error.name === "AbortError")) {
      throw error;
    }
    // Never retry here: the server may already have committed a mutation.
    throw new Error(API_UNREACHABLE_MESSAGE, { cause: error });
  }
  if (response.ok) return response;

  const contentType = response.headers.get("content-type") ?? "";
  // A JSON body means the API answered, even when it answered with an error, so
  // the response is handed back for tRPC to turn into a typed error.
  if (contentType.includes("json")) return response;

  // Anything else is not a tRPC payload: read it for the log, then fail with
  // something the user can act on rather than a JSON parse error.
  const body = await response.text().catch(() => "");
  console.warn("[api] non-JSON error response", {
    url: String(input),
    status: response.status,
    body: body.slice(0, 200),
  });
  throw new Error(API_UNREACHABLE_MESSAGE);
}
