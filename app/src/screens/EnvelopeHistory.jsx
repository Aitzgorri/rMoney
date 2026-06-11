import { useState } from 'react'
import { getTransactions, deleteTransaction } from '../data/transactions'
import { getEnvelopeTransfers, deleteEnvelopeTransfer, getEnvelopes, getDescendants, getTotalEnvelopeBalance, getScheduledTransfers, deleteScheduledTransfer } from '../data/envelopes'
import { getAccounts } from '../data/accounts'
import { getCategoriesFlat } from '../data/categories'
import TransactionForm from '../components/TransactionForm'
import EnvelopeTransferForm from '../components/EnvelopeTransferForm'
import { INDENT } from '../utils/hierarchy'
import { formatDate } from '../utils/dates'
import styles from './EnvelopeHistory.module.css'
import { fmtAmt, round2, parseAmount } from '../utils/format'
import AmountInput from '../components/AmountInput'

export default function EnvelopeHistory({ envelope, onBack, embedded, onDataChange }) {
  const [editing, setEditing]         = useState(null)  // { kind: 'tx'|'transfer'|'scheduled', record }
  const [creatingTransfer, setCreatingTransfer] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [search, setSearch]           = useState('')
  const [showFilter, setShowFilter]   = useState(false)
  const [sortAsc, setSortAsc]         = useState(false)
  const [_refreshKey, setRefreshKey]  = useState(0)
  const [filters, setFilters]         = useState({
    type: '', accountId: '', categoryId: '', payeeName: '', amountMin: '', amountMax: '', dateFrom: '', dateTo: '',
  })

  const accounts        = getAccounts()
  const categories      = getCategoriesFlat()
  const allEnvelopes    = getEnvelopes()
  const descendants     = getDescendants(envelope.id, allEnvelopes)
  const hasDescendants  = descendants.length > 0
  const familyEnvelopes = [envelope, ...descendants]
  const familyIds       = new Set(familyEnvelopes.map(e => e.id))

  // Bump our own key to recompute this screen, and notify the parent (e.g. the
  // desktop Envelopes tree) so its balances refresh too — without the user
  // having to reselect an envelope (SPEC-007, Phase 43e).
  function refresh() { setRefreshKey(k => k + 1); onDataChange?.() }
  function setFilter(field, value) { setFilters(prev => ({ ...prev, [field]: value })) }
  function clearFilters() {
    setFilters({ type:'', accountId:'', categoryId:'', payeeName:'', amountMin:'', amountMax:'', dateFrom:'', dateTo:'' })
    setSearch('')
  }

  // Load records — include all family members (envelope + descendants)
  const txs = getTransactions().filter(t => {
    for (const env of familyEnvelopes) {
      if (t.envelopeId === env.id) return true
      if (!t.envelopeId && t.type === 'income'  && env.isDefaultIncome)  return true
      if (!t.envelopeId && t.type === 'expense' && env.isDefaultExpense) return true
    }
    return false
  }).map(t => {
    const sourceEnv = familyEnvelopes.find(env =>
      t.envelopeId === env.id ||
      (!t.envelopeId && t.type === 'income'  && env.isDefaultIncome) ||
      (!t.envelopeId && t.type === 'expense' && env.isDefaultExpense)
    )
    return { ...t, _envelopeName: sourceEnv?.name ?? envelope.name }
  })

  const transfers = getEnvelopeTransfers().filter(t =>
    familyIds.has(t.fromEnvelopeId) || familyIds.has(t.toEnvelopeId)
  ).map(t => {
    const isInternal = familyIds.has(t.fromEnvelopeId) && familyIds.has(t.toEnvelopeId)
    const sourceEnvId = familyIds.has(t.fromEnvelopeId) ? t.fromEnvelopeId : t.toEnvelopeId
    const sourceEnv = familyEnvelopes.find(e => e.id === sourceEnvId)
    return { ...t, _envelopeName: sourceEnv?.name ?? envelope.name, _isInternal: isInternal }
  })

  // Combine and sort
  const combined = [
    ...txs.map(t => ({ ...t, _kind: 'tx' })),
    ...transfers.map(t => ({ ...t, _kind: 'transfer', type: 'envelope-transfer',
      amount: t.amount, date: t.date })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date))

  // Apply filters
  const displayed = combined.filter(r => {
    if (filters.type && r._kind === 'tx' && r.type !== filters.type) return false
    if (filters.type === 'envelope-transfer' && r._kind !== 'transfer') return false
    if (filters.accountId && r._kind === 'tx' && r.accountId !== filters.accountId) return false
    if (filters.categoryId && r._kind === 'tx' && r.categoryId !== filters.categoryId) return false
    if (filters.payeeName && r._kind === 'tx' && r.payeeName !== filters.payeeName) return false
    if (filters.amountMin && Number(r.amount) < parseAmount(filters.amountMin)) return false
    if (filters.amountMax && Number(r.amount) > parseAmount(filters.amountMax)) return false
    if (filters.dateFrom && r.date < filters.dateFrom) return false
    if (filters.dateTo   && r.date > filters.dateTo)   return false
    if (search && !r.note?.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  // Sort by date + createdAt so same-day records have a stable order
  function stableSort(list, ascending) {
    return [...list].sort((a, b) => {
      const dateDiff = new Date(a.date) - new Date(b.date)
      if (dateDiff !== 0) return ascending ? dateDiff : -dateDiff
      return (new Date(a.createdAt) - new Date(b.createdAt)) * (ascending ? 1 : -1)
    })
  }

  const sorted = stableSort(displayed, sortAsc)

  // Running balance — always oldest-first, same secondary sort as display
  // Internal transfers (both sides within family) don't change the family total
  const chronological = stableSort(displayed, true)
  let runBal = 0
  const runningBalances = {}
  for (const r of chronological) {
    if (r._kind === 'tx') {
      if (r.type === 'income')  runBal += Number(r.amount)
      if (r.type === 'expense') runBal -= Number(r.amount)
    } else if (!r._isInternal) {
      if (familyIds.has(r.toEnvelopeId))   runBal += Number(r.amount)
      if (familyIds.has(r.fromEnvelopeId)) runBal -= Number(r.amount)
    }
    runningBalances[r.id] = runBal
  }

  // Edit views
  if (editing?.kind === 'tx') {
    return (
      <TransactionForm
        initial={editing.record}
        onSave={() => { refresh(); setEditing(null) }}
        onCancel={() => setEditing(null)}
        onDelete={() => setConfirmDelete(editing)}
      />
    )
  }

  if (creatingTransfer) {
    return (
      <EnvelopeTransferForm
        defaultFromEnvelopeId={envelope.id}
        defaultMode="one-time"
        onSave={() => { refresh(); setCreatingTransfer(false) }}
        onCancel={() => setCreatingTransfer(false)}
      />
    )
  }

  if (editing?.kind === 'transfer') {
    return (
      <EnvelopeTransferForm
        initial={editing.record}
        onSave={() => { refresh(); setEditing(null) }}
        onCancel={() => setEditing(null)}
        onDelete={() => { deleteEnvelopeTransfer(editing.record.id); refresh(); setEditing(null) }}
      />
    )
  }

  if (editing?.kind === 'scheduled') {
    return (
      <EnvelopeTransferForm
        initial={editing.record}
        onSave={() => { refresh(); setEditing(null) }}
        onCancel={() => setEditing(null)}
        onDelete={() => { deleteScheduledTransfer(editing.record.id); refresh(); setEditing(null) }}
      />
    )
  }

  const balance = round2(getTotalEnvelopeBalance(envelope.id))

  function envelopeName(id) {
    return allEnvelopes.find(e => e.id === id)?.name ?? '—'
  }

  // Scheduled transfers for this envelope (incoming or outgoing)
  const scheduledTransfers = getScheduledTransfers().filter(s =>
    s.isActive && (s.fromEnvelopeId === envelope.id || s.toEnvelopeId === envelope.id)
  )

  // Savings projection: next 6 months
  // Net monthly amount = incoming monthly - outgoing monthly
  //   Monthly scheduled: ±amount/month
  //   Weekly scheduled:  ±amount × 4.33/month
  function netMonthlyAmount() {
    return getScheduledTransfers()
      .filter(s => s.isActive)
      .reduce((sum, s) => {
        const monthlyAmount = s.frequency === 'monthly' ? s.amount : s.amount * (52 / 12)
        if (s.toEnvelopeId === envelope.id)   return sum + monthlyAmount
        if (s.fromEnvelopeId === envelope.id) return sum - monthlyAmount
        return sum
      }, 0)
  }

  function buildProjection() {
    const net = netMonthlyAmount()
    if (net === 0) return []
    const today = new Date()
    const result = []
    for (let i = 1; i <= 6; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() + i, 1)
      const label = d.toLocaleString('default', { month: 'short', year: 'numeric' })
      result.push({ label, amount: balance + net * i })
    }
    return result
  }

  const projection = buildProjection()

  function accountName(id) {
    return accounts.find(a => a.id === id)?.accountName ?? '—'
  }

  function categoryName(id) {
    return categories.find(c => c.id === id)?.name ?? ''
  }

  const hasActiveFilters = search || Object.values(filters).some(v => v)

  return (
    <div className={styles.screen}>
      {confirmDelete && (
        <div className={styles.overlay}>
          <div className={styles.dialog}>
            <h3>Delete this record?</h3>
            <p>This cannot be undone.</p>
            <div className={styles.dialogActions}>
              <button className={styles.cancelBtn} onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button className={styles.deleteConfirmBtn} onClick={() => {
                if (confirmDelete.kind === 'tx') deleteTransaction(confirmDelete.record.id)
                else deleteEnvelopeTransfer(confirmDelete.record.id)
                refresh()
                setConfirmDelete(null)
                setEditing(null)
              }}>Delete</button>
            </div>
          </div>
        </div>
      )}

      <div className={styles.header}>
        {embedded
          ? <button className={styles.closeBtn} onClick={onBack} title="Close">✕</button>
          : <button className={styles.backBtn} onClick={onBack}>← Back</button>
        }
        <h2 className={styles.title}>{envelope.name}</h2>
        <div className={styles.headerActions}>
          <button className={styles.iconBtn} onClick={() => setCreatingTransfer(true)} title="New transfer from this envelope">⇄</button>
          <button className={`${styles.iconBtn} ${showFilter ? styles.active : ''}`}
            onClick={() => setShowFilter(v => !v)}>⚙</button>
          <button className={styles.iconBtn} onClick={() => setSortAsc(v => !v)}>
            {sortAsc ? '↑' : '↓'}
          </button>
        </div>
      </div>

      <div className={styles.balanceCard}>
        <span className={styles.balanceLabel}>Balance</span>
        <span className={`${styles.balanceValue} ${balance < 0 ? styles.negative : styles.positive}`}>
          {balance < 0 ? '−' : ''}{fmtAmt(Math.abs(balance))}
        </span>
      </div>

      {/* Scheduled transfers section */}
      <div className={styles.scheduledSection}>
        <div className={styles.scheduledHeader}>
          <span className={styles.sectionTitle}>Scheduled transfers</span>
        </div>
        {scheduledTransfers.length === 0 ? (
          <p className={styles.scheduledEmpty}>No scheduled transfers.</p>
        ) : (
          scheduledTransfers.map(s => {
            const isIncoming = s.toEnvelopeId === envelope.id
            const dayLabel = s.frequency === 'monthly'
              ? `${s.dayOfExecution}th`
              : ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][s.dayOfExecution]
            return (
              <div key={s.id} className={styles.scheduledRow}
                onClick={() => setEditing({ kind: 'scheduled', record: s })}>
                <div className={styles.scheduledInfo}>
                  <span className={`${styles.scheduledAmount} ${isIncoming ? styles.positive : styles.negative}`}>
                    {isIncoming ? '+' : '−'}{fmtAmt(s.amount)}
                  </span>
                  <span className={styles.scheduledMeta}>
                    {s.frequency} · {dayLabel}
                  </span>
                  <span className={styles.scheduledMeta}>
                    {isIncoming ? `← from ${envelopeName(s.fromEnvelopeId)}` : `→ to ${envelopeName(s.toEnvelopeId)}`}
                  </span>
                </div>
                <span className={styles.scheduledEdit}>›</span>
              </div>
            )
          })
        )}
      </div>

      {/* Projection section */}
      {projection.length > 0 && (
        <div className={styles.projectionSection}>
          <span className={styles.sectionTitle}>Projection</span>
          <div className={styles.projectionGrid}>
            {projection.map(p => (
              <div key={p.label} className={styles.projectionItem}>
                <span className={styles.projectionLabel}>{p.label}</span>
                <span className={`${styles.projectionAmount} ${p.amount < 0 ? styles.negative : styles.positive}`}>
                  {p.amount < 0 ? '−' : ''}{Math.abs(p.amount).toFixed(0)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <input className={styles.searchInput} placeholder="Search by note..."
        value={search} onChange={e => setSearch(e.target.value)} />

      {showFilter && (
        <div className={styles.filterPanel}>
          <div className={styles.filterRow}>
            <select className={styles.filterInput} value={filters.type} onChange={e => setFilter('type', e.target.value)}>
              <option value="">All types</option>
              <option value="income">Income</option>
              <option value="expense">Expense</option>
              <option value="envelope-transfer">Envelope transfer</option>
            </select>
            <select className={styles.filterInput} value={filters.accountId} onChange={e => setFilter('accountId', e.target.value)}>
              <option value="">All accounts</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.accountName}</option>)}
            </select>
          </div>
          <div className={styles.filterRow}>
            <select className={styles.filterInput} value={filters.categoryId} onChange={e => setFilter('categoryId', e.target.value)}>
              <option value="">All categories</option>
              {categories.map(c => <option key={c.id} value={c.id}>{INDENT.repeat(c.depth)}{c.name}</option>)}
            </select>
          </div>
          <div className={styles.filterRow}>
            <input className={styles.filterInput} placeholder="Payee"
              value={filters.payeeName} onChange={e => setFilter('payeeName', e.target.value)} />
          </div>
          <div className={styles.filterRow}>
            <AmountInput className={styles.filterInput} placeholder="Min amount"
              value={filters.amountMin} onChange={v => setFilter('amountMin', v)} />
            <AmountInput className={styles.filterInput} placeholder="Max amount"
              value={filters.amountMax} onChange={v => setFilter('amountMax', v)} />
          </div>
          <div className={styles.filterRow}>
            <input className={styles.filterInput} type="date" value={filters.dateFrom}
              onChange={e => setFilter('dateFrom', e.target.value)} />
            <input className={styles.filterInput} type="date" value={filters.dateTo}
              onChange={e => setFilter('dateTo', e.target.value)} />
          </div>
          {hasActiveFilters && (
            <button className={styles.clearBtn} onClick={clearFilters}>Clear all filters</button>
          )}
        </div>
      )}

      {sorted.length === 0 ? (
        <p className={styles.empty}>No records found.</p>
      ) : (
        <div className={styles.list}>
          {sorted.map(r => {
            const isTransfer = r._kind === 'transfer'
            const isInternal = isTransfer && r._isInternal
            const isIn  = isTransfer && !isInternal && familyIds.has(r.toEnvelopeId)
            const amount = Number(r.amount)
            const runBal = runningBalances[r.id]
            const amountClass = isTransfer
              ? (isInternal ? styles.neutral : isIn ? styles.positive : styles.negative)
              : r.type === 'income' ? styles.positive : styles.negative

            return (
              <div key={r.id} className={styles.row} onClick={() => {
                setEditing({ kind: isTransfer ? 'transfer' : 'tx', record: r })
              }}>
                <div className={`${styles.typeIcon} ${amountClass}`}>
                  {isTransfer ? '⇄' : r.type === 'income' ? '↓' : '↑'}
                </div>
                <div className={styles.rowMain}>
                  <div className={styles.rowTop}>
                    <span className={styles.rowDate}>{formatDate(r.date)}</span>
                    {!isTransfer && r.payeeName && <span className={styles.rowPayee}>{r.payeeName}</span>}
                    {hasDescendants && <span className={styles.rowEnvelope}>{r._envelopeName}</span>}
                  </div>
                  <div className={styles.rowBottom}>
                    {isTransfer ? (
                      <span className={styles.rowMeta}>
                        {isInternal
                          ? `${envelopeName(r.fromEnvelopeId)} → ${envelopeName(r.toEnvelopeId)}`
                          : isIn
                            ? `← from ${envelopeName(r.fromEnvelopeId)}`
                            : `→ to ${envelopeName(r.toEnvelopeId)}`}
                      </span>
                    ) : (
                      <>
                        <span className={styles.rowMeta}>{accountName(r.accountId)}</span>
                        {categoryName(r.categoryId) && (
                          <span className={styles.rowMeta}>· {categoryName(r.categoryId)}</span>
                        )}
                      </>
                    )}
                    {r.note && <span className={styles.rowNote}>{r.note}</span>}
                  </div>
                </div>
                <div className={styles.rowRight}>
                  <span className={`${styles.rowAmount} ${amountClass}`}>
                    {isInternal ? '⇄' : isTransfer ? (isIn ? '+' : '−') : r.type === 'income' ? '+' : '−'}
                    {fmtAmt(amount)}
                  </span>
                  <span className={styles.runningBal}>{fmtAmt(round2(runBal))}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
