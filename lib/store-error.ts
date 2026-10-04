/**
 * Typed error for failures the savings store raises deliberately.
 *
 * Store mutations reject with a `code` so callers can branch on the kind of
 * failure (invalid amount, missing jar, …) without matching on message text.
 * It extends `Error`, so existing `instanceof Error` handling and `.message`
 * rendering keep working unchanged.
 */

/** Why a store operation was rejected. */
export type StoreErrorCode =
  | "invalid-amount"
  /** The hook was used outside its provider. */
  | "provider-missing"
  /** The jar the caller referenced no longer exists. */
  | "jar-missing";

export class StoreError extends Error {
  readonly code: StoreErrorCode;

  constructor(code: StoreErrorCode, message: string) {
    super(message);
    this.name = "StoreError";
    this.code = code;
  }
}
