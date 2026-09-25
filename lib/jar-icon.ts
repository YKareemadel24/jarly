/**
 * How a jar's `icon` value should be drawn.
 *
 * Personal jars store a bundled MaterialIcons glyph name ("flight"); shared
 * jars arrive from the server with an emoji (the schema default is "🫙") or
 * any other short string a member chose. Passing an emoji to <MaterialIcons>
 * renders nothing at all, so the vessel has to know which kind it holds.
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
