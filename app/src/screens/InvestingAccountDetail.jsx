import { useState } from 'react'
import { getTransactions, updateTransaction } from '../data/transactions'
import TransactionForm from '../components/TransactionForm'
import {
  getInvestingAccount,
  getInvestingAccounts,
  getCashBalances,
  getCurrentBalance,
  createCashBalance,
  updateCashBalanceOpening,
  canDeleteCashBalance,
  deleteCashBalance,
  getAccountCashMovements,
  depositToCashBalance,
  withdrawFromCashBalance,
  deleteCashMovement,
  getCashBalanceByCurrency,
} from '../data/investingAccounts'
import {
  getPositions,
  getOpenLots,
  computeFifoAllocations,
  createBuy,
  createSell,
  createTransfer,
  getStockTransaction,
  getStockTransactionsByTicker,
  createCurrencyExchange,
  updateCurrencyExchange,
  deleteStockTransaction,
} from '../data/stockTransactions'
import {
  getDividend,
  createDividend,
  deleteDividend,
  computeDividendDerived,
  resolveDividendTaxPercent,
} from '../data/dividends'
import { getActiveAccounts } from '../data/accounts'
import { getActiveEnvelopes, getEnvelopesFlat } from '../data/envelopes'
import { getStockProfile } from '../data/stockProfiles'
import { fmtAmt } from '../utils/format'
import { INDENT } from '../utils/hierarchy'
import StockProfileResolutionDialog from '../components/StockProfileResolutionDialog'
import styles from './InvestingAccountDetail.module.css'

function today() { return new Date().toISOString().split('T')[0] }

// Fee movement types merged into parent rows; not rendered as standalone rows.
const FEE_TYPES = new Set(['buy-fee', 'sell-fee', 'exchange-fee'])

// ─── Main detail screen ───────────────────────────────────────────────────────

export default function InvestingAccountDetail({ accountId, onBack, onNavigate, embedded }) {
  const [account,   setAccount]   = useState(() => getInvestingAccount(accountId))
  const [balances,  setBalances]  = useState(() => getCashBalances(accountId))
  const [movements, setMovements] = useState(() => getAccountCashMovements(accountId))

  const [positions,           setPositions]           = useState(() => getPositions(accountId))
  const [defaultSellTicker,   setDefaultSellTicker]   = useState(null)
  const [defaultDividendTicker, setDefaultDividendTicker] = useState(null)
  const [defaultTransferTicker, setDefaultTransferTicker] = useState(null)

  const [formMode,       setFormMode]       = useState(null)  // null | 'new-balance' | 'deposit' | 'withdraw' | 'exchange' | 'buy' | 'sell' | 'transfer' | 'dividend'
  const [activeBalanceId, setActiveBalanceId] = useState(null)

  const [editingOpeningId,    setEditingOpeningId]    = useState(null)
  const [editingOpeningValue, setEditingOpeningValue] = useState('')

  const [confirmDeleteBal, setConfirmDeleteBal] = useState(null)  // { balance, blocked, reason? }
  const [negConfirm,       setNegConfirm]       = useState(null)  // { message, onConfirm }
  const [movementFilter,   setMovementFilter]   = useState('all')
  const [expandedMovementId, setExpandedMovementId] = useState(null)
  const [editingTx,        setEditingTx]        = useState(null)  // full transaction object or null
  const [editingExchange,  setEditingExchange]  = useState(null)  // stockTransaction record or null

  function openLinkedTx(movement) {
    if (!movement.linkedBudgetingTransactionId) return
    const tx = getTransactions().find(t => t.id === movement.linkedBudgetingTransactionId)
    if (tx) setEditingTx(tx)
  }

  function refresh() {
    setAccount(getInvestingAccount(accountId))
    setBalances(getCashBalances(accountId))
    setMovements(getAccountCashMovements(accountId))
    setPositions(getPositions(accountId))
  }

  const balanceMap = Object.fromEntries(balances.map(b => [b.id, b]))

  // ── Handlers ────────────────────────────────────────────────────────────────

  function closeForm() {
    setFormMode(null)
    setActiveBalanceId(null)
  }

  function handleDeleteBalanceRequest(balance) {
    const { canDelete, reason } = canDeleteCashBalance(balance.id)
    setConfirmDeleteBal(canDelete ? { balance, blocked: false } : { balance, blocked: true, reason })
  }

  function handleDeleteBalanceConfirm() {
    deleteCashBalance(confirmDeleteBal.balance.id)
    refresh()
    setConfirmDeleteBal(null)
  }

  function startEditOpening(balance) {
    setEditingOpeningId(balance.id)
    setEditingOpeningValue(String(balance.openingBalance))
  }

  function saveOpening() {
    updateCashBalanceOpening(editingOpeningId, Number(editingOpeningValue))
    setEditingOpeningId(null)
    refresh()
  }

  function withNegCheck(cashBalanceId, netDelta, proceed) {
    const cur = getCurrentBalance(cashBalanceId)
    const after = cur + netDelta
    if (after < 0) {
      setNegConfirm({
        message: `This will take your ${balanceMap[cashBalanceId]?.currency} balance from ${fmtAmt(cur)} to ${fmtAmt(after)}.`,
        onConfirm: () => { proceed(); setNegConfirm(null) },
      })
    } else {
      proceed()
    }
  }

  function handleDeposit(params) {
    depositToCashBalance(params)
    refresh()
    closeForm()
  }

  function handleWithdraw(params) {
    withNegCheck(params.cashBalanceId, -params.amount, () => {
      withdrawFromCashBalance(params)
      refresh()
      closeForm()
    })
  }

  function handleExchange(params) {
    const feeSameAsSource = params.feeCashBalanceId === params.sourceCashBalanceId
    const netDelta = -Number(params.sourceAmount) - (feeSameAsSource ? Number(params.feeAmount || 0) : 0)
    withNegCheck(params.sourceCashBalanceId, netDelta, () => {
      createCurrencyExchange({ ...params, investingAccountId: accountId })
      refresh()
      closeForm()
    })
  }

  function handleUpdateExchange(params) {
    updateCurrencyExchange(editingExchange.id, params)
    refresh()
    setEditingExchange(null)
  }

  function handleBuy(params) {
    const cost = Number(params.shares) * Number(params.price) + Number(params.fee || 0)
    const existing = getCashBalanceByCurrency(accountId, params.currency)
    const currentBal = existing ? getCurrentBalance(existing.id) : 0
    const proceed = () => {
      createBuy({ ...params, investingAccountId: accountId })
      refresh()
      closeForm()
    }
    if (currentBal - cost < 0) {
      setNegConfirm({
        message: `This will take your ${params.currency} balance from ${fmtAmt(currentBal)} to ${fmtAmt(currentBal - cost)}.`,
        onConfirm: () => { proceed(); setNegConfirm(null) },
      })
    } else {
      proceed()
    }
  }

  function handleSell(params) {
    createSell({ ...params, investingAccountId: accountId })
    refresh()
    closeForm()
    setDefaultSellTicker(null)
  }

  function handleTransfer(params) {
    createTransfer({ ...params, investingAccountId: accountId })
    refresh()
    closeForm()
    setDefaultTransferTicker(null)
  }

  function handleDividend(params) {
    createDividend(params)
    refresh()
    closeForm()
    setDefaultDividendTicker(null)
  }

  const displayMovements = (movementFilter === 'all'
    ? movements
    : movements.filter(m => m.cashBalanceId === movementFilter)
  ).filter(m => !FEE_TYPES.has(m.type))

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className={styles.detail}>

      {/* Header */}
      {!embedded ? (
        <div className={styles.header}>
          <button className={styles.backBtn} onClick={onBack}>← Back</button>
          <div className={styles.headerInfo}>
            <span className={styles.accountName}>{account?.name}</span>
            <span className={styles.institution}>{account?.institution}</span>
          </div>
        </div>
      ) : (
        <div className={styles.headerEmbedded}>
          <span className={styles.accountName}>{account?.name}</span>
          <span className={styles.institution}>{account?.institution}</span>
        </div>
      )}
      {account?.note && <p className={styles.accountNote}>{account.note}</p>}

      {/* ── Dialogs ─────────────────────────────────────────────────────────── */}

      {confirmDeleteBal && (
        <div className={styles.overlay}>
          <div className={styles.dialog}>
            {confirmDeleteBal.blocked ? (
              <>
                <h3>Cannot delete</h3>
                <p>{confirmDeleteBal.reason}</p>
                <div className={styles.dialogActions}>
                  <button className={styles.cancelBtn} onClick={() => setConfirmDeleteBal(null)}>OK</button>
                </div>
              </>
            ) : (
              <>
                <h3>Delete {confirmDeleteBal.balance.currency} balance?</h3>
                <p>This will remove the cash balance and its opening entry. This cannot be undone.</p>
                <div className={styles.dialogActions}>
                  <button className={styles.cancelBtn} onClick={() => setConfirmDeleteBal(null)}>Cancel</button>
                  <button className={styles.deleteBtn} onClick={handleDeleteBalanceConfirm}>Delete</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {formMode && (
        <div className={styles.overlay}>
          <div className={styles.formDialog}>
            {formMode === 'new-balance' && (
              <NewBalanceForm
                accountId={accountId}
                existingCurrencies={new Set(balances.map(b => b.currency))}
                onSave={() => { refresh(); closeForm() }}
                onCancel={closeForm}
              />
            )}
            {formMode === 'deposit' && (
              <DepositForm
                balance={balanceMap[activeBalanceId]}
                onSave={handleDeposit}
                onCancel={closeForm}
              />
            )}
            {formMode === 'withdraw' && (
              <WithdrawForm
                balance={balanceMap[activeBalanceId]}
                currentBalance={getCurrentBalance(activeBalanceId)}
                onSave={handleWithdraw}
                onCancel={closeForm}
              />
            )}
            {formMode === 'exchange' && (
              <ExchangeForm
                balances={balances}
                defaultSourceId={activeBalanceId}
                onSave={handleExchange}
                onCancel={closeForm}
              />
            )}
            {formMode === 'buy' && (
              <BuyForm
                balances={balances}
                onSave={handleBuy}
                onCancel={closeForm}
              />
            )}
            {formMode === 'sell' && (
              <SellForm
                accountId={accountId}
                positions={positions}
                defaultTicker={defaultSellTicker}
                onSave={handleSell}
                onCancel={() => { closeForm(); setDefaultSellTicker(null) }}
              />
            )}
            {formMode === 'transfer' && (
              <TransferForm
                accountId={accountId}
                positions={positions}
                balances={balances}
                defaultTicker={defaultTransferTicker}
                onSave={handleTransfer}
                onCancel={() => { closeForm(); setDefaultTransferTicker(null) }}
              />
            )}
            {formMode === 'dividend' && (
              <DividendForm
                accountId={accountId}
                positions={positions}
                defaultTicker={defaultDividendTicker}
                onSave={handleDividend}
                onCancel={() => { closeForm(); setDefaultDividendTicker(null) }}
              />
            )}
          </div>
        </div>
      )}

      {negConfirm && (
        <div className={styles.overlay}>
          <div className={styles.dialog}>
            <h3>⚠ Negative balance</h3>
            <p>{negConfirm.message}</p>
            <p>Do you want to proceed?</p>
            <div className={styles.dialogActions}>
              <button className={styles.cancelBtn} onClick={() => setNegConfirm(null)}>Cancel</button>
              <button className={styles.proceedBtn} onClick={negConfirm.onConfirm}>Proceed</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Cash balances ─────────────────────────────────────────────────── */}

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionLabel}>Cash balances</span>
          <button className={styles.newBalBtn} onClick={() => setFormMode('new-balance')}>+ New</button>
        </div>

        {balances.length === 0 ? (
          <p className={styles.emptySection}>No cash balances yet. Add one to start tracking funds.</p>
        ) : (
          <div className={styles.balanceList}>
            {balances.map(bal => {
              const current = getCurrentBalance(bal.id)
              return (
                <div key={bal.id} className={`${styles.balanceRow} ${current < 0 ? styles.negativeRow : ''}`}>
                  <div className={styles.balanceMain}>
                    <span className={styles.balanceCurrency}>{bal.currency}</span>
                    <span className={`${styles.balanceAmount} ${current < 0 ? styles.negative : ''}`}>
                      {current < 0 ? '−' : ''}{fmtAmt(Math.abs(current))}
                      {current < 0 && <span className={styles.warningBadge}> ⚠</span>}
                    </span>
                  </div>
                  <div className={styles.balanceActions}>
                    <button className={styles.actionBtnSmall} onClick={() => { setActiveBalanceId(bal.id); setFormMode('deposit') }}>Deposit</button>
                    <button className={styles.actionBtnSmall} onClick={() => { setActiveBalanceId(bal.id); setFormMode('withdraw') }}>Withdraw</button>
                    <button className={styles.actionBtnSmall} onClick={() => { setActiveBalanceId(bal.id); setFormMode('exchange') }}>Exchange</button>
                    <button className={styles.actionBtnIcon} onClick={() => startEditOpening(bal)} title="Edit opening balance">✎</button>
                    <button className={`${styles.actionBtnIcon} ${styles.dangerIcon}`} onClick={() => handleDeleteBalanceRequest(bal)} title="Delete">×</button>
                  </div>
                  {editingOpeningId === bal.id && (
                    <div className={styles.openingEdit}>
                      <span className={styles.openingLabel}>Opening balance:</span>
                      <input
                        className={styles.openingInput}
                        type="number"
                        value={editingOpeningValue}
                        onChange={e => setEditingOpeningValue(e.target.value)}
                        autoFocus
                      />
                      <button className={styles.saveBtnSmall} onClick={saveOpening}>Save</button>
                      <button className={styles.cancelBtnSmall} onClick={() => setEditingOpeningId(null)}>Cancel</button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Positions ───────────────────────────────────────────────────── */}

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionLabel}>Positions</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className={styles.newBalBtn} onClick={() => setFormMode('buy')}>+ Buy</button>
            <button className={styles.newBalBtn} onClick={() => { setDefaultDividendTicker(null); setFormMode('dividend') }}>+ Dividend</button>
            {positions.length > 0 && (
              <button className={styles.newBalBtn} onClick={() => { setDefaultTransferTicker(null); setFormMode('transfer') }}>Transfer</button>
            )}
            {onNavigate && <button className={styles.newBalBtn} onClick={() => onNavigate('csv-import', { accountId })}>Import CSV</button>}
          </div>
        </div>
        {positions.length === 0 ? (
          <p className={styles.emptySection}>No stock positions yet.</p>
        ) : (
          <div className={styles.positionList}>
            {positions.map(pos => (
              <div key={pos.ticker} className={styles.positionRow}>
                <span
                  className={`${styles.posTicker} ${onNavigate ? styles.posTickerLink : ''}`}
                  onClick={onNavigate ? () => onNavigate('stock', { ticker: pos.ticker }) : undefined}
                  title={onNavigate ? `Open ${pos.ticker} stock page` : undefined}
                >{pos.ticker}</span>
                <span className={styles.posShares}>{trimDecimals(pos.shares)} sh</span>
                <span className={styles.posAvgCost}>{fmtAmt(pos.avgCost)} {pos.currency} avg</span>
                <button
                  className={styles.actionBtnSmall}
                  onClick={() => { setDefaultSellTicker(pos.ticker); setFormMode('sell') }}
                >Sell</button>
                <button
                  className={styles.actionBtnSmall}
                  onClick={() => { setDefaultDividendTicker(pos.ticker); setFormMode('dividend') }}
                >Dividend</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Cash movements ─────────────────────────────────────────────────── */}

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionLabel}>Cash movements</span>
          {balances.length > 1 && (
            <select
              className={styles.filterSelect}
              value={movementFilter}
              onChange={e => setMovementFilter(e.target.value)}
            >
              <option value="all">All</option>
              {balances.map(b => (
                <option key={b.id} value={b.id}>{b.currency}</option>
              ))}
            </select>
          )}
        </div>
        {displayMovements.length === 0 ? (
          <p className={styles.emptySection}>No movements yet.</p>
        ) : (
          <div className={styles.movementList}>
            {displayMovements.map(m => (
              <MovementRow
                key={m.id}
                movement={m}
                currency={balanceMap[m.cashBalanceId]?.currency ?? '?'}
                allMovements={movements}
                balanceMap={balanceMap}
                isExpanded={expandedMovementId === m.id}
                onToggle={() => setExpandedMovementId(prev => prev === m.id ? null : m.id)}
                onOpenLinkedTx={['deposit', 'withdrawal'].includes(m.type) && m.linkedBudgetingTransactionId
                  ? () => openLinkedTx(m)
                  : null}
                onDelete={
                  m.type === 'dividend'
                    ? () => {
                        if (m.linkedDividendId) deleteDividend(m.linkedDividendId)
                        else deleteCashMovement(m.id)
                        refresh()
                        setExpandedMovementId(null)
                      }
                    : ['deposit', 'withdrawal'].includes(m.type)
                      ? () => { deleteCashMovement(m.id); refresh(); setExpandedMovementId(null) }
                      : (m.type === 'currency-exchange' && m.linkedStockTransactionId)
                        ? () => { deleteStockTransaction(m.linkedStockTransactionId); refresh(); setExpandedMovementId(null) }
                        : null
                }
                onEdit={
                  (m.type === 'currency-exchange' && m.linkedStockTransactionId)
                    ? () => { const txn = getStockTransaction(m.linkedStockTransactionId); if (txn) { setEditingExchange(txn); setExpandedMovementId(null) } }
                    : null
                }
              />
            ))}
          </div>
        )}
      </div>

      {editingTx && (
        <div className={styles.txOverlay}>
          <div className={styles.txFormWrap}>
            <TransactionForm
              initial={editingTx}
              onSave={() => { setEditingTx(null); refresh() }}
              onCancel={() => setEditingTx(null)}
            />
          </div>
        </div>
      )}

      {editingExchange && (
        <div className={styles.overlay}>
          <div className={styles.formDialog}>
            <ExchangeForm
              balances={balances}
              initial={editingExchange}
              onSave={handleUpdateExchange}
              onCancel={() => setEditingExchange(null)}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Movement row ─────────────────────────────────────────────────────────────

function MovementRow({ movement, currency, allMovements, balanceMap, isExpanded, onToggle, onOpenLinkedTx, onDelete, onEdit }) {
  const isOpening = movement.type === 'opening'

  // For buy/sell, find the associated fee and compute net amount.
  const feeTypeFor = { buy: 'buy-fee', sell: 'sell-fee' }
  const expectedFeeType = feeTypeFor[movement.type]
  const feeMovement = expectedFeeType && movement.linkedStockTransactionId
    ? allMovements.find(m => m.linkedStockTransactionId === movement.linkedStockTransactionId && m.type === expectedFeeType)
    : null
  const displayAmount = feeMovement ? movement.amount + feeMovement.amount : movement.amount
  const isNeg = displayAmount < 0

  // Inline stock details for buy/sell rows
  const stockTxn = (movement.type === 'buy' || movement.type === 'sell') && movement.linkedStockTransactionId
    ? getStockTransaction(movement.linkedStockTransactionId)
    : null
  const stockAvgPrice = stockTxn
    ? (stockTxn.shares * stockTxn.price + (movement.type === 'buy' ? stockTxn.fee : -stockTxn.fee)) / stockTxn.shares
    : null

  const typeLabel = {
    opening:             'Opening balance',
    deposit:             'Deposit',
    withdrawal:          'Withdrawal',
    'currency-exchange': movement.amount < 0 ? 'Exchange out' : 'Exchange in',
    buy:                 'Stock buy',
    sell:                'Stock sell',
    dividend:            'Dividend',
    'transfer-fee':      'Transfer fee',
  }[movement.type] ?? movement.type

  return (
    <div className={styles.movementGroup}>
      <div
        className={`${styles.movementRow} ${isOpening ? styles.openingMovement : ''} ${!isOpening ? styles.movementRowClickable : ''}`}
        onClick={!isOpening ? onToggle : undefined}
      >
        <span className={styles.movementDate}>{movement.date}</span>
        <div className={styles.movementTypeGroup}>
          <span className={styles.movementType}>{typeLabel}</span>
          {stockTxn && (
            <span className={styles.movementStockMeta}>
              {stockTxn.ticker} · {trimDecimals(stockTxn.shares)} sh @ {fmtAmt(stockAvgPrice)} {stockTxn.currency}
            </span>
          )}
        </div>
        <span className={`${styles.movementAmount} ${isNeg || isOpening ? (isNeg ? styles.negative : styles.muted) : styles.positive}`}>
          {isNeg ? '−' : '+'}{fmtAmt(Math.abs(displayAmount))} {currency}
        </span>
        {!isOpening && <span className={styles.expandIcon}>{isExpanded ? '▲' : '▼'}</span>}
        {onDelete && (
          <button className={styles.movementDeleteBtn} onClick={e => { e.stopPropagation(); onDelete() }} title="Delete">×</button>
        )}
      </div>
      {isExpanded && (
        <MovementDetail
          movement={movement}
          currency={currency}
          feeMovement={feeMovement}
          allMovements={allMovements}
          balanceMap={balanceMap}
          onOpenLinkedTx={onOpenLinkedTx}
          onEdit={onEdit}
        />
      )}
    </div>
  )
}

// ─── Movement detail (expanded) ───────────────────────────────────────────────

function MovementDetail({ movement, currency, feeMovement, allMovements, balanceMap, onOpenLinkedTx, onEdit }) {
  const stockTxn = movement.linkedStockTransactionId ? getStockTransaction(movement.linkedStockTransactionId) : null

  if ((movement.type === 'buy' || movement.type === 'sell') && stockTxn) {
    const isBuy = movement.type === 'buy'
    const gross = stockTxn.shares * stockTxn.price
    const net = isBuy ? gross + stockTxn.fee : gross - stockTxn.fee
    return (
      <div className={styles.movementDetail}>
        <div className={styles.detailGrid}>
          <span className={styles.detailLabel}>Ticker</span>
          <span>{stockTxn.ticker}</span>
          {stockTxn.stockExchange && <>
            <span className={styles.detailLabel}>Exchange</span>
            <span>{stockTxn.stockExchange}</span>
          </>}
          <span className={styles.detailLabel}>Shares</span>
          <span>{trimDecimals(stockTxn.shares)}</span>
          <span className={styles.detailLabel}>Price</span>
          <span>{fmtAmt(stockTxn.price)} {stockTxn.currency}</span>
          {stockTxn.fee > 0 && <>
            <span className={styles.detailLabel}>Fee</span>
            <span>{fmtAmt(stockTxn.fee)} {stockTxn.currency}</span>
            <span className={styles.detailLabel}>Avg price</span>
            <span>{fmtAmt(net / stockTxn.shares)} {stockTxn.currency}</span>
          </>}
          <span className={styles.detailLabel}>{isBuy ? 'Total cost' : 'Net proceeds'}</span>
          <span className={isBuy ? styles.negative : styles.positive}>{fmtAmt(net)} {stockTxn.currency}</span>
          {stockTxn.transactionExternalId && <>
            <span className={styles.detailLabel}>Txn ID</span>
            <span className={styles.detailMono}>{stockTxn.transactionExternalId}</span>
          </>}
        </div>
      </div>
    )
  }

  if (movement.type === 'deposit' || movement.type === 'withdrawal') {
    const linkedTx = movement.linkedBudgetingTransactionId
      ? getTransactions().find(t => t.id === movement.linkedBudgetingTransactionId)
      : null
    const isCross = linkedTx?.currency && linkedTx.currency !== currency
    const isDeposit = movement.type === 'deposit'
    let rateLabel = null
    if (isCross && linkedTx.amount && Math.abs(movement.amount) > 0) {
      if (isDeposit) {
        // 1 budgeting currency = ? cash currency
        const rate = movement.amount / linkedTx.amount
        rateLabel = `1 ${linkedTx.currency} = ${trimRate(rate)} ${currency}`
      } else {
        // 1 cash currency = ? budgeting currency
        const rate = linkedTx.amount / Math.abs(movement.amount)
        rateLabel = `1 ${currency} = ${trimRate(rate)} ${linkedTx.currency}`
      }
    }
    return (
      <div className={styles.movementDetail}>
        <div className={styles.detailGrid}>
          <span className={styles.detailLabel}>Amount</span>
          <span>{fmtAmt(Math.abs(movement.amount))} {currency}</span>
          {isCross && linkedTx && <>
            <span className={styles.detailLabel}>{isDeposit ? 'From' : 'To'}</span>
            <span>{fmtAmt(linkedTx.amount)} {linkedTx.currency}</span>
            <span className={styles.detailLabel}>Rate</span>
            <span>{rateLabel}</span>
          </>}
          <span className={styles.detailLabel}>Date</span>
          <span>{movement.date}</span>
        </div>
        {onOpenLinkedTx && (
          <button className={styles.detailEditBtn} onClick={onOpenLinkedTx}>
            Edit linked transaction →
          </button>
        )}
      </div>
    )
  }

  if (movement.type === 'dividend') {
    const dividend = movement.linkedDividendId ? getDividend(movement.linkedDividendId) : null
    if (!dividend) return null
    const { totalBeforeTax, taxAmount, netTotal, netPerShare } = computeDividendDerived(dividend)
    return (
      <div className={styles.movementDetail}>
        <div className={styles.detailGrid}>
          <span className={styles.detailLabel}>Ticker</span>
          <span>{dividend.ticker}</span>
          <span className={styles.detailLabel}>Per share</span>
          <span>{fmtAmt(dividend.dividendPerShare)} {dividend.currency}</span>
          <span className={styles.detailLabel}>Shares</span>
          <span>{trimDecimals(dividend.shareCount)}</span>
          <span className={styles.detailLabel}>Before tax</span>
          <span>{fmtAmt(totalBeforeTax)} {dividend.currency}</span>
          <span className={styles.detailLabel}>Tax</span>
          <span>{trimRate(dividend.taxPercent)}% → {fmtAmt(taxAmount)} {dividend.currency}</span>
          <span className={styles.detailLabel}>Net total</span>
          <span className={styles.positive}>{fmtAmt(netTotal)} {dividend.currency}</span>
          <span className={styles.detailLabel}>Net/share</span>
          <span>{fmtAmt(netPerShare)} {dividend.currency}</span>
          <span className={styles.detailLabel}>Ex-div date</span>
          <span>{dividend.exDividendDate}</span>
          <span className={styles.detailLabel}>Payout date</span>
          <span>{dividend.payoutDate}</span>
        </div>
      </div>
    )
  }

  if (movement.type === 'currency-exchange') {
    const paired = movement.linkedExchangeId
      ? allMovements.find(m => m.linkedExchangeId === movement.linkedExchangeId && m.id !== movement.id && m.type === 'currency-exchange')
      : null
    const feeMovEx = movement.linkedExchangeId
      ? allMovements.find(m => m.linkedExchangeId === movement.linkedExchangeId && m.type === 'exchange-fee')
      : null
    const pairedCurrency = paired ? balanceMap[paired.cashBalanceId]?.currency : null
    const feeCurrency = feeMovEx ? balanceMap[feeMovEx.cashBalanceId]?.currency : null
    const isDebit = movement.amount < 0
    return (
      <div className={styles.movementDetail}>
        <div className={styles.detailGrid}>
          {isDebit ? (
            <>
              <span className={styles.detailLabel}>Sold</span>
              <span>{fmtAmt(Math.abs(movement.amount))} {currency}</span>
              {paired && pairedCurrency && <>
                <span className={styles.detailLabel}>Bought</span>
                <span>{fmtAmt(paired.amount)} {pairedCurrency}</span>
              </>}
            </>
          ) : (
            <>
              {paired && pairedCurrency && <>
                <span className={styles.detailLabel}>Sold</span>
                <span>{fmtAmt(Math.abs(paired.amount))} {pairedCurrency}</span>
              </>}
              <span className={styles.detailLabel}>Bought</span>
              <span>{fmtAmt(movement.amount)} {currency}</span>
            </>
          )}
          {feeMovEx && feeCurrency && <>
            <span className={styles.detailLabel}>Fee</span>
            <span>{fmtAmt(Math.abs(feeMovEx.amount))} {feeCurrency}</span>
          </>}
        </div>
        {onEdit && movement.linkedStockTransactionId && (
          <button className={styles.detailEditBtn} onClick={onEdit}>Edit exchange →</button>
        )}
      </div>
    )
  }

  return null
}

// Formats a share count: removes trailing zeros after decimal.
function trimDecimals(n) {
  return parseFloat(n.toFixed(8)).toString()
}

// Formats an exchange rate to up to 6 significant decimal places, stripping trailing zeros.
function trimRate(r) {
  return parseFloat(r.toFixed(6)).toString()
}

// ─── New cash balance form ────────────────────────────────────────────────────

function NewBalanceForm({ accountId, existingCurrencies, onSave, onCancel }) {
  const [currency,       setCurrency]       = useState('')
  const [openingBalance, setOpeningBalance] = useState('0')
  const [error,          setError]          = useState('')

  function handleSubmit(e) {
    e.preventDefault()
    const cur = currency.trim().toUpperCase()
    if (!cur) return
    if (existingCurrencies.has(cur)) { setError(`A ${cur} balance already exists for this account.`); return }
    createCashBalance({ investingAccountId: accountId, currency: cur, openingBalance: Number(openingBalance) })
    onSave()
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <h3 className={styles.formTitle}>New cash balance</h3>
      <div className={styles.formRow}>
        <label className={styles.formLabel}>Currency (ISO 4217)</label>
        <input
          className={styles.formInput}
          value={currency}
          onChange={e => { setCurrency(e.target.value); setError('') }}
          placeholder="USD, EUR, CZK…"
          autoFocus
        />
        {error && <span className={styles.fieldError}>{error}</span>}
      </div>
      <div className={styles.formRow}>
        <label className={styles.formLabel}>Opening balance</label>
        <input
          className={styles.formInput}
          type="number"
          value={openingBalance}
          onChange={e => setOpeningBalance(e.target.value)}
        />
      </div>
      <div className={styles.formActions}>
        <button type="button" className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
        <button type="submit" className={styles.saveBtn} disabled={!currency.trim()}>Create</button>
      </div>
    </form>
  )
}

// ─── Deposit form ─────────────────────────────────────────────────────────────

function DepositForm({ balance, onSave, onCancel }) {
  const accounts      = getActiveAccounts().filter(a => !a.isArchived)
  const envelopesFlat = getEnvelopesFlat(getActiveEnvelopes())

  const [date,               setDate]               = useState(today)
  const [budgetingAccountId, setBudgetingAccountId] = useState(accounts[0]?.id ?? '')
  const [budgetingEnvelopeId, setBudgetingEnvelopeId] = useState(envelopesFlat[0]?.id ?? '')
  const [amount,             setAmount]             = useState('')  // in budgeting account's currency
  const [rate,               setRate]               = useState('1')

  const selectedAccount  = accounts.find(a => a.id === budgetingAccountId)
  const isCrossCurrency  = selectedAccount && selectedAccount.currency !== balance.currency
  const cashCredited     = isCrossCurrency ? Number(amount || 0) * Number(rate || 0) : Number(amount || 0)

  function handleSubmit(e) {
    e.preventDefault()
    if (!amount || Number(amount) <= 0 || !budgetingAccountId || !budgetingEnvelopeId) return
    onSave({
      date,
      cashBalanceId:      balance.id,
      amount:             cashCredited,        // credited to cash balance (cash currency)
      budgetingAmount:    Number(amount),      // deducted from budgeting account (its currency)
      budgetingAccountId,
      budgetingEnvelopeId,
    })
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <h3 className={styles.formTitle}>Deposit into {balance.currency}</h3>
      <div className={styles.formRow}>
        <label className={styles.formLabel}>Date</label>
        <input className={styles.formInput} type="date" value={date} onChange={e => setDate(e.target.value)} />
      </div>
      <div className={styles.formRow}>
        <label className={styles.formLabel}>From account</label>
        <select className={styles.formSelect} value={budgetingAccountId} onChange={e => setBudgetingAccountId(e.target.value)}>
          {accounts.map(a => (
            <option key={a.id} value={a.id}>{a.accountName} ({a.currency})</option>
          ))}
        </select>
      </div>
      <div className={styles.formRow}>
        <label className={styles.formLabel}>From envelope</label>
        <select className={styles.formSelect} value={budgetingEnvelopeId} onChange={e => setBudgetingEnvelopeId(e.target.value)}>
          {envelopesFlat.map(e => (
            <option key={e.id} value={e.id}>{INDENT.repeat(e.depth)}{e.name}</option>
          ))}
        </select>
      </div>
      <div className={styles.formRow}>
        <label className={styles.formLabel}>Amount ({selectedAccount?.currency ?? ''})</label>
        <input
          className={styles.formInput}
          type="number"
          min="0.01"
          step="0.01"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          placeholder="0.00"
          autoFocus
        />
      </div>
      {isCrossCurrency && (
        <div className={styles.formRow}>
          <label className={styles.formLabel}>
            Exchange rate (1 {selectedAccount.currency} = ? {balance.currency})
          </label>
          <input
            className={styles.formInput}
            type="number"
            min="0.000001"
            step="any"
            value={rate}
            onChange={e => setRate(e.target.value)}
          />
        </div>
      )}
      {isCrossCurrency && cashCredited > 0 && (
        <p className={styles.ratePreview}>→ {fmtAmt(cashCredited)} {balance.currency} credited</p>
      )}
      <div className={styles.formActions}>
        <button type="button" className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
        <button type="submit" className={styles.saveBtn} disabled={!amount || Number(amount) <= 0 || (isCrossCurrency && Number(rate) <= 0)}>
          Deposit
        </button>
      </div>
    </form>
  )
}

// ─── Withdraw form ────────────────────────────────────────────────────────────

function WithdrawForm({ balance, currentBalance, onSave, onCancel }) {
  const accounts      = getActiveAccounts().filter(a => !a.isArchived)
  const envelopesFlat = getEnvelopesFlat(getActiveEnvelopes())

  const [date,               setDate]               = useState(today)
  const [budgetingAccountId, setBudgetingAccountId]  = useState(accounts[0]?.id ?? '')
  const [budgetingEnvelopeId, setBudgetingEnvelopeId] = useState(envelopesFlat[0]?.id ?? '')
  const [amount,             setAmount]              = useState('')  // in cash balance's currency
  const [rate,               setRate]                = useState('1')

  const selectedAccount  = accounts.find(a => a.id === budgetingAccountId)
  const isCrossCurrency  = selectedAccount && selectedAccount.currency !== balance.currency
  const budgetingCredited = isCrossCurrency ? Number(amount || 0) * Number(rate || 0) : Number(amount || 0)

  function handleSubmit(e) {
    e.preventDefault()
    if (!amount || Number(amount) <= 0 || !budgetingAccountId || !budgetingEnvelopeId) return
    onSave({
      date,
      cashBalanceId:      balance.id,
      amount:             Number(amount),      // deducted from cash balance (cash currency)
      budgetingAmount:    budgetingCredited,   // credited to budgeting account (its currency)
      budgetingAccountId,
      budgetingEnvelopeId,
    })
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <h3 className={styles.formTitle}>Withdraw from {balance.currency}</h3>
      <p className={styles.formSubtitle}>Available: {fmtAmt(currentBalance)} {balance.currency}</p>
      <div className={styles.formRow}>
        <label className={styles.formLabel}>Date</label>
        <input className={styles.formInput} type="date" value={date} onChange={e => setDate(e.target.value)} />
      </div>
      <div className={styles.formRow}>
        <label className={styles.formLabel}>To account</label>
        <select className={styles.formSelect} value={budgetingAccountId} onChange={e => setBudgetingAccountId(e.target.value)}>
          {accounts.map(a => (
            <option key={a.id} value={a.id}>{a.accountName} ({a.currency})</option>
          ))}
        </select>
      </div>
      <div className={styles.formRow}>
        <label className={styles.formLabel}>To envelope</label>
        <select className={styles.formSelect} value={budgetingEnvelopeId} onChange={e => setBudgetingEnvelopeId(e.target.value)}>
          {envelopesFlat.map(e => (
            <option key={e.id} value={e.id}>{INDENT.repeat(e.depth)}{e.name}</option>
          ))}
        </select>
      </div>
      <div className={styles.formRow}>
        <label className={styles.formLabel}>Amount ({balance.currency})</label>
        <input
          className={styles.formInput}
          type="number"
          min="0.01"
          step="0.01"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          placeholder="0.00"
          autoFocus
        />
      </div>
      {isCrossCurrency && (
        <div className={styles.formRow}>
          <label className={styles.formLabel}>
            Exchange rate (1 {balance.currency} = ? {selectedAccount.currency})
          </label>
          <input
            className={styles.formInput}
            type="number"
            min="0.000001"
            step="any"
            value={rate}
            onChange={e => setRate(e.target.value)}
          />
        </div>
      )}
      {isCrossCurrency && budgetingCredited > 0 && (
        <p className={styles.ratePreview}>→ {fmtAmt(budgetingCredited)} {selectedAccount?.currency} credited to account</p>
      )}
      <div className={styles.formActions}>
        <button type="button" className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
        <button type="submit" className={styles.saveBtn} disabled={!amount || Number(amount) <= 0 || (isCrossCurrency && Number(rate) <= 0)}>
          Withdraw
        </button>
      </div>
    </form>
  )
}

// ─── Exchange form ────────────────────────────────────────────────────────────

function ExchangeForm({ balances, defaultSourceId, onSave, onCancel, initial }) {
  const [date,               setDate]              = useState(initial?.date ?? today)
  const [sourceId,           setSourceId]          = useState(initial?.sourceCashBalanceId ?? defaultSourceId ?? balances[0]?.id ?? '')
  const [sourceAmount,       setSourceAmount]      = useState(initial ? String(initial.sourceAmount) : '')
  const [targetId,           setTargetId]          = useState(() => {
    if (initial) return initial.targetCashBalanceId
    const others = balances.filter(b => b.id !== (defaultSourceId ?? balances[0]?.id))
    return others[0]?.id ?? ''
  })
  const [rate,               setRate]              = useState(initial ? String(initial.exchangeRate) : '1')
  const [feeAmount,          setFeeAmount]         = useState(initial ? String(initial.feeAmount ?? 0) : '0')
  const [feeCashBalanceId,   setFeeCashBalanceId]  = useState(initial?.feeCashBalanceId ?? defaultSourceId ?? balances[0]?.id ?? '')

  const sourceBal = balances.find(b => b.id === sourceId)
  const targetBal = balances.find(b => b.id === targetId)
  const targetAmount = Number(sourceAmount || 0) * Number(rate || 0)

  // When source changes, ensure target is different
  function handleSourceChange(id) {
    setSourceId(id)
    if (targetId === id) {
      const other = balances.find(b => b.id !== id)
      if (other) setTargetId(other.id)
    }
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!sourceAmount || Number(sourceAmount) <= 0 || !sourceId || !targetId || sourceId === targetId) return
    onSave({
      date,
      sourceCashBalanceId: sourceId,
      sourceAmount: Number(sourceAmount),
      targetCashBalanceId: targetId,
      exchangeRate: Number(rate),
      feeAmount: Number(feeAmount || 0),
      feeCashBalanceId: Number(feeAmount) > 0 ? feeCashBalanceId : null,
    })
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <h3 className={styles.formTitle}>{initial ? 'Edit currency exchange' : 'Currency exchange'}</h3>
      <div className={styles.formRow}>
        <label className={styles.formLabel}>Date</label>
        <input className={styles.formInput} type="date" value={date} onChange={e => setDate(e.target.value)} />
      </div>
      <div className={styles.formRow}>
        <label className={styles.formLabel}>From balance</label>
        <select className={styles.formSelect} value={sourceId} onChange={e => handleSourceChange(e.target.value)} disabled={!!initial}>
          {balances.map(b => (
            <option key={b.id} value={b.id}>{b.currency} ({fmtAmt(getCurrentBalance(b.id))})</option>
          ))}
        </select>
      </div>
      <div className={styles.formRow}>
        <label className={styles.formLabel}>Amount ({sourceBal?.currency ?? ''})</label>
        <input
          className={styles.formInput}
          type="number"
          min="0.01"
          step="0.01"
          value={sourceAmount}
          onChange={e => setSourceAmount(e.target.value)}
          placeholder="0.00"
          autoFocus
        />
      </div>
      <div className={styles.formRow}>
        <label className={styles.formLabel}>To balance</label>
        <select className={styles.formSelect} value={targetId} onChange={e => setTargetId(e.target.value)} disabled={!!initial}>
          {balances.filter(b => b.id !== sourceId).map(b => (
            <option key={b.id} value={b.id}>{b.currency} ({fmtAmt(getCurrentBalance(b.id))})</option>
          ))}
        </select>
      </div>
      <div className={styles.formRow}>
        <label className={styles.formLabel}>Rate (1 {sourceBal?.currency} = ? {targetBal?.currency})</label>
        <input
          className={styles.formInput}
          type="number"
          min="0.000001"
          step="any"
          value={rate}
          onChange={e => setRate(e.target.value)}
        />
      </div>
      {targetAmount > 0 && (
        <p className={styles.ratePreview}>
          → {fmtAmt(targetAmount)} {targetBal?.currency}
        </p>
      )}
      <div className={styles.formRow}>
        <label className={styles.formLabel}>Fee (optional)</label>
        <input
          className={styles.formInput}
          type="number"
          min="0"
          step="0.01"
          value={feeAmount}
          onChange={e => setFeeAmount(e.target.value)}
          placeholder="0.00"
        />
      </div>
      {Number(feeAmount) > 0 && (
        <div className={styles.formRow}>
          <label className={styles.formLabel}>Fee from balance</label>
          <select className={styles.formSelect} value={feeCashBalanceId} onChange={e => setFeeCashBalanceId(e.target.value)}>
            {balances.map(b => (
              <option key={b.id} value={b.id}>{b.currency}</option>
            ))}
          </select>
        </div>
      )}
      <div className={styles.formActions}>
        <button type="button" className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
        <button
          type="submit"
          className={styles.saveBtn}
          disabled={!sourceAmount || Number(sourceAmount) <= 0 || sourceId === targetId || !targetId}
        >
          {initial ? 'Save' : 'Exchange'}
        </button>
      </div>
    </form>
  )
}

// ─── Buy form ─────────────────────────────────────────────────────────────────

function BuyForm({ balances, onSave, onCancel }) {
  const [date,          setDate]          = useState(today)
  const [ticker,        setTicker]        = useState('')
  const [stockExchange, setStockExchange] = useState('')
  const [shares,        setShares]        = useState('')
  const [price,         setPrice]         = useState('')
  const [currency,      setCurrency]      = useState(balances[0]?.currency ?? 'USD')
  const [fee,           setFee]           = useState('0')
  const [extId,         setExtId]         = useState('')
  const [resolving,     setResolving]     = useState(false)  // dialog open?
  const [resolvedName,  setResolvedName]  = useState(null)   // name shown as hint after resolution

  const total = Number(shares || 0) * Number(price || 0) + Number(fee || 0)
  const canSave = ticker.trim() && Number(shares) > 0 && Number(price) > 0 && currency.trim()

  function handleTickerBlur() {
    const t = ticker.trim().toUpperCase()
    if (!t) return
    const profile = getStockProfile(t)
    if (!profile) {
      setResolving(true)
    } else {
      if (profile.name) setResolvedName(profile.name)
      // Pre-fill currency from the most recent buy for this ticker
      const prevBuys = getStockTransactionsByTicker(t).filter(tx => tx.type === 'buy')
      if (prevBuys.length > 0) setCurrency(prevBuys[prevBuys.length - 1].currency)
    }
  }

  function handleResolved(candidate) {
    setResolving(false)
    setResolvedName(candidate.name)
    if (!stockExchange.trim() && candidate.stockExchange) setStockExchange(candidate.stockExchange)
    if (candidate.currency) setCurrency(candidate.currency)
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!canSave) return
    onSave({ date, ticker, stockExchange: stockExchange.trim() || null, shares: Number(shares), price: Number(price), currency: currency.trim().toUpperCase(), fee: Number(fee || 0), transactionExternalId: extId.trim() || null })
  }

  return (
    <>
      <form className={styles.form} onSubmit={handleSubmit}>
        <h3 className={styles.formTitle}>Buy stock</h3>
        <div className={styles.formRow}>
          <label className={styles.formLabel}>Date</label>
          <input className={styles.formInput} type="date" value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <div className={styles.formRow}>
          <label className={styles.formLabel}>Ticker</label>
          <div className={styles.tickerInputRow}>
            <input
              className={styles.formInput}
              value={ticker}
              onChange={e => { setTicker(e.target.value.toUpperCase()); setResolvedName(null) }}
              onBlur={handleTickerBlur}
              placeholder="AAPL"
              autoFocus
            />
            {ticker.trim() && (
              <button type="button" className={styles.lookupBtn} onClick={() => setResolving(true)} title="Look up company name">
                Look up
              </button>
            )}
          </div>
          {resolvedName && <span className={styles.resolvedHint}>{resolvedName}</span>}
        </div>
        <div className={styles.formRow}>
          <label className={styles.formLabel}>Exchange (optional)</label>
          <input className={styles.formInput} value={stockExchange} onChange={e => setStockExchange(e.target.value)} placeholder="NASDAQ" />
        </div>
        <div className={styles.formRow}>
          <label className={styles.formLabel}>Shares</label>
          <input className={styles.formInput} type="number" min="0.000001" step="any" value={shares} onChange={e => setShares(e.target.value)} placeholder="10" />
        </div>
        <div className={styles.formRow}>
          <label className={styles.formLabel}>Price per share</label>
          <input className={styles.formInput} type="number" min="0.000001" step="any" value={price} onChange={e => setPrice(e.target.value)} placeholder="175.20" />
        </div>
        <div className={styles.formRow}>
          <label className={styles.formLabel}>Currency</label>
          <input className={styles.formInput} value={currency} onChange={e => setCurrency(e.target.value.toUpperCase())} placeholder="USD" />
        </div>
        <div className={styles.formRow}>
          <label className={styles.formLabel}>Fee</label>
          <input className={styles.formInput} type="number" min="0" step="0.01" value={fee} onChange={e => setFee(e.target.value)} />
        </div>
        <div className={styles.formRow}>
          <label className={styles.formLabel}>Transaction ID (optional)</label>
          <input className={styles.formInput} value={extId} onChange={e => setExtId(e.target.value)} placeholder="Broker reference" />
        </div>
        {total > 0 && <p className={styles.ratePreview}>Total cost: {fmtAmt(total)} {currency}</p>}
        <div className={styles.formActions}>
          <button type="button" className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
          <button type="submit" className={styles.saveBtn} disabled={!canSave}>Buy</button>
        </div>
      </form>

      {resolving && (
        <StockProfileResolutionDialog
          ticker={ticker.trim().toUpperCase()}
          direction="A"
          onConfirm={handleResolved}
          onCancel={() => setResolving(false)}
        />
      )}
    </>
  )
}

// ─── Dividend form ────────────────────────────────────────────────────────────

function DividendForm({ accountId, positions, defaultTicker, onSave, onCancel }) {
  const initTicker = defaultTicker ?? (positions[0]?.ticker ?? '')
  const initPos    = positions.find(p => p.ticker === initTicker)
  const initTaxPct = resolveDividendTaxPercent(initTicker)

  const [exDividendDate,   setExDividendDate]   = useState(today)
  const [payoutDate,       setPayoutDate]       = useState(today)
  const [ticker,           setTicker]           = useState(initTicker)
  const [customTicker,     setCustomTicker]     = useState('')
  const [currency,         setCurrency]         = useState(initPos?.currency ?? 'USD')
  const [dividendPerShare, setDividendPerShare] = useState('')
  const [shareCount,       setShareCount]       = useState(initPos ? trimDecimals(initPos.shares) : '')
  const [taxPctStr,        setTaxPctStr]        = useState(String(initTaxPct))
  const [taxAmtStr,        setTaxAmtStr]        = useState('')
  const [taxMode,          setTaxMode]          = useState('pct')  // 'pct' | 'amt'

  const isOther   = ticker === '__other__'
  const finalTicker = isOther ? customTicker.trim().toUpperCase() : ticker

  function syncTaxAmt(pctStr, ppsStr, scStr) {
    const pct = parseFloat(pctStr || '0')
    const tbt = Number(ppsStr || 0) * Number(scStr || 0)
    setTaxAmtStr(tbt > 0 ? trimRate(tbt * pct / 100) : '')
  }

  function syncTaxPct(amtStr, ppsStr, scStr) {
    const amt = parseFloat(amtStr || '0')
    const tbt = Number(ppsStr || 0) * Number(scStr || 0)
    setTaxPctStr(tbt > 0 ? trimRate(amt / tbt * 100) : '0')
  }

  function handleTickerSelect(t) {
    setTicker(t)
    if (t !== '__other__') {
      const pos = positions.find(p => p.ticker === t)
      if (pos) { setCurrency(pos.currency); setShareCount(trimDecimals(pos.shares)) }
      const newPct = resolveDividendTaxPercent(t)
      setTaxPctStr(String(newPct))
      setTaxMode('pct')
      const sc = pos ? pos.shares : Number(shareCount || 0)
      syncTaxAmt(String(newPct), dividendPerShare, String(sc))
    }
  }

  function handlePpsChange(v) {
    setDividendPerShare(v)
    if (taxMode === 'pct') syncTaxAmt(taxPctStr, v, shareCount)
    else syncTaxPct(taxAmtStr, v, shareCount)
  }

  function handleShareCountChange(v) {
    setShareCount(v)
    if (taxMode === 'pct') syncTaxAmt(taxPctStr, dividendPerShare, v)
    else syncTaxPct(taxAmtStr, dividendPerShare, v)
  }

  function handleTaxPctChange(v) {
    setTaxPctStr(v)
    setTaxMode('pct')
    syncTaxAmt(v, dividendPerShare, shareCount)
  }

  function handleTaxAmtChange(v) {
    setTaxAmtStr(v)
    setTaxMode('amt')
    syncTaxPct(v, dividendPerShare, shareCount)
  }

  const tbt          = Number(dividendPerShare || 0) * Number(shareCount || 0)
  const taxPctNum    = parseFloat(taxPctStr || '0')
  const taxAmtNum    = taxMode === 'pct' ? tbt * taxPctNum / 100 : parseFloat(taxAmtStr || '0')
  const netTotal     = tbt - taxAmtNum
  const netPerShare  = Number(shareCount || 0) > 0 ? netTotal / Number(shareCount) : 0

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  function fmtDateTooltip(iso) {
    if (!iso) return ''
    const [y, m, d] = iso.split('-').map(Number)
    return `${y} ${MONTHS[m - 1]} ${d}`
  }

  const canSave = finalTicker && currency.trim() && Number(dividendPerShare) > 0 && Number(shareCount) > 0 && payoutDate

  function handleSubmit(e) {
    e.preventDefault()
    if (!canSave) return
    const taxPercent = taxMode === 'amt' && tbt > 0
      ? (parseFloat(taxAmtStr || '0') / tbt * 100)
      : parseFloat(taxPctStr || '0')
    onSave({
      investingAccountId: accountId,
      ticker: finalTicker,
      currency: currency.trim().toUpperCase(),
      exDividendDate,
      payoutDate,
      dividendPerShare: Number(dividendPerShare),
      shareCount: Number(shareCount),
      taxPercent,
    })
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <h3 className={styles.formTitle}>New dividend{finalTicker ? ` — ${finalTicker}` : ''}</h3>

      {/* Ticker + Currency on one row */}
      <div className={styles.formPairRow}>
        <div className={styles.formRow} style={{ flex: 2, minWidth: 0 }}>
          <label className={styles.formLabel}>Ticker</label>
          {positions.length > 0 ? (
            <select className={styles.formSelect} value={ticker} onChange={e => handleTickerSelect(e.target.value)}>
              {positions.map(p => <option key={p.ticker} value={p.ticker}>{p.ticker}</option>)}
              <option value="__other__">Other…</option>
            </select>
          ) : (
            <input className={styles.formInput} value={ticker} onChange={e => setTicker(e.target.value.toUpperCase())} placeholder="AAPL" autoFocus />
          )}
        </div>
        <div className={styles.formRow} style={{ flex: 1, minWidth: 0 }}>
          <label className={styles.formLabel}>Currency</label>
          <input className={styles.formInput} value={currency} onChange={e => setCurrency(e.target.value.toUpperCase())} placeholder="USD" />
        </div>
      </div>

      {isOther && (
        <div className={styles.formRow}>
          <label className={styles.formLabel}>Ticker symbol</label>
          <input className={styles.formInput} value={customTicker} onChange={e => setCustomTicker(e.target.value.toUpperCase())} placeholder="AAPL" autoFocus />
        </div>
      )}

      {/* Dates on one row */}
      <div className={styles.formPairRow}>
        <div className={styles.formRow} style={{ flex: 1, minWidth: 0 }}>
          <label className={styles.formLabel}>Ex-div date</label>
          <div className={styles.dateTooltipWrap} data-tooltip={fmtDateTooltip(exDividendDate)}>
            <input className={styles.formInput} type="date" value={exDividendDate} onChange={e => setExDividendDate(e.target.value)} />
          </div>
        </div>
        <div className={styles.formRow} style={{ flex: 1, minWidth: 0 }}>
          <label className={styles.formLabel}>Payout date</label>
          <div className={styles.dateTooltipWrap} data-tooltip={fmtDateTooltip(payoutDate)}>
            <input className={styles.formInput} type="date" value={payoutDate} onChange={e => setPayoutDate(e.target.value)} />
          </div>
        </div>
      </div>

      {/* Per share + Shares on one row */}
      <div className={styles.formPairRow}>
        <div className={styles.formRow} style={{ flex: 1, minWidth: 0 }}>
          <label className={styles.formLabel}>Per share</label>
          <input className={styles.formInput} type="number" min="0" step="any" value={dividendPerShare} onChange={e => handlePpsChange(e.target.value)} placeholder="0.25" autoFocus={positions.length > 0 && !isOther} />
        </div>
        <div className={styles.formRow} style={{ flex: 1, minWidth: 0 }}>
          <label className={styles.formLabel}>Shares</label>
          <input className={styles.formInput} type="number" min="0.000001" step="any" value={shareCount} onChange={e => handleShareCountChange(e.target.value)} placeholder="15" />
        </div>
      </div>

      {tbt > 0 && (
        <p className={styles.ratePreview}>Total before tax: {fmtAmt(tbt)} {currency}</p>
      )}

      <div className={styles.formRow}>
        <label className={styles.formLabel}>Tax % ↔ Tax amount <span className={styles.formLabelHint}>(linked)</span></label>
        <div className={styles.taxBiRow}>
          <input
            className={styles.formInput}
            style={{ width: '72px' }}
            type="number" min="0" max="100" step="any"
            value={taxPctStr}
            onChange={e => handleTaxPctChange(e.target.value)}
            placeholder="0"
          />
          <span className={styles.taxSep}>%</span>
          <input
            className={styles.formInput}
            style={{ width: '88px' }}
            type="number" min="0" step="any"
            value={taxAmtStr}
            onChange={e => handleTaxAmtChange(e.target.value)}
            placeholder="0.00"
          />
          <span className={styles.taxSep}>{currency}</span>
        </div>
      </div>

      {tbt > 0 && (
        <>
          <p className={styles.ratePreview}>Net total: {fmtAmt(netTotal)} {currency} · Net/share: {fmtAmt(netPerShare)} {currency}</p>
          <p className={styles.formSubtitle}>Lands in {currency} cash balance</p>
        </>
      )}
      <div className={styles.formActions}>
        <button type="button" className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
        <button type="submit" className={styles.saveBtn} disabled={!canSave}>Save</button>
      </div>
    </form>
  )
}

// ─── Sell form ────────────────────────────────────────────────────────────────

function SellForm({ accountId, positions, defaultTicker, onSave, onCancel }) {
  const [date,          setDate]          = useState(today)
  const [ticker,        setTicker]        = useState(defaultTicker ?? (positions[0]?.ticker ?? ''))
  const [stockExchange, setStockExchange] = useState('')
  const [shares,        setShares]        = useState('')
  const [price,         setPrice]         = useState('')
  const [fee,           setFee]           = useState('0')
  const [extId,         setExtId]         = useState('')
  const [showLots,      setShowLots]      = useState(false)
  const [lotInputs,     setLotInputs]     = useState({})

  const selectedPos = positions.find(p => p.ticker === ticker)
  const currency = selectedPos?.currency ?? ''
  const openLots = ticker ? getOpenLots(accountId, ticker) : []

  function handleTickerChange(t) {
    setTicker(t)
    setShowLots(false)
    setLotInputs({})
  }

  function toggleLots() {
    if (!showLots) {
      // Pre-fill with FIFO
      const sharesToSell = Number(shares || 0)
      const inputs = {}
      if (sharesToSell > 0 && openLots.length > 0) {
        const { allocations } = computeFifoAllocations(openLots, sharesToSell)
        for (const alloc of allocations) inputs[alloc.sourceBuyId] = String(alloc.sharesFromLot)
      }
      for (const lot of openLots) if (!(lot.id in inputs)) inputs[lot.id] = '0'
      setLotInputs(inputs)
    }
    setShowLots(v => !v)
  }

  const lotTotal = Object.values(lotInputs).reduce((s, v) => s + Number(v || 0), 0)
  const lotValid = !showLots || Math.abs(lotTotal - Number(shares || 0)) < 0.000001
  const maxShares = selectedPos?.shares ?? 0
  const proceeds = Number(shares || 0) * Number(price || 0)
  const canSave = ticker && Number(shares) > 0 && Number(price) > 0 && lotValid

  function handleSubmit(e) {
    e.preventDefault()
    if (!canSave) return
    const lotAllocations = showLots
      ? Object.entries(lotInputs).filter(([, v]) => Number(v) > 0).map(([sourceBuyId, v]) => ({ sourceBuyId, sharesFromLot: Number(v) }))
      : null
    onSave({ date, ticker, stockExchange: stockExchange.trim() || null, shares: Number(shares), price: Number(price), currency, fee: Number(fee || 0), transactionExternalId: extId.trim() || null, lotAllocations })
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <h3 className={styles.formTitle}>Sell stock</h3>
      <div className={styles.formRow}>
        <label className={styles.formLabel}>Date</label>
        <input className={styles.formInput} type="date" value={date} onChange={e => setDate(e.target.value)} />
      </div>
      <div className={styles.formRow}>
        <label className={styles.formLabel}>Ticker</label>
        {positions.length > 0 ? (
          <select className={styles.formSelect} value={ticker} onChange={e => handleTickerChange(e.target.value)}>
            {positions.map(p => <option key={p.ticker} value={p.ticker}>{p.ticker} ({trimDecimals(p.shares)} sh)</option>)}
          </select>
        ) : (
          <input className={styles.formInput} value={ticker} onChange={e => setTicker(e.target.value.toUpperCase())} placeholder="AAPL" autoFocus />
        )}
      </div>
      <div className={styles.formRow}>
        <label className={styles.formLabel}>Exchange (optional)</label>
        <input className={styles.formInput} value={stockExchange} onChange={e => setStockExchange(e.target.value)} placeholder="NASDAQ" />
      </div>
      <div className={styles.formRow}>
        <label className={styles.formLabel}>
          Shares {maxShares > 0 && <span className={styles.available}>({trimDecimals(maxShares)} available)</span>}
        </label>
        <input className={styles.formInput} type="number" min="0.000001" step="any" value={shares} onChange={e => setShares(e.target.value)} placeholder="10" autoFocus={positions.length === 0} />
      </div>
      <div className={styles.formRow}>
        <label className={styles.formLabel}>Price per share {currency && `(${currency})`}</label>
        <input className={styles.formInput} type="number" min="0.000001" step="any" value={price} onChange={e => setPrice(e.target.value)} placeholder="180.00" />
      </div>
      <div className={styles.formRow}>
        <label className={styles.formLabel}>Fee {currency && `(${currency})`}</label>
        <input className={styles.formInput} type="number" min="0" step="0.01" value={fee} onChange={e => setFee(e.target.value)} />
      </div>
      <div className={styles.formRow}>
        <label className={styles.formLabel}>Transaction ID (optional)</label>
        <input className={styles.formInput} value={extId} onChange={e => setExtId(e.target.value)} placeholder="Broker reference" />
      </div>
      {proceeds > 0 && <p className={styles.ratePreview}>Net proceeds: {fmtAmt(proceeds - Number(fee || 0))} {currency}</p>}
      {openLots.length > 0 && (
        <div className={styles.lotPickerSection}>
          <button type="button" className={styles.lotPickerToggle} onClick={toggleLots}>
            {showLots ? '▲' : '▼'} Advanced: choose lots
          </button>
          {showLots && (
            <div className={styles.lotList}>
              {openLots.map(lot => (
                <div key={lot.id} className={styles.lotRow}>
                  <span className={styles.lotMeta}>{lot.date} · {trimDecimals(lot.remainingShares)} sh @ {fmtAmt(lot.price)}</span>
                  <input
                    className={styles.lotInput}
                    type="number" min="0" max={lot.remainingShares} step="any"
                    value={lotInputs[lot.id] ?? '0'}
                    onChange={e => setLotInputs(prev => ({ ...prev, [lot.id]: e.target.value }))}
                  />
                </div>
              ))}
              {!lotValid && (
                <p className={styles.fieldError}>
                  Lot totals ({trimDecimals(lotTotal)}) must equal shares to sell ({shares}).
                </p>
              )}
            </div>
          )}
        </div>
      )}
      <div className={styles.formActions}>
        <button type="button" className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
        <button type="submit" className={styles.saveBtn} disabled={!canSave}>Sell</button>
      </div>
    </form>
  )
}

// ─── Transfer form ────────────────────────────────────────────────────────────

function TransferForm({ accountId, positions, balances, defaultTicker, onSave, onCancel }) {
  const [date,            setDate]            = useState(today)
  const [ticker,          setTicker]          = useState(defaultTicker ?? (positions[0]?.ticker ?? ''))
  const [destinationId,   setDestinationId]   = useState('')
  const [shares,          setShares]          = useState('')
  const [fee,             setFee]             = useState('0')
  const [feeBalanceId,    setFeeBalanceId]    = useState(balances[0]?.id ?? '')
  const [extId,           setExtId]           = useState('')
  const [showLots,        setShowLots]        = useState(false)
  const [lotInputs,       setLotInputs]       = useState({})

  const otherAccounts = getInvestingAccounts().filter(a => a.id !== accountId)
  const selectedPos   = positions.find(p => p.ticker === ticker)
  const openLots      = ticker ? getOpenLots(accountId, ticker) : []
  const maxShares     = selectedPos?.shares ?? 0
  const feeBalance    = balances.find(b => b.id === feeBalanceId)

  function handleTickerChange(t) {
    setTicker(t)
    setShowLots(false)
    setLotInputs({})
  }

  function toggleLots() {
    if (!showLots) {
      const sharesToTransfer = Number(shares || 0)
      const inputs = {}
      if (sharesToTransfer > 0 && openLots.length > 0) {
        const { allocations } = computeFifoAllocations(openLots, sharesToTransfer)
        for (const alloc of allocations) inputs[alloc.sourceBuyId] = String(alloc.sharesFromLot)
      }
      for (const lot of openLots) if (!(lot.id in inputs)) inputs[lot.id] = '0'
      setLotInputs(inputs)
    }
    setShowLots(v => !v)
  }

  const lotTotal = Object.values(lotInputs).reduce((s, v) => s + Number(v || 0), 0)
  const lotValid = !showLots || Math.abs(lotTotal - Number(shares || 0)) < 0.000001
  const canSave  = ticker && destinationId && Number(shares) > 0 && Number(shares) <= maxShares + 0.000001 && lotValid

  function handleSubmit(e) {
    e.preventDefault()
    if (!canSave) return
    const lotAllocations = showLots
      ? Object.entries(lotInputs).filter(([, v]) => Number(v) > 0).map(([sourceBuyId, v]) => ({ sourceBuyId, sharesFromLot: Number(v) }))
      : null
    onSave({
      date,
      destinationInvestingAccountId: destinationId,
      ticker,
      shares: Number(shares),
      fee: Number(fee || 0),
      feeCashBalanceId: Number(fee) > 0 ? feeBalanceId : null,
      transactionExternalId: extId.trim() || null,
      lotAllocations,
    })
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <h3 className={styles.formTitle}>Transfer shares</h3>
      <div className={styles.formRow}>
        <label className={styles.formLabel}>Date</label>
        <input className={styles.formInput} type="date" value={date} onChange={e => setDate(e.target.value)} />
      </div>
      <div className={styles.formRow}>
        <label className={styles.formLabel}>Ticker</label>
        {positions.length > 0 ? (
          <select className={styles.formSelect} value={ticker} onChange={e => handleTickerChange(e.target.value)}>
            {positions.map(p => <option key={p.ticker} value={p.ticker}>{p.ticker} ({trimDecimals(p.shares)} sh)</option>)}
          </select>
        ) : (
          <input className={styles.formInput} value={ticker} onChange={e => setTicker(e.target.value.toUpperCase())} placeholder="AAPL" autoFocus />
        )}
      </div>
      <div className={styles.formRow}>
        <label className={styles.formLabel}>Destination</label>
        {otherAccounts.length === 0 ? (
          <p className={styles.fieldError}>No other investing accounts. Create one first.</p>
        ) : (
          <select className={styles.formSelect} value={destinationId} onChange={e => setDestinationId(e.target.value)} required>
            <option value="">— pick destination account —</option>
            {otherAccounts.map(a => <option key={a.id} value={a.id}>{a.name}{a.institution ? ` (${a.institution})` : ''}</option>)}
          </select>
        )}
      </div>
      <div className={styles.formRow}>
        <label className={styles.formLabel}>
          Shares {maxShares > 0 && <span className={styles.available}>({trimDecimals(maxShares)} available)</span>}
        </label>
        <input className={styles.formInput} type="number" min="0.000001" max={maxShares} step="any" value={shares} onChange={e => setShares(e.target.value)} placeholder="10" autoFocus={positions.length === 0} />
      </div>
      <div className={styles.formRow}>
        <label className={styles.formLabel}>Fee {feeBalance && `(${feeBalance.currency})`}</label>
        <input className={styles.formInput} type="number" min="0" step="0.01" value={fee} onChange={e => setFee(e.target.value)} />
      </div>
      {Number(fee) > 0 && balances.length > 0 && (
        <div className={styles.formRow}>
          <label className={styles.formLabel}>Fee paid from</label>
          <select className={styles.formSelect} value={feeBalanceId} onChange={e => setFeeBalanceId(e.target.value)}>
            {balances.map(b => (
              <option key={b.id} value={b.id}>
                {b.currency} ({fmtAmt(getCurrentBalance(b.id))})
              </option>
            ))}
          </select>
        </div>
      )}
      <div className={styles.formRow}>
        <label className={styles.formLabel}>Transaction ID (optional)</label>
        <input className={styles.formInput} value={extId} onChange={e => setExtId(e.target.value)} placeholder="Broker reference" />
      </div>
      <p className={styles.ratePreview}>
        Cost basis and original buy dates are preserved on the destination side. No cash moves with the shares.
      </p>
      {openLots.length > 0 && (
        <div className={styles.lotPickerSection}>
          <button type="button" className={styles.lotPickerToggle} onClick={toggleLots}>
            {showLots ? '▲' : '▼'} Advanced: choose lots
          </button>
          {showLots && (
            <div className={styles.lotList}>
              {openLots.map(lot => (
                <div key={lot.id} className={styles.lotRow}>
                  <span className={styles.lotMeta}>{lot.date} · {trimDecimals(lot.remainingShares)} sh @ {fmtAmt(lot.price)}</span>
                  <input
                    className={styles.lotInput}
                    type="number" min="0" max={lot.remainingShares} step="any"
                    value={lotInputs[lot.id] ?? '0'}
                    onChange={e => setLotInputs(prev => ({ ...prev, [lot.id]: e.target.value }))}
                  />
                </div>
              ))}
              {!lotValid && (
                <p className={styles.fieldError}>
                  Lot totals ({trimDecimals(lotTotal)}) must equal shares to transfer ({shares}).
                </p>
              )}
            </div>
          )}
        </div>
      )}
      <div className={styles.formActions}>
        <button type="button" className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
        <button type="submit" className={styles.saveBtn} disabled={!canSave}>Transfer</button>
      </div>
    </form>
  )
}
