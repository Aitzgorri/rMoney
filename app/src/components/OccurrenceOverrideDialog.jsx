import { useState } from 'react'
import { applyOccurrenceOverride, skipOccurrence, confirmOccurrence } from '../data/bills'
import { parseAmount, fmtAmt } from '../utils/format'
import { formatDate, localDateStr } from '../utils/dates'
import AmountInput from './AmountInput'
import styles from './OccurrenceOverrideDialog.module.css'

// One-time edit of a single occurrence (Phase 55d, decisions D4): change its
// date / amount / note, skip it, or jump to editing the whole series. The
// series itself stays on its original schedule.
//
// Two modes:
//  • upcoming (no `entry.pendingOcc`): the occurrence is not generated yet —
//    changes are stored as a one-shot override on the item. A chosen date that
//    has arrived (e.g. "Record now") records immediately in BOTH modes.
//  • pending (`entry.pendingOcc` set): the occurrence is already generated and
//    waiting — Skip skips it, Confirm records it with the edited date/amount.
export default function OccurrenceOverrideDialog({ entry, onEditSeries, onClose, onSaved }) {
  const { item, seriesDate, pendingOcc } = entry
  const [date, setDate]     = useState(entry.date)
  const [amount, setAmount] = useState(String(entry.amount))
  const [note, setNote]     = useState('')

  const effAmount = () => {
    const amt = parseAmount(amount)
    return Number.isFinite(amt) ? amt : entry.amount
  }

  function handleSkip() {
    if (pendingOcc) skipOccurrence(pendingOcc.id)
    else applyOccurrenceOverride(item.id, seriesDate, { skipped: true })
    onSaved()
  }

  function handleSave() {
    if (pendingOcc) {
      confirmOccurrence(pendingOcc.id, effAmount(), {
        type:       item.type,
        accountId:  item.accountId,
        currency:   item.currency,
        categoryId: item.categoryId ?? null,
        envelopeId: item.envelopeId ?? null,
        payeeName:  item.payee ?? '',
        note:       note.trim() || item.name,
        date,
        ...(item.countInNextPeriod ? { periodShift: 'next' } : {}),
      })
    } else {
      applyOccurrenceOverride(item.id, seriesDate, { date, amount: effAmount(), note })
    }
    onSaved()
  }

  function handleRecordNow() {
    applyOccurrenceOverride(item.id, seriesDate, { date: localDateStr(), amount: effAmount(), note })
    onSaved()
  }

  const today = localDateStr()

  return (
    <div className={styles.backdrop}>
      <div className={styles.dialog}>
        <h3 className={styles.title}>{item.name}</h3>
        <p className={styles.subtitle}>
          {pendingOcc
            ? `This occurrence (due ${formatDate(seriesDate)}) is waiting for confirmation — confirm it with the values below, skip it, or edit the series`
            : `One-time change to the ${formatDate(seriesDate)} occurrence — the series keeps its schedule`}
          {' '}({fmtAmt(item.amount)} {item.currency}).
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
          {pendingOcc
            ? 'Confirming records the transaction with the date and amount above.'
            : date <= today
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
          <button type="button" className={styles.skipBtn} onClick={handleSkip}
            title="Skip this one occurrence — no transaction is created, the series continues">
            Skip this occurrence
          </button>
          <button type="button" className={styles.cancelBtn} onClick={onClose}
            title="Close without changing anything">Cancel</button>
          {!pendingOcc && date > today && (
            <button type="button" className={styles.cancelBtn} onClick={handleRecordNow}
              title="Record this occurrence today with the amount above (confirm early — no further confirmation)">
              Record now
            </button>
          )}
          <button type="button" className={styles.saveBtn} onClick={handleSave}
            title={pendingOcc
              ? 'Confirm this occurrence — creates the transaction with the date and amount above'
              : 'Save the one-time change for this occurrence only'}>
            {pendingOcc ? 'Confirm' : 'Save one-time change'}
          </button>
        </div>
      </div>
    </div>
  )
}
