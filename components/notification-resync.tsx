import { useSavings } from "@/lib/savings-store";
import { useSettings } from "@/lib/settings-store";
import { useNotificationResync } from "@/lib/notifications";

export function NotificationResync() {
  const { jars, ready: savingsReady, storageError } = useSavings();
  const { remindersEnabled, currency, ready: settingsReady } = useSettings();
  const savingsUnavailable = Boolean(storageError);
  useNotificationResync(jars, {
    enabled: remindersEnabled && !savingsUnavailable,
    currency,
    // Clear previous schedules once storage fails, but never schedule a stale balance.
    ready: savingsReady && (savingsUnavailable || settingsReady),
  });
  return null;
}
