import { useMemo } from "react";

import { jarAccent, jarAccentDark, type Accent } from "@/lib/savings-store";
import { useColorScheme } from "./use-color-scheme";

/**
 * Jar accent hexes resolved for the active color scheme. Dark mode uses the
 * brighter variant set so translucent tints stay legible on warm charcoal.
 */
export function useJarAccents(): Record<Accent, string> {
  const scheme = useColorScheme();
  return useMemo(() => (scheme === "dark" ? jarAccentDark : jarAccent), [scheme]);
}
