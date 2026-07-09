import { useState, useRef } from 'react'
import {
  getPlannedItems,
  createPlannedItem,
  updatePlannedItem,
  deletePlannedItem,
  confirmOccurrence,
  skipOccurrence,
  getNextOccurrenceDate,
  getNextEffectiveOccurrence,
  getDueDates,
  getUpcomingOccurrences,
  checkAndGeneratePending,
  countPastConfirmedOccurrences,
  applyAmountToPastOccurrences,
  getDuePendingOccurrences,
} from '../data/bills'
import { getActiveAccounts } from '../data/accounts'
import { getCategoriesFlat } from '../data/categories'
import { getActiveEnvelopes, getEnvelopesFlat } from '../data/envelopes'
import { getRecentCategoriesForPayee } from '../data/transactions'
import { getFavoriteAccounts, getFavoriteIncomeCategories, getFavoriteExpenseCategories, getFavoriteEnvelopes } from '../data/settings'
import { accountOptions, favoritesOptgroup, treeOptions } from '../components/optionHelpers'
import { formatDate, localDateStr } from '../utils/dates'
import { FREQUENCIES, FREQUENCY_LABELS, WEEKDAYS, MONTH_DAYS, dayPickerKind } from '../utils/frequency'
import CurrencyDropdown from '../components/CurrencyDropdown'
import PayeeAutocomplete from '../components/PayeeAutocomplete'
import OccurrenceOverrideDialog from '../components/OccurrenceOverrideDialog'
import styles from './BillsAndIncome.module.css'
import { fmtAmt, parseAmount } from '../utils/format'
import AmountInput from '../components/AmountInput'

const TODAY = localDateStr()

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
  const [scopeDialog,  setScopeDialog]  = useState(null)   // null | { fields, count, since } (Phase 55a)
  const [overrideEntry, setOverrideEntry] = useState(null) // null | upcoming entry (Phase 55d)
  const [filterType,   setFilterType]  = useState('all')    // 'all' | 'income' | 'expense'
  const [filterPayee,  setFilterPayee] = useState('')       // free-text payee filter (Phase 49d)
  const [sortBy,       setSortBy]      = useState('name')   // 'name' | 'amount' | 'next'
  const [pendingEdits, setPendingEdits] = useState({})      // { [occId]: { amount, date } }
  const [_tick,        setTick]         = useState(0)        // bumped after any mutation to force re-render
  const confirmedRef = useRef(new Set())                     // sync guard: IDs confirmed this render cycle

  const items      = getPlannedItems().filter(i => i.isActive)
  const accounts   = getActiveAccounts()
  const catsFlat   = getCategoriesFlat()
  const envsFlat   = getEnvelopesFlat(getActiveEnvelopes())

  // Pending items whose due date has arrived, enriched with their planned item
  // (shared derivation with the Dashboard upcoming card — Phase 55c).
  const enrichedPending = getDuePendingOccurrences()

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
      // Phase 55a: editing a recurring item whose amount changed offers the
      // opt-in "also change past records" scope (amount only) when linked
      // history exists — otherwise edits always apply "from now on".
      const prev = items.find(i => i.id === fields.id)
      if (prev && fields.frequency !== 'one-time' && Number(fields.amount) !== Number(prev.amount)) {
        const { count, since } = countPastConfirmedOccurrences(fields.id)
        if (count > 0) {
          setScopeDialog({ fields, count, since })
          return
        }
      }
      saveEdit(fields, false)
    } else {
      createPlannedItem(fields)
      checkAndGeneratePending()   // a NEW item backfills from its start date (intended)
      setEditItem(null)
    }
  }

  // Phase 55a: every edit re-anchors generation to the edit day (`generatedFrom`),
  // so a schedule change never backfills transactions — a transaction is created
  // on save only if the newly chosen recurrence day is today.
  function saveEdit(fields, alsoPast) {
    updatePlannedItem(fields.id, { ...fields, generatedFrom: localDateStr() })
    if (alsoPast) applyAmountToPastOccurrences(fields.id, Number(fields.amount))
    checkAndGeneratePending()
    setScopeDialog(null)
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
      ...(item.countInNextPeriod ? { periodShift: 'next' } : {}),   // Phase 55f
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
      if (!parseAmount(edit.amount)) continue
      confirmOccurrence(p.id, parseAmount(edit.amount), {
        type:       p.item.type,
        accountId:  p.item.accountId,
        currency:   p.item.currency,
        categoryId: p.item.categoryId ?? null,
        envelopeId: p.item.envelopeId ?? null,
        payeeName:  p.item.payee ?? '',
        note:       p.item.name,
        date:       edit.date,
        ...(p.item.countInNextPeriod ? { periodShift: 'next' } : {}),   // Phase 55f
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
        {scopeDialog && (
          <div className={styles.dialogBackdrop}>
            <div className={styles.dialog}>
              <h3 className={styles.dialogTitle}>Apply the new amount to past records too?</h3>
              <p className={styles.dialogText}>
                This item has <strong>{scopeDialog.count}</strong> already-recorded transaction{scopeDialog.count === 1 ? '' : 's'} (since {formatDate(scopeDialog.since)}).
              </p>
              <p className={styles.dialogText}>
                Updating them changes <strong>only their amounts</strong> — their dates, accounts,
                categories, envelopes and payees stay unchanged.
              </p>
              <div className={styles.dialogActions}>
                <button className={styles.cancelBtn} onClick={() => setScopeDialog(null)}
                  title="Go back to the form without saving">Cancel</button>
                <button className={styles.cancelBtn} onClick={() => saveEdit(scopeDialog.fields, true)}
                  title={`Also set the amount on the ${scopeDialog.count} past transaction(s) — amounts only, nothing else changes`}>
                  Also update {scopeDialog.count} past record{scopeDialog.count === 1 ? '' : 's'}
                </button>
                <button className={styles.saveBtn} onClick={() => saveEdit(scopeDialog.fields, false)}
                  title="Save the edit for future occurrences only — past records stay as they are">
                  From now on
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Filtered + sorted planned items ───────────────────────────────────────
  // Items that have a pending occurrence whose due date has arrived = outstanding
  const outstandingItemIds = new Set(enrichedPending.map(p => p.plannedItemId))

  const payeeQuery = filterPayee.trim().toLowerCase()
  const filtered = items.filter(i =>
    (filterType === 'all' || i.type === filterType) &&
    (!payeeQuery || (i.payee ?? '').toLowerCase().includes(payeeQuery))
  )
  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'amount') return b.amount - a.amount
    if (sortBy === 'next') {
      const an = getNextEffectiveOccurrence(a)?.date ?? '9999'
      const bn = getNextEffectiveOccurrence(b)?.date ?? '9999'
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
        <button className={styles.backBtn} onClick={onBack} title="Go back">←</button>
        <h1 className={styles.title}>Bills & Income</h1>
        <div style={{ width: 40 }} />
      </div>

      {/* ── Pending section ───────────────────────────────────────────────── */}
      {enrichedPending.length > 0 && (
        <div className={styles.pendingSection}>
          <div className={styles.pendingHeader}>
            <span className={styles.pendingTitle}>Pending ({enrichedPending.length})</span>
            <button className={styles.confirmAllBtn} onClick={handleBulkConfirm} title="Confirm all pending items">✓ Confirm all</button>
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
                  <AmountInput
                    className={`${styles.pendingInput} ${styles.pendingInputAmount}`}
                    value={edit.amount}
                    onChange={v => setEdit(p.id, 'amount', v)}
                  />
                  <span className={styles.pendingCurrency}>{p.item.currency}</span>
                  <button
                    className={styles.confirmBtn}
                    onClick={() => handleConfirmOccurrence(p, parseAmount(edit.amount), edit.date)}
                    disabled={!edit.amount}
                    title="Confirm this occurrence with the shown date and amount"
                  >Confirm</button>
                  <button className={styles.skipBtn} onClick={() => handleSkip(p.id)} title="Skip this occurrence (no transaction is created)">Skip</button>
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
            title="Show the list of planned items"
          >List</button>
          <button
            className={`${styles.viewBtn} ${view === 'upcoming' ? styles.viewActive : ''}`}
            onClick={() => setView('upcoming')}
            title="Show upcoming occurrences"
          >Upcoming</button>
        </div>
        <div className={styles.addButtons}>
          <button className={styles.addBtn} onClick={() => setEditItem('new-income')} title="Add a planned income item">+ Income</button>
          <button className={styles.addBtn} onClick={() => setEditItem('new-expense')} title="Add a planned expense item">+ Expense</button>
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
                  title={t === 'all' ? 'Show all planned items' : `Show only ${t} items`}
                >{t.charAt(0).toUpperCase() + t.slice(1)}</button>
              ))}
            </div>
            <div className={styles.payeeFilter}>
              <PayeeAutocomplete
                className={styles.payeeFilterInput}
                value={filterPayee}
                onChange={setFilterPayee}
                placeholder="Filter by payee…"
              />
              {filterPayee && (
                <button className={styles.payeeFilterClear} onClick={() => setFilterPayee('')} title="Clear payee filter">×</button>
              )}
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
            upcoming.map((entry, i) => {
              const { date, item, amount, overridden } = entry
              const recurring = item.frequency !== 'one-time'
              const Row = recurring ? 'button' : 'div'
              return (
                <Row key={i} className={`${styles.upcomingRow} ${recurring ? styles.upcomingRowBtn : ''}`}
                  {...(recurring ? { onClick: () => setOverrideEntry(entry), title: 'Edit this occurrence — one-time change, skip, or record early' } : {})}>
                  <span className={styles.upcomingDate}>{overridden ? '↻ ' : ''}{formatDate(date)}</span>
                  <div className={styles.upcomingInfo}>
                    <span className={styles.upcomingName}>{item.name}</span>
                    <span className={styles.upcomingAccount}>{accountMap[item.accountId]?.accountName ?? '—'}</span>
                  </div>
                  <div className={styles.upcomingRight}>
                    <span className={`${styles.upcomingAmount} ${item.type === 'income' ? styles.incomeColor : styles.expenseColor}`}>
                      {item.type === 'income' ? '+' : '-'}{fmtAmt(amount ?? item.amount)} {item.currency}
                    </span>
                    <span className={`${styles.modeTag} ${styles.modeUpcoming}`}>upcoming</span>
                  </div>
                </Row>
              )
            })
          )}
        </div>
      )}

      {overrideEntry && (
        <OccurrenceOverrideDialog
          entry={overrideEntry}
          onEditSeries={() => { const it = overrideEntry.item; setOverrideEntry(null); setEditItem(it) }}
          onClose={() => setOverrideEntry(null)}
          onSaved={() => { setOverrideEntry(null); setTick(t => t + 1) }}
        />
      )}
    </div>
  )
}

// ── Item row ─────────────────────────────────────────────────────────────────

function ItemRow({ item, accountMap, isOutstanding, onClick }) {
  const next = getNextEffectiveOccurrence(item)?.date ?? null   // override-aware (55d)
  const freq = FREQUENCY_LABELS[item.frequency] ?? item.frequency
  return (
    <button className={styles.itemRow} onClick={onClick} title="Edit this planned item">
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
    countInNextPeriod: false,   // income only (Phase 55f)
  })

  function set(field, value) { setForm(prev => ({ ...prev, [field]: value })) }
  const isOneTime = form.frequency === 'one-time'
  const typedCats = catsFlat.filter(c => c.type === form.type)

  // Favorites + payee→category memory in the dropdowns (Phase 53e — parity
  // with the transaction form's Phase 51c/51f conventions).
  const catById     = new Map(typedCats.map(c => [c.id, c]))
  const recentCats  = getRecentCategoriesForPayee(form.payee ?? '', form.type, 3)
    .map(id => catById.get(id)).filter(Boolean)
  const favCatIds   = form.type === 'income' ? getFavoriteIncomeCategories() : getFavoriteExpenseCategories()

  // On payee entry with no category chosen, prefill the payee's last-used category.
  function handlePayeeInput(value) {
    setForm(prev => {
      const next = { ...prev, payee: value }
      if (!prev.categoryId) {
        const recent = getRecentCategoriesForPayee(value, prev.type, 1)
        if (recent[0]) next.categoryId = recent[0]
      }
      return next
    })
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim() || !form.amount || !form.accountId) return
    onSave({
      ...form,
      amount:     parseAmount(form.amount),
      categoryId: form.categoryId || null,
      envelopeId: form.envelopeId || null,
      payee:      form.payee || null,
      endDate:    form.endDate || null,
    })
  }

  return (
    <div className={styles.formScreen}>
      <div className={styles.header}>
        <button type="button" className={styles.backBtn} onClick={onCancel} title="Go back without saving">←</button>
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
                onClick={() => set('type', 'income')} title="Set the type to income">Income</button>
              <button type="button"
                className={`${styles.typeBtn} ${form.type === 'expense' ? styles.typeActive : ''}`}
                onClick={() => set('type', 'expense')} title="Set the type to expense">Expense</button>
            </div>
          )}

          <label className={styles.label}>Name
            <input className={styles.input} value={form.name} onChange={e => set('name', e.target.value)} required />
          </label>

          <div className={styles.row}>
            <label className={styles.label} style={{ flex: 1 }}>Amount
              <AmountInput className={styles.input} value={form.amount}
                onChange={v => set('amount', v)} required />
            </label>
            <label className={styles.label} style={{ width: 100 }}>Currency
              <CurrencyDropdown className={styles.input} value={form.currency} onChange={v => set('currency', v)} />
            </label>
          </div>

          <label className={styles.label}>Account <span className={styles.required}>*</span>
            <select className={styles.select} value={form.accountId} onChange={e => set('accountId', e.target.value)} required>
              <option value="">— select account —</option>
              {accountOptions(accounts, getFavoriteAccounts())}
            </select>
          </label>

          <label className={styles.label}>Category (optional)
            <select className={styles.select} value={form.categoryId ?? ''} onChange={e => set('categoryId', e.target.value)}>
              <option value="">— none —</option>
              {recentCats.length > 0 && (
                <optgroup label="Recent for this payee">
                  {recentCats.map(c => <option key={`r${c.id}`} value={c.id}>↻ {c.name}</option>)}
                </optgroup>
              )}
              {favoritesOptgroup(typedCats, favCatIds, recentCats.map(c => c.id))}
              {treeOptions(typedCats)}
            </select>
          </label>

          <label className={styles.label}>Envelope (optional)
            <select className={styles.select} value={form.envelopeId ?? ''} onChange={e => set('envelopeId', e.target.value)}>
              <option value="">— none —</option>
              {favoritesOptgroup(envsFlat, getFavoriteEnvelopes())}
              {treeOptions(envsFlat)}
            </select>
          </label>

          <label className={styles.label}>Payee (optional)
            <PayeeAutocomplete className={styles.input} value={form.payee ?? ''} onChange={handlePayeeInput} />
          </label>

          <label className={styles.label}>Frequency
            <select className={styles.select} value={form.frequency} onChange={e => setForm(prev => ({
              ...prev,
              frequency: e.target.value,
              dayOfExecution: dayPickerKind(prev.frequency) !== dayPickerKind(e.target.value) ? 1 : prev.dayOfExecution,
            }))}>
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
                {dayPickerKind(form.frequency) === 'weekday' ? 'Day of week' : 'Day of month'}
                <select className={styles.select} value={form.dayOfExecution}
                  onChange={e => set('dayOfExecution', Number(e.target.value))}>
                  {dayPickerKind(form.frequency) === 'weekday'
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

              {/* Phase 55a: live feedback — when this schedule will next fire.
                  Edits apply "from now on"; only a today-due schedule records on save. */}
              {(() => {
                const preview = {
                  frequency: form.frequency, dayOfExecution: Number(form.dayOfExecution),
                  startDate: form.startDate, endDate: form.endDate || null,
                }
                const dueDates = form.startDate ? getDueDates(preview, TODAY) : []
                const dueToday = dueDates[dueDates.length - 1] === TODAY
                const next = getNextOccurrenceDate(preview)
                return (
                  <p className={styles.nextOccNote}>
                    {dueToday
                      ? `Due today — will be ${form.applicationMode === 'auto-apply' ? 'recorded as a transaction' : 'shown as pending'} on save (unless already handled today). Next after that: ${next ? formatDate(next) : '—'}`
                      : next
                        ? `Next occurrence: ${formatDate(next)}`
                        : 'No future occurrence — check the start and end dates'}
                  </p>
                )
              })()}
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

          {form.type === 'income' && (
            <label className={styles.radioLabel}
              title="For income received shortly before a new planning period starts (e.g. a wage on the 7th when the period begins on the 10th): its transactions count toward the FOLLOWING period's summary">
              <input type="checkbox" checked={!!form.countInNextPeriod}
                onChange={e => set('countInNextPeriod', e.target.checked)} />
              Count in the next planning period
            </label>
          )}

        </form>
      </div>

      <div className={styles.formActions}>
        <button type="button" className={styles.cancelBtn} onClick={onCancel} title="Cancel without saving">Cancel</button>
        {onDelete && (
          <button type="button" className={styles.deleteBtn} onClick={onDelete} title="Delete this planned item">Delete</button>
        )}
        <button type="submit" form="bill-form" className={styles.saveBtn} title="Save this planned item">Save</button>
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
        <button className={styles.backBtn} onClick={onCancel} title="Go back without confirming">←</button>
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
            <AmountInput
              className={styles.input}
              value={actualAmount}
              onChange={v => setActualAmount(v)}
              style={{ flex: 1 }}
            />
            <span className={styles.currencyLabel}>{item.currency}</span>
          </div>
        </label>
      </div>
      <div className={styles.formActions}>
        <button className={styles.cancelBtn} onClick={onCancel} title="Cancel without confirming">Cancel</button>
        <button className={styles.skipBtn2} onClick={onSkip} title="Skip this occurrence (no transaction is created)">Skip</button>
        <button className={styles.saveBtn}
          onClick={() => onConfirm(occurrence, parseAmount(actualAmount))}
          disabled={!actualAmount} title="Confirm this occurrence with the entered actual amount">
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
          <button className={styles.cancelBtn} onClick={onCancel} title="Cancel — keep it">Cancel</button>
          <button className={styles.deleteBtn2} onClick={() => onConfirm(item)} title="Confirm deletion">Delete</button>
        </div>
      </div>
    </div>
  )
}
