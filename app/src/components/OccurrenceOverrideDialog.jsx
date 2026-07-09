import { useState } from 'react'
import { applyOccurrenceOverride } from '../data/bills'
import { parseAmount, fmtAmt } from '../utils/format'
import { formatDate, localDateStr } from '../utils/dates'
import AmountInput from './AmountInput'
import styles from './OccurrenceOverrideDialog.module.css'

// One-time edit of a single upcoming occurrence (Phase 55d, decisions D4):
// change its date / amount / note, skip it, or jump to editing the whole
// series. The series itself stays on its original schedule. If the chosen
// date has already arrived (e.g. "Record now"), the transaction is recorded
// immediately in BOTH application modes — the user picked the date
// intentionally, so no second confirmation step.
export default function OccurrenceOverrideDialog({ entry, onEditSeries, onClose, onSaved }) {
  const { item, seriesDate } = entry
  const [date, setDate]     = useState(entry.date)
  const [amount, setAmount] = useState(String(entry.amount))
  const [note, setNote]     = useState('')

  function save(overrideFields) {
    applyOccurrenceOverride(item.id, seriesDate, overrideFields)
    onSaved()
  }

  function handleSave() {
    const amt = parseAmount(amount)
    save({ date, amount: Number.isFinite(amt) ? amt : entry.amount, note })
  }

  function handleRecordNow() {
    const amt = parseAmount(amount)
    save({ date: localDateStr(), amount: Number.isFinite(amt) ? amt : entry.amount, note })
  }

  const today = localDateStr()

  return (
    <div className={styles.backdrop}>
      <div className={styles.dialog}>
        <h3 className={styles.title}>{item.name}</h3>
        <p className={styles.subtitle}>
          One-time change to the {formatDate(seriesDate)} occurrence — the series keeps its schedule
          ({fmtAmt(item.amount)} {item.currency}).
        </p>

        <label className={styles.label}>Date
          <input className={styles.input} type="date" value={date} onChange={e => setDate(e.target.value)} />
        </label>
        <label className={styles.label}>Amount ({item.currency})
          <AmountInput className={styles.input} value={amount} onChange={setAmount} />
        </label>
        <label className={styles.label}>Note (optional, this occurrence only)
          <input className={styles.input} value={note} onChange={e => setNote(e.target.value)}
            placeholder={item.name} />
        </label>

        <p className={styles.hint}>
          {date <= today
            ? 'The chosen date has arrived — saving records the transaction immediately.'
            : `Will be ${item.applicationMode === 'auto-apply' ? 'recorded automatically' : 'shown for confirmation'} on ${formatDate(date)}.`}
        </p>

        {onEditSeries && (
          <button type="button" className={styles.editSeries} onClick={onEditSeries}
            title="Open the planned item to change every future occurrence instead">
            Need a lasting change? Edit the series →
          </button>
        )}

        <div className={styles.actions}>
          <button type="button" className={styles.skipBtn} onClick={() => save({ skipped: true })}
            title="Skip this one occurrence — no transaction is created, the series continues">
            Skip this occurrence
          </button>
          <button type="button" className={styles.cancelBtn} onClick={onClose}
            title="Close without changing anything">Cancel</button>
          {date > today && (
            <button type="button" className={styles.cancelBtn} onClick={handleRecordNow}
              title="Record this occurrence today with the amount above (confirm early — no further confirmation)">
              Record now
            </button>
          )}
          <button type="button" className={styles.saveBtn} onClick={handleSave}
            title="Save the one-time change for this occurrence only">
            Save one-time change
          </button>
        </div>
      </div>
    </div>
  )
}
