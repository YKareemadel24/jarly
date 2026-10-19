import { StyleSheet } from "react-native";

import type { ThemeColorPalette } from "@/constants/theme";

export const makeActivityStyles = (c: ThemeColorPalette) =>
  StyleSheet.create({
    content: { padding: 20, paddingBottom: 108 },
    kicker: {
      color: c.muted,
      fontSize: 10,
      letterSpacing: 1.4,
      fontWeight: "800",
      marginTop: 4,
    },
    title: {
      color: c.foreground,
      fontFamily: "Georgia",
      fontSize: 31,
      lineHeight: 36,
      marginTop: 7,
    },
    empty: {
      backgroundColor: c.surface,
      borderRadius: 26,
      padding: 26,
      alignItems: "center",
      borderWidth: 1,
      borderColor: c.border,
      marginTop: 26,
    },
    emptyTitle: {
      color: c.foreground,
      fontFamily: "Georgia",
      fontSize: 22,
      marginTop: 14,
    },
    emptyCopy: {
      color: c.muted,
      fontSize: 13,
      lineHeight: 19,
      textAlign: "center",
      marginTop: 8,
    },
    group: { marginTop: 24 },
    groupLabel: {
      color: c.muted,
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 0.9,
      marginBottom: 9,
    },
    groupCard: {
      backgroundColor: c.surface,
      borderColor: c.border,
      borderLeftWidth: 1,
      borderRightWidth: 1,
      paddingHorizontal: 15,
    },
    groupCardFirst: {
      borderTopWidth: 1,
      borderTopLeftRadius: 21,
      borderTopRightRadius: 21,
      paddingTop: 5,
    },
    groupCardLast: {
      borderBottomWidth: 1,
      borderBottomLeftRadius: 21,
      borderBottomRightRadius: 21,
      paddingBottom: 5,
    },
    row: {
      minHeight: 65,
      flexDirection: "row",
      alignItems: "center",
      gap: 11,
      paddingVertical: 8,
    },
    rowIcon: {
      width: 39,
      height: 39,
      borderRadius: 13,
      alignItems: "center",
      justifyContent: "center",
    },
    rowTitle: { color: c.foreground, fontSize: 14, fontWeight: "800" },
    rowMeta: { color: c.muted, fontSize: 11, marginTop: 4 },
    rowAmount: {
      fontSize: 13,
      fontWeight: "800",
      fontVariant: ["tabular-nums"],
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: c.border,
      marginLeft: 50,
    },
  });
