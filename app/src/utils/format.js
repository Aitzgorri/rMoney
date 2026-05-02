// Formats a number with 2 decimal places and a narrow no-break space ( ) as
// the thousands separator (e.g. 2440.75 → "2 440.75"). Sign is preserved.
export function fmtAmt(n) {
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/,/g, ' ')
}
