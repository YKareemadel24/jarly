import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { feedback } from "@/lib/haptics";
import { sanitizeAmountInput } from "@/lib/savings-core";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "back"];

export function AmountKeypad({ value, onChange, color }: { value: string; onChange: (value: string) => void; color: string }) {
  const press = (key: string) => {
    feedback.tap();
    if (key === "back") return onChange(value.slice(0, -1));
    if (key === "." && (!value || value.includes("."))) return;
    if (value.replace(".", "").length >= 7) return;
    onChange(sanitizeAmountInput(`${value}${key}`));
  };

  return <View style={styles.grid}>{KEYS.map((key) => <Pressable key={key} accessibilityLabel={key === "back" ? "Delete amount digit" : key} onPress={() => press(key)} onLongPress={key === "back" ? () => onChange("") : undefined} style={({ pressed }) => [styles.key, pressed && { backgroundColor: `${color}16` }]}>{key === "back" ? <MaterialIcons name="backspace" size={22} color={color} /> : <Text style={styles.keyText}>{key}</Text>}</Pressable>)}</View>;
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", marginTop: 10, gap: 8 },
  key: { width: "31.8%", height: 56, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  keyText: { fontSize: 20, fontWeight: "600", color: "#2C231D" },
});
