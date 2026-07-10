import { useState, useRef, useCallback } from 'react'
import { getTransactions, deleteTransaction } from '../data/transactions'
import { getEnvelopeTransfers, deleteEnvelopeTransfer, getEnvelopes, getDescendants, getTotalEnvelopeBalance, getScheduledTransfers, deleteScheduledTransfer, scheduledTransfersSummary, getEnvelopePath } from '../data/envelopes'
import { getAccounts } from '../data/accounts'
import { getCategoriesFlat } from '../data/categories'
import TransactionForm from '../components/TransactionForm'
import EnvelopeTransferForm from '../components/EnvelopeTransferForm'
import { INDENT } from '../utils/hierarchy'
import { formatDate } from '../utils/dates'
import { dayLabel as freqDayLabel, FREQUENCY_LABELS, dayPickerKind } from '../utils/frequency'
import { buildEnvelopeProjection } from '../utils/envelopeProjection'
import { useCollapseState } from '../utils/useCollapseState'
import styles from './EnvelopeHistory.module.css'
import { fmtAmt, round2, parseAmount } from '../utils/format'
import { daysRemaining } from '../utils/planningPeriod'
import AmountInput from '../components/AmountInput'
import PayeeAutocomplete from '../components/PayeeAutocomplete'

// Records rendered initially and added per scroll-to-bottom chunk (Phase 62c —
// same display-only pagination as the Transactions list, 62a).
const PAGE_SIZE = 50

// Sort key for the scheduled-transfers list (Phase 50b): day-of-month rules
// first (group 0, ordered by day 1–28), then weekday rules (group 1, by weekday).
function schedSortKey(s) {
  const group = dayPickerKind(s.frequency) === 'weekday' ? 1 : 0
  return group * 1000 + (s.dayOfExecution ?? 0)
}

export default function EnvelopeHistory({ envelope, onBack, embedded, onDataChange }) {
  const [editing, setEditing]         = useState(null)  // { kind: 'tx'|'transfer'|'scheduled', record }
  const [creatingTransfer, setCreatingTransfer] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [search, setSearch]           = useState('')
  const [showFilter, setShowFilter]   = useState(false)
  const [showDaily, setShowDaily]     = useState(false)  // per-day spendable figure (Phase 54c)
  const [sortAsc, setSortAsc]         = useState(false)
  const [_refreshKey, setRefreshKey]  = useState(0)
  const [filters, setFilters]         = useState({
    type: '', accountId: '', categoryId: '', payeeName: '', amountMin: '', amountMax: '', dateFrom: '', dateTo: '',
  })
  // Scheduled-transfers section collapse — default collapsed, persisted globally
  // (Phase 50a). The hook stores the *expanded* ids, so an empty set = collapsed.
  // Must be called before any early return (rules-of-hooks).
  const schedCollapse = useCollapseState('rmoney_envelopes_scheduled_expanded')

  // Incremental rendering of the records list (Phase 62c): show PAGE_SIZE rows,
  // grow when the bottom sentinel scrolls into view; reset when the envelope,
  // filters, search or sort change (adjust-state-during-render — no effect).
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const listSignature = JSON.stringify([envelope.id, filters, search, sortAsc])
  const [prevListSignature, setPrevListSignature] = useState(listSignature)
  if (listSignature !== prevListSignature) {
    setPrevListSignature(listSignature)
    setVisibleCount(PAGE_SIZE)
  }
  // Callback ref so the observer re-attaches across the sentinel's conditional mounts.
  const sentinelObserver = useRef(null)
  const sentinelRef = useCallback(node => {
    sentinelObserver.current?.disconnect()
    sentinelObserver.current = null
    if (node) {
      sentinelObserver.current = new IntersectionObserver(entries => {
        if (entries[0].isIntersecting) setVisibleCount(c => c + PAGE_SIZE)
      }, { rootMargin: '200px' })
      sentinelObserver.current.observe(node)
    }
  }, [])

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
      // Boundary account-transfers (SPEC-038): stored flow decides the sign
      if (r.type === 'transfer' && r.envelopeFlow === 'income')  runBal += Number(r.destinationAmount)
      if (r.type === 'transfer' && r.envelopeFlow === 'expense') runBal -= Number(r.sourceAmount)
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

  // "Parent / Leaf" — only the last two path segments, never higher ancestors
  // (Phase 61b rework: identifies a sub-envelope compactly in scheduled rows).
  function envelopeShortLabel(id) {
    return getEnvelopePath(id, allEnvelopes).slice(-2).join(' / ') || '—'
  }

  // Scheduled transfers touching this envelope OR any of its descendants
  // (Phase 61b rework — a parent lists its sub-envelopes' transfers too),
  // ordered by scheduled day (Phase 50b): day-of-month rules first by day,
  // then weekday rules by weekday.
  const scheduledTransfers = getScheduledTransfers()
    .filter(s => s.isActive && (familyIds.has(s.fromEnvelopeId) || familyIds.has(s.toEnvelopeId)))
    .sort((a, b) => schedSortKey(a) - schedSortKey(b))

  const schedExpanded = schedCollapse.has('scheduled')

  // Balance projection: next 6 months (Phase 52). Forecasts from recurring
  // scheduled flows (transfers + planned items) + a 3-month unscheduled average
  // + one-time future scheduled items, over this envelope and its descendants.
  const { series: projection, recurringNet, avgUnscheduledNet, monthsUsed } = buildEnvelopeProjection(envelope.id, 6)

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
              <button className={styles.cancelBtn} onClick={() => setConfirmDelete(null)} title="Cancel — keep the record">Cancel</button>
              <button className={styles.deleteConfirmBtn} title="Confirm deletion — this cannot be undone" onClick={() => {
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
          : <button className={styles.backBtn} onClick={onBack} title="Back to the envelope list">← Back</button>
        }
        <h2 className={styles.title}>{envelope.name}</h2>
        <div className={styles.headerActions}>
          <button className={styles.transferBtn} onClick={() => setCreatingTransfer(true)} title="New transfer from this envelope">⇄ Transfer</button>
          <button className={`${styles.iconBtn} ${showDaily ? styles.active : ''}`}
            onClick={() => setShowDaily(v => !v)}
            title="Show how much can be spent per day until the end of the planning period">÷</button>
          <button className={`${styles.iconBtn} ${showFilter ? styles.active : ''}`}
            onClick={() => setShowFilter(v => !v)}
            title={showFilter ? 'Hide transaction filters' : 'Show transaction filters'}>⚙</button>
          <button className={styles.iconBtn} onClick={() => setSortAsc(v => !v)}
            title={sortAsc ? 'Oldest first — click for newest first' : 'Newest first — click for oldest first'}>
            {sortAsc ? '↑' : '↓'}
          </button>
        </div>
      </div>

      <div className={styles.balanceCard}>
        <span className={styles.balanceLabel}>Balance</span>
        <span className={`${styles.balanceValue} ${balance < 0 ? styles.negative : styles.positive}`}>
          {balance < 0 ? '−' : ''}{fmtAmt(Math.abs(balance))}
        </span>
        {showDaily && (() => {
          // Same formula as the Dashboard daily-spending widget (SPEC-008).
          const days = daysRemaining()
          const daily = balance <= 0 ? 0 : days > 0 ? balance / days : 0
          return (
            <span className={styles.balanceLabel}>
              {fmtAmt(daily)} / day · {days} day{days === 1 ? '' : 's'} left in period
            </span>
          )
        })()}
      </div>

      {/* Scheduled transfers section — collapsible, default collapsed (Phase 50) */}
      <div className={styles.scheduledSection}>
        <button type="button" className={styles.scheduledHeader}
          onClick={() => schedCollapse.toggle('scheduled')}
          title={schedExpanded ? 'Collapse the scheduled transfers section' : 'Expand the scheduled transfers section'}>
          <span className={styles.chevron}>{schedExpanded ? '▾' : '▸'}</span>
          <span className={styles.sectionTitle}>Scheduled transfers</span>
          {scheduledTransfers.length > 0 && (() => {
            // Per-frequency net sums of the raw amounts; the ≈ monthly average
            // (yearly ÷ 12) appears only when a non-monthly frequency exists
            // (Phase 61b — an all-monthly sum needs no approximation).
            const { byFrequency, monthlyAvg, allMonthly } = scheduledTransfersSummary(scheduledTransfers, familyIds)
            if (byFrequency.length === 0) return null
            const signed = n => `${n < 0 ? '−' : '+'}${fmtAmt(Math.abs(round2(n)))}`
            return (
              <span className={styles.schedSummary}
                title="Net sum of the scheduled transfers per frequency; ≈ is the average per month (yearly total ÷ 12)">
                {byFrequency.map(g => (
                  <span key={g.frequency} className={round2(g.net) < 0 ? styles.negative : styles.positive}>
                    {FREQUENCY_LABELS[g.frequency] ?? g.frequency} {signed(g.net)}
                  </span>
                ))}
                {!allMonthly && (
                  <span className={round2(monthlyAvg) < 0 ? styles.negative : styles.positive}>
                    ≈ {signed(monthlyAvg)}/mo
                  </span>
                )}
              </span>
            )
          })()}
          {scheduledTransfers.length > 0 && (
            <span className={styles.schedCount}>{scheduledTransfers.length}</span>
          )}
        </button>
        {schedExpanded && (
          scheduledTransfers.length === 0 ? (
            <p className={styles.scheduledEmpty}>No scheduled transfers.</p>
          ) : (
            scheduledTransfers.map(s => {
              // Direction relative to the whole family (envelope + descendants).
              // Both sides inside → internal: moves nothing in or out, neutral.
              const intoFamily  = familyIds.has(s.toEnvelopeId)
              const outOfFamily = familyIds.has(s.fromEnvelopeId)
              const isInternal  = intoFamily && outOfFamily
              const isIncoming  = intoFamily && !outOfFamily
              // The family-side envelope this transfer belongs to — tagged on the
              // row when it isn't the viewed envelope itself (Phase 61b rework).
              const ownEnvId = isInternal ? null : (isIncoming ? s.toEnvelopeId : s.fromEnvelopeId)
              const dayStr = freqDayLabel(s.frequency, s.dayOfExecution)
              return (
                <div key={s.id} className={styles.scheduledRow}
                  onClick={() => setEditing({ kind: 'scheduled', record: s })}>
                  <span className={styles.schedDay}>{dayStr}</span>
                  <span className={styles.schedFreq}>{FREQUENCY_LABELS[s.frequency] ?? s.frequency}</span>
                  <span className={`${styles.schedAmount} ${isInternal ? styles.neutral : isIncoming ? styles.positive : styles.negative}`}>
                    {isInternal ? '' : isIncoming ? '+' : '−'}{fmtAmt(s.amount)}
                  </span>
                  {ownEnvId && ownEnvId !== envelope.id && (
                    <span className={styles.schedOwnEnv}>{envelopeShortLabel(ownEnvId)}</span>
                  )}
                  <span className={styles.schedEnv}>
                    {isInternal
                      ? `${envelopeShortLabel(s.fromEnvelopeId)} ⇄ ${envelopeShortLabel(s.toEnvelopeId)}`
                      : isIncoming
                        ? `← ${envelopeShortLabel(s.fromEnvelopeId)}`
                        : `→ ${envelopeShortLabel(s.toEnvelopeId)}`}
                  </span>
                  <span className={styles.scheduledEdit}>›</span>
                </div>
              )
            })
          )
        )}
      </div>

      {/* Projection section — one row on desktop (Phase 50d / 52) */}
      {projection.length > 0 && (
        <div className={styles.projectionSection}>
          <span className={styles.sectionTitle}>Projection</span>
          <div className={styles.projectionGrid}>
            {projection.map(p => {
              const v = round2(p.amount)
              return (
                <div key={p.label} className={styles.projectionItem}>
                  <span className={styles.projectionLabel}>{p.label}</span>
                  <span className={`${styles.projectionAmount} ${v < 0 ? styles.negative : styles.positive}`}>
                    {v < 0 ? '−' : ''}{fmtAmt(Math.abs(v))}
                  </span>
                </div>
              )
            })}
          </div>
          {/* Explainable breakdown (Phase 52d) */}
          <span className={styles.projectionNote}>
            {(() => {
              const sched = round2(recurringNet)
              const unsch = round2(avgUnscheduledNet)
              const fmtSigned = n => `${n < 0 ? '−' : '+'}${fmtAmt(Math.abs(n))}`
              return `scheduled net ${fmtSigned(sched)}/mo · avg unscheduled ${fmtSigned(unsch)}/mo` +
                (monthsUsed > 0 ? ` · based on ${monthsUsed} mo` : '')
            })()}
          </span>
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
            <PayeeAutocomplete className={styles.filterInput} placeholder="Payee"
              value={filters.payeeName} onChange={v => setFilter('payeeName', v)} />
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
            <button className={styles.clearBtn} onClick={clearFilters} title="Clear all filters and the search text">Clear all filters</button>
          )}
        </div>
      )}

      {sorted.length === 0 ? (
        <p className={styles.empty}>No records found.</p>
      ) : (
        <div className={styles.list}>
          {sorted.slice(0, visibleCount).map(r => {
            const isTransfer = r._kind === 'transfer'
            const isInternal = isTransfer && r._isInternal
            const isIn  = isTransfer && !isInternal && familyIds.has(r.toEnvelopeId)
            // Boundary account-transfer posted to this envelope (SPEC-038)
            const isBoundary = r._kind === 'tx' && r.type === 'transfer'
            const boundaryIn = isBoundary && r.envelopeFlow === 'income'
            const amount = isBoundary
              ? Number(boundaryIn ? r.destinationAmount : r.sourceAmount)
              : Number(r.amount)
            const runBal = runningBalances[r.id]
            const amountClass = isTransfer
              ? (isInternal ? styles.neutral : isIn ? styles.positive : styles.negative)
              : isBoundary
                ? (boundaryIn ? styles.positive : styles.negative)
                : r.type === 'income' ? styles.positive : styles.negative

            return (
              <div key={r.id} className={styles.row} onClick={() => {
                setEditing({ kind: isTransfer ? 'transfer' : 'tx', record: r })
              }}>
                <div className={`${styles.typeIcon} ${amountClass}`}>
                  {isTransfer || isBoundary ? '⇄' : r.type === 'income' ? '↓' : '↑'}
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
                    ) : isBoundary ? (
                      <span className={styles.rowMeta}>
                        {boundaryIn
                          ? `← from account ${accountName(r.sourceAccountId)}`
                          : `→ to account ${accountName(r.destinationAccountId)}`}
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
                    {isInternal ? '⇄' : isTransfer ? (isIn ? '+' : '−') : isBoundary ? (boundaryIn ? '+' : '−') : r.type === 'income' ? '+' : '−'}
                    {fmtAmt(amount)}
                  </span>
                  <span className={styles.runningBal}>{fmtAmt(round2(runBal))}</span>
                </div>
              </div>
            )
          })}
          {sorted.length > visibleCount && (
            <div ref={sentinelRef} className={styles.loadMoreRow}>
              <button className={styles.loadMoreBtn}
                onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
                title={`Show the next ${Math.min(PAGE_SIZE, sorted.length - visibleCount)} records`}>
                Load more ({sorted.length - visibleCount} remaining)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
