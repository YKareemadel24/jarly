import { StyleSheet } from "react-native";

import type { ThemeColorPalette } from "@/constants/theme";

export const makeStyles = (c: ThemeColorPalette) =>
  StyleSheet.create({
    label: {
      color: c.muted,
      fontSize: 10,
      letterSpacing: 1.1,
      fontWeight: "800",
      marginTop: 26,
      marginBottom: 9,
    },
    card: {
      borderRadius: 21,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      padding: 15,
      gap: 10,
    },
    title: { color: c.foreground, fontSize: 14, fontWeight: "800" },
    copy: { color: c.muted, fontSize: 12, lineHeight: 18 },
    actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    button: {
      minHeight: 44,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: "center",
      justifyContent: "center",
    },
    buttonText: { color: c.primary, fontSize: 12, fontWeight: "800" },
    primary: { backgroundColor: c.primary, borderColor: c.primary },
    primaryText: { color: "#FFFDF9" },
    preview: {
      borderTopWidth: 1,
      borderColor: c.border,
      paddingTop: 12,
      gap: 8,
    },
    error: { color: c.error, fontSize: 12, lineHeight: 18 },
    disabled: { opacity: 0.5 },
    pressed: { opacity: 0.8 },
  });
