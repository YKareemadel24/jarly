import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { View, useColorScheme as useSystemColorScheme } from "react-native";
import { colorScheme as nativewindColorScheme, vars } from "nativewind";

import { SchemeColors, type ColorScheme } from "@/constants/theme";

type AppearanceMode = ColorScheme | "system";
type ThemeContextValue = {
  colorScheme: ColorScheme;
  setColorScheme: (scheme: ColorScheme) => void;
  appearanceMode: AppearanceMode;
  setAppearanceMode: (mode: AppearanceMode) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);
const APPEARANCE_KEY = "saving-jar:appearance";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useSystemColorScheme() ?? "light";
  const [appearanceMode, setAppearanceModeState] = useState<AppearanceMode>("system");
  const colorScheme: ColorScheme = appearanceMode === "system" ? systemScheme : appearanceMode;

  const applyScheme = useCallback((scheme: ColorScheme) => {
    nativewindColorScheme.set(scheme);
    if (typeof document !== "undefined") {
      const root = document.documentElement;
      root.dataset.theme = scheme;
      root.classList.toggle("dark", scheme === "dark");
      const palette = SchemeColors[scheme];
      Object.entries(palette).forEach(([token, value]) => root.style.setProperty(`--color-${token}`, value));
    }
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(APPEARANCE_KEY).then((stored) => {
      if (stored === "light" || stored === "dark" || stored === "system") setAppearanceModeState(stored);
    }).catch(() => undefined);
  }, []);

  useEffect(() => { applyScheme(colorScheme); }, [applyScheme, colorScheme]);

  const setAppearanceMode = useCallback((mode: AppearanceMode) => {
    setAppearanceModeState(mode);
    AsyncStorage.setItem(APPEARANCE_KEY, mode).catch(() => undefined);
  }, []);
  const setColorScheme = useCallback((scheme: ColorScheme) => setAppearanceMode(scheme), [setAppearanceMode]);

  const themeVariables = useMemo(() => vars({
    "color-primary": SchemeColors[colorScheme].primary,
    "color-background": SchemeColors[colorScheme].background,
    "color-surface": SchemeColors[colorScheme].surface,
    "color-foreground": SchemeColors[colorScheme].foreground,
    "color-muted": SchemeColors[colorScheme].muted,
    "color-border": SchemeColors[colorScheme].border,
    "color-success": SchemeColors[colorScheme].success,
    "color-warning": SchemeColors[colorScheme].warning,
    "color-error": SchemeColors[colorScheme].error,
  }), [colorScheme]);

  const value = useMemo(() => ({ colorScheme, setColorScheme, appearanceMode, setAppearanceMode }), [appearanceMode, colorScheme, setAppearanceMode, setColorScheme]);
  return <ThemeContext.Provider value={value}><View style={[{ flex: 1 }, themeVariables]}>{children}</View></ThemeContext.Provider>;
}

export function useThemeContext(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useThemeContext must be used within ThemeProvider");
  return ctx;
}
