import { useThemeContext } from "@/lib/theme-provider";

/**
 * To support static rendering, this value needs to be re-calculated on the client side for web
 */
export function useColorScheme() {
  return useThemeContext().colorScheme;
}
