const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

/**
 * Format a yyyy-mm-dd string as "15 Apr 2026".
 * Returns '' for falsy input.
 */
export function formatDate(str) {
  if (!str) return ''
  const [y, m, d] = str.split('-')
  return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`
}
