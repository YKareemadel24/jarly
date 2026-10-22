import { StyleSheet } from "react-native";
import type { ThemeColorPalette } from "@/constants/theme";

export const makeStyles = (c: ThemeColorPalette) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      justifyContent: "flex-end",
      backgroundColor: "rgba(32,27,24,.58)",
    },
    sheet: {
      flexGrow: 0,
      maxHeight: "90%",
      backgroundColor: c.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
    },
    content: { padding: 22, paddingBottom: 32 },
    title: {
      color: c.foreground,
      fontFamily: "Georgia",
      fontSize: 25,
      marginBottom: 8,
    },
    copy: { color: c.muted, fontSize: 14, lineHeight: 21 },
    label: {
      color: c.foreground,
      fontSize: 14,
      fontWeight: "700",
      marginTop: 15,
      marginBottom: 7,
    },
    input: {
      color: c.foreground,
      backgroundColor: c.background,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      minHeight: 48,
      paddingHorizontal: 13,
      paddingVertical: 12,
      fontSize: 16,
    },
    primary: {
      backgroundColor: c.foreground,
      minHeight: 48,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      padding: 12,
      marginTop: 18,
    },
    primaryText: { color: c.background, fontSize: 15, fontWeight: "700" },
    secondary: {
      minHeight: 48,
      alignItems: "center",
      justifyContent: "center",
      padding: 12,
    },
    secondaryText: { color: c.foreground, fontSize: 14, fontWeight: "700" },
    error: { color: c.error, fontSize: 14, lineHeight: 21, marginTop: 12 },
    history: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      marginTop: 12,
    },
    revision: { marginBottom: 12 },
  });
