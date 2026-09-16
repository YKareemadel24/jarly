import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useMemo } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { type ThemeColorPalette } from "@/constants/theme";
import { useColors } from "@/hooks/use-colors";

export type SheetAction = {
  /** Button label. */
  label: string;
  /** Optional second line explaining what the action does. */
  detail?: string;
  /** Renders in the error colour. */
  destructive?: boolean;
  /** Material icon shown at the left of the row. */
  icon?: string;
  onPress: () => void;
};

type Props = {
  visible: boolean;
  title: string;
  message?: string;
  /** Rendered top to bottom, so put Cancel last. */
  actions: SheetAction[];
  onDismiss: () => void;
};

/**
 * A modal list of choices.
 *
 * `Alert.alert` is a no-op on React Native Web: every flow that relied on it
 * silently did nothing in the browser, which made the jar options menu, the
 * archive action and the delete confirmation unreachable. This renders the same
 * choices as ordinary views so the behaviour is identical on every platform.
 */
export function ActionSheet({ visible, title, message, actions, onDismiss }: Props) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        {/* Dismiss target sits behind the card, so a tap on the card itself is
            handled by the card and never reaches this. */}
        <Pressable accessibilityLabel="Dismiss" style={StyleSheet.absoluteFill} onPress={onDismiss} />
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}
          <View style={styles.actions}>
            {actions.map((action) => (
              <Pressable
                key={action.label}
                accessibilityLabel={action.label}
                onPress={() => {
                  // Close first so a navigation triggered by the action does not
                  // leave the sheet mounted over the next screen.
                  onDismiss();
                  action.onPress();
                }}
                style={({ pressed }) => [styles.action, pressed && styles.pressed]}
              >
                {action.icon ? (
                  <MaterialIcons
                    name={action.icon as never}
                    size={19}
                    color={action.destructive ? colors.error : colors.primary}
                  />
                ) : null}
                <View style={{ flex: 1 }}>
                  <Text style={[styles.actionLabel, action.destructive && { color: colors.error }]}>{action.label}</Text>
                  {action.detail ? <Text style={styles.actionDetail}>{action.detail}</Text> : null}
                </View>
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (c: ThemeColorPalette) =>
  StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: "rgba(28,22,18,.42)", alignItems: "center", justifyContent: "center", padding: 24 },
    card: { width: "100%", maxWidth: 400, backgroundColor: c.surface, borderRadius: 24, borderWidth: 1, borderColor: c.border, padding: 20 },
    title: { color: c.foreground, fontFamily: "Georgia", fontSize: 20 },
    message: { color: c.muted, fontSize: 13, lineHeight: 19, marginTop: 8 },
    actions: { marginTop: 16, gap: 8 },
    action: { minHeight: 56, borderRadius: 16, borderWidth: 1, borderColor: c.border, backgroundColor: c.background, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 11 },
    actionLabel: { color: c.foreground, fontSize: 14, fontWeight: "800" },
    actionDetail: { color: c.muted, fontSize: 11, marginTop: 3, lineHeight: 15 },
    pressed: { opacity: 0.86, transform: [{ scale: 0.98 }] },
  });