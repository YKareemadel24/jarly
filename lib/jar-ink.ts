// Darkens an accent hex toward cocoa ink (#2C231D) so text on tint passes contrast.
export function inkOnAccent(accentHex: string): string {
  const m = /^#([0-9a-fA-F]{6})$/.exec(accentHex.trim());
  if (!m) return accentHex;
  const ink = [0x2c, 0x23, 0x1d];
  const hex = m[1].toLowerCase();
  const rgb = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const mixed = rgb.map((v, i) => Math.round(v * 0.68 + ink[i] * 0.32));
  return "#" + mixed.map((v) => v.toString(16).padStart(2, "0")).join("");
}
