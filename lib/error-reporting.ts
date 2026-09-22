/**
 * Global error capture — the app's single crash-reporting seam.
 *
 * React Native routes every uncaught JS error through `ErrorUtils`'s global
 * handler. Installing a wrapper here means that when a reporting service is
 * adopted (Sentry, Crashlytics, …) there is exactly one place to forward to,
 * and screens never wire anything themselves.
 *
 * Today it logs with a `[crash]` prefix and chains to the previous handler, so
 * behaviour (and the dev red-box) is unchanged.
 */

type ErrorHandler = (error: unknown, isFatal?: boolean) => void;

type ErrorUtilsLike = {
  getGlobalHandler?: () => ErrorHandler;
  setGlobalHandler?: (handler: ErrorHandler) => void;
};

let installed = false;

/** Forwarding point for a future crash-reporting service. */
export function reportError(
  error: unknown,
  context?: { isFatal?: boolean },
): void {
  console.error(
    `[crash] ${context?.isFatal ? "fatal" : "recoverable"}:`,
    error,
  );
}

export function initErrorReporting(): void {
  // Idempotent: the root layout mounts once, but Fast Refresh re-runs it.
  if (installed) return;
  const errorUtils = (globalThis as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils;
  if (!errorUtils?.getGlobalHandler || !errorUtils.setGlobalHandler) return;
  installed = true;

  const previous = errorUtils.getGlobalHandler();
  errorUtils.setGlobalHandler((error, isFatal) => {
    try {
      reportError(error, { isFatal });
    } finally {
      previous?.(error, isFatal);
    }
  });
}
