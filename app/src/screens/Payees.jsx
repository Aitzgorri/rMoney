import { useState, useMemo } from 'react'
import { getTransactions, deleteTransaction } from '../data/transactions'
import { renamePayee, deletePayee, payeeExists, getPayeeUsage, normPayee } from '../data/payees'
import { getActiveAccounts } from '../data/accounts'
import { getCategoriesFlat } from '../data/categories'
import { getActiveEnvelopes, getEnvelopesFlat } from '../data/envelopes'
import { getMainCurrency } from '../data/settings'
import { INDENT } from '../utils/hierarchy'
import { fmtAmt, parseAmount } from '../utils/format'
import { formatDate } from '../utils/dates'
import AmountInput from '../components/AmountInput'
import PayeeAutocomplete from '../components/PayeeAutocomplete'
import TransactionForm from '../components/TransactionForm'
import styles from './Payees.module.css'

const UNSPECIFIED = 'Unspecified payee'
const NO_PAYEE_KEY = '__none__'

const TODAY = () => new Date().toISOString().slice(0, 10)
function monthsAgo(n) { const d = new Date(); d.setMonth(d.getMonth() - n); return d.toISOString().slice(0, 10) }
const emptyFilters = () => ({
  dateFrom: monthsAgo(12), dateTo: TODAY(),
  amountMin: '', amountMax: '', currency: '', accountId: '', envelopeId: '', categoryId: '',
})

export default function Payees() {
  const [refreshKey, setRefreshKey] = useState(0)
  const [editingTx, setEditingTx]   = useState(null)
  const [renaming, setRenaming]     = useState(null)   // group being renamed
  const [renameVal, setRenameVal]   = useState('')
  const [confirmMerge, setConfirmMerge]   = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [expanded, setExpanded]     = useState(new Set())
  const [search, setSearch]         = useState('')
  const [sortBy, setSortBy]         = useState('spent')
  const [filters, setFilters]       = useState(emptyFilters)

  const accounts    = getActiveAccounts()
  const envelopes   = getEnvelopesFlat(getActiveEnvelopes())
  const incomeCats  = getCategoriesFlat('income')
  const expenseCats = getCategoriesFlat('expense')
  const mainCurrency = getMainCurrency()

  function refresh() { setRefreshKey(k => k + 1) }
  function setFilter(field, value) { setFilters(p => ({ ...p, [field]: value })) }

  const catName = useMemo(() => {
    const m = {}
    for (const c of [...incomeCats, ...expenseCats]) m[c.id] = c.name
    return m
  }, [incomeCats, expenseCats])

  // ── Build the grouped report ────────────────────────────────────────────────
  const groups = useMemo(() => {
    const txs = getTransactions().filter(t => t.type === 'income' || t.type === 'expense')
    const filtered = txs.filter(t => {
      if (filters.dateFrom && t.date < filters.dateFrom) return false
      if (filters.dateTo   && t.date > filters.dateTo)   return false
      if (filters.currency  && (t.currency || mainCurrency) !== filters.currency) return false
      if (filters.accountId && t.accountId !== filters.accountId) return false
      if (filters.envelopeId && t.envelopeId !== filters.envelopeId) return false
      if (filters.categoryId && t.categoryId !== filters.categoryId) return false
      if (filters.amountMin && Number(t.amount) < parseAmount(filters.amountMin)) return false
      if (filters.amountMax && Number(t.amount) > parseAmount(filters.amountMax)) return false
      return true
    })
    const map = new Map()
    for (const t of filtered) {
      const raw = t.payeeName?.trim()
      const key = raw ? normPayee(raw) : NO_PAYEE_KEY
      const g = map.get(key) ?? { key, display: raw || '(no payee)', nameCounts: {}, txns: [], paid: {}, received: {}, count: 0, lastUsed: '' }
      g.txns.push(t)
      g.count += 1
      if ((t.date ?? '') > g.lastUsed) g.lastUsed = t.date ?? ''
      const cur = t.currency || mainCurrency
      const amt = Number(t.amount) || 0
      if (t.type === 'expense') g.paid[cur] = (g.paid[cur] ?? 0) + amt
      else g.received[cur] = (g.received[cur] ?? 0) + amt
      if (raw) g.nameCounts[raw] = (g.nameCounts[raw] ?? 0) + 1
      map.set(key, g)
    }
    for (const g of map.values()) {
      const names = Object.entries(g.nameCounts)
      if (names.length) g.display = names.sort((a, b) => b[1] - a[1])[0][0]
      g.txns.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    }
    return [...map.values()]
  // refreshKey forces a re-read of localStorage after rename/merge/delete
  }, [filters, mainCurrency, refreshKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const distinctCurrencies = useMemo(
    () => [...new Set(getTransactions().filter(t => t.type === 'income' || t.type === 'expense').map(t => t.currency || mainCurrency))].sort(),
    [mainCurrency, refreshKey], // eslint-disable-line react-hooks/exhaustive-deps
  )

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = q ? groups.filter(g => g.display.toLowerCase().includes(q)) : [...groups]
    const spent = g => Object.values(g.paid).reduce((s, v) => s + v, 0)
    return list.sort((a, b) => {
      if (sortBy === 'name')  return a.display.localeCompare(b.display)
      if (sortBy === 'count') return b.count - a.count
      return spent(b) - spent(a)
    })
  }, [groups, search, sortBy])

  function toggle(key) { setExpanded(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n }) }

  const isManaged = g => g.key !== NO_PAYEE_KEY && g.display !== UNSPECIFIED

  function startRename(g) { if (!isManaged(g)) return; setRenaming(g); setRenameVal(g.display) }
  function submitRename() {
    const newName = renameVal.trim()
    if (!newName || !renaming) { setRenaming(null); return }
    if (normPayee(newName) !== renaming.key && payeeExists(newName)) {
      setConfirmMerge({ from: renaming.display, to: newName, usage: getPayeeUsage(renaming.display) })
      return
    }
    renamePayee(renaming.display, newName)
    setRenaming(null); refresh()
  }
  function doMerge() { renamePayee(confirmMerge.from, confirmMerge.to); setConfirmMerge(null); setRenaming(null); refresh() }
  function doDelete() { deletePayee(confirmDelete.name); setConfirmDelete(null); refresh() }

  const hasFilters = filters.amountMin || filters.amountMax || filters.currency || filters.accountId ||
    filters.envelopeId || filters.categoryId || filters.dateFrom !== monthsAgo(12) || filters.dateTo !== TODAY()

  function summaryLine(g) {
    const parts = []
    for (const cur of [...new Set([...Object.keys(g.paid), ...Object.keys(g.received)])].sort()) {
      const bits = []
      if (g.paid[cur])     bits.push(`paid ${fmtAmt(g.paid[cur])} ${cur}`)
      if (g.received[cur]) bits.push(`received ${fmtAmt(g.received[cur])} ${cur}`)
      if (bits.length) parts.push(bits.join(' · '))
    }
    return parts.join('  |  ') || '—'
  }

  // ── Transaction edit view ───────────────────────────────────────────────────
  if (editingTx) {
    return (
      <TransactionForm
        initial={editingTx}
        onSave={() => { setEditingTx(null); refresh() }}
        onCancel={() => setEditingTx(null)}
        onDelete={() => { deleteTransaction(editingTx.id); setEditingTx(null); refresh() }}
      />
    )
  }

  return (
    <div className={styles.screen}>
      {confirmMerge && (
        <div className={styles.overlay}>
          <div className={styles.dialog}>
            <h3>Merge payees?</h3>
            <p>"{confirmMerge.from}" will be merged into the existing "{confirmMerge.to}". {confirmMerge.usage.txCount} transaction(s){confirmMerge.usage.itemCount ? ` + ${confirmMerge.usage.itemCount} recurring item(s)` : ''} will move. This cannot be undone.</p>
            <div className={styles.dialogActions}>
              <button className={styles.cancelBtn} onClick={() => setConfirmMerge(null)} title="Cancel — don't merge">Cancel</button>
              <button className={styles.confirmBtn} onClick={doMerge} title="Confirm the merge">Merge</button>
            </div>
          </div>
        </div>
      )}
      {confirmDelete && (
        <div className={styles.overlay}>
          <div className={styles.dialog}>
            <h3>Delete payee "{confirmDelete.name}"?</h3>
            <p>{confirmDelete.usage.txCount} transaction(s){confirmDelete.usage.itemCount ? ` + ${confirmDelete.usage.itemCount} recurring item(s)` : ''} will be left with no payee (the records are kept). This cannot be undone.</p>
            <div className={styles.dialogActions}>
              <button className={styles.cancelBtn} onClick={() => setConfirmDelete(null)} title="Cancel — keep it">Cancel</button>
              <button className={styles.deleteBtn} onClick={doDelete} title="Confirm deletion">Delete</button>
            </div>
          </div>
        </div>
      )}

      <div className={styles.header}>
        <h1 className={styles.title}>Payees</h1>
        <div className={styles.toolbar}>
          <input className={styles.search} placeholder="Search payees…" value={search} onChange={e => setSearch(e.target.value)} />
          <select className={styles.sortSelect} value={sortBy} onChange={e => setSortBy(e.target.value)}>
            <option value="spent">Most spent</option>
            <option value="count">Most transactions</option>
            <option value="name">Name</option>
          </select>
        </div>
      </div>

      <div className={styles.filters}>
        <label className={styles.f}>From<input type="date" value={filters.dateFrom} onChange={e => setFilter('dateFrom', e.target.value)} /></label>
        <label className={styles.f}>Until<input type="date" value={filters.dateTo} onChange={e => setFilter('dateTo', e.target.value)} /></label>
        <label className={styles.f}>Min<AmountInput value={filters.amountMin} onChange={v => setFilter('amountMin', v)} placeholder="0,00" /></label>
        <label className={styles.f}>Max<AmountInput value={filters.amountMax} onChange={v => setFilter('amountMax', v)} placeholder="0,00" /></label>
        <label className={styles.f}>Currency
          <select value={filters.currency} onChange={e => setFilter('currency', e.target.value)}>
            <option value="">All</option>
            {distinctCurrencies.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className={styles.f}>Account
          <select value={filters.accountId} onChange={e => setFilter('accountId', e.target.value)}>
            <option value="">All</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.accountName}</option>)}
          </select>
        </label>
        <label className={styles.f}>Envelope
          <select value={filters.envelopeId} onChange={e => setFilter('envelopeId', e.target.value)}>
            <option value="">All</option>
            {envelopes.map(e => <option key={e.id} value={e.id}>{INDENT.repeat(e.depth)}{e.name}</option>)}
          </select>
        </label>
        <label className={styles.f}>Category
          <select value={filters.categoryId} onChange={e => setFilter('categoryId', e.target.value)}>
            <option value="">All</option>
            <option disabled>── Income ──</option>
            {incomeCats.map(c => <option key={c.id} value={c.id}>{INDENT.repeat(c.depth)}{c.name}</option>)}
            <option disabled>── Expense ──</option>
            {expenseCats.map(c => <option key={c.id} value={c.id}>{INDENT.repeat(c.depth)}{c.name}</option>)}
          </select>
        </label>
        {hasFilters && <button className={styles.clearBtn} onClick={() => setFilters(emptyFilters())} title="Reset all filters to their defaults">Clear filters</button>}
      </div>

      {shown.length === 0 ? (
        <p className={styles.empty}>No payees match the current filters.</p>
      ) : (
        <div className={styles.list}>
          {shown.map(g => {
            const open = expanded.has(g.key)
            return (
              <div key={g.key} className={styles.group}>
                <div className={styles.payeeRow} onClick={() => toggle(g.key)}>
                  <span className={styles.chev}>{open ? '▾' : '▸'}</span>
                  {renaming?.key === g.key ? (
                    <form className={styles.renameForm} onClick={e => e.stopPropagation()} onSubmit={e => { e.preventDefault(); submitRename() }}>
                      <PayeeAutocomplete className={styles.renameInput} value={renameVal} onChange={setRenameVal} />
                      <button type="submit" className={styles.iconBtn} title="Save the new payee name">✓</button>
                      <button type="button" className={styles.iconBtn} onClick={() => setRenaming(null)} title="Cancel renaming">✕</button>
                    </form>
                  ) : (
                    <span className={styles.payeeName}>{g.display}</span>
                  )}
                  <span className={styles.payeeMeta}>{g.count} txn · {summaryLine(g)}</span>
                  {isManaged(g) && renaming?.key !== g.key && (
                    <span className={styles.payeeActions} onClick={e => e.stopPropagation()}>
                      <button className={styles.iconBtn} title="Rename / merge" onClick={() => startRename(g)}>✎</button>
                      <button className={`${styles.iconBtn} ${styles.iconBtnDanger}`} title="Delete payee" onClick={() => setConfirmDelete({ name: g.display, usage: getPayeeUsage(g.display) })}>×</button>
                    </span>
                  )}
                </div>
                {open && (
                  <div className={styles.txns}>
                    {g.txns.map(t => (
                      <div key={t.id} className={styles.txnRow} onClick={() => setEditingTx(t)}>
                        <span className={styles.txnDate}>{formatDate(t.date)}</span>
                        <span className={`${styles.txnAmt} ${t.type === 'income' ? styles.pos : styles.neg}`}>
                          {t.type === 'income' ? '+' : '−'}{fmtAmt(t.amount)} {t.currency || mainCurrency}
                        </span>
                        <span className={styles.txnMeta}>{accounts.find(a => a.id === t.accountId)?.accountName ?? '—'}{catName[t.categoryId] ? ` · ${catName[t.categoryId]}` : ''}</span>
                        {t.note && <span className={styles.txnNote}>{t.note}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
