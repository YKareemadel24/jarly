import { useEffect } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { useColors } from "@/hooks/use-colors";

export function Sheet({ visible, onClose, children, label }: { visible: boolean; onClose: () => void; children: React.ReactNode; label: string }) {
  const colors = useColors();
  const reduce = useReducedMotion();
  const y = useSharedValue(60);
  const opacity = useSharedValue(0);
  useEffect(() => {
    if (!visible) return;
    y.value = 60;
    opacity.value = 0;
    y.value = reduce ? withTiming(0, { duration: 90 }) : withSpring(0, { damping: 26, stiffness: 260 });
    opacity.value = withTiming(1, { duration: 150 });
  }, [visible, y, opacity, reduce]);
  const body = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  const fade = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Modal transparent animationType="none" visible={visible} onRequestClose={onClose}>
      <View style={styles.root}>
        <Animated.View style={[styles.backdrop, fade]}>
          <Pressable accessibilityLabel="Close dialog" onPress={onClose} style={StyleSheet.absoluteFill} />
        </Animated.View>
        <Animated.View accessibilityViewIsModal accessibilityLabel={label} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, body]}>
          <View style={styles.handle} />
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,.35)" },
  backdrop: { ...StyleSheet.absoluteFillObject },
  card: { borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, borderBottomWidth: 0, padding: 20, paddingBottom: 28, maxHeight: "92%" },
  handle: { alignSelf: "center", width: 40, height: 4, borderRadius: 999, backgroundColor: "rgba(120,110,100,.4)", marginBottom: 12 },
});
