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
}) {
  let generation = 0;
  let disposed = false;
  const refresh = async () => {
    if (disposed) return;
    const request = ++generation;
    options.busy(true);
    try {
      const data = await options.fetch();
      if (!disposed && request === generation) options.receive(data);
    } catch (error) {
      if (!disposed && request === generation) options.failed(error);
    } finally {
      if (!disposed && request === generation) options.busy(false);
    }
  };
  const foreground = () => { if (options.active()) void refresh(); };
  const timer = setInterval(foreground, options.intervalMs ?? 10_000);
  return {
    refresh,
    foreground,
    dispose: () => { disposed = true; ++generation; clearInterval(timer); },
  };
}

export function isSharedAuthFailure(error: unknown): boolean {
  const code = (error as { data?: { code?: string } } | null)?.data?.code;
  return code === "UNAUTHORIZED" || code === "FORBIDDEN";
}
