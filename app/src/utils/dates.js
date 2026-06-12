const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

/**
 * Format a Date as a LOCAL yyyy-mm-dd string.
 *
 * Use this instead of `date.toISOString().split('T')[0]` whenever you need the
 * calendar date a user sees: `toISOString()` converts to UTC first, so in any
 * positive-UTC timezone midnight-local rolls back to the previous day (this is
 * the root cause of the "day 16 shows as the 15th" scheduled-transfer bug).
 */
export function localDateStr(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Format a yyyy-mm-dd string as "15 Apr 2026".
 * Returns '' for falsy input.
 */
export function formatDate(str) {
  if (!str) return ''
  const [y, m, d] = str.split('-')
  return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`
}
