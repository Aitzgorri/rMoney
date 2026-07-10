import { useState, useEffect } from 'react'
import { useMediaQuery, DESKTOP } from '../utils/mediaQuery'
import { getTransactions, deleteTransaction, getPayees, getLastUsedAccountId, transferDirection } from '../data/transactions'
import { getTxAccountFilter, setTxAccountFilter } from '../utils/uiSession'
import { getAccounts } from '../data/accounts'
import { convertToMain, ensureRates } from '../utils/currency'
import { getMainCurrency, getFavoriteAccounts } from '../data/settings'
import { splitFavorites } from '../utils/favorites'
import { fmtAmt } from '../utils/format'
import { getCategoriesFlat, getDescendants as getCategoryDescendants } from '../data/categories'
import { getEnvelopes, getEnvelopesFlat, getDescendants as getEnvelopeDescendants, envelopePathLabel } from '../data/envelopes'
import TransactionForm from '../components/TransactionForm'
import InlineFormRow from '../components/InlineFormRow'
import { INDENT } from '../utils/hierarchy'
import { formatDate } from '../utils/dates'
import styles from './Transactions.module.css'

// `dir` = transferDirection(tx, filteredAccountId) — when a single account is
// filtered, transfers get a direction: signed amount in the account's own
// currency and a lighter-blue in / darker-blue out color (Phase 61e, P4).
function formatAmount(tx, dir) {
  if (tx.type === 'income')   return `+${fmtAmt(tx.amount)}`
  if (tx.type === 'expense')  return `−${fmtAmt(tx.amount)}`
  if (tx.type === 'transfer') {
    if (dir === 'in')  return `+${fmtAmt(tx.destinationAmount)}`
    if (dir === 'out') return `−${fmtAmt(tx.sourceAmount)}`
    return fmtAmt(tx.sourceAmount)
  }
  return ''
}

function amountClass(tx, s, dir) {
  if (tx.type === 'income')   return s.positive
  if (tx.type === 'expense')  return s.negative
  if (dir === 'in')  return s.transferIn
  if (dir === 'out') return s.transferOut
  return s.neutral
}

const TYPE_ICON = { income: '↓', expense: '↑', transfer: '⇄' }

export default function Transactions({ initialAccountId, openInline }) {
  const isDesktop = useMediaQuery(DESKTOP)
  const [txs, setTxs]         = useState(() => getTransactions())
  const [editing, setEditing] = useState(null)
  const mainCurrency = getMainCurrency()
  const [, rerender] = useState(0)
  useEffect(() => {
    let cancelled = false
    ensureRates(mainCurrency).then(() => { if (!cancelled) rerender(n => n + 1) }).catch(() => {})
    return () => { cancelled = true }
  }, [mainCurrency])
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [inlineOpen, setInlineOpen] = useState(false)

  // When the TopNav "+ Add transaction" button navigates here with openInline, expand the form.
  // openInline is a timestamp so each click fires this even when already on this screen.
  useEffect(() => {
    if (openInline) setInlineOpen(true)
  }, [openInline])
  const [search, setSearch]   = useState('')
  const [showFilter, setShowFilter] = useState(false)
  const [filters, setFilters] = useState({
    type: '',
    // Navigation param wins; else restore the session's last account filter so
    // returning from the ＋-menu add route keeps the filter in place (Phase 53a).
    accountId: initialAccountId || getTxAccountFilter(),
    categoryId: '',
    envelopeId: '',
    payeeName: '',
    amountMin: '',
    amountMax: '',
    dateFrom: '',
    dateTo: '',
  })
  const [sortAsc, setSortAsc]   = useState(false)
  const [viewMode, setViewMode] = useState('list')  // 'list' | 'payees'

  // Mirror the account filter into the session store so the ＋-menu New-transaction
  // route (mounted outside this screen) can prefill from it (Phase 53a).
  useEffect(() => { setTxAccountFilter(filters.accountId) }, [filters.accountId])

  const accounts        = getAccounts()
  // Account quick-filters ordered like the dropdowns: favorites first, in the
  // user's favorite order, then the rest (Phase 61d).
  const { favorites: favAccounts, rest: restAccounts } = splitFavorites(accounts, getFavoriteAccounts())
  const payees          = getPayees()
  const categoriesFlat  = getCategoriesFlat()
  const envelopesFlat   = getEnvelopesFlat(getEnvelopes().filter(e => !e.isArchived))

  // Envelope full-path labels for the list rows (Phase 49e). Built once from
  // ALL envelopes (incl. archived) so historical transactions still resolve.
  const allEnvelopesForPath = getEnvelopes()
  const envPathById = Object.fromEntries(
    allEnvelopesForPath.map(e => [e.id, envelopePathLabel(e.id, '›', allEnvelopesForPath)])
  )

  // For the category filter dropdown — split by type for type-aware rendering
  const filterCatsIncome  = categoriesFlat.filter(c => c.type === 'income')
  const filterCatsExpense = categoriesFlat.filter(c => c.type === 'expense')

  function refresh() { setTxs(getTransactions()) }

  function accountName(id) {
    return accounts.find(a => a.id === id)?.accountName ?? '—'
  }
  function categoryName(id) {
    return categoriesFlat.find(c => c.id === id)?.name ?? ''
  }


  function applyFilters(list) {
    const categoryIdSet = filters.categoryId
      ? new Set([filters.categoryId, ...getCategoryDescendants(filters.categoryId, categoriesFlat).map(c => c.id)])
      : null
    const envelopeIdSet = filters.envelopeId
      ? new Set([filters.envelopeId, ...getEnvelopeDescendants(filters.envelopeId, envelopesFlat).map(e => e.id)])
      : null

    return list.filter(tx => {
      if (filters.type && tx.type !== filters.type) return false
      if (filters.accountId) {
        if (tx.type === 'transfer') {
          if (tx.sourceAccountId !== filters.accountId &&
              tx.destinationAccountId !== filters.accountId) return false
        } else {
          if (tx.accountId !== filters.accountId) return false
        }
      }
      if (categoryIdSet && !categoryIdSet.has(tx.categoryId)) return false
      if (envelopeIdSet && !envelopeIdSet.has(tx.envelopeId)) return false
      if (filters.payeeName) {
        const txPayee = tx.payeeName?.trim() || 'Unspecified payee'
        if (!txPayee.toLowerCase().includes(filters.payeeName.toLowerCase())) return false
      }
      const amt = Number(tx.amount || tx.sourceAmount)
      if (filters.amountMin && amt < Number(filters.amountMin)) return false
      if (filters.amountMax && amt > Number(filters.amountMax)) return false
      if (filters.dateFrom && tx.date < filters.dateFrom) return false
      if (filters.dateTo   && tx.date > filters.dateTo)   return false
      if (search && !tx.note?.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }

  function setFilter(field, value) {
    setFilters(prev => ({ ...prev, [field]: value }))
  }

  function clearFilters() {
    setFilters({ type:'', accountId:'', categoryId:'', envelopeId:'', payeeName:'', amountMin:'', amountMax:'', dateFrom:'', dateTo:'' })
    setSearch('')
  }

  const hasActiveFilters = search || Object.values(filters).some(v => v)

  let displayed = applyFilters(txs)
  if (sortAsc) displayed = [...displayed].reverse()

  // Running balance — only when filtered to single account
  const singleAccount = filters.accountId && !filters.type
    ? accounts.find(a => a.id === filters.accountId)
    : null

  function getRunningBalances(list, account) {
    if (!account) return {}
    const sorted = [...list].sort((a, b) => {
      const dateDiff = new Date(a.date) - new Date(b.date)
      if (dateDiff !== 0) return dateDiff
      return new Date(a.createdAt) - new Date(b.createdAt)
    })
    let bal = Number(account.startingBalance)
    const balances = {}
    for (const tx of sorted) {
      if (tx.type === 'income')   bal += Number(tx.amount)
      if (tx.type === 'expense')  bal -= Number(tx.amount)
      if (tx.type === 'transfer') {
        if (tx.sourceAccountId === account.id)      bal -= Number(tx.sourceAmount)
        if (tx.destinationAccountId === account.id) bal += Number(tx.destinationAmount)
      }
      balances[tx.id] = bal
    }
    return balances
  }

  const runningBalances = singleAccount ? getRunningBalances(displayed, singleAccount) : {}

  // Summary totals for the filtered list (income/expense, grouped by currency)
  const txSummary = {}
  for (const tx of displayed) {
    if (tx.type === 'transfer') continue
    const cur = tx.currency || '?'
    if (!txSummary[cur]) txSummary[cur] = { income: 0, expense: 0 }
    if (tx.type === 'income') txSummary[cur].income += Number(tx.amount)
    else txSummary[cur].expense += Number(tx.amount)
  }
  const summaryEntries = Object.entries(txSummary)
  const needsConversion = summaryEntries.some(([cur]) => cur !== mainCurrency) && summaryEntries.length > 0
  let mainIncome = null, mainExpense = null
  if (needsConversion) {
    let incSum = 0, expSum = 0
    for (const [cur, { income, expense }] of summaryEntries) {
      const ci = convertToMain(income, cur, mainCurrency)
      const ce = convertToMain(expense, cur, mainCurrency)
      if (ci === null || ce === null) { incSum = null; break }
      incSum += ci; expSum += ce
    }
    mainIncome = incSum; mainExpense = expSum
  }

  // Build payee report: group income/expense transactions by payee name and currency
  function buildPayeeReport() {
    const map = {}
    for (const tx of txs) {
      if (tx.type === 'transfer') continue
      const name = tx.payeeName || 'Unspecified payee'
      if (!map[name]) map[name] = { income: {}, expense: {}, count: 0 }
      const currency = tx.currency || '?'
      if (tx.type === 'income') {
        map[name].income[currency] = (map[name].income[currency] ?? 0) + Number(tx.amount)
      } else {
        map[name].expense[currency] = (map[name].expense[currency] ?? 0) + Number(tx.amount)
      }
      map[name].count++
    }
    return Object.entries(map)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  const deleteModal = confirmDelete && (
    <div className={styles.overlay}>
      <div className={styles.dialog}>
        <h3>Delete this transaction?</h3>
        <p>This cannot be undone.</p>
        <div className={styles.dialogActions}>
          <button className={styles.cancelBtn} onClick={() => setConfirmDelete(null)} title="Keep this transaction">Cancel</button>
          <button className={styles.deleteConfirmBtn} title="Permanently delete this transaction" onClick={() => {
            deleteTransaction(confirmDelete.id)
            refresh()
            setConfirmDelete(null)
            setEditing(null)
          }}>Delete</button>
        </div>
      </div>
    </div>
  )

  if (editing) {
    return (
      <>
        {deleteModal}
        <TransactionForm
          initial={editing}
          onSave={() => { refresh(); setEditing(null) }}
          onCancel={() => setEditing(null)}
          onDelete={() => setConfirmDelete(editing)}
        />
      </>
    )
  }

  return (
    <div className={styles.screen}>
      {deleteModal}

      <div className={styles.controls}>
        <div className={styles.header}>
          <h1 className={styles.title}>Transactions</h1>
          <div className={styles.headerActions}>
            {/* These three use the styled data-tooltip (CSS attr tooltip) INSTEAD of a
                native title — one visible tooltip, never both (CLAUDE.md tooltip rule). */}
            <button
              className={`${styles.iconBtn} ${viewMode === 'payees' ? styles.active : ''}`}
              data-tooltip={viewMode === 'payees' ? 'Back to the transaction list' : 'Show the payee report'}
              onClick={() => setViewMode(v => v === 'payees' ? 'list' : 'payees')}>
              ₽
            </button>
            {!isDesktop && (
              <button className={`${styles.iconBtn} ${showFilter ? styles.active : ''}`}
                data-tooltip={showFilter ? 'Hide transaction filters' : 'Show transaction filters'}
                onClick={() => setShowFilter(v => !v)}>⚙</button>
            )}
            <button className={styles.iconBtn}
              data-tooltip={sortAsc ? 'Oldest first — click for newest first' : 'Newest first — click for oldest first'}
              onClick={() => setSortAsc(v => !v)}>
              {sortAsc ? '↑' : '↓'}
            </button>
          </div>
        </div>

        <div className={styles.searchRow}>
          <input
            className={styles.searchInput}
            placeholder="Search by note..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <div className={styles.accountButtons}>
          <button
            className={`${styles.accountBtn} ${!filters.accountId ? styles.active : ''}`}
            onClick={() => setFilter('accountId', '')}
            title="Show transactions from all accounts"
          >
            All
          </button>
          {favAccounts.map(a => (
            <button
              key={a.id}
              className={`${styles.accountBtn} ${filters.accountId === a.id ? styles.active : ''}`}
              onClick={() => setFilter('accountId', a.id)}
              title={`Show only ${a.accountName} transactions`}
            >
              {a.accountName}
            </button>
          ))}
          {isDesktop && favAccounts.length > 0 && restAccounts.length > 0 && (
            <div className={styles.accountFavDivider} />
          )}
          {restAccounts.map(a => (
            <button
              key={a.id}
              className={`${styles.accountBtn} ${filters.accountId === a.id ? styles.active : ''}`}
              onClick={() => setFilter('accountId', a.id)}
              title={`Show only ${a.accountName} transactions`}
            >
              {a.accountName}
            </button>
          ))}
        </div>

        {(isDesktop || showFilter) && (
          <div className={styles.filterPanel}>
            <div className={styles.filterRow}>
              <select className={styles.filterInput} value={filters.type} onChange={e => setFilter('type', e.target.value)}>
                <option value="">All types</option>
                <option value="income">Income</option>
                <option value="expense">Expense</option>
                <option value="transfer">Transfer</option>
              </select>
            </div>
            <div className={styles.filterRow}>
              <select className={styles.filterInput} value={filters.payeeName}
                onChange={e => setFilter('payeeName', e.target.value)}>
                <option value="">All payees</option>
                {payees.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
              </select>
            </div>
            <div className={styles.filterRow}>
              <select className={styles.filterInput} value={filters.categoryId} onChange={e => setFilter('categoryId', e.target.value)}>
                <option value="">All categories</option>
                {filters.type === 'income' && filterCatsIncome.map(c => (
                  <option key={c.id} value={c.id}>{INDENT.repeat(c.depth)}{c.name}</option>
                ))}
                {filters.type === 'expense' && filterCatsExpense.map(c => (
                  <option key={c.id} value={c.id}>{INDENT.repeat(c.depth)}{c.name}</option>
                ))}
                {!filters.type && (
                  <>
                    {filterCatsIncome.length > 0 && <option disabled>— Income —</option>}
                    {filterCatsIncome.map(c => (
                      <option key={c.id} value={c.id}>{INDENT.repeat(c.depth)}{c.name}</option>
                    ))}
                    {filterCatsExpense.length > 0 && <option disabled>— Expense —</option>}
                    {filterCatsExpense.map(c => (
                      <option key={c.id} value={c.id}>{INDENT.repeat(c.depth)}{c.name}</option>
                    ))}
                  </>
                )}
              </select>
            </div>
            <div className={styles.filterRow}>
              <select className={styles.filterInput} value={filters.envelopeId} onChange={e => setFilter('envelopeId', e.target.value)}>
                <option value="">All envelopes</option>
                {envelopesFlat.map(e => (
                  <option key={e.id} value={e.id}>{INDENT.repeat(e.depth)}{e.name}</option>
                ))}
              </select>
            </div>

            <div className={styles.filterGroup}>
              <span className={styles.filterGroupLabel}>Amount</span>
              <div className={styles.filterRowPair}>
                <input className={styles.filterInput} type="number" placeholder="Min"
                  value={filters.amountMin} onChange={e => setFilter('amountMin', e.target.value)} />
                <input className={styles.filterInput} type="number" placeholder="Max"
                  value={filters.amountMax} onChange={e => setFilter('amountMax', e.target.value)} />
              </div>
            </div>

            <div className={styles.filterGroup}>
              <span className={styles.filterGroupLabel}>Date range</span>
              <div className={styles.filterRowPair}>
                <div className={styles.filterDateField}>
                  <span className={styles.filterDateHint}>From</span>
                  <input className={styles.filterInput} type="date" value={filters.dateFrom}
                    onChange={e => setFilter('dateFrom', e.target.value)} />
                </div>
                <div className={styles.filterDateField}>
                  <span className={styles.filterDateHint}>To</span>
                  <input className={styles.filterInput} type="date" value={filters.dateTo}
                    onChange={e => setFilter('dateTo', e.target.value)} />
                </div>
              </div>
            </div>

            {hasActiveFilters && (
              <button className={styles.clearBtn} onClick={clearFilters} title="Reset all filters and search">Clear all filters</button>
            )}
          </div>
        )}

        {!isDesktop && hasActiveFilters && !showFilter && (
          <button className={styles.clearBtnSmall} onClick={clearFilters} title="Reset all filters and search">✕ Clear filters</button>
        )}
      </div>

      <div className={styles.listPane}>
        {viewMode !== 'payees' && summaryEntries.length > 0 && (
          <div className={styles.txSummary}>
            {summaryEntries.map(([cur, { income, expense }]) => (
              <span key={cur} className={styles.txSummaryGroup}>
                {income > 0 && <span className={styles.txSummaryIncome}>+{fmtAmt(income)} {cur}</span>}
                {expense > 0 && <span className={styles.txSummaryExpense}>−{fmtAmt(expense)} {cur}</span>}
              </span>
            ))}
            {needsConversion && (
              <span className={styles.txSummaryMain}>
                {mainIncome !== null
                  ? `≈ +${fmtAmt(mainIncome)} / −${fmtAmt(mainExpense)} ${mainCurrency}`
                  : `— ${mainCurrency}`}
              </span>
            )}
          </div>
        )}

        {isDesktop && viewMode !== 'payees' && (
          <InlineFormRow label="Add transaction" open={inlineOpen} onOpenChange={setInlineOpen}>
            {onCollapse => (
              <TransactionForm
                inline
                defaultAccountId={filters.accountId || getLastUsedAccountId()}
                onSave={() => { refresh(); onCollapse() }}
                onCancel={onCollapse}
              />
            )}
          </InlineFormRow>
        )}

        {viewMode === 'payees' ? (
          <PayeeReport
            report={buildPayeeReport()}
            onSelectPayee={name => {
              setFilter('payeeName', name)
              setViewMode('list')
            }}
            styles={styles}
          />
        ) : displayed.length === 0 ? (
          <p className={styles.empty}>No transactions found.</p>
        ) : (
          <div className={styles.list}>
            {displayed.map(tx => {
              const dir = transferDirection(tx, filters.accountId)
              return (
              <div key={tx.id} className={styles.row} onClick={() => setEditing(tx)}>
                <div className={`${styles.typeIcon} ${amountClass(tx, styles, dir)}`}>
                  {TYPE_ICON[tx.type]}
                </div>
                <div className={styles.rowMain}>
                  <div className={styles.rowTop}>
                    <span className={styles.rowDate}>{formatDate(tx.date)}</span>
                    {tx.payeeName && <span className={styles.rowPayee}>{tx.payeeName}</span>}
                  </div>
                  <div className={styles.rowBottom}>
                    {tx.type !== 'transfer' ? (
                      <>
                        <span className={styles.rowMeta}>{accountName(tx.accountId)}</span>
                        {categoryName(tx.categoryId) && (
                          <span className={styles.rowMeta}>· {categoryName(tx.categoryId)}</span>
                        )}
                        {tx.envelopeId && envPathById[tx.envelopeId] && (
                          <span className={styles.rowMeta}>◇ {envPathById[tx.envelopeId]}</span>
                        )}
                      </>
                    ) : (
                      <span className={styles.rowMeta}>
                        {accountName(tx.sourceAccountId)} → {accountName(tx.destinationAccountId)}
                      </span>
                    )}
                    {tx.note && <span className={styles.rowNote}>{tx.note}</span>}
                  </div>
                </div>
                <div className={styles.rowRight}>
                  <span className={`${styles.rowAmount} ${amountClass(tx, styles, dir)}`}>
                    {formatAmount(tx, dir)}
                  </span>
                  <span className={styles.rowCurrency}>
                    {dir === 'in'
                      ? (tx.destinationCurrency || tx.sourceCurrency || '')
                      : (tx.currency || tx.sourceCurrency || '')}
                  </span>
                  {singleAccount && (
                    <span className={styles.runningBal}>
                      {runningBalances[tx.id] != null ? fmtAmt(runningBalances[tx.id]) : ''}
                    </span>
                  )}
                </div>
              </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function PayeeReport({ report, onSelectPayee, styles }) {
  if (report.length === 0) {
    return <p className={styles.empty}>No payee data yet.</p>
  }
  return (
    <div className={styles.payeeList}>
      {report.map(({ name, income, expense, count }) => (
        <div key={name} className={styles.payeeRow} onClick={() => onSelectPayee(name)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className={styles.payeeName}>{name}</span>
            <span className={styles.payeeTxCount}>{count} tx</span>
          </div>
          <div className={styles.payeeTotals}>
            {Object.entries(income).map(([cur, amt]) => (
              <div key={'i' + cur} className={styles.payeeTotal}>
                <span className={styles.payeeTotalLabel}>Received</span>
                <span className={styles.payeeTotalPositive}>+{fmtAmt(amt)} {cur}</span>
              </div>
            ))}
            {Object.entries(expense).map(([cur, amt]) => (
              <div key={'e' + cur} className={styles.payeeTotal}>
                <span className={styles.payeeTotalLabel}>Paid</span>
                <span className={styles.payeeTotalNegative}>−{fmtAmt(amt)} {cur}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
