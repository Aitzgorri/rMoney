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
import { INDENT } from '../utils/hierarchy'
import styles from './EnvelopeTransferForm.module.css'

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTH_DAYS = Array.from({ length: 28 }, (_, i) => i + 1)

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
  const today = new Date().toISOString().split('T')[0]

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
  })

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  function handleFrequencyChange(freq) {
    setForm(prev => ({ ...prev, frequency: freq, dayOfExecution: 1 }))
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!form.amount || !form.fromEnvelopeId || !form.toEnvelopeId) return
    if (form.fromEnvelopeId === form.toEnvelopeId) return

    if (mode === 'one-time') {
      const data = {
        fromEnvelopeId: form.fromEnvelopeId,
        toEnvelopeId:   form.toEnvelopeId,
        amount:         form.amount,
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
        amount:         Number(form.amount),
        frequency:      form.frequency,
        dayOfExecution: Number(form.dayOfExecution),
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
          {flat.map(e => (
            <option key={e.id} value={e.id}>
              {INDENT.repeat(e.depth)}{e.name}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <label className={styles.label}>To</label>
        <select
          className={styles.input}
          value={form.toEnvelopeId}
          onChange={e => set('toEnvelopeId', e.target.value)}
        >
          {flat.map(e => (
            <option key={e.id} value={e.id}>
              {INDENT.repeat(e.depth)}{e.name}
            </option>
          ))}
        </select>
        {form.fromEnvelopeId === form.toEnvelopeId && (
          <span className={styles.error}>Source and destination must be different</span>
        )}
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Amount <span className={styles.required}>*</span></label>
        <input
          className={styles.input}
          type="number"
          step="0.01"
          min="0.01"
          value={form.amount}
          onChange={e => set('amount', e.target.value)}
          placeholder="0.00"
          required
        />
      </div>

      {mode === 'regular' && (
        <>
          <div className={styles.field}>
            <label className={styles.label}>Frequency</label>
            <select className={styles.input} value={form.frequency}
              onChange={e => handleFrequencyChange(e.target.value)}>
              <option value="monthly">Monthly</option>
              <option value="weekly">Weekly</option>
            </select>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>
              {form.frequency === 'monthly' ? 'Day of month' : 'Day of week'}
            </label>
            <select className={styles.input} value={form.dayOfExecution}
              onChange={e => set('dayOfExecution', Number(e.target.value))}>
              {form.frequency === 'monthly'
                ? MONTH_DAYS.map(d => <option key={d} value={d}>{d}</option>)
                : WEEKDAYS.map((w, i) => <option key={i} value={i}>{w}</option>)
              }
            </select>
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
