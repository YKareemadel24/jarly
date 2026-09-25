/** Keep network ordering and foreground scheduling independent of React so the
 * lifecycle can be tested without a native renderer. The cache is memory-only.
 */
export function createSharedRefresh<T>(options: {
  fetch: () => Promise<T>;
  receive: (value: T) => void;
  failed: (error: unknown) => void;
  busy: (value: boolean) => void;
  active: () => boolean;
  intervalMs?: number;
  /** Cap for the exponential failure backoff; defaults to five minutes. */
  maxBackoffMs?: number;
}) {
  let generation = 0;
  let disposed = false;
  // Consecutive failures back the poller off exponentially so an offline device
  // or a rejected token does not hammer the API on every tick. Manual
  // refresh() calls (post-mutation re-reads) always run; only scheduled ticks
  // and foreground/reactivation hooks respect the backoff window.
  let failures = 0;
  let backoffUntil = 0;
  const intervalMs = options.intervalMs ?? 10_000;
  const maxBackoffMs = options.maxBackoffMs ?? 300_000;
  const refresh = async () => {
    if (disposed) return;
    const request = ++generation;
    options.busy(true);
    try {
      const data = await options.fetch();
      failures = 0;
      backoffUntil = 0;
      if (!disposed && request === generation) options.receive(data);
    } catch (error) {
      failures += 1;
      backoffUntil =
        Date.now() + Math.min(intervalMs * 2 ** failures, maxBackoffMs);
      if (!disposed && request === generation) options.failed(error);
    } finally {
      if (!disposed && request === generation) options.busy(false);
    }
  };
  const foreground = () => {
    if (Date.now() < backoffUntil) return;
    if (options.active()) void refresh();
  };
  const timer = setInterval(foreground, intervalMs);
  return {
    refresh,
    foreground,
    dispose: () => {
      disposed = true;
      ++generation;
      clearInterval(timer);
    },
  };
}

export function isSharedAuthFailure(error: unknown): boolean {
  const code = (error as { data?: { code?: string } } | null)?.data?.code;
  return code === "UNAUTHORIZED" || code === "FORBIDDEN";
}
