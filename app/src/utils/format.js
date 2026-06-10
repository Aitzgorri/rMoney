// Rounds to 2 decimals and collapses negative-zero / sub-cent floating-point
// residue to +0, so a value that nets to zero never renders with a spurious
// minus sign ("-0.00"). Apply before any `value < 0` sign decision.
export function round2(n) {
  const r = Math.round(Number(n) * 100) / 100
  return r === 0 ? 0 : r  // `-0 === 0` is true, so this also normalises -0 to +0
}

// Formats a monetary amount with 2 decimals using a COMMA decimal separator and
// a narrow no-break space (U+202F) as the thousands separator, regardless of
// locale (e.g. 2440.75 -> "2<nnbsp>440,75"). Near-zero / -0 collapses to "0,00"
// (never "-0.00"); the sign is preserved for genuine negatives. This is the
// single source of truth for amount display (SPEC-015 Tier 2 number format).
// Percentages and FX rates keep the dot separator and must NOT use this.
export function fmtAmt(n) {
  let v = round2(n)
  if (!Number.isFinite(v)) v = 0
  return v
    .toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .replace(/,/g, ' ')  // grouping: comma -> narrow no-break space
    .replace('.', ',')        // decimal: dot -> comma
}
