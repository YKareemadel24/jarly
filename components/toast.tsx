import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/use-colors";

type ToastProps = {
  visible: boolean;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss: () => void;
  /** Auto-dismiss delay in ms; 0 disables. */
  durationMs?: number;
};

/**
 * Lightweight bottom toast for calm, reversible actions (e.g. withdrawals).
 * Announces politely to screen readers and auto-dismisses.
 */
export function Toast({ visible, message, actionLabel, onAction, onDismiss, durationMs = 5500 }: ToastProps) {
  const colors = useColors();
  useEffect(() => {
    if (!visible || !durationMs) return;
    const timer = setTimeout(onDismiss, durationMs);
    return () => clearTimeout(timer);
  }, [visible, durationMs, onDismiss]);

  if (!visible) return null;
  return (
    <View
      pointerEvents="box-none"
      accessibilityLiveRegion="polite"
      style={toastStyles.wrap}
    >
      <View style={[toastStyles.toast, { backgroundColor: colors.foreground }]}>
        <Text numberOfLines={2} style={[toastStyles.message, { color: colors.background }]}>{message}</Text>
        {actionLabel && onAction ? (
          <Pressable accessibilityLabel={actionLabel} onPress={() => { onAction(); onDismiss(); }} hitSlop={8} style={({ pressed }) => [toastStyles.action, pressed && toastStyles.pressed]}>
            <MaterialIcons name="undo" size={15} color="#FFFDF9" />
            <Text style={toastStyles.actionLabel}>{actionLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const toastStyles = StyleSheet.create({
  wrap: { position: "absolute", left: 20, right: 20, bottom: 24, alignItems: "center", zIndex: 20 },
  toast: { flexDirection: "row", alignItems: "center", gap: 12, maxWidth: 420, alignSelf: "stretch", borderRadius: 17, paddingHorizontal: 16, minHeight: 52, paddingVertical: 10, shadowColor: "#201B18", shadowOpacity: 0.28, shadowOffset: { width: 0, height: 6 }, shadowRadius: 14, elevation: 6 },
  message: { flex: 1, fontSize: 13, fontWeight: "600", lineHeight: 18 },
  action: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 11, paddingHorizontal: 10, paddingVertical: 7 },
  actionLabel: { color: "#FFFDF9", fontSize: 13, fontWeight: "800" },
  pressed: { opacity: 0.75 },
});
