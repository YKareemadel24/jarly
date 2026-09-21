/**
 * Messages the tRPC middleware raises, shared so a client can match on the same
 * strings it is shown.
 *
 * There is no session-cookie constant any more. Supabase Auth owns the session
 * and the client attaches the access token as a Bearer header on every call, so
 * the server never issues or clears a cookie of its own.
 */
export const UNAUTHED_ERR_MSG = "Please login (10001)";
export const NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";
