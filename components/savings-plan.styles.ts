import { StyleSheet } from "react-native";
import type { ThemeColorPalette } from "@/constants/theme";

export const makeSavingsPlanStyles = (c: ThemeColorPalette) =>
  StyleSheet.create({
    card: {
      backgroundColor: c.surface,
      borderColor: c.border,
      borderWidth: 1,
      borderRadius: 22,
      padding: 18,
      gap: 12,
      marginTop: 18,
    },
    kicker: {
      color: c.muted,
      fontSize: 10,
      fontWeight: "800",
      letterSpacing: 1.2,
    },
    title: { color: c.foreground, fontFamily: "Georgia", fontSize: 23 },
    metric: { gap: 5 },
    label: { color: c.muted, fontSize: 13, fontWeight: "600" },
    amount: {
      color: c.foreground,
      fontSize: 18,
      fontWeight: "800",
      fontVariant: ["tabular-nums"],
    },
    estimate: { color: c.foreground, fontSize: 18, fontWeight: "700" },
    hint: { color: c.muted, fontSize: 12, lineHeight: 18 },
    copy: { color: c.muted, fontSize: 14, lineHeight: 21 },
  });
