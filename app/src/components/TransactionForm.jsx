import { useState } from 'react'
import { getActiveAccounts } from '../data/accounts'
import { getCategoriesFlat, getDefaultCategoryId, createCategory } from '../data/categories'
import { getActiveEnvelopes, getEnvelopesFlat, getEnvelopes, envelopePathLabel, getDefaultIncomeEnvelope, getDefaultExpenseEnvelope } from '../data/envelopes'
import { createTransaction, updateTransaction, getRecentCategoriesForPayee, getRecentEnvelopesForPayee } from '../data/transactions'
import { getFavoriteAccounts, getFavoriteIncomeCategories, getFavoriteExpenseCategories, getFavoriteEnvelopes } from '../data/settings'
import PayeeAutocomplete from './PayeeAutocomplete'
import { createPlannedItem } from '../data/bills'
import { parseAmount } from '../utils/format'
import { RECURRING_FREQUENCIES, WEEKDAYS, MONTH_DAYS, dayPickerKind } from '../utils/frequency'
import { localDateStr } from '../utils/dates'
import { accountOptions, favoritesOptgroup, treeOptions } from './optionHelpers'
import AmountInput from './AmountInput'
import styles from './TransactionForm.module.css'

const TODAY = localDateStr()
const NEW_CATEGORY = '__new__'   // sentinel option value for inline category create (51e)


export default function TransactionForm({ initial, defaultAccountId, onSave, onCancel, onDelete, inline = false }) {
  const [type, setType] = useState(initial?.type ?? 'expense')

  const accounts  = getActiveAccounts()
  const envelopes = getEnvelopesFlat(getActiveEnvelopes())

  const categories = getCategoriesFlat(type === 'income' ? 'income' : 'expense')

  // Prefill the account from the caller (left-column filter or last-used) when
  // creating; fall back to the first account (Phase 51d).
  const defaultAccount = (defaultAccountId && accounts.find(a => a.id === defaultAccountId)) || accounts[0]

  // Inline category creation (Phase 51e)
  const [showNewCategory, setShowNewCategory] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [newCatParent, setNewCatParent] = useState('')

  const [form, setForm] = useState(() => initial ?? {
    amount:              '',
    currency:            defaultAccount?.currency ?? 'EUR',
    accountId:           defaultAccount?.id ?? '',
    categoryId:          '',
    envelopeId:          '',
    payeeName:           '',
    date:                TODAY,
    note:                '',
    // transfer fields — From follows the same filter → last-used prefill as the
    // expense account (Phase 54b); To picks the first *different* account so the
    // form never opens with source === destination.
    sourceAccountId:      defaultAccount?.id ?? '',
    sourceAmount:         '',
    destinationAccountId: accounts.find(a => a.id !== defaultAccount?.id)?.id ?? '',
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
    // Phase 51f/53g: when no category / envelope is chosen yet, prefill the last
    // one used for this payee. The lookups match by exact (normalized) name, so
    // partial typing returns nothing — only a complete payee prefills.
    if (type !== 'transfer' && !form.categoryId) {
      const recent = getRecentCategoriesForPayee(value, type, 1)
      if (recent[0]) set('categoryId', recent[0])
    }
    if (type !== 'transfer' && !form.envelopeId) {
      const recent = getRecentEnvelopesForPayee(value, type, 1)
      if (recent[0]) set('envelopeId', recent[0])
    }
  }

  // Category dropdown change — the sentinel option opens the inline create row
  // instead of selecting a category (Phase 51e).
  function handleCategorySelect(value) {
    if (value === NEW_CATEGORY) { setShowNewCategory(true); return }
    set('categoryId', value)
  }

  function handleCreateCategory() {
    const name = newCatName.trim()
    if (!name) return
    const cat = createCategory({ type, name, parentId: newCatParent || null })
    set('categoryId', cat.id)
    setNewCatName('')
    setNewCatParent('')
    setShowNewCategory(false)
  }

  // Switching between a weekday picker and a day-of-month picker invalidates the
  // stored dayOfExecution, so reset it to a safe default when the kind changes.
  function handleFrequencyChange(freq) {
    setForm(prev => ({
      ...prev,
      frequency: freq,
      dayOfExecution: dayPickerKind(prev.frequency) !== dayPickerKind(freq) ? 1 : prev.dayOfExecution,
    }))
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

  // ── Favorites-aware dropdown data (Phase 51c/51f/51h; shared helpers 53e) ──
  // Accounts (flat): ★ favorites, divider, rest. Categories/envelopes
  // (hierarchical): payee-recents block (categories only), then a Favorites
  // group, then the FULL indented tree (A1 — favorites are a shortcut, the
  // tree stays complete). Recents/favorites de-duplicated against each other.
  const favAcctIds = getFavoriteAccounts()
  const catById = new Map(categories.map(c => [c.id, c]))
  const recentCats = (type !== 'transfer' ? getRecentCategoriesForPayee(form.payeeName, type, 3) : [])
    .map(id => catById.get(id)).filter(Boolean)
  const favCatIds = type === 'income' ? getFavoriteIncomeCategories() : getFavoriteExpenseCategories()
  const envById = new Map(envelopes.map(e => [e.id, e]))
  const recentEnvs = (type !== 'transfer' ? getRecentEnvelopesForPayee(form.payeeName, type, 3) : [])
    .map(id => envById.get(id)).filter(Boolean)
  const allEnvelopes = getEnvelopes()   // incl. archived, for the path label

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      {!inline && (
        <div className={styles.header}>
          <button type="button" className={styles.backBtn} onClick={onCancel} title="Go back without saving">← Back</button>
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
              title={t === 'income' ? 'Record an income' : t === 'expense' ? 'Record an expense' : 'Record a transfer'}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      )}

      {type !== 'transfer' ? (
        <>
          {/* Row 1 (desktop): Date · Account · Payee */}
          <div className={styles.row}>
            <div className={styles.field} style={{ flex: 1 }}>
              <label className={styles.label}>Date</label>
              <input className={styles.input} type="date" value={form.date}
                onChange={e => set('date', e.target.value)} />
            </div>
            <div className={styles.field} style={{ flex: 2 }}>
              <label className={styles.label}>Account *</label>
              <select className={styles.input} value={form.accountId}
                onChange={e => set('accountId', e.target.value)} required>
                {accountOptions(accounts, favAcctIds)}
              </select>
            </div>
            <div className={styles.field} style={{ flex: 2 }}>
              <label className={styles.label}>Payee</label>
              <PayeeAutocomplete className={styles.input} value={form.payeeName}
                onChange={handlePayeeInput} placeholder="e.g. Gas Station XYZ" />
            </div>
          </div>

          {/* Row 2 (desktop): Category · Envelope · Amount · Currency */}
          <div className={styles.row}>
            <div className={styles.field} style={{ flex: 2 }}>
              <label className={styles.label}>Category</label>
              <select className={styles.input} value={form.categoryId}
                onChange={e => handleCategorySelect(e.target.value)}>
                <option value="">— Uncategorized —</option>
                {recentCats.length > 0 && (
                  <optgroup label="Recent for this payee">
                    {recentCats.map(c => <option key={`r${c.id}`} value={c.id}>↻ {c.name}</option>)}
                  </optgroup>
                )}
                {favoritesOptgroup(categories, favCatIds, recentCats.map(c => c.id))}
                {treeOptions(categories)}
                <option value={NEW_CATEGORY}>＋ New category…</option>
              </select>
              {showNewCategory && (
                <div className={styles.newCatBox}>
                  <input className={styles.input} value={newCatName} autoFocus
                    onChange={e => setNewCatName(e.target.value)}
                    placeholder={`New ${type} category name`}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleCreateCategory() } }} />
                  <select className={styles.input} value={newCatParent}
                    onChange={e => setNewCatParent(e.target.value)}>
                    <option value="">（top level）</option>
                    {treeOptions(categories)}
                  </select>
                  <div className={styles.newCatActions}>
                    <button type="button" className={styles.newCatAdd} onClick={handleCreateCategory} title="Create this category">Add</button>
                    <button type="button" className={styles.newCatCancel} title="Cancel creating a category"
                      onClick={() => { setShowNewCategory(false); setNewCatName('') }}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
            <div className={styles.field} style={{ flex: 2 }}>
              <label className={styles.label}>Envelope</label>
              <select className={styles.input} value={form.envelopeId}
                onChange={e => set('envelopeId', e.target.value)}>
                <option value="">— Default —</option>
                {recentEnvs.length > 0 && (
                  <optgroup label="Recent for this payee">
                    {recentEnvs.map(e => <option key={`r${e.id}`} value={e.id}>↻ {e.name}</option>)}
                  </optgroup>
                )}
                {favoritesOptgroup(envelopes, getFavoriteEnvelopes(), recentEnvs.map(e => e.id))}
                {treeOptions(envelopes)}
              </select>
              {form.envelopeId && (
                <span className={styles.envPath}>{envelopePathLabel(form.envelopeId, '›', allEnvelopes)}</span>
              )}
            </div>
            <div className={styles.field} style={{ flex: 1 }}>
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

          {/* Row 3: Note */}
          <div className={styles.field}>
            <label className={styles.label}>Note</label>
            <input className={styles.input} value={form.note}
              onChange={e => set('note', e.target.value)} placeholder="Optional" />
          </div>

          {/* Income only: per-transaction next-period attribution (Phase 55f) */}
          {type === 'income' && (
            <label className={styles.recurringToggle}
              title="Count this income toward the FOLLOWING planning period's summary (for money received shortly before a new period starts)">
              <input type="checkbox" checked={form.periodShift === 'next'}
                onChange={e => set('periodShift', e.target.checked ? 'next' : null)} />
              Count in the next planning period
            </label>
          )}
        </>
      ) : (
        <>
          {/* Row 1 (desktop): Date · From account · To account */}
          <div className={styles.row}>
            <div className={styles.field} style={{ flex: 1 }}>
              <label className={styles.label}>Date</label>
              <input className={styles.input} type="date" value={form.date}
                onChange={e => set('date', e.target.value)} />
            </div>
            <div className={styles.field} style={{ flex: 2 }}>
              <label className={styles.label}>From account *</label>
              <select className={styles.input} value={form.sourceAccountId}
                onChange={e => set('sourceAccountId', e.target.value)} required>
                {accountOptions(accounts, favAcctIds)}
              </select>
            </div>
            <div className={styles.field} style={{ flex: 2 }}>
              <label className={styles.label}>To account *</label>
              <select className={styles.input} value={form.destinationAccountId}
                onChange={e => set('destinationAccountId', e.target.value)} required>
                {accountOptions(accounts, favAcctIds)}
              </select>
            </div>
          </div>

          {/* Cross-currency only: amount sent in the source currency */}
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

          {/* Row 2 (desktop): Amount/Received · Fee · Currency */}
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
              <label className={styles.label}>Fee</label>
              <AmountInput className={styles.input}
                value={form.transferFee} onChange={v => set('transferFee', v)}
                placeholder="0,00" />
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

          {/* Row 3: Note */}
          <div className={styles.field}>
            <label className={styles.label}>Note</label>
            <input className={styles.input} value={form.note}
              onChange={e => set('note', e.target.value)} placeholder="Optional" />
          </div>
        </>
      )}

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
              {/* One row on desktop: Name · Frequency · Day */}
              <div className={styles.row}>
                <div className={styles.field} style={{ flex: 2 }}>
                  <label className={styles.label}>Name</label>
                  <input className={styles.input} value={form.recurringName}
                    onChange={e => set('recurringName', e.target.value)}
                    placeholder="e.g. Monthly rent" />
                </div>
                <div className={styles.field} style={{ flex: 1 }}>
                  <label className={styles.label}>Frequency</label>
                  <select className={styles.input} value={form.frequency}
                    onChange={e => handleFrequencyChange(e.target.value)}>
                    {RECURRING_FREQUENCIES.map(f => (
                      <option key={f.value} value={f.value}>{f.label}</option>
                    ))}
                  </select>
                </div>
                <div className={styles.field} style={{ flex: 1 }}>
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
        <button type="button" className={styles.cancelBtn} onClick={onCancel} title="Discard changes and close the form">Cancel</button>
        <button type="submit" className={styles.saveBtn} title={isEdit ? 'Save changes to this transaction' : 'Save this transaction'}>
          {isEdit ? 'Save changes' : 'Save'}
        </button>
      </div>

      {isEdit && onDelete && (
        initial?.linkedFromInvestments
          ? <p className={styles.linkedNote}>This transaction was created by an investment deposit or withdrawal. To delete it, remove the movement from the Investments screen.</p>
          : <button type="button" className={styles.deleteBtn} onClick={onDelete} title="Delete this transaction (asks for confirmation)">Delete transaction</button>
      )}
    </form>
  )
}
