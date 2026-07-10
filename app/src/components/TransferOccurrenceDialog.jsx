import { useState } from 'react'
import { applyScheduledTransferOverride } from '../data/envelopes'
import { parseAmount, fmtAmt } from '../utils/format'
import { formatDate, localDateStr } from '../utils/dates'
import AmountInput from './AmountInput'
// Same visual language as the Bills & Income occurrence dialog (Phase 55d).
import styles from './OccurrenceOverrideDialog.module.css'

// One-time edit of a single scheduled-transfer occurrence (Phase 64b — mirrors
// the Bills & Income dialog): move its date, adjust its amount, or skip it —
// the rule itself keeps its schedule. A chosen date that has arrived fires the
// transfer immediately (D4: intentional date choice, no waiting for app open).
//
// Props: rule (the scheduled transfer), occurrence ({ date, seriesDate, amount,
// overridden } from nextScheduledOccurrenceInfo), routeLabel ("From → To"),
// optional onEditSeries, onClose, onSaved.
export default function TransferOccurrenceDialog({ rule, occurrence, routeLabel, onEditSeries, onClose, onSaved }) {
  const [date, setDate]     = useState(occurrence.date)
  const [amount, setAmount] = useState(String(occurrence.amount))

  const effAmount = () => {
    const a = parseAmount(amount)
    return Number.isFinite(a) ? a : occurrence.amount
  }
  const today = localDateStr()

  function handleSkip() {
    applyScheduledTransferOverride(rule.id, occurrence.seriesDate, { skipped: true })
    onSaved()
  }

  function handleSave() {
    applyScheduledTransferOverride(rule.id, occurrence.seriesDate, { date, amount: effAmount() })
    onSaved()
  }

  function handleRecordNow() {
    applyScheduledTransferOverride(rule.id, occurrence.seriesDate, { date: today, amount: effAmount() })
    onSaved()
  }

  return (
    <div className={styles.backdrop}>
      <div className={styles.dialog}>
        <h3 className={styles.title}>{routeLabel}</h3>
        <p className={styles.subtitle}>
          One-time change to the {formatDate(occurrence.seriesDate)} occurrence — the rule keeps
          its schedule ({fmtAmt(rule.amount)}).
        </p>

        <label className={styles.label}>Date
          <input className={styles.input} type="date" value={date} onChange={e => setDate(e.target.value)} />
        </label>
        <label className={styles.label}>Amount
          <AmountInput className={styles.input} value={amount} onChange={setAmount} />
        </label>

        <p className={styles.hint}>
          {date <= today
            ? 'The chosen date has arrived — saving records the transfer immediately.'
            : `The transfer will fire on ${formatDate(date)}.`}
        </p>

        {onEditSeries && (
          <button type="button" className={styles.editSeries} onClick={onEditSeries}
            title="Open the scheduled transfer to change every future occurrence instead">
            Need a lasting change? Edit the series →
          </button>
        )}

        <div className={styles.actions}>
          <button type="button" className={styles.skipBtn} onClick={handleSkip}
            title="Skip this one occurrence — no transfer is created, the series continues">
            Skip this occurrence
          </button>
          <button type="button" className={styles.cancelBtn} onClick={onClose}
            title="Close without changing anything">Cancel</button>
          {date > today && (
            <button type="button" className={styles.cancelBtn} onClick={handleRecordNow}
              title="Record this occurrence today with the amount above">
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
