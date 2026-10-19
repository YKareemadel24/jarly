import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSavings } from "@/lib/savings-store";
import { useSettings } from "@/lib/settings-store";
import { useNotificationResync } from "@/lib/notifications";
import { NotificationResync } from "@/components/notification-resync";

vi.mock("@/lib/savings-store", () => ({ useSavings: vi.fn() }));
vi.mock("@/lib/settings-store", () => ({ useSettings: vi.fn() }));
vi.mock("@/lib/notifications", () => ({ useNotificationResync: vi.fn() }));

describe("NotificationResync", () => {
  beforeEach(() => vi.clearAllMocks());

  it("clears old schedules when savings failed to hydrate", () => {
    const jars = [{ id: "stale" }];
    vi.mocked(useSavings).mockReturnValue({
      jars,
      ready: true,
      storageError: new Error("storage unavailable"),
    } as never);
    vi.mocked(useSettings).mockReturnValue({
      remindersEnabled: true,
      currency: "USD",
      ready: false,
    } as never);

    NotificationResync();

    expect(useNotificationResync).toHaveBeenCalledWith(jars, {
      enabled: false,
      currency: "USD",
      ready: true,
    });
  });
});
