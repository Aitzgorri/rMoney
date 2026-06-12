// Single source of truth for recurrence frequencies across the whole app.
// Phase 47 — every frequency dropdown (transaction recurrence, envelope
// scheduled transfers, Bills & Income) and every recurrence engine
// (data/bills.js, data/envelopes.js) reads from here so the option set can
// never drift between screens again.
//
// Each entry carries which kind of "day" picker it needs:
//   'none'      → no day picker (uses an explicit date instead, e.g. one-time)
//   'weekday'   → dayOfExecution is a weekday 0 (Sun) … 6 (Sat)
//   'month-day' → dayOfExecution is a day of month 1 … 28
export const FREQUENCIES = [
  { value: 'one-time',  label: 'One-time',  dayPicker: 'none' },
  { value: 'weekly',    label: 'Weekly',    dayPicker: 'weekday' },
  { value: 'biweekly',  label: 'Bi-weekly', dayPicker: 'weekday' },
  { value: 'monthly',   label: 'Monthly',   dayPicker: 'month-day' },
  { value: 'quarterly', label: 'Quarterly', dayPicker: 'month-day' },
  { value: 'yearly',    label: 'Yearly',    dayPicker: 'month-day' },
]

// The recurring subset (everything except one-time). Recurring forms — the
// transaction recurrence box and the regular envelope-transfer form — offer
// exactly this set so the options match Bills & Income (which also offers
// one-time for a single future-dated item).
export const RECURRING_FREQUENCIES = FREQUENCIES.filter(f => f.value !== 'one-time')

// value → label, derived so adding a frequency above updates every consumer.
export const FREQUENCY_LABELS = Object.fromEntries(FREQUENCIES.map(f => [f.value, f.label]))

// Which day picker a frequency needs: 'none' | 'weekday' | 'month-day'.
export function dayPickerKind(frequency) {
  return FREQUENCIES.find(f => f.value === frequency)?.dayPicker ?? 'none'
}

// Shared day-picker option lists.
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
export const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const MONTH_DAYS = Array.from({ length: 28 }, (_, i) => i + 1)

// Human label for a stored (frequency, dayOfExecution) pair — e.g.
// "Tuesday" for weekday pickers, "15th" for month-day pickers.
export function dayLabel(frequency, dayOfExecution) {
  const kind = dayPickerKind(frequency)
  if (kind === 'weekday') return WEEKDAYS[dayOfExecution] ?? ''
  if (kind === 'month-day') return `${dayOfExecution}th`
  return ''
}

// ─── Planning period basis (monthly / quarterly / yearly) ────────────────────
// NOTE: distinct from the recurrence frequencies above. These are the period
// bases used by the Planning + Budgets screens; do NOT add weekly/bi-weekly.
export const PERIOD_LABELS = {
  monthly:   'Monthly',
  quarterly: 'Quarterly',
  yearly:    'Yearly',
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
