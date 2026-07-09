import { useState } from 'react'
import {
  getActiveEnvelopes,
  getEnvelopesFlat,
  getDefaultIncomeEnvelope,
  createEnvelopeTransfer,
  updateEnvelopeTransfer,
  createScheduledTransfer,
  updateScheduledTransfer,
} from '../data/envelopes'
import { parseAmount } from '../utils/format'
import { localDateStr } from '../utils/dates'
import { getFavoriteEnvelopes } from '../data/settings'
import { favoritesOptgroup, treeOptions } from './optionHelpers'
import { RECURRING_FREQUENCIES, WEEKDAYS, MONTH_DAYS, dayPickerKind } from '../utils/frequency'
import AmountInput from './AmountInput'
import styles from './EnvelopeTransferForm.module.css'

export default function EnvelopeTransferForm({
  initial,
  defaultFromEnvelopeId,
  defaultToEnvelopeId,
  defaultMode = 'one-time',
  onSave,
  onCancel,
  onDelete,
  inline = false,
}) {
  const envelopes = getActiveEnvelopes()
  const flat = getEnvelopesFlat(envelopes)
  const defaultIncome = getDefaultIncomeEnvelope()
  const favEnvIds = getFavoriteEnvelopes()   // Favorites group atop both selects (Phase 53e)
  const today = localDateStr()

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // Determine initial mode: editing keeps the record's kind, new uses defaultMode
  const initialMode = initial
    ? (initial.frequency ? 'regular' : 'one-time')
    : defaultMode

  const [mode, setMode] = useState(initialMode)

  const initialFromId = initial?.fromEnvelopeId
    ?? defaultFromEnvelopeId
    ?? defaultIncome?.id
    ?? flat[0]?.id ?? ''

  const initialToId = initial?.toEnvelopeId
    ?? defaultToEnvelopeId
    ?? flat.find(e => e.id !== initialFromId)?.id ?? ''

  const [form, setForm] = useState({
    fromEnvelopeId: initialFromId,
    toEnvelopeId:   initialToId,
    amount:         initial?.amount         ?? '',
    date:           initial?.date           ?? today,
    note:           initial?.note           ?? '',
    frequency:      initial?.frequency      ?? 'monthly',
    dayOfExecution: initial?.dayOfExecution ?? 1,
    startDate:      initial?.startDate      ?? '',   // optional cadence anchor/gate (Phase 53f)
  })

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  function handleFrequencyChange(freq) {
    setForm(prev => ({
      ...prev,
      frequency: freq,
      dayOfExecution: dayPickerKind(prev.frequency) !== dayPickerKind(freq) ? 1 : prev.dayOfExecution,
    }))
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!form.amount || !form.fromEnvelopeId || !form.toEnvelopeId) return
    if (form.fromEnvelopeId === form.toEnvelopeId) return

    if (mode === 'one-time') {
      const data = {
        fromEnvelopeId: form.fromEnvelopeId,
        toEnvelopeId:   form.toEnvelopeId,
        amount:         parseAmount(form.amount),
        date:           form.date,
        note:           form.note,
      }
      if (initial && !initial.frequency) {
        updateEnvelopeTransfer(initial.id, data)
      } else {
        createEnvelopeTransfer(data)
      }
    } else {
      const data = {
        fromEnvelopeId: form.fromEnvelopeId,
        toEnvelopeId:   form.toEnvelopeId,
        amount:         parseAmount(form.amount),
        frequency:      form.frequency,
        dayOfExecution: Number(form.dayOfExecution),
        startDate:      form.startDate || null,
        note:           form.note,
      }
      if (initial && initial.frequency) {
        updateScheduledTransfer(initial.id, data)
      } else {
        createScheduledTransfer(data)
      }
    }
    onSave()
  }

  const isEdit = !!initial

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      {showDeleteConfirm && (
        <div className={styles.overlay}>
          <div className={styles.dialog}>
            <h3>Delete this {mode === 'regular' ? 'scheduled ' : ''}transfer?</h3>
            <p>This cannot be undone.</p>
            <div className={styles.dialogActions}>
              <button type="button" className={styles.cancelBtn} onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
              <button type="button" className={styles.deleteConfirmBtn} onClick={onDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {!inline && (
        <div className={styles.header}>
          <button type="button" className={styles.backBtn} onClick={onCancel}>← Back</button>
          <h2 className={styles.title}>{isEdit ? 'Edit' : 'New'} Transfer</h2>
          <span style={{ width: 60 }} />
        </div>
      )}

      {/* One-time / Regular toggle — only when creating */}
      {!isEdit && (
        <div className={styles.modeToggle}>
          <button
            type="button"
            className={`${styles.modeBtn} ${mode === 'one-time' ? styles.modeActive : ''}`}
            onClick={() => setMode('one-time')}
          >
            One-time
          </button>
          <button
            type="button"
            className={`${styles.modeBtn} ${mode === 'regular' ? styles.modeActive : ''}`}
            onClick={() => setMode('regular')}
          >
            Regular
          </button>
        </div>
      )}

      <div className={styles.field}>
        <label className={styles.label}>From</label>
        <select
          className={styles.input}
          value={form.fromEnvelopeId}
          onChange={e => set('fromEnvelopeId', e.target.value)}
        >
          {favoritesOptgroup(flat, favEnvIds)}
          {treeOptions(flat)}
        </select>
      </div>

      <div className={styles.field}>
        <label className={styles.label}>To</label>
        <select
          className={styles.input}
          value={form.toEnvelopeId}
          onChange={e => set('toEnvelopeId', e.target.value)}
        >
          {favoritesOptgroup(flat, favEnvIds)}
          {treeOptions(flat)}
        </select>
        {form.fromEnvelopeId === form.toEnvelopeId && (
          <span className={styles.error}>Source and destination must be different</span>
        )}
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Amount <span className={styles.required}>*</span></label>
        <AmountInput
          className={styles.input}
          value={form.amount}
          onChange={v => set('amount', v)}
          placeholder="0,00"
          required
        />
      </div>

      {mode === 'regular' && (
        <>
          <div className={styles.field}>
            <label className={styles.label}>Frequency</label>
            <select className={styles.input} value={form.frequency}
              onChange={e => handleFrequencyChange(e.target.value)}>
              {RECURRING_FREQUENCIES.map(f => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>
              {dayPickerKind(form.frequency) === 'weekday' ? 'Day of week' : 'Day of month'}
            </label>
            <select className={styles.input} value={form.dayOfExecution}
              onChange={e => set('dayOfExecution', Number(e.target.value))}>
              {dayPickerKind(form.frequency) === 'weekday'
                ? WEEKDAYS.map((w, i) => <option key={i} value={i}>{w}</option>)
                : MONTH_DAYS.map(d => <option key={d} value={d}>{d}</option>)
              }
            </select>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Start date (optional)</label>
            <input
              className={styles.input}
              type="date"
              value={form.startDate}
              onChange={e => set('startDate', e.target.value)}
              title="The transfer never fires before this date; bi-weekly, quarterly and yearly cadences count from it. Leave empty to start immediately."
            />
          </div>
        </>
      )}

      {mode === 'one-time' && (
        <div className={styles.field}>
          <label className={styles.label}>Date</label>
          <input
            className={styles.input}
            type="date"
            value={form.date}
            onChange={e => set('date', e.target.value)}
          />
        </div>
      )}

      <div className={styles.field}>
        <label className={styles.label}>Note</label>
        <input
          className={styles.input}
          value={form.note}
          onChange={e => set('note', e.target.value)}
          placeholder="Optional"
        />
      </div>

      <div className={styles.actions}>
        <button type="button" className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
        <button type="submit" className={styles.saveBtn}
          disabled={form.fromEnvelopeId === form.toEnvelopeId}>
          {isEdit ? 'Save' : mode === 'one-time' ? 'Transfer' : 'Save'}
        </button>
      </div>

      {onDelete && (
        <button type="button" className={styles.deleteBtn} onClick={() => setShowDeleteConfirm(true)}>
          Delete transfer
        </button>
      )}
    </form>
  )
}
