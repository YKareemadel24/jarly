import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

/**
 * Tiered haptic vocabulary:
 * - tap:       light, for keypad presses and chip selection
 * - medium:    calm confirmation (e.g. withdrawal committed)
 * - success:   deposit committed
 * - milestone: heavier celebration pattern
 */
export const feedback = {
  tap: () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  },
  medium: () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  },
  success: () => {
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  },
  error: () => {
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  },
  milestone: () => {
    if (Platform.OS === "web") return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => undefined);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  },
};
