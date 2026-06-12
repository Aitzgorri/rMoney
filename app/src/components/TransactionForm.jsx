import { useState } from 'react'
import { getActiveAccounts } from '../data/accounts'
import { getCategoriesFlat, getDefaultCategoryId } from '../data/categories'
import { getActiveEnvelopes, getEnvelopesFlat, getDefaultIncomeEnvelope, getDefaultExpenseEnvelope } from '../data/envelopes'
import { createTransaction, updateTransaction } from '../data/transactions'
import PayeeAutocomplete from './PayeeAutocomplete'
import { createPlannedItem } from '../data/bills'
import { INDENT } from '../utils/hierarchy'
import { parseAmount } from '../utils/format'
import AmountInput from './AmountInput'
import styles from './TransactionForm.module.css'

const FREQUENCIES = ['monthly', 'weekly', 'yearly']
const DAYS = Array.from({ length: 28 }, (_, i) => i + 1)
const TODAY = new Date().toISOString().split('T')[0]


export default function TransactionForm({ initial, onSave, onCancel, onDelete, inline = false }) {
  const [type, setType] = useState(initial?.type ?? 'expense')

  const accounts  = getActiveAccounts()
  const envelopes = getEnvelopesFlat(getActiveEnvelopes())

  const categories = getCategoriesFlat(type === 'income' ? 'income' : 'expense')

  const [form, setForm] = useState(() => initial ?? {
    amount:              '',
    currency:            accounts[0]?.currency ?? 'EUR',
    accountId:           accounts[0]?.id ?? '',
    categoryId:          '',
    envelopeId:          '',
    payeeName:           '',
    date:                TODAY,
    note:                '',
    // transfer fields
    sourceAccountId:      accounts[0]?.id ?? '',
    sourceAmount:         '',
    destinationAccountId: accounts[1]?.id ?? '',
    destinationAmount:    '',
    transferFee:          '0',
    // recurring
    isRecurring:          false,
    recurringName:        '',
    frequency:            'monthly',
    dayOfExecution:       1,
    applicationMode:      'auto-apply',
  })

  const [showRecurring, setShowRecurring] = useState(initial?.isRecurring ?? false)

  function handleRecurringToggle(checked) {
    setShowRecurring(checked)
    // Pre-populate name with payee when turning on for the first time
    if (checked && !form.recurringName) {
      set('recurringName', form.payeeName?.trim() || '')
    }
  }

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  function handlePayeeInput(value) {
    set('payeeName', value)
    // Keep recurringName in sync with payee while the user hasn't edited it manually
    if (showRecurring && form.recurringName === (form.payeeName ?? '')) {
      set('recurringName', value)
    }
  }

  function handleSubmit(e) {
    e.preventDefault()
    const data = { ...form, type }

    // Normalise money fields — AmountInput stores raw strings (comma or dot) — Phase 45h
    data.amount = parseAmount(form.amount)
    data.transferFee = parseAmount(form.transferFee) || 0
    if (type === 'transfer') {
      data.sourceAmount = parseAmount(form.sourceAmount)
      data.destinationAmount = parseAmount(form.destinationAmount)
    }

    // Prevent transferring to the same account
    if (type === 'transfer' && data.sourceAccountId === data.destinationAccountId) {
      alert('Source and destination accounts must be different.')
      return
    }

    // Resolve default payee if none entered
    if (type !== 'transfer' && !data.payeeName?.trim()) {
      data.payeeName = 'Unspecified payee'
    }

    // Resolve default category if none selected
    if (type !== 'transfer' && !data.categoryId) {
      const defaultCategoryId = getDefaultCategoryId(type)
      if (defaultCategoryId) data.categoryId = defaultCategoryId
    }

    // Resolve default envelope if none selected
    if (type !== 'transfer' && !data.envelopeId) {
      const defaultEnvelope = type === 'income'
        ? getDefaultIncomeEnvelope()
        : getDefaultExpenseEnvelope()
      if (defaultEnvelope) data.envelopeId = defaultEnvelope.id
    }

    // Derive exchange rate for cross-currency transfers
    if (type === 'transfer') {
      const src  = accounts.find(a => a.id === form.sourceAccountId)
      const dest = accounts.find(a => a.id === form.destinationAccountId)
      data.sourceCurrency      = src?.currency ?? ''
      data.destinationCurrency = dest?.currency ?? ''
      // For same-currency transfers, destination receives exactly what source sends
      if (!isCrossCurrency) {
        data.destinationAmount = data.sourceAmount
      }
      if (Number(data.sourceAmount) > 0 && Number(data.destinationAmount) > 0) {
        data.exchangeRate = (Number(data.destinationAmount) / Number(data.sourceAmount)).toFixed(6)
      }
    }

    if (initial) {
      updateTransaction(initial.id, data)
    } else {
      createTransaction(data)
    }

    // Create a planned item in Bills & Income when the recurring toggle is on
    if (!initial && showRecurring) {
      const account = accounts.find(a => a.id === data.accountId)
      const itemName = form.recurringName?.trim() || form.payeeName?.trim() || `Recurring ${type}`
      createPlannedItem({
        type,
        name:            itemName,
        amount:          Number(data.amount),
        currency:        account?.currency ?? data.currency,
        accountId:       data.accountId,
        categoryId:      data.categoryId || null,
        envelopeId:      data.envelopeId || null,
        payee:           form.payeeName?.trim() || '',
        frequency:       form.frequency,
        dayOfExecution:  form.dayOfExecution,
        startDate:       data.date,
        applicationMode: form.applicationMode,
      })
    }

    onSave()
  }

  // Derived: are the two transfer accounts different currencies?
  const srcAccount  = accounts.find(a => a.id === form.sourceAccountId)
  const destAccount = accounts.find(a => a.id === form.destinationAccountId)
  const isCrossCurrency = srcAccount && destAccount && srcAccount.currency !== destAccount.currency

  const isEdit = !!initial

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      {!inline && (
        <div className={styles.header}>
          <button type="button" className={styles.backBtn} onClick={onCancel}>← Back</button>
          <h2 className={styles.title}>{isEdit ? 'Edit' : 'New'} Transaction</h2>
          <span style={{ width: 60 }} />
        </div>
      )}

      {/* Type selector — only show when creating */}
      {!isEdit && (
        <div className={styles.typeSelector}>
          {['income', 'expense', 'transfer'].map(t => (
            <button
              key={t}
              type="button"
              className={`${styles.typeBtn} ${type === t ? styles.typeActive : ''} ${styles['type_' + t]}`}
              onClick={() => setType(t)}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      )}

      {type !== 'transfer' ? (
        <>
          <div className={styles.row}>
            <div className={styles.field} style={{ flex: 2 }}>
              <label className={styles.label}>Amount *</label>
              <AmountInput className={styles.input}
                value={form.amount} onChange={v => set('amount', v)}
                placeholder="0,00" required />
            </div>
            <div className={styles.field} style={{ flex: 1 }}>
              <label className={styles.label}>Currency</label>
              <input className={styles.input} value={
                accounts.find(a => a.id === form.accountId)?.currency ?? '—'
              } readOnly />
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Account *</label>
            <select className={styles.input} value={form.accountId}
              onChange={e => set('accountId', e.target.value)} required>
              {accounts.map(a => (
                <option key={a.id} value={a.id}>{a.accountName} ({a.currency})</option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Category</label>
            <select className={styles.input} value={form.categoryId}
              onChange={e => set('categoryId', e.target.value)}>
              <option value="">— Uncategorized —</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>{INDENT.repeat(c.depth)}{c.name}</option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Envelope</label>
            <select className={styles.input} value={form.envelopeId}
              onChange={e => set('envelopeId', e.target.value)}>
              <option value="">— Default —</option>
              {envelopes.map(e => (
                <option key={e.id} value={e.id}>{INDENT.repeat(e.depth)}{e.name}</option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Payee</label>
            <PayeeAutocomplete className={styles.input} value={form.payeeName}
              onChange={handlePayeeInput} placeholder="e.g. Gas Station XYZ" />
          </div>
        </>
      ) : (
        <>
          <div className={styles.field}>
            <label className={styles.label}>From account *</label>
            <select className={styles.input} value={form.sourceAccountId}
              onChange={e => set('sourceAccountId', e.target.value)} required>
              {accounts.map(a => (
                <option key={a.id} value={a.id}>{a.accountName} ({a.currency})</option>
              ))}
            </select>
          </div>

          {isCrossCurrency && (
            <div className={styles.row}>
              <div className={styles.field} style={{ flex: 2 }}>
                <label className={styles.label}>Sent *</label>
                <AmountInput className={styles.input}
                  value={form.sourceAmount} onChange={v => set('sourceAmount', v)}
                  placeholder="0,00" required />
              </div>
              <div className={styles.field} style={{ flex: 1 }}>
                <label className={styles.label}>Currency</label>
                <input className={styles.input} value={srcAccount?.currency ?? '—'} readOnly />
              </div>
            </div>
          )}

          <div className={styles.field}>
            <label className={styles.label}>Fee (optional)</label>
            <AmountInput className={styles.input}
              value={form.transferFee} onChange={v => set('transferFee', v)}
              placeholder="0,00" />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>To account *</label>
            <select className={styles.input} value={form.destinationAccountId}
              onChange={e => set('destinationAccountId', e.target.value)} required>
              {accounts.map(a => (
                <option key={a.id} value={a.id}>{a.accountName} ({a.currency})</option>
              ))}
            </select>
          </div>

          <div className={styles.row}>
            <div className={styles.field} style={{ flex: 2 }}>
              <label className={styles.label}>{isCrossCurrency ? 'Received *' : 'Amount *'}</label>
              <AmountInput className={styles.input}
                value={isCrossCurrency ? form.destinationAmount : form.sourceAmount}
                onChange={v => isCrossCurrency
                  ? set('destinationAmount', v)
                  : set('sourceAmount', v)}
                placeholder="0,00" required />
            </div>
            <div className={styles.field} style={{ flex: 1 }}>
              <label className={styles.label}>Currency</label>
              <input className={styles.input} value={destAccount?.currency ?? '—'} readOnly />
            </div>
          </div>

          {isCrossCurrency && parseAmount(form.sourceAmount) > 0 && parseAmount(form.destinationAmount) > 0 && (
            <div className={styles.rateInfo}>
              Rate: 1 {srcAccount.currency} = {(parseAmount(form.destinationAmount) / parseAmount(form.sourceAmount)).toFixed(4)} {destAccount.currency}
            </div>
          )}
        </>
      )}

      <div className={styles.field}>
        <label className={styles.label}>Date</label>
        <input className={styles.input} type="date" value={form.date}
          onChange={e => set('date', e.target.value)} />
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Note</label>
        <input className={styles.input} value={form.note}
          onChange={e => set('note', e.target.value)} placeholder="Optional" />
      </div>

      {/* Recurring — only for income/expense */}
      {type !== 'transfer' && (
        <div className={styles.field}>
          <label className={styles.recurringToggle}>
            <input type="checkbox" checked={showRecurring}
              onChange={e => handleRecurringToggle(e.target.checked)} />
            Set up recurring
          </label>
          {showRecurring && (
            <div className={styles.recurringBox}>
              <div className={styles.field}>
                <label className={styles.label}>Name</label>
                <input className={styles.input} value={form.recurringName}
                  onChange={e => set('recurringName', e.target.value)}
                  placeholder="e.g. Monthly rent" />
              </div>
              <div className={styles.row}>
                <div className={styles.field} style={{ flex: 1 }}>
                  <label className={styles.label}>Frequency</label>
                  <select className={styles.input} value={form.frequency}
                    onChange={e => set('frequency', e.target.value)}>
                    {FREQUENCIES.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
                <div className={styles.field} style={{ flex: 1 }}>
                  <label className={styles.label}>Day</label>
                  <select className={styles.input} value={form.dayOfExecution}
                    onChange={e => set('dayOfExecution', Number(e.target.value))}>
                    {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Application mode</label>
                <div className={styles.radioGroup}>
                  <label className={styles.radioLabel}>
                    <input type="radio" name="applicationMode" value="auto-apply"
                      checked={form.applicationMode === 'auto-apply'}
                      onChange={() => set('applicationMode', 'auto-apply')} />
                    Auto-apply <span className={styles.radioHint}>(fixed amount — transaction created automatically)</span>
                  </label>
                  <label className={styles.radioLabel}>
                    <input type="radio" name="applicationMode" value="outstanding"
                      checked={form.applicationMode === 'outstanding'}
                      onChange={() => set('applicationMode', 'outstanding')} />
                    Outstanding <span className={styles.radioHint}>(variable amount — you confirm each time)</span>
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <div className={styles.actions}>
        <button type="button" className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
        <button type="submit" className={styles.saveBtn}>
          {isEdit ? 'Save changes' : 'Save'}
        </button>
      </div>

      {isEdit && onDelete && (
        initial?.linkedFromInvestments
          ? <p className={styles.linkedNote}>This transaction was created by an investment deposit or withdrawal. To delete it, remove the movement from the Investments screen.</p>
          : <button type="button" className={styles.deleteBtn} onClick={onDelete}>Delete transaction</button>
      )}
    </form>
  )
}
