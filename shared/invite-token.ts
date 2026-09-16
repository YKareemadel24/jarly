/**
 * Shared-jar invite tokens.
 *
 * An invite is a short, unambiguous code that can travel as a deep link, a QR
 * code, or something someone reads out loud. It is deliberately NOT the
 * recipient's account id: the whole point of sharing is that the owner does not
 * have to know who the recipient is, or whether they even have an account yet.
 *
 * Pure and dependency-free so the client (parsing a pasted link) and the server
 * (validating a token before it is consumed) agree on exactly one format.
 */

/**
 * Token alphabet, minus the characters people confuse when a code is read aloud
 * or typed off a screen: 0/O, 1/l/I.
 */
export const INVITE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/** Length of a generated token, in characters. */
export const INVITE_TOKEN_LENGTH = 22;

/** Path an invite link travels on, on web and in the app deep link. */
export const INVITE_PATH = "/join";

/** Query parameter carrying the token. */
export const INVITE_PARAM = "t";

/** How long a freshly minted invite stays usable. */
export const INVITE_TTL_DAYS = 14;

/** True when `token` is shaped like a token this app could have generated. */
export function isValidInviteToken(token: string): boolean {
  if (token.length !== INVITE_TOKEN_LENGTH) return false;
  for (const char of token) {
    if (!INVITE_ALPHABET.includes(char)) return false;
  }
  return true;
}

/**
 * Pull a token out of anything a user might hand us: a bare code, a web link,
 * or an app deep link. Returns undefined when nothing usable is in there, so
 * the caller can show one honest "that link did not work" message.
 */
export function inviteTokenFromInput(raw: string): string | undefined {
  const text = raw.trim();
  if (!text) return undefined;
  if (isValidInviteToken(text)) return text;

  // Query-string form: https://host/join?t=CODE or jarly://join?t=CODE
  const query = new RegExp(`[?&]${INVITE_PARAM}=([^&#\\s]+)`).exec(text);
  if (query) {
    const candidate = safeDecode(query[1]);
    if (isValidInviteToken(candidate)) return candidate;
  }

  // Path form: https://host/join/CODE
  const path = new RegExp(`${INVITE_PATH}/([^?&#\\s]+)`).exec(text);
  if (path) {
    const candidate = safeDecode(path[1]);
    if (isValidInviteToken(candidate)) return candidate;
  }

  return undefined;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Build the shareable link for a token against a base URL (no trailing slash). */
export function inviteUrl(base: string, token: string): string {
  const trimmed = base.replace(/\/+$/, "");
  return `${trimmed}${INVITE_PATH}?${INVITE_PARAM}=${token}`;
}