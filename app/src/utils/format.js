// Rounds to 2 decimals and collapses negative-zero / sub-cent floating-point
// residue to +0, so a value that nets to zero never renders with a spurious
// minus sign ("-0.00"). Apply before any `value < 0` sign decision.
export function round2(n) {
  const r = Math.round(Number(n) * 100) / 100
  return r === 0 ? 0 : r  // `-0 === 0` is true, so this also normalises -0 to +0
}

// Internal: format with a COMMA decimal separator and a narrow no-break space
// (U+202F) thousands separator, within the given fraction-digit bounds. Non-
// finite input formats as 0; callers that want a dash guard it themselves.
function fmtFixed(n, minDp, maxDp) {
  let v = Number(n)
  if (!Number.isFinite(v)) v = 0
  return v
    .toLocaleString('en-US', { minimumFractionDigits: minDp, maximumFractionDigits: maxDp })
    .replace(/,/g, ' ')  // grouping: comma -> narrow no-break space
    .replace('.', ',')        // decimal: dot -> comma
}

// Formats a monetary amount with 2 decimals, comma decimal + narrow no-break
// space thousands, regardless of locale (e.g. 2440.75 -> "2 440,75"). Near-zero
// / -0 collapses to "0,00" (never "-0.00"); the sign is preserved for genuine
// negatives. This is the single source of truth for amount display (SPEC-015
// Tier 2). Percentages and FX rates keep the dot separator and must NOT use this.
export function fmtAmt(n) {
  return fmtFixed(round2(n), 2, 2)
}

// Signed money: a leading "+" for positives, the value's own "-" for negatives,
// and "—" for non-finite/missing. Use for deltas and cash-impact figures, not
// for plain balances (which should not carry a "+").
export function fmtSigned(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—'
  const v = round2(n)
  return (v > 0 ? '+' : '') + fmtAmt(v)
}

// Variable-precision money (e.g. share prices): 2..maxDp decimals with the same
// comma decimal + narrow-space thousands, and "—" for non-finite/missing.
export function fmtPriceAmt(n, maxDp = 4) {
  if (n == null || !Number.isFinite(Number(n))) return '—'
  return fmtFixed(n, 2, maxDp)
}
