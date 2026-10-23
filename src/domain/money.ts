/** Money helpers. Amounts are integer Rupiah. No floating point is persisted. */

function groupThousands(n: number): string {
  const s = Math.trunc(Math.abs(n)).toString();
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const fromEnd = s.length - i;
    out += s[i];
    if (fromEnd > 1 && fromEnd % 3 === 1) out += '.';
  }
  return out;
}

/** Rp1.250.000 / -Rp1.250.000 */
export function formatRupiah(amount: number, opts: { sign?: boolean } = {}): string {
  const rounded = Math.round(amount);
  const neg = rounded < 0;
  const body = 'Rp' + groupThousands(rounded);
  if (neg) return '-' + body;
  if (opts.sign && rounded > 0) return '+' + body;
  return body;
}

/** Compact form for chart axes: Rp1,2 jt / Rp850 rb / Rp1,5 M */
export function formatRupiahCompact(amount: number): string {
  const neg = amount < 0;
  const a = Math.abs(amount);
  let s: string;
  const fmt = (v: number) => {
    const r = Math.round(v * 10) / 10;
    return (Number.isInteger(r) ? r.toString() : r.toFixed(1)).replace('.', ',');
  };
  if (a >= 1_000_000_000) s = fmt(a / 1_000_000_000) + ' M';
  else if (a >= 1_000_000) s = fmt(a / 1_000_000) + ' jt';
  else if (a >= 1_000) s = fmt(a / 1_000) + ' rb';
  else s = Math.round(a).toString();
  return (neg ? '-' : '') + 'Rp' + s;
}

/** Parse user input like "1.250.000", "Rp 1.250.000", "1250000" into integer rupiah. Returns null if invalid. */
export function parseRupiahInput(text: string): number | null {
  const digits = text.replace(/[^0-9]/g, '');
  if (!digits) return null;
  if (digits.length > 15) return null;
  const n = parseInt(digits, 10);
  return Number.isFinite(n) ? n : null;
}

/** Format digits while typing: "1250000" -> "1.250.000" */
export function formatAmountTyping(text: string): string {
  const n = parseRupiahInput(text);
  return n === null ? '' : groupThousands(n);
}

/**
 * Percentage change between two values. Returns null when the comparison is meaningless
 * (previous period is zero), so the UI never shows a fake percentage.
 */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function formatPercent(p: number, digits = 0): string {
  const factor = Math.pow(10, digits);
  const r = Math.round(p * factor) / factor;
  return r.toFixed(digits).replace('.', ',') + '%';
}

/** Safe ratio in percent; null when the denominator is not positive. */
export function ratioPercent(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return (numerator / denominator) * 100;
}
