/**
 * How a jar's `icon` value should be drawn.
 *
 * Jars store a bundled MaterialIcons glyph name ("flight") or any other short
 * string the user chose. Passing a non-glyph string to <MaterialIcons> renders
 * nothing at all, so the vessel has to know which kind it holds.
 */
export type JarIconRender =
  | { kind: "font"; name: string }
  | { kind: "text"; text: string };

/** Shown when a jar has no usable icon at all. */
export const FALLBACK_JAR_ICON = "🫙";

/** MaterialIcons glyph names are printable ASCII; emoji never are. */
const GLYPH_NAME = /^[\x20-\x7E]+$/;

export function jarIconRender(icon: string): JarIconRender {
  const trimmed = icon.trim();
  if (trimmed && GLYPH_NAME.test(trimmed))
    return { kind: "font", name: trimmed };
  return { kind: "text", text: trimmed || FALLBACK_JAR_ICON };
}
