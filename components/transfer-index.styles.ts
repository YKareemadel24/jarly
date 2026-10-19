import { StyleSheet } from "react-native";

import { type ThemeColorPalette } from "@/constants/theme";

export const makeStyles = (c: ThemeColorPalette) =>
  StyleSheet.create({
    header: { flexDirection: "row", justifyContent: "flex-start" },
    circle: {
      width: 38,
      height: 38,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    kicker: {
      color: c.muted,
      fontSize: 10,
      letterSpacing: 1.4,
      fontWeight: "800",
      marginTop: 18,
    },
    title: {
      color: c.foreground,
      fontFamily: "Georgia",
      fontSize: 31,
      lineHeight: 36,
      marginTop: 8,
    },
    copy: { color: c.muted, fontSize: 13.5, lineHeight: 20, marginTop: 10 },
    summary: {
      flexDirection: "row",
      alignItems: "center",
      borderRadius: 22,
      borderWidth: 1,
      padding: 16,
      marginTop: 20,
    },
    summaryRow: { flex: 1, alignItems: "center" },
    summaryValue: { color: c.foreground, fontFamily: "Georgia", fontSize: 24 },
    summaryLabel: {
      color: c.muted,
      fontSize: 11,
      marginTop: 3,
      fontWeight: "700",
    },
    summaryDivider: {
      width: StyleSheet.hairlineWidth,
      alignSelf: "stretch",
      backgroundColor: c.border,
    },
    choice: {
      flexDirection: "row",
      alignItems: "center",
      gap: 13,
      marginTop: 14,
      borderRadius: 21,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      padding: 15,
    },
    choiceIcon: {
      width: 44,
      height: 44,
      borderRadius: 15,
      alignItems: "center",
      justifyContent: "center",
    },
    choiceTitle: { color: c.foreground, fontSize: 14, fontWeight: "800" },
    choiceCopy: {
      color: c.muted,
      fontSize: 11.5,
      marginTop: 3,
      lineHeight: 16,
    },
    note: {
      flexDirection: "row",
      gap: 8,
      marginTop: 22,
      alignItems: "flex-start",
    },
    noteText: { color: c.muted, fontSize: 11.5, lineHeight: 17, flex: 1 },
    pressed: { opacity: 0.86, transform: [{ scale: 0.99 }] },
  });
