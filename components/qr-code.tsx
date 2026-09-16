import { useMemo } from "react";
import { View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";

import { qrMatrix } from "@/lib/qr";

type Props = {
  /** The string to encode. An empty value renders the placeholder instead. */
  value: string;
  /** Rendered width and height in pixels. */
  size: number;
  /** Module colour. Defaults to the app's warm ink. */
  color?: string;
  /** Background colour; also the quiet zone. */
  background?: string;
};

/**
 * A QR code drawn as vector paths.
 *
 * The dark modules are emitted as a single `<Path>` rather than one `<Rect>` per
 * module: a transfer frame runs to roughly a thousand modules, and a thousand
 * native views is enough to visibly stall the animation frame that shows it.
 * One path keeps the tree flat no matter how dense the code gets.
 *
 * The quiet zone is part of the symbol: scanners need the margin, so it is drawn
 * here rather than left to whatever padding the caller happens to apply.
 */
export function QrCode({ value, size, color = "#2D2722", background = "#FFFDF9" }: Props) {
  const matrix = useMemo(() => qrMatrix(value), [value]);

  if (!matrix) {
    // An empty or unencodable value gets a blank tile rather than a broken one,
    // so a layout never jumps when the value finally arrives.
    return <View style={{ width: size, height: size, backgroundColor: background, borderRadius: 8 }} />;
  }

  // Four modules of quiet zone on every side, per the spec's minimum.
  const quiet = 4;
  const span = matrix.count + quiet * 2;
  const scale = size / span;

  let d = "";
  for (let y = 0; y < matrix.count; y += 1) {
    const row = matrix.modules[y];
    for (let x = 0; x < matrix.count; x += 1) {
      if (!row[x]) continue;
      const px = (x + quiet) * scale;
      const py = (y + quiet) * scale;
      d += `M${px.toFixed(2)} ${py.toFixed(2)}h${scale.toFixed(2)}v${scale.toFixed(2)}h-${scale.toFixed(2)}z`;
    }
  }

  return (
    <View accessible accessibilityRole="image" accessibilityLabel="QR code" style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Rect x={0} y={0} width={size} height={size} fill={background} />
        <Path d={d} fill={color} />
      </Svg>
    </View>
  );
}