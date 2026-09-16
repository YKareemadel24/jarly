/**
 * QR encoding, on device.
 *
 * The `qrcode` package already ships its full encoder as plain JavaScript with
 * no canvas dependency, so there is no reason to add a second QR library or to
 * round-trip every code through the server. This wraps it down to the one thing
 * the app needs: a boolean matrix of modules.
 */

// Reach straight for the core encoder rather than any of the entry points: the
// browser build also pulls in the canvas renderer, which has no business in a
// React Native bundle even if it is never called. This module is pure maths.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const QRCode = require("qrcode/lib/core/qrcode") as {
  create: (text: string, options?: { errorCorrectionLevel?: "L" | "M" | "Q" | "H" }) => {
    modules: { size: number; data: Uint8Array | number[] };
  };
};

export type QrMatrix = {
  /** Row-major grid; `true` means a dark module. */
  modules: boolean[][];
  /** Modules per side, excluding the quiet zone. */
  count: number;
};

/**
 * Encode `value`, or undefined when it cannot be encoded (for example, when it
 * is longer than the largest supported symbol).
 */
export function qrMatrix(value: string): QrMatrix | undefined {
  if (!value) return undefined;
  try {
    // "M" tolerates roughly 15% damage, which is the right trade for a code read
    // off a screen at arm's length: enough slack for a smudge, still compact.
    const result = QRCode.create(value, { errorCorrectionLevel: "M" });
    const size = result.modules.size;
    const data = result.modules.data;
    const modules: boolean[][] = [];
    for (let y = 0; y < size; y += 1) {
      const row: boolean[] = [];
      for (let x = 0; x < size; x += 1) {
        row.push(Boolean(data[y * size + x]));
      }
      modules.push(row);
    }
    return { modules, count: size };
  } catch {
    return undefined;
  }
}