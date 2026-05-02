import { useState, useRef } from 'react'
import {
  getPlannedItems,
  createPlannedItem,
  updatePlannedItem,
  deletePlannedItem,
  getPendingOccurrences,
  confirmOccurrence,
  skipOccurrence,
  getNextOccurrenceDate,
  getUpcomingOccurrences,
  checkAndGeneratePending,
} from '../data/bills'
import { getActiveAccounts } from '../data/accounts'
import { getCategoriesFlat } from '../data/categories'
import { getActiveEnvelopes, getEnvelopesFlat } from '../data/envelopes'
import { INDENT } from '../utils/hierarchy'
import { formatDate } from '../utils/dates'
import styles from './BillsAndIncome.module.css'
import { fmtAmt } from '../utils/format'

const FREQUENCIES = [
  { value: 'one-time',   label: 'One-time' },
  { value: 'weekly',     label: 'Weekly' },
  { value: 'monthly',    label: 'Monthly' },
  { value: 'quarterly',  label: 'Quarterly' },
  { value: 'yearly',     label: 'Yearly' },
]

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTH_DAYS = Array.from({ length: 28 }, (_, i) => i + 1)

const TODAY = new Date().toISOString().split('T')[0]

function daysOverdue(dueDate) {
  const due   = new Date(dueDate)
  const today = new Date(TODAY)
  const diff  = Math.floor((today - due) / 86400000)
  return diff
}


export default function BillsAndIncome({ onBack }) {
  const [view,         setView]        = useState('list')   // 'list' | 'upcoming'
  const [editItem,     setEditItem]    = useState(null)     // null | 'new-income' | 'new-expense' | item
  const [deleteTarget, setDeleteTarget] = useState(null)   // null | item
  const [filterType,   setFilterType]  = useState('all')    // 'all' | 'income' | 'expense'
  const [sortBy,       setSortBy]      = useState('name')   // 'name' | 'amount' | 'next'
  const [pendingEdits, setPendingEdits] = useState({})      // { [occId]: { amount, date } }
  const [_tick,        setTick]         = useState(0)        // bumped after any mutation to force re-render
  const confirmedRef = useRef(new Set())                     // sync guard: IDs confirmed this render cycle

  const items      = getPlannedItems().filter(i => i.isActive)
  const pending    = getPendingOccurrences().filter(p => p.status === 'pending')
  const accounts   = getActiveAccounts()
  const catsFlat   = getCategoriesFlat()
  const envsFlat   = getEnvelopesFlat(getActiveEnvelopes())

  // Enrich pending items with their parent planned item
  const todayStr = new Date().toISOString().split('T')[0]
  const enrichedPending = pending
    .map(p => ({ ...p, item: items.find(i => i.id === p.plannedItemId) }))
    .filter(p => p.item && p.dueDate <= todayStr)   // only show if the due date has arrived
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))

  function getEdit(p) {
    const e = pendingEdits[p.id]
    return {
      amount: e?.amount ?? String(p.plannedAmount ?? ''),
      date:   e?.date   ?? p.dueDate,
    }
  }

  function setEdit(id, field, value) {
    setPendingEdits(prev => ({ ...prev, [id]: { ...(prev[id] ?? {}), [field]: value } }))
  }

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleSaveItem(fields) {
    if (fields.id) {
      updatePlannedItem(fields.id, fields)
    } else {
      createPlannedItem(fields)
    }
    checkAndGeneratePending()   // generate any past-due occurrences for the saved item
    setEditItem(null)
  }

  function handleDeleteItem(item) {
    deletePlannedItem(item.id)
    setDeleteTarget(null)
    setEditItem(null)
  }

  function handleConfirmOccurrence(occ, actualAmount, actualDate) {
    if (confirmedRef.current.has(occ.id)) return   // sync guard: block before React re-renders
    confirmedRef.current.add(occ.id)
    const item = items.find(i => i.id === occ.plannedItemId)
    if (!item) return
    confirmOccurrence(occ.id, actualAmount, {
      type:       item.type,
      accountId:  item.accountId,
      currency:   item.currency,
      categoryId: item.categoryId ?? null,
      envelopeId: item.envelopeId ?? null,
      payeeName:  item.payee ?? '',
      note:       item.name,
      date:       actualDate ?? occ.dueDate,
    })
    setTick(t => t + 1)
  }

  function handleSkip(occId) {
    skipOccurrence(occId)
    setTick(t => t + 1)
  }

  function handleBulkConfirm() {
    for (const p of enrichedPending) {
      const edit = getEdit(p)
      if (!Number(edit.amount)) continue
      confirmOccurrence(p.id, Number(edit.amount), {
        type:       p.item.type,
        accountId:  p.item.accountId,
        currency:   p.item.currency,
        categoryId: p.item.categoryId ?? null,
        envelopeId: p.item.envelopeId ?? null,
        payeeName:  p.item.payee ?? '',
        note:       p.item.name,
        date:       edit.date,
      })
    }
    confirmedRef.current = new Set()
    setTick(t => t + 1)
  }

  // ── Sub-views ──────────────────────────────────────────────────────────────

  if (editItem !== null) {
    const isNew    = editItem === 'new-income' || editItem === 'new-expense'
    const initType = editItem === 'new-income' ? 'income' : editItem === 'new-expense' ? 'expense' : editItem.type
    return (
      <div className={styles.screen}>
        <PlannedItemForm
          initial={isNew ? null : editItem}
          defaultType={initType}
          accounts={accounts}
          catsFlat={catsFlat}
          envsFlat={envsFlat}
          onSave={handleSaveItem}
          onCancel={() => setEditItem(null)}
          onDelete={isNew ? null : () => setDeleteTarget(isNew ? null : editItem)}
        />
        {deleteTarget && (
          <DeleteItemDialog
            item={deleteTarget}
            onConfirm={handleDeleteItem}
            onCancel={() => setDeleteTarget(null)}
          />
        )}
      </div>
    )
  }

  // ── Filtered + sorted planned items ───────────────────────────────────────
  // Items that have a pending occurrence whose due date has arrived = outstanding
  const outstandingItemIds = new Set(enrichedPending.map(p => p.plannedItemId))

  const filtered = items.filter(i => filterType === 'all' || i.type === filterType)
  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'amount') return b.amount - a.amount
    if (sortBy === 'next') {
      const an = getNextOccurrenceDate(a) ?? '9999'
      const bn = getNextOccurrenceDate(b) ?? '9999'
      return an.localeCompare(bn)
    }
    return a.name.localeCompare(b.name)
  })
  // Exclude items already shown in the pending section above
  const incomeItems  = sorted.filter(i => i.type === 'income'  && !outstandingItemIds.has(i.id))
  const expenseItems = sorted.filter(i => i.type === 'expense' && !outstandingItemIds.has(i.id))

  const upcoming = view === 'upcoming' ? getUpcomingOccurrences() : []
  const accountMap = Object.fromEntries(accounts.map(a => [a.id, a]))

  return (
    <div className={styles.screen}>

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className={styles.header}>
        <button className={styles.backBtn} onClick={onBack}>←</button>
        <h1 className={styles.title}>Bills & Income</h1>
        <div style={{ width: 40 }} />
      </div>

      {/* ── Pending section ───────────────────────────────────────────────── */}
      {enrichedPending.length > 0 && (
        <div className={styles.pendingSection}>
          <div className={styles.pendingHeader}>
            <span className={styles.pendingTitle}>Pending ({enrichedPending.length})</span>
            <button className={styles.confirmAllBtn} onClick={handleBulkConfirm}>✓ Confirm all</button>
          </div>
          {enrichedPending.map(p => {
            const overdue = daysOverdue(p.dueDate)
            const edit    = getEdit(p)
            return (
              <div key={p.id} className={styles.pendingRow}>
                <div className={styles.pendingTop}>
                  <span className={styles.pendingName}>{p.item.name}</span>
                  <span className={styles.pendingMeta}>
                    {accountMap[p.item.accountId]?.accountName ?? '—'}
                    {overdue > 0 && <span className={styles.overdue}> · {overdue}d overdue</span>}
                  </span>
                </div>
                <div className={styles.pendingEditRow}>
                  <input
                    className={styles.pendingInput}
                    type="date"
                    value={edit.date}
                    onChange={e => setEdit(p.id, 'date', e.target.value)}
                  />
                  <input
                    className={`${styles.pendingInput} ${styles.pendingInputAmount}`}
                    type="number"
                    min="0"
                    step="0.01"
                    value={edit.amount}
                    onChange={e => setEdit(p.id, 'amount', e.target.value)}
                  />
                  <span className={styles.pendingCurrency}>{p.item.currency}</span>
                  <button
                    className={styles.confirmBtn}
                    onClick={() => handleConfirmOccurrence(p, Number(edit.amount), edit.date)}
                    disabled={!edit.amount}
                  >Confirm</button>
                  <button className={styles.skipBtn} onClick={() => handleSkip(p.id)}>Skip</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── View toggle + Add button ───────────────────────────────────────── */}
      <div className={styles.viewRow}>
        <div className={styles.viewToggle}>
          <button
            className={`${styles.viewBtn} ${view === 'list' ? styles.viewActive : ''}`}
            onClick={() => setView('list')}
          >List</button>
          <button
            className={`${styles.viewBtn} ${view === 'upcoming' ? styles.viewActive : ''}`}
            onClick={() => setView('upcoming')}
          >Upcoming</button>
        </div>
        <div className={styles.addButtons}>
          <button className={styles.addBtn} onClick={() => setEditItem('new-income')}>+ Income</button>
          <button className={styles.addBtn} onClick={() => setEditItem('new-expense')}>+ Expense</button>
        </div>
      </div>

      {/* ── List view ─────────────────────────────────────────────────────── */}
      {view === 'list' && (
        <div className={styles.listView}>
          {/* Filter + sort bar */}
          <div className={styles.toolbar}>
            <div className={styles.filterGroup}>
              {['all', 'income', 'expense'].map(t => (
                <button
                  key={t}
                  className={`${styles.filterBtn} ${filterType === t ? styles.filterActive : ''}`}
                  onClick={() => setFilterType(t)}
                >{t.charAt(0).toUpperCase() + t.slice(1)}</button>
              ))}
            </div>
            <select
              className={styles.sortSelect}
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
            >
              <option value="name">Name</option>
              <option value="amount">Amount</option>
              <option value="next">Next date</option>
            </select>
          </div>

          {items.length === 0 && (
            <p className={styles.empty}>No planned items yet. Add income or expenses above.</p>
          )}

          {(filterType === 'all' || filterType === 'income') && incomeItems.length > 0 && (
            <div className={styles.group}>
              <div className={styles.groupTitle}>Income</div>
              {incomeItems.map(item => (
                <ItemRow key={item.id} item={item} accountMap={accountMap} isOutstanding={outstandingItemIds.has(item.id)} onClick={() => setEditItem(item)} />
              ))}
            </div>
          )}

          {(filterType === 'all' || filterType === 'expense') && expenseItems.length > 0 && (
            <div className={styles.group}>
              <div className={styles.groupTitle}>Expenses</div>
              {expenseItems.map(item => (
                <ItemRow key={item.id} item={item} accountMap={accountMap} isOutstanding={outstandingItemIds.has(item.id)} onClick={() => setEditItem(item)} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Upcoming view ─────────────────────────────────────────────────── */}
      {view === 'upcoming' && (
        <div className={styles.upcomingView}>
          {upcoming.length === 0 ? (
            <p className={styles.empty}>No upcoming occurrences found.</p>
          ) : (
            upcoming.map(({ date, item }, i) => (
              <div key={i} className={styles.upcomingRow}>
                <span className={styles.upcomingDate}>{formatDate(date)}</span>
                <div className={styles.upcomingInfo}>
                  <span className={styles.upcomingName}>{item.name}</span>
                  <span className={styles.upcomingAccount}>{accountMap[item.accountId]?.accountName ?? '—'}</span>
                </div>
                <div className={styles.upcomingRight}>
                  <span className={`${styles.upcomingAmount} ${item.type === 'income' ? styles.incomeColor : styles.expenseColor}`}>
                    {item.type === 'income' ? '+' : '-'}{fmtAmt(item.amount)} {item.currency}
                  </span>
                  <span className={`${styles.modeTag} ${styles.modeUpcoming}`}>upcoming</span>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ── Item row ─────────────────────────────────────────────────────────────────

function ItemRow({ item, accountMap, isOutstanding, onClick }) {
  const next = getNextOccurrenceDate(item)
  const freq = FREQUENCIES.find(f => f.value === item.frequency)?.label ?? item.frequency
  return (
    <button className={styles.itemRow} onClick={onClick}>
      <div className={styles.itemInfo}>
        <span className={styles.itemName}>{item.name}</span>
        <span className={styles.itemMeta}>
          {freq} · {accountMap[item.accountId]?.accountName ?? '—'}
          {!isOutstanding && next ? ` · next ${formatDate(next)}` : ''}
        </span>
      </div>
      <div className={styles.itemRight}>
        <span className={`${styles.itemAmount} ${item.type === 'income' ? styles.incomeColor : ''}`}>
          {fmtAmt(item.amount)} {item.currency}
        </span>
        <span className={`${styles.modeTag} ${isOutstanding ? styles.modeOutst : styles.modeUpcoming}`}>
          {isOutstanding ? 'outstanding' : 'upcoming'}
        </span>
      </div>
    </button>
  )
}

// ── Planned item form ─────────────────────────────────────────────────────────

function PlannedItemForm({ initial, defaultType, accounts, catsFlat, envsFlat, onSave, onCancel, onDelete }) {
  const [form, setForm] = useState(() => initial ?? {
    type:            defaultType,
    name:            '',
    amount:          '',
    currency:        'EUR',
    accountId:       accounts[0]?.id ?? '',
    categoryId:      '',
    envelopeId:      '',
    payee:           '',
    frequency:       'monthly',
    dayOfExecution:  1,
    startDate:       TODAY,
    endDate:         '',
    date:            TODAY,
    applicationMode: 'auto-apply',
  })

  function set(field, value) { setForm(prev => ({ ...prev, [field]: value })) }
  const isOneTime = form.frequency === 'one-time'
  const typedCats = catsFlat.filter(c => c.type === form.type)

  function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim() || !form.amount || !form.accountId) return
    onSave({
      ...form,
      amount:     Number(form.amount),
      categoryId: form.categoryId || null,
      envelopeId: form.envelopeId || null,
      payee:      form.payee || null,
      endDate:    form.endDate || null,
    })
  }

  return (
    <div className={styles.formScreen}>
      <div className={styles.header}>
        <button type="button" className={styles.backBtn} onClick={onCancel}>←</button>
        <h1 className={styles.title}>
          {initial ? 'Edit' : 'New'} planned {form.type}
        </h1>
        <div style={{ width: 40 }} />
      </div>

      <div className={styles.formBody}>
        <form id="bill-form" onSubmit={handleSubmit} className={styles.form}>

          {!initial && (
            <div className={styles.typeToggle}>
              <button type="button"
                className={`${styles.typeBtn} ${form.type === 'income' ? styles.typeActive : ''}`}
                onClick={() => set('type', 'income')}>Income</button>
              <button type="button"
                className={`${styles.typeBtn} ${form.type === 'expense' ? styles.typeActive : ''}`}
                onClick={() => set('type', 'expense')}>Expense</button>
            </div>
          )}

          <label className={styles.label}>Name
            <input className={styles.input} value={form.name} onChange={e => set('name', e.target.value)} required />
          </label>

          <div className={styles.row}>
            <label className={styles.label} style={{ flex: 1 }}>Amount
              <input className={styles.input} type="number" min="0" step="0.01" value={form.amount}
                onChange={e => set('amount', e.target.value)} required />
            </label>
            <label className={styles.label} style={{ width: 80 }}>Currency
              <input className={styles.input} value={form.currency}
                onChange={e => set('currency', e.target.value.toUpperCase())} maxLength={4} />
            </label>
          </div>

          <label className={styles.label}>Account <span className={styles.required}>*</span>
            <select className={styles.select} value={form.accountId} onChange={e => set('accountId', e.target.value)} required>
              <option value="">— select account —</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.accountName}</option>)}
            </select>
          </label>

          <label className={styles.label}>Category (optional)
            <select className={styles.select} value={form.categoryId ?? ''} onChange={e => set('categoryId', e.target.value)}>
              <option value="">— none —</option>
              {typedCats.map(c => <option key={c.id} value={c.id}>{INDENT.repeat(c.depth)}{c.name}</option>)}
            </select>
          </label>

          <label className={styles.label}>Envelope (optional)
            <select className={styles.select} value={form.envelopeId ?? ''} onChange={e => set('envelopeId', e.target.value)}>
              <option value="">— none —</option>
              {envsFlat.map(e => <option key={e.id} value={e.id}>{INDENT.repeat(e.depth)}{e.name}</option>)}
            </select>
          </label>

          <label className={styles.label}>Payee (optional)
            <input className={styles.input} value={form.payee ?? ''} onChange={e => set('payee', e.target.value)} />
          </label>

          <label className={styles.label}>Frequency
            <select className={styles.select} value={form.frequency} onChange={e => set('frequency', e.target.value)}>
              {FREQUENCIES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </label>

          {isOneTime ? (
            <label className={styles.label}>Date
              <input className={styles.input} type="date" value={form.date} onChange={e => set('date', e.target.value)} />
            </label>
          ) : (
            <>
              <label className={styles.label}>
                {form.frequency === 'weekly' ? 'Day of week' : 'Day of month'}
                <select className={styles.select} value={form.dayOfExecution}
                  onChange={e => set('dayOfExecution', Number(e.target.value))}>
                  {form.frequency === 'weekly'
                    ? WEEKDAYS.map((w, i) => <option key={i} value={i}>{w}</option>)
                    : MONTH_DAYS.map(d => <option key={d} value={d}>{d}</option>)
                  }
                </select>
              </label>
              <div className={styles.row}>
                <label className={styles.label} style={{ flex: 1 }}>Start date
                  <input className={styles.input} type="date" value={form.startDate}
                    onChange={e => set('startDate', e.target.value)} />
                </label>
                <label className={styles.label} style={{ flex: 1 }}>End date (optional)
                  <input className={styles.input} type="date" value={form.endDate ?? ''}
                    onChange={e => set('endDate', e.target.value)} />
                </label>
              </div>
            </>
          )}

          <div className={styles.modeGroup}>
            <span className={styles.label}>Application mode</span>
            <label className={styles.radioLabel}>
              <input type="radio" name="mode" value="auto-apply" checked={form.applicationMode === 'auto-apply'}
                onChange={() => set('applicationMode', 'auto-apply')} />
              Auto-apply — transaction created automatically
            </label>
            <label className={styles.radioLabel}>
              <input type="radio" name="mode" value="outstanding" checked={form.applicationMode === 'outstanding'}
                onChange={() => set('applicationMode', 'outstanding')} />
              Outstanding — I confirm the actual amount
            </label>
          </div>

        </form>
      </div>

      <div className={styles.formActions}>
        <button type="button" className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
        {onDelete && (
          <button type="button" className={styles.deleteBtn} onClick={onDelete}>Delete</button>
        )}
        <button type="submit" form="bill-form" className={styles.saveBtn}>Save</button>
      </div>
    </div>
  )
}

// ── Confirm occurrence dialog ─────────────────────────────────────────────────

function ConfirmOccurrenceDialog({ occurrence, item, onConfirm, onSkip, onCancel }) {
  const [actualAmount, setActualAmount] = useState(String(occurrence.plannedAmount ?? ''))

  if (!item) return null

  return (
    <div className={styles.formScreen}>
      <div className={styles.header}>
        <button className={styles.backBtn} onClick={onCancel}>←</button>
        <h1 className={styles.title}>Confirm: {item.name}</h1>
        <div style={{ width: 40 }} />
      </div>
      <div className={styles.formBody}>
        <div className={styles.confirmInfo}>
          <div className={styles.confirmRow}>
            <span className={styles.confirmLabel}>Planned</span>
            <span className={styles.confirmValue}>{occurrence.plannedAmount != null ? fmtAmt(occurrence.plannedAmount) : ''} {item.currency}</span>
          </div>
          <div className={styles.confirmRow}>
            <span className={styles.confirmLabel}>Due date</span>
            <span className={styles.confirmValue}>{formatDate(occurrence.dueDate)}</span>
          </div>
        </div>
        <label className={styles.label}>Actual amount
          <div className={styles.row}>
            <input
              className={styles.input}
              type="number"
              min="0"
              step="0.01"
              value={actualAmount}
              onChange={e => setActualAmount(e.target.value)}
              style={{ flex: 1 }}
            />
            <span className={styles.currencyLabel}>{item.currency}</span>
          </div>
        </label>
      </div>
      <div className={styles.formActions}>
        <button className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
        <button className={styles.skipBtn2} onClick={onSkip}>Skip</button>
        <button className={styles.saveBtn}
          onClick={() => onConfirm(occurrence, Number(actualAmount))}
          disabled={!actualAmount}>
          Confirm
        </button>
      </div>
    </div>
  )
}

// ── Delete confirmation dialog ────────────────────────────────────────────────

function DeleteItemDialog({ item, onConfirm, onCancel }) {
  return (
    <div className={styles.dialogBackdrop}>
      <div className={styles.dialog}>
        <h3 className={styles.dialogTitle}>Delete "{item.name}"?</h3>
        {item.frequency !== 'one-time' && (
          <p className={styles.dialogText}>
            All pending occurrences for this item will also be removed.
            Already-created transactions are kept.
          </p>
        )}
        <p className={styles.dialogWarning}>This cannot be undone.</p>
        <div className={styles.dialogActions}>
          <button className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
          <button className={styles.deleteBtn2} onClick={() => onConfirm(item)}>Delete</button>
        </div>
      </div>
    </div>
  )
}
