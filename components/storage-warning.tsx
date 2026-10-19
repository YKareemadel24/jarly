import { StyleSheet, Text, View } from "react-native";

import { useSavings } from "@/lib/savings-store";

export function StorageWarning() {
  const { storageError } = useSavings();
  if (!storageError) return null;
  return (
    <View accessibilityRole="alert" style={styles.wrap}>
      <Text style={styles.text}>{storageError}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: 54,
    left: 16,
    right: 16,
    zIndex: 100,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "#8B2F27",
    boxShadow: "0px 4px 12px rgba(0, 0, 0, 0.2)",
  },
  text: { color: "#FFFFFF", fontSize: 13, fontWeight: "600" },
});
