/**
 * Decimal-safe money helpers.
 *
 * Amounts are stored as integer paise everywhere (DB, API, IndexedDB).
 * Parsing and formatting use integer arithmetic so ₹0.10 never becomes
 * 0.09999999999999999.
 */

const inrGrouping = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 0,
});

/** Format integer paise as Indian Rupees, e.g. 123456 -> "₹1,234.56". */
export function formatINR(paise: number, options: { showPaise?: boolean } = {}): string {
  const showPaise = options.showPaise ?? true;
  const sign = paise < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(paise));
  const rupees = Math.floor(abs / 100);
  const fraction = abs % 100;
  const base = `${sign}₹${inrGrouping.format(rupees)}`;
  if (!showPaise || fraction === 0) return base;
  return `${base}.${String(fraction).padStart(2, "0")}`;
}

/** Compact Indian notation for chart axes: ₹1.2L, ₹2.5Cr, ₹8k. */
export function formatCompactINR(paise: number): string {
  const sign = paise < 0 ? "-" : "";
  const rupees = Math.abs(paise) / 100;
  if (rupees >= 1_00_00_000) return `${sign}₹${trim(rupees / 1_00_00_000)}Cr`;
  if (rupees >= 1_00_000) return `${sign}₹${trim(rupees / 1_00_000)}L`;
  if (rupees >= 1_000) return `${sign}₹${trim(rupees / 1_000)}k`;
  return `${sign}₹${trim(rupees)}`;
}

function trim(value: number): string {
  const fixed = value >= 100 ? value.toFixed(0) : value.toFixed(1);
  return fixed.replace(/\.0$/, "");
}

/**
 * Parse a user-entered rupee string into integer paise.
 * Returns null for invalid or non-positive values.
 */
export function parseRupeesToPaise(input: string): number | null {
  const cleaned = input.replace(/[₹,\s]/g, "");
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  const [whole, fraction = ""] = cleaned.split(".");
  const paise = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(paise) || paise <= 0 || paise > 10 ** 15) return null;
  return paise;
}

/** Convert paise to an editable rupee string without floating point math. */
export function paiseToInput(paise: number): string {
  const abs = Math.abs(Math.trunc(paise));
  const rupees = Math.floor(abs / 100);
  const fraction = abs % 100;
  const sign = paise < 0 ? "-" : "";
  if (fraction === 0) return `${sign}${rupees}`;
  return `${sign}${rupees}.${String(fraction).padStart(2, "0")}`;
}

/** Percentage of a limit, rounded to one decimal. */
export function percentOf(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 1000) / 10;
}

export function sumPaise(values: number[]): number {
  return values.reduce((total, value) => total + Math.trunc(value), 0);
}
