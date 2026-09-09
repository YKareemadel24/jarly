import { useSavings } from "@/lib/savings-store";
import { useSettings } from "@/lib/settings-store";
import { useNotificationResync } from "@/lib/notifications";

export function NotificationResync() {
  const { jars } = useSavings();
  const { remindersEnabled, currency } = useSettings();
  useNotificationResync(jars, { enabled: remindersEnabled, currency });
  return null;
}
