export const PERIOD_LABELS = {
  monthly:   'Monthly',
  quarterly: 'Quarterly',
  yearly:    'Yearly',
}

export const FREQUENCY_LABELS = {
  'one-time':  'One-time',
  monthly:     'Monthly',
  quarterly:   'Quarterly',
  yearly:      'Yearly',
}

// Convert an amount from one period basis to another (monthly / quarterly / yearly).
// 'one-time' amounts are returned unchanged.
export function convertAmount(amount, fromBasis, toBasis) {
  const n = Number(amount)
  if (!fromBasis || fromBasis === 'one-time' || fromBasis === toBasis) return n

  // Normalise to monthly first
  let monthly
  if (fromBasis === 'monthly')   monthly = n
  else if (fromBasis === 'quarterly') monthly = n / 3
  else if (fromBasis === 'yearly')    monthly = n / 12
  else return n

  if (toBasis === 'monthly')   return monthly
  if (toBasis === 'quarterly') return monthly * 3
  if (toBasis === 'yearly')    return monthly * 12
  return monthly
}

// Given a day-of-month (1–28), return the next calendar date on which that day falls.
export function getNextOccurrenceDate(dayOfExecution) {
  const today = new Date()
  const y = today.getFullYear()
  const m = today.getMonth()
  const d = today.getDate()
  if (d <= Number(dayOfExecution)) {
    return new Date(y, m, Number(dayOfExecution)).toISOString().split('T')[0]
  }
  return new Date(y, m + 1, Number(dayOfExecution)).toISOString().split('T')[0]
}
