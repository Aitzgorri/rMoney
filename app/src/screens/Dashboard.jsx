import { useState, useEffect } from 'react'
import { getActiveAccounts } from '../data/accounts'
import { getAccountBalance, getTransactions } from '../data/transactions'
import { getActiveEnvelopes, getEnvelopes, getEnvelopesFlat, getTotalEnvelopeBalance } from '../data/envelopes'
import { INDENT } from '../utils/hierarchy'
import { getWidgets, addWidget, removeWidget, reorderWidgets, getMainCurrency, getCurrencyDisplay, getFavoriteAccounts } from '../data/settings'
import { splitFavorites } from '../utils/favorites'
import { getCurrentPeriod, isInCurrentPeriod, daysRemaining } from '../utils/planningPeriod'
import { getUpcomingOccurrences, getDuePendingOccurrences, confirmOccurrence } from '../data/bills'
import { getCategories } from '../data/categories'
import { ensureRates, convertToMain, getRatesLastFetchedAt, formatRatesTimestamp } from '../utils/currency'
import styles from './Dashboard.module.css'
import { fmtAmt } from '../utils/format'

function formatUpcomingDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}

function getDisplayName(item, categoriesById) {
  if (item.payee) return item.payee
  if (item.categoryId && categoriesById[item.categoryId]) return categoriesById[item.categoryId].name
  return item.name
}

const TYPE_ICON = {
  savings: '🏦',
  debit:   '💳',
  cash:    '💵',
  credit:  '💳',
}

export default function Dashboard({ onNavigate }) {
  const accounts = getActiveAccounts()
  const period = getCurrentPeriod()
  const [widgets, setWidgets] = useState(() => getWidgets())
  const [editingWidgets, setEditingWidgets] = useState(false)
  const [addingWidget, setAddingWidget] = useState(false)
  const [newWidgetEnvelopeId, setNewWidgetEnvelopeId] = useState('')
  const [showAllUpcoming, setShowAllUpcoming] = useState(false)

  const mainCurrency = getMainCurrency()
  const [showNative, setShowNative] = useState(() => getCurrencyDisplay() === 'native')
  const [ratesLoading, setRatesLoading] = useState(false)
  const [ratesError, setRatesError] = useState(null)
  const [ratesTimestamp, setRatesTimestamp] = useState(() => getRatesLastFetchedAt())

  // Phase 55c: due-pending occurrences (waiting for confirmation) were invisible
  // here — getUpcomingOccurrences excludes their items entirely. Show them at the
  // top of the Upcoming card with an inline Confirm (same semantics as Bills & Income).
  const [, bumpTick] = useState(0)
  const upcoming = getUpcomingOccurrences()
  const duePending = getDuePendingOccurrences()
  const categoriesById = Object.fromEntries(getCategories().map(c => [c.id, c]))

  function handleConfirmDue(p) {
    confirmOccurrence(p.id, p.plannedAmount, {
      type:       p.item.type,
      accountId:  p.item.accountId,
      currency:   p.item.currency,
      categoryId: p.item.categoryId ?? null,
      envelopeId: p.item.envelopeId ?? null,
      payeeName:  p.item.payee ?? '',
      note:       p.item.name,
      date:       p.dueDate,
    })
    bumpTick(t => t + 1)
  }

  const envelopes = getActiveEnvelopes()
  const envelopesFlat = getEnvelopesFlat(envelopes)

  function refreshWidgets() { setWidgets(getWidgets()) }

  const accountsWithBalance = accounts.map(a => ({
    ...a,
    balance: getAccountBalance(a.id, a.startingBalance),
  }))

  const totals = accountsWithBalance.reduce((acc, a) => {
    acc[a.currency] = (acc[a.currency] ?? 0) + a.balance
    return acc
  }, {})

  // Compute total in main currency — null means a rate is unavailable (show "—")
  const mainCurrencyTotal = accountsWithBalance.length === 0 ? null : (() => {
    let sum = 0
    for (const a of accountsWithBalance) {
      const converted = convertToMain(a.balance, a.currency, mainCurrency)
      if (converted === null) return null
      sum += converted
    }
    return sum
  })()

  const hasMultipleCurrencies = Object.keys(totals).length > 1
  const needsRates = hasMultipleCurrencies || Object.keys(totals).some(c => c !== mainCurrency)

  useEffect(() => {
    if (!needsRates) return
    let cancelled = false
    async function load() {
      setRatesLoading(true)
      setRatesError(null)
      try {
        await ensureRates(mainCurrency)
        if (!cancelled) setRatesTimestamp(getRatesLastFetchedAt())
      } catch (err) {
        if (!cancelled) setRatesError(err.message)
      } finally {
        if (!cancelled) setRatesLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [mainCurrency, needsRates])

  async function handleRefreshRates() {
    setRatesLoading(true)
    setRatesError(null)
    try {
      await ensureRates(mainCurrency, true)
      setRatesTimestamp(getRatesLastFetchedAt())
    } catch (err) {
      setRatesError(err.message)
    } finally {
      setRatesLoading(false)
    }
  }

  // Period summary: income and expenses within current planning period
  const periodTxs = getTransactions().filter(t =>
    t.type !== 'transfer' && isInCurrentPeriod(t.date)
  )

  const periodSummary = periodTxs.reduce((acc, t) => {
    const cur = t.currency || '?'
    if (!acc[cur]) acc[cur] = { income: 0, expense: 0 }
    if (t.type === 'income')  acc[cur].income  += Number(t.amount)
    if (t.type === 'expense') acc[cur].expense += Number(t.amount)
    return acc
  }, {})

  const hasPeriodData = Object.keys(periodSummary).length > 0

  // Widget actions
  function handleAddWidget() {
    if (!newWidgetEnvelopeId) return
    addWidget('envelope-daily-spending', { envelopeId: newWidgetEnvelopeId })
    refreshWidgets()
    setAddingWidget(false)
    setNewWidgetEnvelopeId('')
  }

  function handleRemoveWidget(id) {
    removeWidget(id)
    refreshWidgets()
  }

  function handleMoveWidget(index, direction) {
    const ids = widgets.map(w => w.id)
    const target = index + direction
    if (target < 0 || target >= ids.length) return
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    reorderWidgets(ids)
    refreshWidgets()
  }

  return (
    <div className={styles.screen}>
      <div className={styles.headerRow}>
        <h1 className={styles.title}>Dashboard</h1>
        <span className={styles.periodLabel}>{period.label}</span>
      </div>

      {needsRates && (
        <div className={styles.ratesBar}>
          <span className={styles.ratesTimestamp}>
            {ratesError
              ? <span className={styles.ratesError}>Rate fetch failed</span>
              : ratesTimestamp
                ? `Rates as of ${formatRatesTimestamp(ratesTimestamp)}`
                : 'Rates not loaded'}
          </span>
          <button
            className={styles.refreshBtn}
            onClick={handleRefreshRates}
            disabled={ratesLoading}
            title="Fetch the latest exchange rates"
          >
            {ratesLoading ? 'Refreshing…' : 'Refresh rates'}
          </button>
        </div>
      )}

      {/* Account Balances card */}
      <div className={`${styles.card} ${styles.accountsCard}`}>
        <div className={styles.cardHeader}>
          <span className={styles.cardTitle}>Account Balances</span>
          <button className={styles.seeAll} onClick={() => onNavigate('accounts')} title="Go to Accounts">
            See all →
          </button>
        </div>

        {accounts.length === 0 ? (
          <p className={styles.empty}>No accounts yet.</p>
        ) : (
          <>
            <div className={styles.totals}>
              {showNative || !needsRates ? (
                Object.entries(totals).map(([currency, total]) => (
                  <div key={currency} className={styles.totalRow}>
                    <span className={styles.totalLabel}>Total {currency}</span>
                    <span className={total < 0 ? styles.negative : styles.positive}>
                      {total < 0 ? '−' : ''}{fmtAmt(Math.abs(total))} {currency}
                    </span>
                  </div>
                ))
              ) : (
                <div className={styles.totalRow}>
                  <span className={styles.totalLabel}>Total {mainCurrency}</span>
                  <span className={mainCurrencyTotal !== null && mainCurrencyTotal < 0 ? styles.negative : styles.positive}>
                    {mainCurrencyTotal === null
                      ? '—'
                      : `${mainCurrencyTotal < 0 ? '−' : ''}${fmtAmt(Math.abs(mainCurrencyTotal))} ${mainCurrency}`}
                  </span>
                </div>
              )}
              {needsRates && (
                <button
                  className={styles.showNativeBtn}
                  onClick={() => setShowNative(v => !v)}
                  title={showNative ? `Show totals in ${mainCurrency}` : 'Show totals in native currencies'}
                >
                  {showNative ? `Show in ${mainCurrency}` : 'Show in native'}
                </button>
              )}
            </div>

            <div className={styles.divider} />

            {(() => {
              // Favorite accounts (Phase 48) float to the top in the user's
              // favorite order, separated from the rest by a divider line.
              const { favorites, rest } = splitFavorites(accountsWithBalance, getFavoriteAccounts())
              const renderRow = account => {
                const approx = account.currency !== mainCurrency
                  ? convertToMain(account.balance, account.currency, mainCurrency)
                  : null
                return (
                  <div
                    key={account.id}
                    className={`${styles.accountRow} ${styles.accountRowClickable}`}
                    onClick={() => onNavigate('transactions', { accountId: account.id })}
                  >
                    <div className={styles.accountLeft}>
                      <span className={styles.accountIcon}>{TYPE_ICON[account.type]}</span>
                      <span className={styles.accountName}>
                        {account.accountName}
                        {account.companyName ? ` · ${account.companyName}` : ''}
                      </span>
                    </div>
                    <div className={styles.accountRight}>
                      <span className={account.balance < 0 ? styles.negative : styles.positive}>
                        {account.balance < 0 ? '−' : ''}{fmtAmt(Math.abs(account.balance))} {account.currency}
                      </span>
                      {approx !== null && (
                        <span className={styles.approxHint}>
                          ≈ {approx < 0 ? '−' : ''}{fmtAmt(Math.abs(approx))} {mainCurrency}
                        </span>
                      )}
                    </div>
                  </div>
                )
              }
              return (
                <>
                  {favorites.map(renderRow)}
                  {favorites.length > 0 && rest.length > 0 && <div className={styles.favDivider} />}
                  {rest.map(renderRow)}
                </>
              )
            })()}
          </>
        )}
      </div>

      {/* Period Summary card */}
      <div className={`${styles.card} ${styles.periodCard}`}>
        <div className={styles.cardHeader}>
          <span className={styles.cardTitle}>Period Summary</span>
          <span className={styles.periodSmall}>{period.label}</span>
        </div>

        {!hasPeriodData ? (
          <p className={styles.empty}>No transactions this period.</p>
        ) : (
          Object.entries(periodSummary).map(([currency, { income, expense }]) => {
            const net = income - expense
            return (
              <div key={currency} className={styles.summaryBlock}>
                <div className={styles.summaryRow}>
                  <span className={styles.summaryLabel}>Income</span>
                  <span className={styles.positive}>+{fmtAmt(income)} {currency}</span>
                </div>
                <div className={styles.summaryRow}>
                  <span className={styles.summaryLabel}>Expenses</span>
                  <span className={styles.negative}>−{fmtAmt(expense)} {currency}</span>
                </div>
                <div className={styles.divider} />
                <div className={styles.summaryRow}>
                  <span className={styles.summaryLabel}>Net</span>
                  <span className={net < 0 ? styles.negative : styles.positive}>
                    {net < 0 ? '−' : '+'}{fmtAmt(Math.abs(net))} {currency}
                  </span>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Upcoming card */}
      <div className={`${styles.card} ${styles.upcomingCard}`}>
        <div className={styles.cardHeader}>
          <span className={styles.cardTitle}>Upcoming</span>
          {upcoming.length > 5 && (
            <button className={styles.seeAll} onClick={() => setShowAllUpcoming(v => !v)} title={showAllUpcoming ? 'Show only the first 5 upcoming items' : 'Show all upcoming items'}>
              {showAllUpcoming ? 'Show less' : `See all ${upcoming.length}`}
            </button>
          )}
        </div>

        {/* Due & waiting for confirmation — confirmable right here (Phase 55c) */}
        {duePending.length > 0 && (
          <div className={styles.upcomingList}>
            {duePending.map(p => (
              <div key={p.id} className={`${styles.upcomingRow} ${styles.dueRow}`}>
                <span className={styles.upcomingDate}>{formatUpcomingDate(p.dueDate)}</span>
                <span className={styles.dueTag}>due</span>
                <span className={p.item.type === 'income' ? styles.positive : styles.negative}>
                  {p.item.type === 'income' ? '+' : '-'}{fmtAmt(p.plannedAmount)} {p.item.currency}
                </span>
                <span className={styles.upcomingName}>{getDisplayName(p.item, categoriesById)}</span>
                <button className={styles.confirmDueBtn} onClick={() => handleConfirmDue(p)}
                  title={`Confirm with the planned amount and due date — creates the transaction (adjust amount/date on the Bills & Income page instead if needed)`}>
                  Confirm
                </button>
              </div>
            ))}
          </div>
        )}

        {upcoming.length === 0 && duePending.length === 0 ? (
          <p className={styles.empty}>No upcoming items.</p>
        ) : upcoming.length === 0 ? null : (
          <div className={styles.upcomingList}>
            {(showAllUpcoming ? upcoming : upcoming.slice(0, 5)).map(({ date, item }) => (
              <div key={item.id + date} className={styles.upcomingRow}>
                <span className={styles.upcomingDate}>{formatUpcomingDate(date)}</span>
                <span className={item.type === 'income' ? styles.upcomingTypeIncome : styles.upcomingTypeExpense}>
                  {item.type === 'income' ? 'Income' : 'Expense'}
                </span>
                <span className={item.type === 'income' ? styles.positive : styles.negative}>
                  {item.type === 'income' ? '+' : '-'}{fmtAmt(item.amount)} {item.currency}
                </span>
                <span className={styles.upcomingName}>{getDisplayName(item, categoriesById)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Widgets section */}
      <div className={styles.widgetSection}>
        <div className={styles.cardHeader}>
          <span className={styles.cardTitle}>Widgets</span>
          <button className={styles.seeAll} onClick={() => setEditingWidgets(v => !v)} title={editingWidgets ? 'Finish editing widgets' : 'Reorder or remove widgets'}>
            {editingWidgets ? 'Done' : 'Edit'}
          </button>
        </div>

        <div className={styles.widgetGrid}>
          {widgets.map((widget, index) => (
            <WidgetRenderer
              key={widget.id}
              widget={widget}
              envelopes={envelopes}
              editing={editingWidgets}
              onRemove={() => handleRemoveWidget(widget.id)}
              onMoveUp={() => handleMoveWidget(index, -1)}
              onMoveDown={() => handleMoveWidget(index, 1)}
              isFirst={index === 0}
              isLast={index === widgets.length - 1}
            />
          ))}
        </div>

        {addingWidget ? (
          <div className={styles.addWidgetForm}>
            <select
              className={styles.widgetSelect}
              value={newWidgetEnvelopeId}
              onChange={e => setNewWidgetEnvelopeId(e.target.value)}
            >
              <option value="">Select an envelope...</option>
              {envelopesFlat.map(e => (
                <option key={e.id} value={e.id}>{INDENT.repeat(e.depth)}{e.name}</option>
              ))}
            </select>
            <div className={styles.addWidgetActions}>
              <button className={styles.cancelSmall} onClick={() => { setAddingWidget(false); setNewWidgetEnvelopeId('') }} title="Cancel adding a widget">Cancel</button>
              <button className={styles.confirmSmall} onClick={handleAddWidget} disabled={!newWidgetEnvelopeId} title="Add this widget to the dashboard">Add</button>
            </div>
          </div>
        ) : (
          <button className={styles.addWidgetBtn} onClick={() => setAddingWidget(true)} title="Add a new widget">
            + Add widget
          </button>
        )}
      </div>
    </div>
  )
}

function WidgetRenderer({ widget, envelopes, editing, onRemove, onMoveUp, onMoveDown, isFirst, isLast }) {
  if (widget.type === 'envelope-daily-spending') {
    return (
      <EnvelopeDailySpendingWidget
        widget={widget}
        envelopes={envelopes}
        editing={editing}
        onRemove={onRemove}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
        isFirst={isFirst}
        isLast={isLast}
      />
    )
  }
  return null
}

function EnvelopeDailySpendingWidget({ widget, envelopes, editing, onRemove, onMoveUp, onMoveDown, isFirst, isLast }) {
  const envelope = envelopes.find(e => e.id === widget.config.envelopeId)
  if (!envelope) {
    const allEnvelopes = getEnvelopes()
    const archived = allEnvelopes.find(e => e.id === widget.config.envelopeId)
    const message = archived ? `"${archived.name}" is archived` : 'Envelope not found'
    return (
      <div className={styles.widgetCard}>
        <span className={styles.widgetError}>{message}</span>
        {editing && <button className={styles.removeBtn} onClick={onRemove} title="Remove this widget">Remove</button>}
      </div>
    )
  }

  const balance = getTotalEnvelopeBalance(envelope.id)
  const days = daysRemaining()
  const daily = balance <= 0 ? 0 : days > 0 ? balance / days : 0
  const isNegative = balance <= 0

  return (
    <div className={styles.widgetCard}>
      {editing && (
        <div className={styles.widgetEditBar}>
          <div className={styles.widgetMoveButtons}>
            <button className={styles.moveBtn} onClick={onMoveUp} disabled={isFirst} title="Move widget up">▲</button>
            <button className={styles.moveBtn} onClick={onMoveDown} disabled={isLast} title="Move widget down">▼</button>
          </div>
          <button className={styles.removeBtn} onClick={onRemove} title="Remove this widget">Remove</button>
        </div>
      )}
      <div className={styles.widgetName}>{envelope.name}</div>
      <div className={styles.widgetRow}>
        <span className={styles.widgetLabel}>Balance</span>
        <span className={isNegative ? styles.negative : styles.positive}>
          {balance < 0 ? '−' : ''}{fmtAmt(Math.abs(balance))}
        </span>
      </div>
      <div className={styles.widgetRow}>
        <span className={styles.widgetLabel}>Days remaining</span>
        <span className={styles.widgetValue}>{days}</span>
      </div>
      <div className={styles.widgetDailyRow}>
        <span className={styles.widgetLabel}>Daily allowance</span>
        <span className={isNegative ? styles.widgetWarning : styles.widgetDaily}>
          {fmtAmt(daily)} / day
        </span>
      </div>
      {isNegative && (
        <div className={styles.widgetWarningText}>Balance is negative — no spending available</div>
      )}
    </div>
  )
}
