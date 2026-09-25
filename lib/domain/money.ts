/**
 * Money primitives for the Saving Jar domain.
 *
 * Money is ALWAYS an integer number of minor units (cents). Never floats.
 * These are the only two places conversion happens, so a display value can
 * never leak into a stored one.
 */

/** Convert a human-entered value (number or numeric string) into minor units. Null when not a finite number. */
export function toMinor(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

/** Convert minor units back to a whole-currency number for display inputs. */
export function fromMinor(minor: number): number {
  return minor / 100;
}

/** Format minor units as a currency string, falling back when Intl lacks the currency. */
export function money(minor: number, currency: string = "USD"): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(fromMinor(minor));
  } catch {
    return `${currency} ${fromMinor(minor).toFixed(2)}`;
  }
}

/** Keep only digits and a single decimal separator, max two fraction digits. */
export function sanitizeAmountInput(raw: string): string {
  let cleaned = "";
  let seenDot = false;
  let fraction = 0;
  for (const char of raw.replace(",", ".")) {
    if (char >= "0" && char <= "9") {
      if (seenDot) {
        if (fraction >= 2) continue;
        fraction += 1;
      }
      cleaned += char;
    } else if (char === "." && !seenDot) {
      seenDot = true;
      cleaned += char;
    }
  }
  return cleaned;
}
