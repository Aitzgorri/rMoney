import { useState, useEffect } from 'react'
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
  ASSET_CLASS,
  createBuy,
  createSell,
  createTransfer,
  createSwap,
  createWalletTransfer,
  getCryptoActivity,
  canDeleteStockTransaction,
  getStockTransaction,
  getStockTransactionsByTicker,
  createCurrencyExchange,
  updateCurrencyExchange,
  updateBuy,
  updateSell,
  updateTransfer,
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
import { getPortfolios, getAllPortfolioAssignments } from '../data/portfolios'
import { fmtAmt } from '../utils/format'
import HybridFilterDropdown from '../components/HybridFilterDropdown'
import { snapshotFxRates, convertToMain } from '../utils/currency'
import { getMainCurrency } from '../data/settings'
import { getLatestPrice, searchCryptoCoins, getCryptoPrice } from '../data/marketDataClient'
import { setCryptoCoin, getCoinId, getCryptoProfile } from '../data/cryptoProfiles'
import ConfigurableTable from '../components/ConfigurableTable'
import { INDENT } from '../utils/hierarchy'
import StockProfileResolutionDialog from '../components/StockProfileResolutionDialog'
import CurrencyDropdown from '../components/CurrencyDropdown'
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
  const [cryptoPositions,     setCryptoPositions]     = useState(() => getPositions(accountId, ASSET_CLASS.CRYPTO))
  const [enrichedCrypto,      setEnrichedCrypto]      = useState([])
  const [cryptoActivity,      setCryptoActivity]      = useState(() => getCryptoActivity(accountId))
  const [cryptoActionPos,     setCryptoActionPos]     = useState(null)  // crypto position targeted by Sell/Swap/Transfer
  const [showStocks,          setShowStocks]          = useState(true)  // Asset-movements: show stock rows
  const [showCrypto,          setShowCrypto]          = useState(true)  // Asset-movements: show crypto rows + swaps/moves
  const [activityDelete,      setActivityDelete]      = useState(null)  // { activity } | { activity, blocked, reason }
  const [cryptoEditSwap,      setCryptoEditSwap]      = useState(null)  // swap record being edited (replace-on-save)
  const [defaultSellTicker,   setDefaultSellTicker]   = useState(null)
  const [defaultDividendTicker, setDefaultDividendTicker] = useState(null)
  const [defaultTransferTicker, setDefaultTransferTicker] = useState(null)

  const [formMode,       setFormMode]       = useState(null)  // null | 'new-balance' | 'deposit' | 'withdraw' | 'exchange' | 'buy' | 'sell' | 'transfer' | 'dividend' | 'crypto-buy' | 'crypto-sell' | 'crypto-swap' | 'crypto-swap-edit' | 'crypto-wallet-transfer'
  const [activeBalanceId, setActiveBalanceId] = useState(null)

  const [editingOpeningId,    setEditingOpeningId]    = useState(null)
  const [editingOpeningValue, setEditingOpeningValue] = useState('')

  const [confirmDeleteBal, setConfirmDeleteBal] = useState(null)  // { balance, blocked, reason? }
  const [negConfirm,       setNegConfirm]       = useState(null)  // { message, onConfirm }
  const [movementFilter,   setMovementFilter]   = useState('all')
  const [filterTypes,       setFilterTypes]     = useState([])
  const [filterPortfolios,  setFilterPortfolios] = useState([])
  const [filterTickers,     setFilterTickers]   = useState([])
  const [filterCurrencies,  setFilterCurrencies] = useState([])
  const [filterBarOpen,     setFilterBarOpen]   = useState(
    () => localStorage.getItem(`rmoney_mov_filterbar_${accountId}`) === 'open'
  )
  const [visibleCount, setVisibleCount] = useState(50)
  const [expandedMovementId, setExpandedMovementId] = useState(null)
  const [movementsFullscreen, setMovementsFullscreen] = useState(false)
  const [enrichedPositions, setEnrichedPositions] = useState([])
  const [editingTx,        setEditingTx]        = useState(null)  // full transaction object or null
  const [editingExchange,  setEditingExchange]  = useState(null)  // stockTransaction record or null
  const [editingStockTx,   setEditingStockTx]   = useState(null)  // buy or sell stockTransaction being edited
  const [editingTransfer,  setEditingTransfer]  = useState(null)  // transfer stockTransaction being edited

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
    setCryptoPositions(getPositions(accountId, ASSET_CLASS.CRYPTO))
    setCryptoActivity(getCryptoActivity(accountId))
  }

  const balanceMap = Object.fromEntries(balances.map(b => [b.id, b]))

  // ── Enrich positions with async market data ──────────────────────────────────

  useEffect(() => {
    if (positions.length === 0) { setEnrichedPositions([]); return }
    const mainCurrency = getMainCurrency()
    let cancelled = false

    Promise.all(positions.map(async pos => {
      const profile = getStockProfile(pos.ticker)
      const exchange = profile?.stockExchange ?? null

      // Fee-exclusive avg price from open lots
      const lots = getOpenLots(accountId, pos.ticker)
      const totalFeeExclusive = lots.reduce((s, l) => s + l.remainingShares * l.price, 0)
      const totalShares = lots.reduce((s, l) => s + l.remainingShares, 0)
      const avgCostNoFee = totalShares > 0 ? totalFeeExclusive / totalShares : 0

      let latestPrice = null, previousClose = null
      try {
        const result = await getLatestPrice(pos.ticker, exchange)
        latestPrice = result.price ?? null
        previousClose = result.previousClose ?? null
      } catch { /* market data unavailable — show "—" */ }

      const mvTrading = latestPrice != null ? pos.shares * latestPrice : null
      const mvMain = mvTrading != null ? convertToMain(mvTrading, pos.currency, mainCurrency) : null

      return { ...pos, name: profile?.name ?? null, exchange, avgCostNoFee, latestPrice, previousClose, mvTrading, mvMain }
    })).then(enriched => {
      if (cancelled) return
      const totalMvMain = enriched.reduce((s, p) => s + (p.mvMain ?? 0), 0)
      setEnrichedPositions(enriched.map(p => {
        const perShareChange = (p.latestPrice != null && p.previousClose != null)
          ? p.latestPrice - p.previousClose : null
        const chgAmtTrading = perShareChange != null ? perShareChange * p.shares : null
        const chgAmtMain    = chgAmtTrading != null
          ? convertToMain(chgAmtTrading, p.currency, mainCurrency) : null
        const chgPct = (perShareChange != null && p.previousClose !== 0)
          ? (perShareChange / p.previousClose) * 100 : null
        return {
          ...p,
          shareOnAccount: totalMvMain > 0 && p.mvMain != null ? (p.mvMain / totalMvMain) * 100 : null,
          chgPct,
          chgAmtTrading,
          chgAmtMain,
        }
      }))
    })

    return () => { cancelled = true }
  }, [accountId, positions]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Enrich crypto positions with live CoinGecko prices (SPEC-036, 8b) ─────────
  // Priced in each holding's trade currency via the resolved coinId (cryptoProfiles),
  // then converted to main. Mirrors the stock enrichment above.
  useEffect(() => {
    if (cryptoPositions.length === 0) { setEnrichedCrypto([]); return }
    const mainCurrency = getMainCurrency()
    let cancelled = false

    Promise.all(cryptoPositions.map(async pos => {
      const coinId = getCoinId(pos.ticker)
      let latestPrice = null
      try {
        const result = await getCryptoPrice(pos.ticker, pos.currency, coinId)
        latestPrice = result.price ?? null
      } catch { /* price unavailable — show "—" */ }

      const mvTrading = latestPrice != null ? pos.shares * latestPrice : null
      const mvMain    = mvTrading != null ? convertToMain(mvTrading, pos.currency, mainCurrency) : null
      const costMain  = convertToMain(pos.avgCost * pos.shares, pos.currency, mainCurrency)
      const plMain    = (mvMain != null && costMain != null) ? mvMain - costMain : null
      const plPct     = (latestPrice != null && pos.avgCost > 0) ? ((latestPrice - pos.avgCost) / pos.avgCost) * 100 : null
      return { ...pos, coinId, latestPrice, mvTrading, mvMain, plMain, plPct }
    })).then(enriched => {
      if (!cancelled) setEnrichedCrypto(enriched)
    })

    return () => { cancelled = true }
  }, [accountId, cryptoPositions]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handlers ────────────────────────────────────────────────────────────────

  function closeForm() {
    setFormMode(null)
    setActiveBalanceId(null)
    setCryptoActionPos(null)
    setCryptoEditSwap(null)
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

  async function handleDeposit(params) {
    if (params.crossCurrencyMode === 'auto-exchange') {
      // Full model: land in matching-currency balance, then bundle an exchange to the target.
      let matchingBal = getCashBalanceByCurrency(accountId, params.budgetingCurrency)
      if (!matchingBal) matchingBal = createCashBalance({ investingAccountId: accountId, currency: params.budgetingCurrency, openingBalance: 0 })
      depositToCashBalance({ date: params.date, cashBalanceId: matchingBal.id, amount: params.amount, budgetingAmount: params.amount, budgetingAccountId: params.budgetingAccountId, budgetingEnvelopeId: params.budgetingEnvelopeId })
      const mainCurrency = getMainCurrency()
      const targetBal = balanceMap[params.cashBalanceId]
      const [srcSnap, tgtSnap] = await Promise.all([
        snapshotFxRates(params.budgetingCurrency, params.date, mainCurrency),
        snapshotFxRates(targetBal?.currency, params.date, mainCurrency),
      ])
      const exchangeRates = (srcSnap || tgtSnap) ? { mainCurrency, sourceRateToMain: srcSnap?.rateToMain ?? null, targetRateToMain: tgtSnap?.rateToMain ?? null, capturedAt: new Date().toISOString() } : null
      createCurrencyExchange({
        investingAccountId: accountId,
        date: params.date,
        sourceCashBalanceId: matchingBal.id,
        sourceAmount: params.amount,
        targetCashBalanceId: params.cashBalanceId,
        exchangeRate: params.exchangeRate,
        feeAmount: params.fxFeeAmount,
        feeCashBalanceId: Number(params.fxFeeAmount) > 0 ? matchingBal.id : null,
        exchangeRates,
      })
    } else if (params.crossCurrencyMode === 'land-in-matching') {
      // Just deposit into the matching-currency balance; user exchanges later.
      let matchingBal = getCashBalanceByCurrency(accountId, params.budgetingCurrency)
      if (!matchingBal) matchingBal = createCashBalance({ investingAccountId: accountId, currency: params.budgetingCurrency, openingBalance: 0 })
      depositToCashBalance({ date: params.date, cashBalanceId: matchingBal.id, amount: params.amount, budgetingAmount: params.amount, budgetingAccountId: params.budgetingAccountId, budgetingEnvelopeId: params.budgetingEnvelopeId })
    } else {
      depositToCashBalance(params)
    }
    refresh()
    closeForm()
  }

  async function handleWithdraw(params) {
    if (params.crossCurrencyMode === 'auto-exchange') {
      // Full model: exchange source balance → matching-currency balance, then withdraw to budgeting.
      withNegCheck(params.cashBalanceId, -params.amount, async () => {
        let matchingBal = getCashBalanceByCurrency(accountId, params.budgetingCurrency)
        if (!matchingBal) matchingBal = createCashBalance({ investingAccountId: accountId, currency: params.budgetingCurrency, openingBalance: 0 })
        const mainCurrency = getMainCurrency()
        const sourceBal = balanceMap[params.cashBalanceId]
        const [srcSnap, tgtSnap] = await Promise.all([
          snapshotFxRates(sourceBal?.currency, params.date, mainCurrency),
          snapshotFxRates(params.budgetingCurrency, params.date, mainCurrency),
        ])
        const exchangeRates = (srcSnap || tgtSnap) ? { mainCurrency, sourceRateToMain: srcSnap?.rateToMain ?? null, targetRateToMain: tgtSnap?.rateToMain ?? null, capturedAt: new Date().toISOString() } : null
        const targetAmount = params.amount * params.exchangeRate
        createCurrencyExchange({
          investingAccountId: accountId,
          date: params.date,
          sourceCashBalanceId: params.cashBalanceId,
          sourceAmount: params.amount,
          targetCashBalanceId: matchingBal.id,
          exchangeRate: params.exchangeRate,
          feeAmount: params.fxFeeAmount,
          feeCashBalanceId: Number(params.fxFeeAmount) > 0 ? params.cashBalanceId : null,
          exchangeRates,
        })
        withdrawFromCashBalance({ date: params.date, cashBalanceId: matchingBal.id, amount: targetAmount, budgetingAmount: targetAmount, budgetingAccountId: params.budgetingAccountId, budgetingEnvelopeId: params.budgetingEnvelopeId })
        refresh()
        closeForm()
      })
    } else if (params.crossCurrencyMode === 'land-in-matching') {
      // Exchange source → matching-currency balance only; user withdraws later.
      withNegCheck(params.cashBalanceId, -params.amount, async () => {
        let matchingBal = getCashBalanceByCurrency(accountId, params.budgetingCurrency)
        if (!matchingBal) matchingBal = createCashBalance({ investingAccountId: accountId, currency: params.budgetingCurrency, openingBalance: 0 })
        const mainCurrency = getMainCurrency()
        const sourceBal = balanceMap[params.cashBalanceId]
        const [srcSnap, tgtSnap] = await Promise.all([
          snapshotFxRates(sourceBal?.currency, params.date, mainCurrency),
          snapshotFxRates(params.budgetingCurrency, params.date, mainCurrency),
        ])
        const exchangeRates = (srcSnap || tgtSnap) ? { mainCurrency, sourceRateToMain: srcSnap?.rateToMain ?? null, targetRateToMain: tgtSnap?.rateToMain ?? null, capturedAt: new Date().toISOString() } : null
        createCurrencyExchange({
          investingAccountId: accountId,
          date: params.date,
          sourceCashBalanceId: params.cashBalanceId,
          sourceAmount: params.amount,
          targetCashBalanceId: matchingBal.id,
          exchangeRate: params.exchangeRate,
          feeAmount: params.fxFeeAmount,
          feeCashBalanceId: Number(params.fxFeeAmount) > 0 ? params.cashBalanceId : null,
          exchangeRates,
        })
        refresh()
        closeForm()
      })
    } else {
      withNegCheck(params.cashBalanceId, -params.amount, () => {
        withdrawFromCashBalance(params)
        refresh()
        closeForm()
      })
    }
  }

  async function handleExchange(params) {
    const mainCurrency = getMainCurrency()
    const sourceBal = balanceMap[params.sourceCashBalanceId]
    const targetBal = balanceMap[params.targetCashBalanceId]
    const [srcSnap, tgtSnap] = await Promise.all([
      snapshotFxRates(sourceBal?.currency, params.date, mainCurrency),
      snapshotFxRates(targetBal?.currency, params.date, mainCurrency),
    ])
    const exchangeRates = (srcSnap || tgtSnap) ? {
      mainCurrency,
      sourceRateToMain: srcSnap?.rateToMain ?? null,
      targetRateToMain: tgtSnap?.rateToMain ?? null,
      capturedAt: new Date().toISOString(),
    } : null
    const feeSameAsSource = params.feeCashBalanceId === params.sourceCashBalanceId
    const netDelta = -Number(params.sourceAmount) - (feeSameAsSource ? Number(params.feeAmount || 0) : 0)
    withNegCheck(params.sourceCashBalanceId, netDelta, () => {
      createCurrencyExchange({ ...params, investingAccountId: accountId, exchangeRates })
      refresh()
      closeForm()
    })
  }

  async function handleUpdateExchange(params) {
    const mainCurrency = getMainCurrency()
    const sourceBal = balanceMap[editingExchange.sourceCashBalanceId]
    const targetBal = balanceMap[editingExchange.targetCashBalanceId]
    const [srcSnap, tgtSnap] = await Promise.all([
      snapshotFxRates(sourceBal?.currency, params.date, mainCurrency),
      snapshotFxRates(targetBal?.currency, params.date, mainCurrency),
    ])
    const exchangeRates = (srcSnap || tgtSnap) ? {
      mainCurrency,
      sourceRateToMain: srcSnap?.rateToMain ?? null,
      targetRateToMain: tgtSnap?.rateToMain ?? null,
      capturedAt: new Date().toISOString(),
    } : null
    updateCurrencyExchange(editingExchange.id, { ...params, exchangeRates })
    refresh()
    setEditingExchange(null)
  }

  async function handleUpdateBuy(params) {
    const mainCurrency = getMainCurrency()
    let exchangeRates = editingStockTx.exchangeRates
    if (params.date !== editingStockTx.date || !exchangeRates) {
      exchangeRates = await snapshotFxRates(editingStockTx.currency, params.date, mainCurrency)
    }
    updateBuy(editingStockTx.id, { ...params, exchangeRates })
    refresh()
    setEditingStockTx(null)
  }

  async function handleUpdateSell(params) {
    const mainCurrency = getMainCurrency()
    let exchangeRates = editingStockTx.exchangeRates
    if (params.date !== editingStockTx.date || !exchangeRates) {
      exchangeRates = await snapshotFxRates(editingStockTx.currency, params.date, mainCurrency)
    }
    updateSell(editingStockTx.id, { ...params, exchangeRates })
    refresh()
    setEditingStockTx(null)
  }

  function handleUpdateTransfer(params) {
    updateTransfer(editingTransfer.id, params)
    refresh()
    setEditingTransfer(null)
  }

  async function handleBuy(params) {
    const mainCurrency = getMainCurrency()
    const exchangeRates = await snapshotFxRates(params.currency, params.date, mainCurrency)
    const cost = Number(params.shares) * Number(params.price) + Number(params.fee || 0)

    const sourceBal = params.sourceCashBalanceId ? balanceMap[params.sourceCashBalanceId] : null
    const isCrossSource = sourceBal && sourceBal.currency !== params.currency

    if (isCrossSource) {
      // Cross-currency source: check source balance, create buy then triggered exchange.
      const srcCurrent = getCurrentBalance(params.sourceCashBalanceId)
      const sourceAmount = Number(params.fxSourceAmount)
      const fxFeeAmount = Number(params.fxFeeAmount || 0)
      const srcDelta = -(sourceAmount + fxFeeAmount)

      const proceed = async () => {
        const buy = createBuy({ ...params, investingAccountId: accountId, exchangeRates })
        const tradeBal = getCashBalanceByCurrency(accountId, params.currency)
        const [srcSnap, tgtSnap] = await Promise.all([
          snapshotFxRates(sourceBal.currency, params.date, mainCurrency),
          snapshotFxRates(params.currency, params.date, mainCurrency),
        ])
        const exRates = (srcSnap || tgtSnap) ? { mainCurrency, sourceRateToMain: srcSnap?.rateToMain ?? null, targetRateToMain: tgtSnap?.rateToMain ?? null, capturedAt: new Date().toISOString() } : null
        createCurrencyExchange({
          investingAccountId: accountId,
          date: params.date,
          sourceCashBalanceId: params.sourceCashBalanceId,
          sourceAmount,
          targetCashBalanceId: tradeBal.id,
          exchangeRate: Number(params.fxExchangeRate),
          feeAmount: fxFeeAmount,
          feeCashBalanceId: fxFeeAmount > 0 ? params.sourceCashBalanceId : null,
          triggeredByStockTransactionId: buy.id,
          exchangeRates: exRates,
        })
        refresh()
        closeForm()
      }

      if (srcCurrent + srcDelta < 0) {
        setNegConfirm({
          message: `This will take your ${sourceBal.currency} balance from ${fmtAmt(srcCurrent)} to ${fmtAmt(srcCurrent + srcDelta)}.`,
          onConfirm: () => { proceed(); setNegConfirm(null) },
        })
      } else {
        proceed()
      }
      return
    }

    // Same-currency source (existing logic).
    const existing = getCashBalanceByCurrency(accountId, params.currency)
    const currentBal = existing ? getCurrentBalance(existing.id) : 0
    const proceed = () => {
      createBuy({ ...params, investingAccountId: accountId, exchangeRates })
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

  async function handleSell(params) {
    const mainCurrency = getMainCurrency()
    const exchangeRates = await snapshotFxRates(params.currency, params.date, mainCurrency)
    createSell({ ...params, investingAccountId: accountId, exchangeRates })

    if (params.proceedsCashBalanceId) {
      const proceedsBal = balanceMap[params.proceedsCashBalanceId]
      if (proceedsBal && proceedsBal.currency !== params.currency) {
        // Sell proceeds land in trade-currency balance; then exchange to selected destination.
        const tradeBal = getCashBalanceByCurrency(accountId, params.currency)
        if (tradeBal) {
          const [srcSnap, tgtSnap] = await Promise.all([
            snapshotFxRates(params.currency, params.date, mainCurrency),
            snapshotFxRates(proceedsBal.currency, params.date, mainCurrency),
          ])
          const exRates = (srcSnap || tgtSnap) ? { mainCurrency, sourceRateToMain: srcSnap?.rateToMain ?? null, targetRateToMain: tgtSnap?.rateToMain ?? null, capturedAt: new Date().toISOString() } : null
          const netProceeds = Number(params.shares) * Number(params.price) - Number(params.fee || 0)
          createCurrencyExchange({
            investingAccountId: accountId,
            date: params.date,
            sourceCashBalanceId: tradeBal.id,
            sourceAmount: netProceeds,
            targetCashBalanceId: params.proceedsCashBalanceId,
            exchangeRate: Number(params.proceedsExchangeRate),
            feeAmount: Number(params.proceedsFxFeeAmount || 0),
            feeCashBalanceId: Number(params.proceedsFxFeeAmount) > 0 ? tradeBal.id : null,
            exchangeRates: exRates,
          })
        }
      }
    }

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

  // SPEC-036 crypto swap / wallet-transfer (coin-for-coin and wallet moves).
  function handleCryptoSwap(params) {
    createSwap({ ...params, investingAccountId: accountId })
    refresh()
    closeForm()
  }

  function handleCryptoWalletTransfer(params) {
    createWalletTransfer({ ...params, investingAccountId: accountId })
    refresh()
    closeForm()
  }

  // Delete a crypto swap / wallet-transfer (from the Asset movements list). A swap is blocked
  // if the coin it produced has since been sold or swapped (canDeleteStockTransaction).
  function requestDeleteActivity(activity) {
    const { canDelete, reason } = canDeleteStockTransaction(activity.id)
    setActivityDelete(canDelete ? { activity } : { activity, blocked: true, reason })
  }
  function confirmDeleteActivity() {
    deleteStockTransaction(activityDelete.activity.id)
    setActivityDelete(null)
    refresh()
  }

  // Edit a swap = replace: it must first be deletable (its produced coin not yet consumed).
  function requestEditActivity(activity) {
    if (activity.type !== 'swap') return
    const { canDelete, reason } = canDeleteStockTransaction(activity.id)
    if (!canDelete) { setActivityDelete({ activity, blocked: true, reason }); return }
    setCryptoEditSwap(activity)
    setFormMode('crypto-swap-edit')
  }
  function handleEditSwap(params) {
    if (cryptoEditSwap) deleteStockTransaction(cryptoEditSwap.id)
    createSwap({ ...params, investingAccountId: accountId })
    refresh()
    closeForm()
  }

  function handleDividend(params) {
    createDividend(params)
    refresh()
    closeForm()
    setDefaultDividendTicker(null)
  }

  // ── Movement filter helpers ──────────────────────────────────────────────────

  // Build ticker lookup: movementId → ticker (for buy/sell/dividend/transfer-fee)
  const movTicker = {}
  for (const m of movements) {
    if (m.linkedStockTransactionId) {
      const tx = getStockTransaction(m.linkedStockTransactionId)
      if (tx?.ticker) movTicker[m.id] = tx.ticker
    } else if (m.linkedDividendId) {
      const dv = getDividend(m.linkedDividendId)
      if (dv?.ticker) movTicker[m.id] = dv.ticker
    }
  }

  // Portfolio lookup: ticker → [portfolioId]
  const allAssignments = getAllPortfolioAssignments()
  const tickerPortfolios = {}
  for (const a of allAssignments) {
    if (!tickerPortfolios[a.ticker]) tickerPortfolios[a.ticker] = []
    tickerPortfolios[a.ticker].push(a.portfolioId)
  }

  // Compute base list (balance filter + fee-type merge)
  const baseMovements = (movementFilter === 'all'
    ? movements
    : movements.filter(m => m.cashBalanceId === movementFilter)
  ).filter(m => !FEE_TYPES.has(m.type))

  // Apply hybrid filters
  const displayMovements = baseMovements.filter(m => {
    if (filterTypes.length > 0 && !filterTypes.includes(m.type)) return false
    const ticker = movTicker[m.id]
    if (filterTickers.length > 0 && (!ticker || !filterTickers.includes(ticker))) return false
    if (filterPortfolios.length > 0) {
      const portfolioIds = ticker ? (tickerPortfolios[ticker] ?? []) : []
      if (!filterPortfolios.some(pid => portfolioIds.includes(pid))) return false
    }
    if (filterCurrencies.length > 0) {
      const cur = balanceMap[m.cashBalanceId]?.currency
      if (!cur || !filterCurrencies.includes(cur)) return false
    }
    return true
  })

  // SPEC-036: classify a cash movement by asset class for the Stocks/Crypto toggles.
  function movementAssetClass(m) {
    if (m.type === 'buy' || m.type === 'sell') {
      const tx = m.linkedStockTransactionId ? getStockTransaction(m.linkedStockTransactionId) : null
      return tx?.assetClass === 'crypto' ? 'crypto' : 'stock'
    }
    if (m.type === 'dividend') return 'stock'
    if (m.type === 'swap-fee') return 'crypto'
    return 'other'   // deposits, withdrawals, exchanges, opening — not asset-specific, always shown
  }

  // Merge cash movements with crypto swaps/wallet-transfers (informational, no cash leg) into one
  // "asset movements" stream, gated by the Stocks/Crypto toggles, newest first.
  const cashItems = displayMovements
    .filter(m => {
      const cls = movementAssetClass(m)
      if (cls === 'stock') return showStocks
      if (cls === 'crypto') return showCrypto
      return true
    })
    .map(m => ({ kind: 'cash', id: m.id, date: m.date, createdAt: m.createdAt, movement: m }))
  const activityItems = showCrypto
    ? cryptoActivity.map(a => ({ kind: 'activity', id: a.id, date: a.date, createdAt: a.createdAt, activity: a }))
    : []
  const combinedItems = [...cashItems, ...activityItems]
    .sort((a, b) => b.date.localeCompare(a.date) || new Date(b.createdAt) - new Date(a.createdAt))

  // Visible slice for virtualization
  const shownItems = combinedItems.slice(0, visibleCount)
  const hasMore = combinedItems.length > visibleCount

  // Filter options derived from baseMovements
  const typeOptions = [
    { id: 'buy', label: 'Buy' },
    { id: 'sell', label: 'Sell' },
    { id: 'dividend', label: 'Dividend' },
    { id: 'deposit', label: 'Deposit' },
    { id: 'withdrawal', label: 'Withdrawal' },
    { id: 'currency-exchange', label: 'Currency exchange' },
    { id: 'transfer-fee', label: 'Transfer fee' },
    { id: 'swap-fee', label: 'Swap fee' },
  ]

  const tickerOptions = [...new Set(
    baseMovements.map(m => movTicker[m.id]).filter(Boolean)
  )].sort().map(t => ({ id: t, label: t }))

  const portfolioOptions = getPortfolios().map(p => ({ id: p.id, label: p.name }))

  const currencyOptions = [...new Set(
    baseMovements.map(m => balanceMap[m.cashBalanceId]?.currency).filter(Boolean)
  )].sort().map(c => ({ id: c, label: c }))

  const activeFilterCount = filterTypes.length + filterPortfolios.length + filterTickers.length + filterCurrencies.length

  function toggleFilterBar() {
    const next = !filterBarOpen
    setFilterBarOpen(next)
    localStorage.setItem(`rmoney_mov_filterbar_${accountId}`, next ? 'open' : 'closed')
  }

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
            {formMode === 'crypto-buy' && (
              <CryptoBuyForm
                balances={balances}
                onSave={handleBuy}
                onCancel={closeForm}
              />
            )}
            {formMode === 'crypto-sell' && cryptoActionPos && (
              <CryptoSellForm
                position={cryptoActionPos}
                balances={balances}
                onSave={handleSell}
                onCancel={closeForm}
              />
            )}
            {formMode === 'crypto-swap' && cryptoActionPos && (
              <CryptoSwapForm
                position={cryptoActionPos}
                cryptoTickers={cryptoPositions.map(p => p.ticker)}
                onSave={handleCryptoSwap}
                onCancel={closeForm}
              />
            )}
            {formMode === 'crypto-swap-edit' && cryptoEditSwap && (() => {
              const s = cryptoEditSwap
              const cur = cryptoPositions.find(p => p.ticker === s.from.ticker)
              // Restore the disposed amount so the original quantity validates on re-save.
              const restored = (cur?.shares ?? 0) + s.from.quantity + (s.fee?.coin === s.from.ticker ? s.fee.quantity : 0)
              const editPos = { ticker: s.from.ticker, currency: s.currency, shares: restored }
              const editInitial = {
                date: s.date,
                fromQty: String(s.from.quantity),
                toCoin: { coinId: getCoinId(s.to.ticker), symbol: s.to.ticker, name: getCryptoProfile(s.to.ticker)?.name ?? s.to.ticker },
                toQty: String(s.to.quantity),
                fromPrice: s.from?.price != null ? String(s.from.price) : '',
                toPrice: s.to?.price != null ? String(s.to.price) : '',
                fee: s.fee ? String(s.fee.quantity) : '0',
                feeCoin: s.fee?.coin ?? s.from.ticker,
              }
              return (
                <CryptoSwapForm
                  position={editPos}
                  cryptoTickers={cryptoPositions.map(p => p.ticker)}
                  initial={editInitial}
                  onSave={handleEditSwap}
                  onCancel={closeForm}
                />
              )
            })()}
            {formMode === 'crypto-wallet-transfer' && cryptoActionPos && (
              <CryptoWalletTransferForm
                position={cryptoActionPos}
                onSave={handleCryptoWalletTransfer}
                onCancel={closeForm}
              />
            )}
            {formMode === 'sell' && (
              <SellForm
                accountId={accountId}
                positions={positions}
                balances={balances}
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

      {activityDelete && (
        <div className={styles.overlay}>
          <div className={styles.dialog}>
            {activityDelete.blocked ? (
              <>
                <h3>Can't delete</h3>
                <p>{activityDelete.reason}</p>
                <div className={styles.dialogActions}>
                  <button className={styles.cancelBtn} onClick={() => setActivityDelete(null)}>Close</button>
                </div>
              </>
            ) : (
              <>
                <h3>Delete {activityDelete.activity.type === 'swap' ? 'swap' : 'wallet move'}?</h3>
                <p>This reverses its effect on your crypto holdings and can't be undone.</p>
                <div className={styles.dialogActions}>
                  <button className={styles.cancelBtn} onClick={() => setActivityDelete(null)}>Cancel</button>
                  <button className={styles.proceedBtn} onClick={confirmDeleteActivity}>Delete</button>
                </div>
              </>
            )}
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
                    <button className={styles.actionBtnIcon} onClick={() => startEditOpening(bal)} title="Edit opening balance" aria-label="Edit opening balance">✎</button>
                    <button className={`${styles.actionBtnIcon} ${styles.dangerIcon}`} onClick={() => handleDeleteBalanceRequest(bal)} title="Delete cash balance" aria-label="Delete cash balance">×</button>
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
            <button className={styles.newBalBtn} onClick={() => setFormMode('crypto-buy')}>+ Buy crypto</button>
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
          <ConfigurableTable
            storageKey={`rmoney_positions_columns_${accountId}`}
            rowKey={p => p.ticker}
            rows={enrichedPositions.length > 0 ? enrichedPositions : positions}
            maxHeight="460px"
            emptyMessage="No positions."
            columns={[
              {
                id: 'ticker', label: 'Ticker',
                sortValue: p => p.ticker,
                render: p => (
                  <span
                    className={`${styles.posTicker} ${onNavigate ? styles.posTickerLink : ''}`}
                    onClick={onNavigate ? () => onNavigate('stock', { ticker: p.ticker }) : undefined}
                  >{p.ticker}</span>
                ),
              },
              {
                id: 'name', label: 'Name',
                sortValue: p => p.name ?? '',
                render: p => p.name ?? '—',
              },
              {
                id: 'exchange', label: 'Exchange',
                sortValue: p => p.exchange ?? '',
                render: p => p.exchange ?? '—',
                defaultHidden: true,
              },
              {
                id: 'currency', label: 'Currency',
                sortValue: p => p.currency,
                render: p => p.currency,
                defaultHidden: true,
              },
              {
                id: 'latestPrice', label: 'Latest price', align: 'right',
                sortValue: p => p.latestPrice ?? -Infinity,
                render: p => p.latestPrice != null ? `${fmtAmt(p.latestPrice)} ${p.currency}` : '—',
              },
              {
                id: 'shares', label: 'Shares', align: 'right',
                sortValue: p => p.shares,
                render: p => trimDecimals(p.shares),
              },
              {
                id: 'avgCostFee', label: 'Price/sh (w/ fee)', align: 'right',
                sortValue: p => p.avgCost,
                render: p => `${fmtAmt(p.avgCost)} ${p.currency}`,
              },
              {
                id: 'avgCostNoFee', label: 'Avg price', align: 'right',
                sortValue: p => p.avgCostNoFee ?? p.avgCost,
                render: p => {
                  const v = p.avgCostNoFee ?? p.avgCost
                  return `${fmtAmt(v)} ${p.currency}`
                },
                defaultHidden: true,
              },
              {
                id: 'mvTrading', label: 'MV (trading)', align: 'right',
                sortValue: p => p.mvTrading ?? -Infinity,
                render: p => p.mvTrading != null ? `${fmtAmt(p.mvTrading)} ${p.currency}` : '—',
              },
              {
                id: 'mvMain', label: 'MV (main)', align: 'right',
                sortValue: p => p.mvMain ?? -Infinity,
                render: p => {
                  const mc = getMainCurrency()
                  return p.mvMain != null ? `${fmtAmt(p.mvMain)} ${mc}` : '—'
                },
              },
              {
                id: 'shareOnAccount', label: 'Share %', align: 'right',
                sortValue: p => p.shareOnAccount ?? -Infinity,
                render: p => p.shareOnAccount != null ? `${p.shareOnAccount.toFixed(1)}%` : '—',
                defaultHidden: true,
              },
              {
                id: 'chgPct', label: "Change (%)", align: 'right',
                sortValue: p => p.chgPct ?? -Infinity,
                render: p => {
                  if (p.chgPct == null) return '—'
                  const sign = p.chgPct >= 0 ? '+' : ''
                  return (
                    <span style={{ color: p.chgPct >= 0 ? '#4ade80' : '#f87171' }}>
                      {sign}{p.chgPct.toFixed(2)}%
                    </span>
                  )
                },
              },
              {
                id: 'chgAmtTrading', label: "Change (trading)", align: 'right',
                sortValue: p => p.chgAmtTrading ?? -Infinity,
                render: p => {
                  if (p.chgAmtTrading == null) return '—'
                  const sign = p.chgAmtTrading >= 0 ? '+' : '−'
                  return (
                    <span style={{ color: p.chgAmtTrading >= 0 ? '#4ade80' : '#f87171' }}>
                      {sign}{fmtAmt(Math.abs(p.chgAmtTrading))} {p.currency}
                    </span>
                  )
                },
              },
              {
                id: 'chgAmtMain', label: "Change (main)", align: 'right',
                sortValue: p => p.chgAmtMain ?? -Infinity,
                render: p => {
                  const mc = getMainCurrency()
                  if (p.chgAmtMain == null) return '—'
                  const sign = p.chgAmtMain >= 0 ? '+' : '−'
                  return (
                    <span style={{ color: p.chgAmtMain >= 0 ? '#4ade80' : '#f87171' }}>
                      {sign}{fmtAmt(Math.abs(p.chgAmtMain))} {mc}
                    </span>
                  )
                },
              },
              {
                id: 'actions', label: '',
                render: p => (
                  <span style={{ display: 'flex', gap: 4 }}>
                    <button
                      className={styles.actionBtnSmall}
                      onClick={() => { setDefaultSellTicker(p.ticker); setFormMode('sell') }}
                    >Sell</button>
                    <button
                      className={styles.actionBtnSmall}
                      onClick={() => { setDefaultDividendTicker(p.ticker); setFormMode('dividend') }}
                    >Div</button>
                  </span>
                ),
              },
            ]}
          />
        )}
      </div>

      {/* ── Crypto holdings (SPEC-036, 8b) ──────────────────────────────────── */}

      {cryptoPositions.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionLabel}>Crypto holdings</span>
          </div>
          <ConfigurableTable
            storageKey={`rmoney_crypto_positions_columns_${accountId}`}
            rowKey={p => p.ticker}
            rows={enrichedCrypto.length > 0 ? enrichedCrypto : cryptoPositions}
            maxHeight="460px"
            emptyMessage="No crypto positions."
            columns={[
              { id: 'ticker', label: 'Coin', sortValue: p => p.ticker, render: p => p.ticker },
              { id: 'quantity', label: 'Quantity', align: 'right', sortValue: p => p.shares, render: p => trimDecimals(p.shares) },
              { id: 'avgCost', label: 'Avg cost (w/ fee)', align: 'right', sortValue: p => p.avgCost, render: p => `${fmtAmt(p.avgCost)} ${p.currency}` },
              { id: 'latestPrice', label: 'Latest price', align: 'right', sortValue: p => p.latestPrice ?? -Infinity, render: p => p.latestPrice != null ? `${fmtAmt(p.latestPrice)} ${p.currency}` : '—' },
              { id: 'mvTrading', label: 'Value (trading)', align: 'right', sortValue: p => p.mvTrading ?? -Infinity, render: p => p.mvTrading != null ? `${fmtAmt(p.mvTrading)} ${p.currency}` : '—' },
              {
                id: 'mvMain', label: 'Value (main)', align: 'right',
                sortValue: p => p.mvMain ?? -Infinity,
                render: p => { const mc = getMainCurrency(); return p.mvMain != null ? `${fmtAmt(p.mvMain)} ${mc}` : '—' },
              },
              {
                id: 'plMain', label: 'P/L (main)', align: 'right',
                sortValue: p => p.plMain ?? -Infinity,
                render: p => {
                  const mc = getMainCurrency()
                  if (p.plMain == null) return '—'
                  const sign = p.plMain >= 0 ? '+' : '−'
                  return <span style={{ color: p.plMain >= 0 ? '#4ade80' : '#f87171' }}>{sign}{fmtAmt(Math.abs(p.plMain))} {mc}</span>
                },
              },
              {
                id: 'plPct', label: 'P/L %', align: 'right',
                sortValue: p => p.plPct ?? -Infinity,
                render: p => {
                  if (p.plPct == null) return '—'
                  const sign = p.plPct >= 0 ? '+' : ''
                  return <span style={{ color: p.plPct >= 0 ? '#4ade80' : '#f87171' }}>{sign}{p.plPct.toFixed(2)}%</span>
                },
              },
              {
                id: 'actions', label: '',
                render: p => (
                  <span style={{ display: 'flex', gap: 4 }}>
                    <button className={styles.actionBtnSmall} onClick={() => { setCryptoActionPos(p); setFormMode('crypto-sell') }}>Sell</button>
                    <button className={styles.actionBtnSmall} onClick={() => { setCryptoActionPos(p); setFormMode('crypto-swap') }}>Swap</button>
                    <button className={styles.actionBtnSmall} onClick={() => { setCryptoActionPos(p); setFormMode('crypto-wallet-transfer') }}>Move</button>
                  </span>
                ),
              },
            ]}
          />
        </div>
      )}

      {/* ── Asset movements (cash + crypto swaps/moves, SPEC-036) ───────────── */}

      <div className={`${styles.section} ${movementsFullscreen ? styles.movementsFullscreenSection : ''}`}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionLabel}>
            Asset movements
            {activeFilterCount > 0 && (
              <span className={styles.filterBadge}>{combinedItems.length}</span>
            )}
          </span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button
              type="button"
              className={`${styles.filterToggleBtn} ${showStocks ? styles.filterToggleActive : ''}`}
              onClick={() => setShowStocks(v => !v)}
              title="Show / hide stock movements"
            >
              Stocks
            </button>
            <button
              type="button"
              className={`${styles.filterToggleBtn} ${showCrypto ? styles.filterToggleActive : ''}`}
              onClick={() => setShowCrypto(v => !v)}
              title="Show / hide crypto movements, swaps and wallet moves"
            >
              Crypto
            </button>
            <button
              className={`${styles.filterToggleBtn} ${filterBarOpen ? styles.filterToggleOpen : ''} ${activeFilterCount > 0 ? styles.filterToggleActive : ''}`}
              onClick={toggleFilterBar}
              type="button"
            >
              {activeFilterCount > 0 ? `Filters (${activeFilterCount})` : 'Filters'}
            </button>
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
            <button
              className={styles.expandBtn}
              onClick={() => setMovementsFullscreen(v => !v)}
              title={movementsFullscreen ? 'Exit fullscreen' : 'Expand to fullscreen'}
            >{movementsFullscreen ? '✕' : '⛶'}</button>
          </div>
        </div>

        {filterBarOpen && (
          <div className={styles.filterBar}>
            <HybridFilterDropdown
              label="Type"
              options={typeOptions}
              selected={filterTypes}
              onChange={setFilterTypes}
            />
            <HybridFilterDropdown
              label="Ticker"
              options={tickerOptions}
              selected={filterTickers}
              onChange={setFilterTickers}
              disabled={tickerOptions.length === 0}
            />
            <HybridFilterDropdown
              label="Portfolio"
              options={portfolioOptions}
              selected={filterPortfolios}
              onChange={setFilterPortfolios}
              disabled={portfolioOptions.length === 0}
            />
            <HybridFilterDropdown
              label="Currency"
              options={currencyOptions}
              selected={filterCurrencies}
              onChange={setFilterCurrencies}
              disabled={currencyOptions.length === 0}
            />
            {activeFilterCount > 0 && (
              <button
                className={styles.clearFiltersBtn}
                onClick={() => { setFilterTypes([]); setFilterPortfolios([]); setFilterTickers([]); setFilterCurrencies([]) }}
                type="button"
              >Clear all</button>
            )}
          </div>
        )}

        <div className={styles.movementScrollWrap}>
          {combinedItems.length === 0 ? (
            <p className={styles.emptySection}>
              {(activeFilterCount > 0 || !showStocks || !showCrypto) ? 'No movements match the current filters.' : 'No movements yet.'}
            </p>
          ) : (
            <>
              <div className={styles.movementList}>
                {shownItems.map(item => {
                  if (item.kind === 'activity') {
                    return (
                      <AssetActivityRow
                        key={item.id}
                        activity={item.activity}
                        isExpanded={expandedMovementId === item.id}
                        onToggle={() => setExpandedMovementId(prev => prev === item.id ? null : item.id)}
                        onEdit={item.activity.type === 'swap' ? () => { requestEditActivity(item.activity); setExpandedMovementId(null) } : undefined}
                        onDelete={() => requestDeleteActivity(item.activity)}
                      />
                    )
                  }
                  const m = item.movement
                  return (
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
                        : ((m.type === 'buy' || m.type === 'sell') && m.linkedStockTransactionId)
                          ? () => { const txn = getStockTransaction(m.linkedStockTransactionId); if (txn) { setEditingStockTx(txn); setExpandedMovementId(null) } }
                          : (m.type === 'transfer-fee' && m.linkedStockTransactionId)
                            ? () => { const txn = getStockTransaction(m.linkedStockTransactionId); if (txn) { setEditingTransfer(txn); setExpandedMovementId(null) } }
                            : null
                    }
                  />
                  )
                })}
              </div>
              {hasMore && (
                <button
                  className={styles.loadMoreBtn}
                  onClick={() => setVisibleCount(v => v + 50)}
                  type="button"
                >
                  Load more ({combinedItems.length - visibleCount} remaining)
                </button>
              )}
            </>
          )}
        </div>
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

      {editingStockTx?.type === 'buy' && (
        <div className={styles.overlay}>
          <div className={styles.formDialog}>
            <BuyEditForm
              txn={editingStockTx}
              onSave={handleUpdateBuy}
              onCancel={() => setEditingStockTx(null)}
            />
          </div>
        </div>
      )}

      {editingStockTx?.type === 'sell' && (
        <div className={styles.overlay}>
          <div className={styles.formDialog}>
            <SellEditForm
              txn={editingStockTx}
              accountId={accountId}
              onSave={handleUpdateSell}
              onCancel={() => setEditingStockTx(null)}
            />
          </div>
        </div>
      )}

      {editingTransfer && (
        <div className={styles.overlay}>
          <div className={styles.formDialog}>
            <TransferEditForm
              txn={editingTransfer}
              balances={balances}
              onSave={handleUpdateTransfer}
              onCancel={() => setEditingTransfer(null)}
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

  const isCryptoTxn = stockTxn?.assetClass === 'crypto'  // SPEC-036: label crypto trades distinctly
  const typeLabel = {
    opening:             'Opening balance',
    deposit:             'Deposit',
    withdrawal:          'Withdrawal',
    'currency-exchange': movement.amount < 0 ? 'Exchange out' : 'Exchange in',
    buy:                 isCryptoTxn ? 'Crypto buy'  : 'Stock buy',
    sell:                isCryptoTxn ? 'Crypto sell' : 'Stock sell',
    dividend:            'Dividend',
    'transfer-fee':      'Transfer fee',
    'swap-fee':          'Swap fee',   // SPEC-036: crypto swap fee — standalone row (no parent buy/sell movement)
  }[movement.type] ?? movement.type

  return (
    <div className={styles.movementGroup}>
      <div
        className={`${styles.movementRow} ${isOpening ? styles.openingMovement : ''} ${!isOpening ? styles.movementRowClickable : ''}`}
        onClick={!isOpening ? onToggle : undefined}
      >
        <span className={styles.movementDate}>{movement.date}</span>
        <div className={styles.movementTypeGroup}>
          <span className={styles.movementType}>
            {typeLabel}
            {stockTxn?.legacyFeeMismatch && (
              <span className={styles.feeMismatchChip} title={`Fee currency (${stockTxn.feeCurrency}) differs from trade currency (${stockTxn.currency})`}>fee mismatch</span>
            )}
          </span>
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
          <button className={styles.movementDeleteBtn} onClick={e => { e.stopPropagation(); onDelete() }} title="Delete movement" aria-label="Delete movement">×</button>
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
        {onEdit && (
          <button className={styles.detailEditBtn} onClick={onEdit}>
            Edit {isBuy ? 'buy' : 'sell'} →
          </button>
        )}
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

  if (movement.type === 'transfer-fee' && stockTxn) {
    const destAccount = getInvestingAccount(stockTxn.destinationInvestingAccountId)
    return (
      <div className={styles.movementDetail}>
        <div className={styles.detailGrid}>
          <span className={styles.detailLabel}>Ticker</span>
          <span>{stockTxn.ticker}</span>
          <span className={styles.detailLabel}>Shares</span>
          <span>{trimDecimals(stockTxn.shares)}</span>
          <span className={styles.detailLabel}>Destination</span>
          <span>{destAccount?.name ?? stockTxn.destinationInvestingAccountId}</span>
          <span className={styles.detailLabel}>Fee</span>
          <span>{fmtAmt(Math.abs(movement.amount))} {currency}</span>
          {stockTxn.transactionExternalId && <>
            <span className={styles.detailLabel}>Txn ID</span>
            <span className={styles.detailMono}>{stockTxn.transactionExternalId}</span>
          </>}
        </div>
        {onEdit && (
          <button className={styles.detailEditBtn} onClick={onEdit}>Edit transfer →</button>
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
    if (!currency) return
    if (existingCurrencies.has(currency)) { setError(`A ${currency} balance already exists for this account.`); return }
    createCashBalance({ investingAccountId: accountId, currency, openingBalance: Number(openingBalance) })
    onSave()
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <h3 className={styles.formTitle}>New cash balance</h3>
      <div className={styles.formRow}>
        <label className={styles.formLabel}>Currency (ISO 4217)</label>
        <CurrencyDropdown
          className={styles.formInput}
          value={currency}
          onChange={v => { setCurrency(v); setError('') }}
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
  const [crossMode,          setCrossMode]          = useState('auto-exchange')  // 'auto-exchange' | 'land-in-matching'
  const [rate,               setRate]               = useState('1')
  const [fxFee,              setFxFee]              = useState('0')

  const selectedAccount = accounts.find(a => a.id === budgetingAccountId)
  const isCrossCurrency = selectedAccount && selectedAccount.currency !== balance.currency
  const exchangedAmount = Number(amount || 0) * Number(rate || 0)

  function handleSubmit(e) {
    e.preventDefault()
    if (!amount || Number(amount) <= 0 || !budgetingAccountId || !budgetingEnvelopeId) return
    if (isCrossCurrency) {
      if (crossMode === 'auto-exchange' && Number(rate) <= 0) return
      onSave({
        date,
        cashBalanceId:      balance.id,
        amount:             Number(amount),
        budgetingAccountId,
        budgetingEnvelopeId,
        crossCurrencyMode:  crossMode,
        budgetingCurrency:  selectedAccount.currency,
        exchangeRate:       Number(rate),
        fxFeeAmount:        Number(fxFee || 0),
      })
    } else {
      onSave({
        date,
        cashBalanceId:   balance.id,
        amount:          Number(amount),
        budgetingAmount: Number(amount),
        budgetingAccountId,
        budgetingEnvelopeId,
      })
    }
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
        <div className={styles.crossCurrencyBox}>
          <p className={styles.crossCurrencyLabel}>Cross-currency detected ({selectedAccount.currency} → {balance.currency})</p>
          <label className={styles.radioLabel}>
            <input type="radio" name="crossMode" value="auto-exchange" checked={crossMode === 'auto-exchange'} onChange={() => setCrossMode('auto-exchange')} />
            {' '}Auto-exchange at rate — land in {selectedAccount.currency} balance, then exchange to {balance.currency}
          </label>
          {crossMode === 'auto-exchange' && (
            <>
              <div className={styles.formRow}>
                <label className={styles.formLabel}>Rate (1 {selectedAccount.currency} = ? {balance.currency})</label>
                <input className={styles.formInput} type="number" min="0.000001" step="any" value={rate} onChange={e => setRate(e.target.value)} />
              </div>
              <div className={styles.formRow}>
                <label className={styles.formLabel}>FX fee ({selectedAccount.currency}, optional)</label>
                <input className={styles.formInput} type="number" min="0" step="0.01" value={fxFee} onChange={e => setFxFee(e.target.value)} />
              </div>
              {exchangedAmount > 0 && (
                <p className={styles.ratePreview}>→ {fmtAmt(exchangedAmount)} {balance.currency} credited</p>
              )}
            </>
          )}
          <label className={styles.radioLabel}>
            <input type="radio" name="crossMode" value="land-in-matching" checked={crossMode === 'land-in-matching'} onChange={() => setCrossMode('land-in-matching')} />
            {' '}Land in {selectedAccount.currency} balance; exchange to {balance.currency} later
          </label>
        </div>
      )}
      <div className={styles.formActions}>
        <button type="button" className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
        <button
          type="submit"
          className={styles.saveBtn}
          disabled={!amount || Number(amount) <= 0 || (isCrossCurrency && crossMode === 'auto-exchange' && Number(rate) <= 0)}
        >
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
  const [crossMode,          setCrossMode]           = useState('auto-exchange')  // 'auto-exchange' | 'land-in-matching'
  const [rate,               setRate]                = useState('1')
  const [fxFee,              setFxFee]               = useState('0')

  const selectedAccount  = accounts.find(a => a.id === budgetingAccountId)
  const isCrossCurrency  = selectedAccount && selectedAccount.currency !== balance.currency
  const convertedAmount  = Number(amount || 0) * Number(rate || 0)  // balance.currency → budgeting currency

  function handleSubmit(e) {
    e.preventDefault()
    if (!amount || Number(amount) <= 0 || !budgetingAccountId || !budgetingEnvelopeId) return
    if (isCrossCurrency) {
      if (Number(rate) <= 0) return
      onSave({
        date,
        cashBalanceId:      balance.id,
        amount:             Number(amount),
        budgetingAccountId,
        budgetingEnvelopeId,
        crossCurrencyMode:  crossMode,
        budgetingCurrency:  selectedAccount.currency,
        exchangeRate:       Number(rate),
        fxFeeAmount:        Number(fxFee || 0),
      })
    } else {
      onSave({
        date,
        cashBalanceId:   balance.id,
        amount:          Number(amount),
        budgetingAmount: Number(amount),
        budgetingAccountId,
        budgetingEnvelopeId,
      })
    }
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
        <div className={styles.crossCurrencyBox}>
          <p className={styles.crossCurrencyLabel}>Cross-currency detected ({balance.currency} → {selectedAccount.currency})</p>
          <label className={styles.radioLabel}>
            <input type="radio" name="crossWithdrawMode" value="auto-exchange" checked={crossMode === 'auto-exchange'} onChange={() => setCrossMode('auto-exchange')} />
            {' '}Auto-exchange and withdraw — exchange {balance.currency} to {selectedAccount.currency}, then withdraw to account
          </label>
          <label className={styles.radioLabel}>
            <input type="radio" name="crossWithdrawMode" value="land-in-matching" checked={crossMode === 'land-in-matching'} onChange={() => setCrossMode('land-in-matching')} />
            {' '}Exchange to {selectedAccount.currency} balance only; I will withdraw it separately
          </label>
          <div className={styles.formRow}>
            <label className={styles.formLabel}>Rate (1 {balance.currency} = ? {selectedAccount.currency})</label>
            <input className={styles.formInput} type="number" min="0.000001" step="any" value={rate} onChange={e => setRate(e.target.value)} />
          </div>
          <div className={styles.formRow}>
            <label className={styles.formLabel}>FX fee ({balance.currency}, optional)</label>
            <input className={styles.formInput} type="number" min="0" step="0.01" value={fxFee} onChange={e => setFxFee(e.target.value)} />
          </div>
          {convertedAmount > 0 && crossMode === 'auto-exchange' && (
            <p className={styles.ratePreview}>→ {fmtAmt(convertedAmount)} {selectedAccount.currency} credited to account</p>
          )}
          {convertedAmount > 0 && crossMode === 'land-in-matching' && (
            <p className={styles.ratePreview}>→ {fmtAmt(convertedAmount)} {selectedAccount.currency} to cash balance</p>
          )}
        </div>
      )}
      <div className={styles.formActions}>
        <button type="button" className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
        <button type="submit" className={styles.saveBtn} disabled={!amount || Number(amount) <= 0 || (isCrossCurrency && Number(rate) <= 0)}>
          {isCrossCurrency && crossMode === 'land-in-matching' ? 'Exchange' : 'Withdraw'}
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

  const triggeredBuy = initial?.triggeredByStockTransactionId
    ? getStockTransaction(initial.triggeredByStockTransactionId)
    : null

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <h3 className={styles.formTitle}>{initial ? 'Edit currency exchange' : 'Currency exchange'}</h3>
      {triggeredBuy && (
        <p className={styles.formSubtitle}>
          This exchange was triggered by a buy of {triggeredBuy.ticker} on {triggeredBuy.date}. Editing the rate changes how much {sourceBal?.currency} was used to fund that buy.
        </p>
      )}
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

function BuyForm({ balances, onSave, onCancel, initialTicker = '', tickerLocked = false }) {
  const [date,            setDate]            = useState(today)
  const [ticker,          setTicker]          = useState(initialTicker.toUpperCase())
  const [stockExchange,   setStockExchange]   = useState(() => {
    if (initialTicker) { const p = getStockProfile(initialTicker.toUpperCase()); return p?.stockExchange ?? '' }
    return ''
  })
  const [shares,          setShares]          = useState('')
  const [price,           setPrice]           = useState('')
  const [currency,        setCurrency]        = useState(() => {
    if (initialTicker) {
      const t = initialTicker.toUpperCase()
      const prevBuys = getStockTransactionsByTicker(t).filter(tx => tx.type === 'buy')
      if (prevBuys.length > 0) return prevBuys[prevBuys.length - 1].currency
      const p = getStockProfile(t)
      if (p?.currency) return p.currency
    }
    return balances[0]?.currency ?? 'USD'
  })
  const [fee,             setFee]             = useState('0')
  const [extId,           setExtId]           = useState('')
  const [resolving,       setResolving]       = useState(false)
  // null = unresolved; { name, stockExchange, currency } = profile known (show summary card)
  const [resolvedProfile, setResolvedProfile] = useState(() => {
    if (!initialTicker) return null
    const t = initialTicker.toUpperCase()
    const p = getStockProfile(t)
    return p?.name ? { name: p.name, stockExchange: p.stockExchange, currency: p.currency } : null
  })

  const [sourceBalanceId, setSourceBalanceId] = useState(() => {
    const matchingBal = balances.find(b => b.currency === (balances[0]?.currency ?? 'USD'))
    return matchingBal?.id ?? balances[0]?.id ?? ''
  })
  const [fxRate,          setFxRate]          = useState('1')
  const [fxFee,           setFxFee]           = useState('0')

  const sourceBal     = balances.find(b => b.id === sourceBalanceId)
  const isCrossSource = sourceBal && sourceBal.currency !== currency
  const total         = Number(shares || 0) * Number(price || 0) + Number(fee || 0)
  const fxSourceAmount = isCrossSource && Number(fxRate) > 0 ? total / Number(fxRate) : 0
  const canSave = ticker.trim() && Number(shares) > 0 && Number(price) > 0 && currency.trim() && (!isCrossSource || Number(fxRate) > 0)

  function handleTickerBlur() {
    const t = ticker.trim().toUpperCase()
    if (!t) return
    const profile = getStockProfile(t)
    if (!profile?.name) {
      setResolving(true)
    } else {
      setResolvedProfile({ name: profile.name, stockExchange: profile.stockExchange, currency: profile.currency })
      const prevBuys = getStockTransactionsByTicker(t).filter(tx => tx.type === 'buy')
      if (prevBuys.length > 0) setCurrency(prevBuys[prevBuys.length - 1].currency)
      else if (profile.currency) setCurrency(profile.currency)
    }
  }

  function handleResolved(candidate) {
    setResolving(false)
    setResolvedProfile({ name: candidate.name, stockExchange: candidate.stockExchange, currency: candidate.currency })
    if (!stockExchange.trim() && candidate.stockExchange) setStockExchange(candidate.stockExchange)
    if (candidate.currency) setCurrency(candidate.currency)
  }

  // Keep sourceBalanceId in sync when currency changes.
  function handleCurrencyChange(c) {
    setCurrency(c)
    const matching = balances.find(b => b.currency === c)
    if (matching) setSourceBalanceId(matching.id)
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!canSave) return
    onSave({
      date, ticker, stockExchange: stockExchange.trim() || null, shares: Number(shares), price: Number(price), currency,
      fee: Number(fee || 0), transactionExternalId: extId.trim() || null,
      sourceCashBalanceId: isCrossSource ? sourceBalanceId : null,
      fxExchangeRate: isCrossSource ? Number(fxRate) : null,
      fxSourceAmount: isCrossSource ? fxSourceAmount : null,
      fxFeeAmount: isCrossSource ? Number(fxFee || 0) : null,
    })
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
          {tickerLocked ? (
            <span className={styles.lockedFieldValue}>{ticker}</span>
          ) : (
          <div className={styles.tickerInputRow}>
            <input
              className={styles.formInput}
              value={ticker}
              onChange={e => { setTicker(e.target.value.toUpperCase()); setResolvedProfile(null) }}
              onBlur={handleTickerBlur}
              placeholder="AAPL"
              autoFocus
            />
            {ticker.trim() && !resolvedProfile && (
              <button type="button" className={styles.lookupBtn} onClick={() => setResolving(true)} title="Look up company name">
                Look up
              </button>
            )}
          </div>
          )}
          {resolvedProfile && (
            <div className={styles.profileCard}>
              <span className={styles.profileCardText}>
                {resolvedProfile.name}
                {resolvedProfile.stockExchange ? ` · ${resolvedProfile.stockExchange}` : ''}
                {resolvedProfile.currency ? ` · ${resolvedProfile.currency}` : ''}
              </span>
              <button type="button" className={styles.relookupBtn} onClick={() => setResolving(true)}>
                Re-look up
              </button>
            </div>
          )}
          {getStockProfile(ticker.trim().toUpperCase())?.isManual === true && (
            <span className={styles.manualStockChip} title="No API data — prices are entered manually">Manual stock</span>
          )}
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
          <CurrencyDropdown className={styles.formInput} value={currency} onChange={handleCurrencyChange} />
        </div>
        <div className={styles.formRow}>
          <label className={styles.formLabel}>Fee ({currency})</label>
          <input className={styles.formInput} type="number" min="0" step="0.01" value={fee} onChange={e => setFee(e.target.value)} />
        </div>
        {balances.length > 0 && (
          <div className={styles.formRow}>
            <label className={styles.formLabel}>Pay from</label>
            <select className={styles.formSelect} value={sourceBalanceId} onChange={e => setSourceBalanceId(e.target.value)}>
              {balances.map(b => (
                <option key={b.id} value={b.id}>{b.currency} ({fmtAmt(getCurrentBalance(b.id))} available)</option>
              ))}
            </select>
          </div>
        )}
        {isCrossSource && (
          <div className={styles.crossCurrencyBox}>
            <p className={styles.crossCurrencyLabel}>Currency exchange required — {sourceBal.currency} → {currency}</p>
            <p className={styles.ratePreview}>Need: {fmtAmt(total)} {currency}</p>
            <div className={styles.formRow}>
              <label className={styles.formLabel}>Rate (1 {sourceBal.currency} = ? {currency})</label>
              <input className={styles.formInput} type="number" min="0.000001" step="any" value={fxRate} onChange={e => setFxRate(e.target.value)} />
            </div>
            {fxSourceAmount > 0 && <p className={styles.ratePreview}>Source amount: {fmtAmt(fxSourceAmount)} {sourceBal.currency}</p>}
            <div className={styles.formRow}>
              <label className={styles.formLabel}>FX fee ({sourceBal.currency}, optional)</label>
              <input className={styles.formInput} type="number" min="0" step="0.01" value={fxFee} onChange={e => setFxFee(e.target.value)} />
            </div>
          </div>
        )}
        <div className={styles.formRow}>
          <label className={styles.formLabel}>Transaction ID (optional)</label>
          <input className={styles.formInput} value={extId} onChange={e => setExtId(e.target.value)} placeholder="Broker reference" />
        </div>
        {total > 0 && !isCrossSource && <p className={styles.ratePreview}>Total cost: {fmtAmt(total)} {currency}</p>}
        <div className={styles.formActions}>
          <button type="button" className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
          <button type="submit" className={styles.saveBtn} disabled={!canSave}>{isCrossSource ? 'Save buy + exchange' : 'Buy'}</button>
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

// Returns the ISO date one calendar day before `iso` (used to look up shares held
// on the day before ex-dividend, i.e. the broker's holder-of-record cutoff).
function dateMinusOneDay(iso) {
  if (!iso) return null
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() - 1)
  return d.toISOString().slice(0, 10)
}

function sharesHeldOn(accountId, ticker, asOfDate) {
  if (!accountId || !ticker || ticker === '__other__' || !asOfDate) return 0
  return getOpenLots(accountId, ticker, asOfDate).reduce((s, l) => s + l.remainingShares, 0)
}

function DividendForm({ accountId, positions, defaultTicker, onSave, onCancel, tickerLocked = false }) {
  const initTicker = defaultTicker ?? (positions[0]?.ticker ?? '')
  const initPos    = positions.find(p => p.ticker === initTicker)
  const initTaxPct = resolveDividendTaxPercent(initTicker)
  const initLookup = dateMinusOneDay(today())
  const initShares = sharesHeldOn(accountId, initTicker, initLookup)

  const [exDividendDate,   setExDividendDate]   = useState(today)
  const [payoutDate,       setPayoutDate]       = useState(today)
  const [ticker,           setTicker]           = useState(initTicker)
  const [customTicker,     setCustomTicker]     = useState('')
  const [currency,         setCurrency]         = useState(initPos?.currency ?? 'USD')
  const [dividendType,     setDividendType]     = useState('regular')
  const [dividendPerShare, setDividendPerShare] = useState('')
  const [shareCount,       setShareCount]       = useState(initShares > 0 ? trimDecimals(initShares) : '')
  const [autoFilledFromDate, setAutoFilledFromDate] = useState(initShares > 0 ? initLookup : null)
  const [taxPctStr,        setTaxPctStr]        = useState(String(initTaxPct))
  const [taxAmtStr,        setTaxAmtStr]        = useState('')
  const [taxMode,          setTaxMode]          = useState('pct')  // 'pct' | 'amt'

  const isOther   = ticker === '__other__'
  const finalTicker = isOther ? customTicker.trim().toUpperCase() : ticker
  const lookupDate = dateMinusOneDay(exDividendDate)
  const sharesAsOf = sharesHeldOn(accountId, finalTicker, lookupDate)
  // Warning shows once the user has a real ticker and date but the lot history says zero shares on that date.
  const showNoSharesWarning = !!finalTicker && finalTicker !== '__other__' && !!lookupDate && sharesAsOf === 0

  // Re-fill shareCount when the lookup target changes (ticker or exDividendDate).
  // Any manual edit clears autoFilledFromDate; the next ticker/date change overrides
  // the manual value (matching the spec: changing the ex-dividend date re-triggers auto-fill).
  useEffect(() => {
    if (!finalTicker || finalTicker === '__other__' || !lookupDate) {
      setAutoFilledFromDate(null)
      return
    }
    const newSc = sharesAsOf > 0 ? trimDecimals(sharesAsOf) : ''
    setShareCount(newSc)
    setAutoFilledFromDate(sharesAsOf > 0 ? lookupDate : null)
    if (taxMode === 'pct') syncTaxAmt(taxPctStr, dividendPerShare, newSc)
    else syncTaxPct(taxAmtStr, dividendPerShare, newSc)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finalTicker, lookupDate, accountId])

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
      if (pos) setCurrency(pos.currency)
      const newPct = resolveDividendTaxPercent(t)
      setTaxPctStr(String(newPct))
      setTaxMode('pct')
      // shareCount is re-filled by the auto-fill effect; tax sync happens there too.
    }
  }

  function handlePpsChange(v) {
    setDividendPerShare(v)
    if (taxMode === 'pct') syncTaxAmt(taxPctStr, v, shareCount)
    else syncTaxPct(taxAmtStr, v, shareCount)
  }

  function handleShareCountChange(v) {
    setShareCount(v)
    setAutoFilledFromDate(null)
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

  const canSave = finalTicker && currency && Number(dividendPerShare) > 0 && Number(shareCount) > 0 && payoutDate

  function handleSubmit(e) {
    e.preventDefault()
    if (!canSave) return
    const taxPercent = taxMode === 'amt' && tbt > 0
      ? (parseFloat(taxAmtStr || '0') / tbt * 100)
      : parseFloat(taxPctStr || '0')
    onSave({
      investingAccountId: accountId,
      ticker: finalTicker,
      currency,
      exDividendDate,
      payoutDate,
      dividendPerShare: Number(dividendPerShare),
      shareCount: Number(shareCount),
      taxPercent,
      type: dividendType,
    })
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <h3 className={styles.formTitle}>New dividend{finalTicker ? ` — ${finalTicker}` : ''}</h3>

      {/* Ticker + Currency on one row */}
      <div className={styles.formPairRow}>
        <div className={styles.formRow} style={{ flex: 2, minWidth: 0 }}>
          <label className={styles.formLabel}>Ticker</label>
          {tickerLocked ? (
            <span className={styles.lockedFieldValue}>{initTicker}</span>
          ) : positions.length > 0 ? (
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
          <CurrencyDropdown className={styles.formInput} value={currency} onChange={setCurrency} />
        </div>
      </div>

      {getStockProfile(finalTicker)?.isManual === true && (
        <span className={styles.manualStockChip} title="No API data — prices are entered manually">Manual stock</span>
      )}

      {isOther && (
        <div className={styles.formRow}>
          <label className={styles.formLabel}>Ticker symbol</label>
          <input className={styles.formInput} value={customTicker} onChange={e => setCustomTicker(e.target.value.toUpperCase())} placeholder="AAPL" autoFocus />
        </div>
      )}

      <div className={styles.formRow}>
        <label className={styles.formLabel}>Type</label>
        <select className={styles.formSelect} value={dividendType} onChange={e => setDividendType(e.target.value)}>
          <option value="regular">Regular</option>
          <option value="special">Special</option>
        </select>
      </div>

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
          {autoFilledFromDate && (
            <p className={styles.shareAutoHint}>Auto-filled from lots on {autoFilledFromDate}</p>
          )}
          {showNoSharesWarning && (
            <p className={styles.shareWarnChip}>No shares held on {lookupDate}</p>
          )}
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

// ─── Crypto coin picker (SPEC-036 / D8) ──────────────────────────────────────
// Search CoinGecko for a symbol/name, show ranked candidates with the top
// (highest-market-cap) pre-selected, let the user confirm or change it.
// `value` / onChange carry { coinId, symbol, name } | null.
function CoinSearchPicker({ value, onChange }) {
  const [query,      setQuery]      = useState('')
  const [candidates, setCandidates] = useState([])
  const [searching,  setSearching]  = useState(false)
  const [error,      setError]      = useState('')
  const [listOpen,   setListOpen]   = useState(true)

  async function runSearch() {
    const q = query.trim()
    if (!q) return
    setSearching(true); setError('')
    try {
      const results = await searchCryptoCoins(q)
      setCandidates(results)
      setListOpen(true)
      if (results.length > 0) {
        const top = results[0]
        onChange({ coinId: top.coinId, symbol: top.symbol, name: top.name })
      } else {
        onChange(null)
        setError('No coins found for that symbol or name.')
      }
    } catch {
      setError('Coin search failed — check your connection.')
    } finally {
      setSearching(false)
    }
  }

  return (
    <div className={styles.formRow}>
      <label className={styles.formLabel}>Coin</label>
      <div className={styles.tickerInputRow}>
        <input
          className={styles.formInput}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); runSearch() } }}
          placeholder="BTC or Bitcoin"
          autoFocus
        />
        <button type="button" className={styles.lookupBtn} onClick={runSearch} disabled={!query.trim() || searching}>
          {searching ? '…' : 'Search'}
        </button>
      </div>
      {error && <span className={styles.manualStockChip}>{error}</span>}
      {candidates.length > 0 && (
        <div style={{ margin: '6px 0' }}>
          <button
            type="button"
            onClick={() => setListOpen(o => !o)}
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', opacity: 0.8, fontSize: '0.85em', padding: 0 }}
          >
            {listOpen ? '▾' : '▸'} {candidates.length} match{candidates.length === 1 ? '' : 'es'}
          </button>
          {listOpen && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 4, maxHeight: 220, overflowY: 'auto' }}>
              {candidates.slice(0, 8).map(c => (
                <label
                  key={c.coinId}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '4px 6px', borderRadius: 4 }}
                >
                  <input
                    type="radio"
                    name="cryptoCoin"
                    checked={value?.coinId === c.coinId}
                    onChange={() => { onChange({ coinId: c.coinId, symbol: c.symbol, name: c.name }); setListOpen(false) }}
                  />
                  <span>{c.name} <span style={{ opacity: 0.6 }}>({c.symbol}){c.marketCapRank ? ` · #${c.marketCapRank}` : ''}</span></span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}
      {value && (
        <div className={styles.profileCard}>
          <span className={styles.profileCardText}>Selected: {value.name} ({value.symbol})</span>
        </div>
      )}
    </div>
  )
}

// ─── Crypto buy form (SPEC-036) ───────────────────────────────────────────────
// Mirrors BuyForm (same cash-balance + cross-currency FX param shape, reused by
// handleBuy) but with a coin picker instead of stock resolution and a wallet
// label instead of an exchange. Persists the chosen symbol→coin mapping.
function CryptoBuyForm({ balances, onSave, onCancel }) {
  const [date,     setDate]     = useState(today)
  const [coin,     setCoin]     = useState(null)   // { coinId, symbol, name } | null
  const [wallet,   setWallet]   = useState('')
  const [quantity, setQuantity] = useState('')
  const [price,    setPrice]    = useState('')
  const [currency, setCurrency] = useState(() => balances[0]?.currency ?? 'USD')
  const [fee,      setFee]      = useState('0')

  const [sourceBalanceId, setSourceBalanceId] = useState(() => {
    const match = balances.find(b => b.currency === (balances[0]?.currency ?? 'USD'))
    return match?.id ?? balances[0]?.id ?? ''
  })
  const [fxRate, setFxRate] = useState('1')
  const [fxFee,  setFxFee]  = useState('0')

  const sourceBal      = balances.find(b => b.id === sourceBalanceId)
  const isCrossSource  = sourceBal && sourceBal.currency !== currency
  const total          = Number(quantity || 0) * Number(price || 0) + Number(fee || 0)
  const fxSourceAmount = isCrossSource && Number(fxRate) > 0 ? total / Number(fxRate) : 0
  const canSave        = !!coin && Number(quantity) > 0 && Number(price) > 0 && currency.trim() && (!isCrossSource || Number(fxRate) > 0)

  function handleCurrencyChange(c) {
    setCurrency(c)
    const match = balances.find(b => b.currency === c)
    if (match) setSourceBalanceId(match.id)
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!canSave) return
    // Persist the symbol→coin mapping so pricing uses the exact coin (D8).
    setCryptoCoin(coin.symbol, { coinId: coin.coinId, name: coin.name })
    onSave({
      assetClass: 'crypto',
      date,
      ticker: coin.symbol,
      wallet: wallet.trim() || null,
      stockExchange: null,
      shares: Number(quantity),
      price: Number(price),
      currency,
      fee: Number(fee || 0),
      transactionExternalId: null,
      sourceCashBalanceId: isCrossSource ? sourceBalanceId : null,
      fxExchangeRate: isCrossSource ? Number(fxRate) : null,
      fxSourceAmount:  isCrossSource ? fxSourceAmount : null,
      fxFeeAmount:     isCrossSource ? Number(fxFee || 0) : null,
    })
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <h3 className={styles.formTitle}>Buy crypto</h3>
      <div className={styles.formRow}>
        <label className={styles.formLabel}>Date</label>
        <input className={styles.formInput} type="date" value={date} onChange={e => setDate(e.target.value)} />
      </div>
      <CoinSearchPicker value={coin} onChange={setCoin} />
      <div className={styles.formRow}>
        <label className={styles.formLabel}>Wallet (optional)</label>
        <input className={styles.formInput} value={wallet} onChange={e => setWallet(e.target.value)} placeholder="cold-storage / ledger / exchange" />
      </div>
      <div className={styles.formRow}>
        <label className={styles.formLabel}>Quantity</label>
        <input className={styles.formInput} type="number" min="0.00000001" step="any" value={quantity} onChange={e => setQuantity(e.target.value)} placeholder="0.05" />
      </div>
      <div className={styles.formRow}>
        <label className={styles.formLabel}>Price per coin</label>
        <input className={styles.formInput} type="number" min="0.00000001" step="any" value={price} onChange={e => setPrice(e.target.value)} placeholder="64000" />
      </div>
      <div className={styles.formRow}>
        <label className={styles.formLabel}>Currency</label>
        <CurrencyDropdown className={styles.formInput} value={currency} onChange={handleCurrencyChange} />
      </div>
      <div className={styles.formRow}>
        <label className={styles.formLabel}>Fee ({currency})</label>
        <input className={styles.formInput} type="number" min="0" step="0.01" value={fee} onChange={e => setFee(e.target.value)} />
      </div>
      {balances.length > 0 && (
        <div className={styles.formRow}>
          <label className={styles.formLabel}>Pay from</label>
          <select className={styles.formSelect} value={sourceBalanceId} onChange={e => setSourceBalanceId(e.target.value)}>
            {balances.map(b => (
              <option key={b.id} value={b.id}>{b.currency} ({fmtAmt(getCurrentBalance(b.id))} available)</option>
            ))}
          </select>
        </div>
      )}
      {isCrossSource && (
        <div className={styles.crossCurrencyBox}>
          <p className={styles.crossCurrencyLabel}>Currency exchange required — {sourceBal.currency} → {currency}</p>
          <p className={styles.ratePreview}>Need: {fmtAmt(total)} {currency}</p>
          <div className={styles.formRow}>
            <label className={styles.formLabel}>Rate (1 {sourceBal.currency} = ? {currency})</label>
            <input className={styles.formInput} type="number" min="0.000001" step="any" value={fxRate} onChange={e => setFxRate(e.target.value)} />
          </div>
          <p className={styles.ratePreview}>Pay: {fmtAmt(fxSourceAmount)} {sourceBal.currency}</p>
          <div className={styles.formRow}>
            <label className={styles.formLabel}>Exchange fee ({sourceBal.currency})</label>
            <input className={styles.formInput} type="number" min="0" step="0.01" value={fxFee} onChange={e => setFxFee(e.target.value)} />
          </div>
        </div>
      )}
      <div className={styles.formActions}>
        <button type="button" className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
        <button type="submit" className={styles.saveBtn} disabled={!canSave}>Buy</button>
      </div>
    </form>
  )
}

// ─── Crypto sell form (SPEC-036) ──────────────────────────────────────────────
// Coin is fixed (from the holdings row). FIFO lot selection is the createSell
// default (scoped to crypto lots). Proceeds land in the trade-currency cash
// balance. Reuses handleSell; cross-currency proceeds are a later enhancement.
function CryptoSellForm({ position, balances, onSave, onCancel }) {
  const [date,     setDate]     = useState(today)
  const [quantity, setQuantity] = useState('')
  const [price,    setPrice]    = useState('')
  const [fee,      setFee]      = useState('0')

  const currency  = position.currency
  const available = position.shares
  const qtyNum    = Number(quantity)
  const overSell  = qtyNum > available + 1e-9
  const canSave   = qtyNum > 0 && !overSell && Number(price) > 0
  const hasTradeBal = balances.some(b => b.currency === currency)

  function handleSubmit(e) {
    e.preventDefault()
    if (!canSave) return
    onSave({
      assetClass: 'crypto',
      date,
      ticker: position.ticker,
      shares: qtyNum,
      price: Number(price),
      currency,
      fee: Number(fee || 0),
    })
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <h3 className={styles.formTitle}>Sell {position.ticker}</h3>
      <div className={styles.formRow}>
        <label className={styles.formLabel}>Date</label>
        <input className={styles.formInput} type="date" value={date} onChange={e => setDate(e.target.value)} />
      </div>
      <div className={styles.formRow}>
        <label className={styles.formLabel}>Quantity</label>
        <input className={styles.formInput} type="number" min="0.00000001" step="any" value={quantity} onChange={e => setQuantity(e.target.value)} placeholder={trimDecimals(available)} autoFocus />
        <p className={styles.ratePreview}>Held: {trimDecimals(available)} {position.ticker}</p>
        {overSell && <span className={styles.shareWarnChip}>Quantity exceeds the {trimDecimals(available)} you hold.</span>}
      </div>
      <div className={styles.formRow}>
        <label className={styles.formLabel}>Price per coin ({currency})</label>
        <input className={styles.formInput} type="number" min="0.00000001" step="any" value={price} onChange={e => setPrice(e.target.value)} placeholder="64000" />
      </div>
      <div className={styles.formRow}>
        <label className={styles.formLabel}>Fee ({currency})</label>
        <input className={styles.formInput} type="number" min="0" step="0.01" value={fee} onChange={e => setFee(e.target.value)} />
      </div>
      <p className={styles.formSubtitle}>Proceeds land in your {currency} cash balance{hasTradeBal ? '' : ' (it will be created)'}.</p>
      <div className={styles.formActions}>
        <button type="button" className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
        <button type="submit" className={styles.saveBtn} disabled={!canSave}>Sell</button>
      </div>
    </form>
  )
}

// ─── Crypto swap form (SPEC-036, D2) ──────────────────────────────────────────
// Disposes some of a held coin (FROM, fixed) for another coin (TO, searched).
// Auto-fetches both coins' live prices (editable — fall back to last/edited price
// if a fetch fails) to show the implied vs market exchange rate and the swap P/L,
// and stores both prices on the record. One atomic createSwap; no fiat moves
// except an optional fee. The disposal value (fromQty × fromPrice) sets the
// realised P/L and the acquired coin's cost basis.
function CryptoSwapForm({ position, cryptoTickers = [], initial = null, onSave, onCancel }) {
  const isEdit         = !!initial
  const currency       = position.currency
  const available      = position.shares
  const feeCoinOptions = [...new Set([position.ticker, ...cryptoTickers])]  // held coins; FROM first

  const [date,             setDate]             = useState(initial?.date ?? today)
  const [fromQty,          setFromQty]          = useState(initial?.fromQty ?? '')
  const [toCoin,           setToCoin]           = useState(initial?.toCoin ?? null)
  const [toQty,            setToQty]            = useState(initial?.toQty ?? '')
  const [fromPrice,        setFromPrice]        = useState(initial?.fromPrice ?? '')
  const [toPrice,          setToPrice]          = useState(initial?.toPrice ?? '')
  const [fromPriceLoading, setFromPriceLoading] = useState(false)
  const [toPriceLoading,   setToPriceLoading]   = useState(false)
  const [fee,              setFee]              = useState(initial?.fee ?? '0')
  const [feeCoin,          setFeeCoin]          = useState(initial?.feeCoin ?? position.ticker)

  // Live price of the held (FROM) coin — coinId from cryptoProfiles. Only fills an EMPTY field,
  // so a seeded (edit) or user-edited price is never clobbered.
  useEffect(() => {
    let cancelled = false
    setFromPriceLoading(true)
    getCryptoPrice(position.ticker, currency, getCoinId(position.ticker))
      .then(r => { if (!cancelled && r?.price != null) setFromPrice(prev => prev === '' ? String(r.price) : prev) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setFromPriceLoading(false) })
    return () => { cancelled = true }
  }, [position.ticker, currency])

  // Live price of the acquired (TO) coin whenever the selection changes (fills only when empty).
  useEffect(() => {
    if (!toCoin) { setToPrice(''); return }
    let cancelled = false
    setToPriceLoading(true)
    getCryptoPrice(toCoin.symbol, currency, toCoin.coinId)
      .then(r => { if (!cancelled && r?.price != null) setToPrice(prev => prev === '' ? String(r.price) : prev) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setToPriceLoading(false) })
    return () => { cancelled = true }
  }, [toCoin, currency])

  const fromNum     = Number(fromQty)
  const toNum       = Number(toQty)
  const fromP       = Number(fromPrice)
  const toP         = Number(toPrice)
  const overFrom    = fromNum > available + 1e-9
  const sameCoin    = toCoin && toCoin.symbol === position.ticker
  const given       = fromNum > 0 && fromP > 0 ? fromNum * fromP : null   // market value disposed
  const received    = toNum > 0 && toP > 0 ? toNum * toP : null           // market value acquired
  const impliedRate = fromNum > 0 && toNum > 0 ? toNum / fromNum : null   // TO per 1 FROM (your swap)
  const marketRate  = fromP > 0 && toP > 0 ? fromP / toP : null           // TO per 1 FROM at market
  const swapPL      = given != null && received != null ? received - given : null
  const swapPLpct   = swapPL != null && given > 0 ? (swapPL / given) * 100 : null
  const canSave     = fromNum > 0 && !overFrom && !!toCoin && !sameCoin && toNum > 0 && fromP > 0

  function handleSubmit(e) {
    e.preventDefault()
    if (!canSave) return
    setCryptoCoin(toCoin.symbol, { coinId: toCoin.coinId, name: toCoin.name })
    onSave({
      date,
      fromTicker: position.ticker,
      fromQuantity: fromNum,
      toTicker: toCoin.symbol,
      toQuantity: toNum,
      spotValue: given,                 // disposal value → realised P/L + TO cost basis
      fromPrice: fromP,
      toPrice: toP > 0 ? toP : null,
      currency,
      fee: Number(fee || 0),            // crypto fee QUANTITY, in feeCoin
      feeCoin: Number(fee) > 0 ? feeCoin : null,
    })
  }

  const plColor = swapPL != null ? (swapPL >= 0 ? '#4ade80' : '#f87171') : undefined

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <h3 className={styles.formTitle}>{isEdit ? 'Edit swap' : 'Swap'} {position.ticker}</h3>
      {isEdit && <p className={styles.formSubtitle}>Saving replaces the original swap record.</p>}
      <div className={styles.formRow}>
        <label className={styles.formLabel}>Date</label>
        <input className={styles.formInput} type="date" value={date} onChange={e => setDate(e.target.value)} />
      </div>
      <div className={styles.formRow}>
        <label className={styles.formLabel}>From — {position.ticker} quantity</label>
        <input className={styles.formInput} type="number" min="0.00000001" step="any" value={fromQty} onChange={e => setFromQty(e.target.value)} placeholder={trimDecimals(available)} autoFocus />
        <p className={styles.ratePreview}>Held: {trimDecimals(available)} {position.ticker}</p>
        {overFrom && <span className={styles.shareWarnChip}>Exceeds the {trimDecimals(available)} you hold.</span>}
      </div>
      <p className={styles.formSubtitle}>To — acquired coin</p>
      <CoinSearchPicker value={toCoin} onChange={setToCoin} />
      {sameCoin && <span className={styles.shareWarnChip}>Pick a different coin than {position.ticker}.</span>}
      <div className={styles.formRow}>
        <label className={styles.formLabel}>To quantity{toCoin ? ` — ${toCoin.symbol}` : ''}</label>
        <input className={styles.formInput} type="number" min="0.00000001" step="any" value={toQty} onChange={e => setToQty(e.target.value)} placeholder="8" />
      </div>

      {/* Live prices (editable — last/edited value is kept if a fetch fails). */}
      <div className={styles.formPairRow}>
        <div className={styles.formRow} style={{ flex: 1, minWidth: 0 }}>
          <label className={styles.formLabel}>{position.ticker} price ({currency}){fromPriceLoading ? ' …' : ''}</label>
          <input className={styles.formInput} type="number" min="0" step="any" value={fromPrice} onChange={e => setFromPrice(e.target.value)} placeholder="60000" />
        </div>
        <div className={styles.formRow} style={{ flex: 1, minWidth: 0 }}>
          <label className={styles.formLabel}>{toCoin ? toCoin.symbol : 'To'} price ({currency}){toPriceLoading ? ' …' : ''}</label>
          <input className={styles.formInput} type="number" min="0" step="any" value={toPrice} onChange={e => setToPrice(e.target.value)} placeholder="0.60" />
        </div>
      </div>

      {(impliedRate != null || given != null) && (
        <div className={styles.crossCurrencyBox}>
          {impliedRate != null && toCoin && (
            <p className={styles.ratePreview}>Your rate: 1 {position.ticker} = {trimDecimals(impliedRate)} {toCoin.symbol}</p>
          )}
          {marketRate != null && toCoin && (
            <p className={styles.ratePreview}>Market rate: 1 {position.ticker} = {trimDecimals(marketRate)} {toCoin.symbol}</p>
          )}
          {given != null && (
            <p className={styles.ratePreview}>Value given: {fmtAmt(given)} {currency}{received != null ? ` · received: ${fmtAmt(received)} ${currency}` : ''}</p>
          )}
          {swapPL != null && (
            <p className={styles.ratePreview} style={{ color: plColor }}>
              Swap P/L: {swapPL >= 0 ? '+' : '−'}{fmtAmt(Math.abs(swapPL))} {currency}{swapPLpct != null ? ` (${swapPLpct >= 0 ? '+' : ''}${swapPLpct.toFixed(2)}%)` : ''}
            </p>
          )}
        </div>
      )}

      <div className={styles.formPairRow}>
        <div className={styles.formRow} style={{ flex: 1, minWidth: 0 }}>
          <label className={styles.formLabel}>Fee quantity (crypto)</label>
          <input className={styles.formInput} type="number" min="0" step="any" value={fee} onChange={e => setFee(e.target.value)} placeholder="0" />
        </div>
        {Number(fee) > 0 && (
          <div className={styles.formRow} style={{ flex: 1, minWidth: 0 }}>
            <label className={styles.formLabel}>Fee coin</label>
            <select className={styles.formSelect} value={feeCoin} onChange={e => setFeeCoin(e.target.value)}>
              {feeCoinOptions.map(t => <option key={t} value={t}>{t}{t === position.ticker ? ' (spent coin)' : ''}</option>)}
            </select>
          </div>
        )}
      </div>
      <p className={styles.formSubtitle}>
        No cash changes hands — a swap is coin-for-coin. Any fee is paid in crypto (default the spent coin) and
        reduces that holding. Both prices are saved with the swap.
      </p>
      <div className={styles.formActions}>
        <button type="button" className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
        <button type="submit" className={styles.saveBtn} disabled={!canSave}>{isEdit ? 'Save' : 'Swap'}</button>
      </div>
    </form>
  )
}

// ─── Crypto wallet transfer form (SPEC-036, D3 — coarse-label audit record) ────
// Records moving a coin between the user's wallets. No effect on holdings/P&L.
function CryptoWalletTransferForm({ position, onSave, onCancel }) {
  const [date,       setDate]       = useState(today)
  const [quantity,   setQuantity]   = useState('')
  const [fromWallet, setFromWallet] = useState('')
  const [toWallet,   setToWallet]   = useState('')

  const available = position.shares
  const qtyNum    = Number(quantity)
  const over      = qtyNum > available + 1e-9
  const canSave   = qtyNum > 0 && !over && toWallet.trim()

  function handleSubmit(e) {
    e.preventDefault()
    if (!canSave) return
    onSave({
      date,
      ticker: position.ticker,
      quantity: qtyNum,
      fromWallet: fromWallet.trim() || null,
      toWallet: toWallet.trim() || null,
    })
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <h3 className={styles.formTitle}>Move {position.ticker} between wallets</h3>
      <div className={styles.formRow}>
        <label className={styles.formLabel}>Date</label>
        <input className={styles.formInput} type="date" value={date} onChange={e => setDate(e.target.value)} />
      </div>
      <div className={styles.formRow}>
        <label className={styles.formLabel}>Quantity</label>
        <input className={styles.formInput} type="number" min="0.00000001" step="any" value={quantity} onChange={e => setQuantity(e.target.value)} placeholder={trimDecimals(available)} autoFocus />
        <p className={styles.ratePreview}>Held: {trimDecimals(available)} {position.ticker}</p>
        {over && <span className={styles.shareWarnChip}>Exceeds the {trimDecimals(available)} you hold.</span>}
      </div>
      <div className={styles.formRow}>
        <label className={styles.formLabel}>From wallet (optional)</label>
        <input className={styles.formInput} value={fromWallet} onChange={e => setFromWallet(e.target.value)} placeholder="exchange" />
      </div>
      <div className={styles.formRow}>
        <label className={styles.formLabel}>To wallet</label>
        <input className={styles.formInput} value={toWallet} onChange={e => setToWallet(e.target.value)} placeholder="cold-storage / ledger" />
      </div>
      <p className={styles.formSubtitle}>Records the move only — cost basis is preserved and no P/L is realised.</p>
      <div className={styles.formActions}>
        <button type="button" className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
        <button type="submit" className={styles.saveBtn} disabled={!canSave}>Move</button>
      </div>
    </form>
  )
}

// ─── Asset-movements row for a crypto swap / wallet-transfer (SPEC-036) ────────
// Expandable like a buy/sell MovementRow: collapsed summary + ▼, click to expand a
// detail grid; × deletes, "Edit swap →" lives in the detail. Informational (no cash).
function AssetActivityRow({ activity: a, isExpanded, onToggle, onEdit, onDelete }) {
  const isSwap   = a.type === 'swap'
  const rate     = isSwap && a.from?.quantity > 0 ? a.to.quantity / a.from.quantity : null
  const mktRate  = isSwap && a.from?.price != null && a.to?.price != null && a.to.price !== 0 ? a.from.price / a.to.price : null
  const given    = isSwap && a.from?.price != null ? a.from.quantity * a.from.price : null
  const recv     = isSwap && a.to?.price != null ? a.to.quantity * a.to.price : null
  const pl       = given != null && recv != null ? recv - given : null
  const plColor  = pl != null ? (pl >= 0 ? '#4ade80' : '#f87171') : undefined

  const summary = isSwap
    ? `${trimDecimals(a.from.quantity)} ${a.from.ticker} → ${trimDecimals(a.to.quantity)} ${a.to.ticker}`
    : `${trimDecimals(a.quantity)} ${a.ticker} · ${a.fromWallet || '—'} → ${a.toWallet || '—'}`

  return (
    <div className={styles.movementGroup}>
      <div className={`${styles.movementRow} ${styles.movementRowClickable}`} onClick={onToggle}>
        <span className={styles.movementDate}>{a.date}</span>
        <div className={styles.movementTypeGroup}>
          <span className={styles.movementType}>{isSwap ? 'Swap' : 'Wallet move'}</span>
          <span className={styles.movementStockMeta}>{summary}</span>
        </div>
        {pl != null
          ? <span className={styles.movementAmount} style={{ color: plColor }}>{pl >= 0 ? '+' : '−'}{fmtAmt(Math.abs(pl))} {a.currency}</span>
          : <span className={`${styles.movementAmount} ${styles.muted}`}>no cash</span>}
        <span className={styles.expandIcon}>{isExpanded ? '▲' : '▼'}</span>
      </div>
      {isExpanded && (
        <div className={styles.movementDetail}>
          <div className={styles.detailGrid}>
            {isSwap ? (
              <>
                <span className={styles.detailLabel}>From</span>
                <span>{trimDecimals(a.from.quantity)} {a.from.ticker}</span>
                <span className={styles.detailLabel}>To</span>
                <span>{trimDecimals(a.to.quantity)} {a.to.ticker}</span>
                {rate != null && <><span className={styles.detailLabel}>Your rate</span><span>1 {a.from.ticker} = {trimDecimals(rate)} {a.to.ticker}</span></>}
                {mktRate != null && <><span className={styles.detailLabel}>Market rate</span><span>1 {a.from.ticker} = {trimDecimals(mktRate)} {a.to.ticker}</span></>}
                {a.from?.price != null && <><span className={styles.detailLabel}>{a.from.ticker} price</span><span>{fmtAmt(a.from.price)} {a.currency}</span></>}
                {a.to?.price != null && <><span className={styles.detailLabel}>{a.to.ticker} price</span><span>{fmtAmt(a.to.price)} {a.currency}</span></>}
                {a.fee?.coin && a.fee.quantity != null && <><span className={styles.detailLabel}>Fee</span><span>{trimDecimals(a.fee.quantity)} {a.fee.coin}</span></>}
                {given != null && <><span className={styles.detailLabel}>Value given</span><span>{fmtAmt(given)} {a.currency}</span></>}
                {recv != null && <><span className={styles.detailLabel}>Value received</span><span>{fmtAmt(recv)} {a.currency}</span></>}
                {pl != null && <><span className={styles.detailLabel}>Swap P/L</span><span style={{ color: plColor }}>{pl >= 0 ? '+' : '−'}{fmtAmt(Math.abs(pl))} {a.currency}</span></>}
              </>
            ) : (
              <>
                <span className={styles.detailLabel}>Coin</span>
                <span>{a.ticker}</span>
                <span className={styles.detailLabel}>Quantity</span>
                <span>{trimDecimals(a.quantity)}</span>
                <span className={styles.detailLabel}>From wallet</span>
                <span>{a.fromWallet || '—'}</span>
                <span className={styles.detailLabel}>To wallet</span>
                <span>{a.toWallet || '—'}</span>
              </>
            )}
          </div>
          <p className={styles.formSubtitle}>No cash impact — a swap is coin-for-coin; a wallet move only relabels where the coin is held.</p>
          <div style={{ display: 'flex', gap: 8 }}>
            {isSwap && onEdit && (
              <button className={styles.detailEditBtn} onClick={onEdit}>Edit swap →</button>
            )}
            {onDelete && (
              <button className={styles.detailEditBtn} style={{ color: '#f87171' }} onClick={onDelete}>Delete</button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Sell form ────────────────────────────────────────────────────────────────

function SellForm({ accountId, positions, balances = [], defaultTicker, onSave, onCancel, tickerLocked = false }) {
  const [date,          setDate]          = useState(today)
  const [ticker,        setTicker]        = useState(defaultTicker ?? (positions[0]?.ticker ?? ''))
  const [stockExchange, setStockExchange] = useState('')
  const [shares,        setShares]        = useState('')
  const [price,         setPrice]         = useState('')
  const [fee,           setFee]           = useState('0')
  const [extId,         setExtId]         = useState('')
  const [showLots,      setShowLots]      = useState(false)
  const [lotInputs,     setLotInputs]     = useState({})
  // Phase 32c / item 368: once the user edits any per-lot quantity, the form switches
  // to "lots → total" mode (shares = sum of lot inputs). Reset by closing + reopening
  // the picker.
  const [manualMode,    setManualMode]    = useState(false)
  const [proceedsBalId, setProceedsBalId] = useState('')  // '' = matching-currency (default)
  const [proceedsRate,  setProceedsRate]  = useState('1')
  const [proceedsFxFee, setProceedsFxFee] = useState('0')

  const selectedPos    = positions.find(p => p.ticker === ticker)
  const currency       = selectedPos?.currency ?? ''
  const openLots       = ticker ? getOpenLots(accountId, ticker) : []
  const proceedsBal    = balances.find(b => b.id === proceedsBalId)
  const isCrossProceeds = proceedsBal && proceedsBal.currency !== currency
  const netProceeds    = Number(shares || 0) * Number(price || 0) - Number(fee || 0)

  function handleTickerChange(t) {
    setTicker(t)
    setShowLots(false)
    setLotInputs({})
    setManualMode(false)
  }

  function handleSharesChange(value) {
    setShares(value)
    // "Total → lots" mode: re-run FIFO when the picker is open and the user hasn't
    // taken manual control of any lot input yet.
    if (showLots && !manualMode && openLots.length > 0) {
      const sharesToSell = Number(value || 0)
      const inputs = {}
      if (sharesToSell > 0) {
        const { allocations } = computeFifoAllocations(openLots, sharesToSell)
        for (const alloc of allocations) inputs[alloc.sourceBuyId] = String(alloc.sharesFromLot)
      }
      for (const lot of openLots) if (!(lot.id in inputs)) inputs[lot.id] = '0'
      setLotInputs(inputs)
    }
  }

  function handleLotChange(lotId, raw) {
    const lot = openLots.find(l => l.id === lotId)
    if (!lot) return
    // Phase 32c / item 367: clamp at input time to the lot's remaining shares so
    // the user can't allocate more than is available.
    let clamped = raw
    const numVal = Number(raw)
    if (Number.isFinite(numVal) && numVal > lot.remainingShares) {
      clamped = String(lot.remainingShares)
    }
    const nextInputs = { ...lotInputs, [lotId]: clamped }
    setLotInputs(nextInputs)
    setManualMode(true)
    const sum = Object.values(nextInputs).reduce((s, v) => s + Number(v || 0), 0)
    setShares(sum > 0 ? trimDecimals(sum) : '')
  }

  function toggleLots() {
    if (!showLots) {
      // Pre-fill with FIFO and reset to auto-mode.
      const sharesToSell = Number(shares || 0)
      const inputs = {}
      if (sharesToSell > 0 && openLots.length > 0) {
        const { allocations } = computeFifoAllocations(openLots, sharesToSell)
        for (const alloc of allocations) inputs[alloc.sourceBuyId] = String(alloc.sharesFromLot)
      }
      for (const lot of openLots) if (!(lot.id in inputs)) inputs[lot.id] = '0'
      setLotInputs(inputs)
      setManualMode(false)
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
    onSave({
      date, ticker, stockExchange: stockExchange.trim() || null, shares: Number(shares),
      price: Number(price), currency, fee: Number(fee || 0),
      transactionExternalId: extId.trim() || null, lotAllocations,
      proceedsCashBalanceId: isCrossProceeds ? proceedsBalId : null,
      proceedsExchangeRate: isCrossProceeds ? Number(proceedsRate) : null,
      proceedsFxFeeAmount: isCrossProceeds ? Number(proceedsFxFee || 0) : null,
    })
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
        {tickerLocked ? (
          <span className={styles.lockedFieldValue}>{ticker}</span>
        ) : positions.length > 0 ? (
          <select className={styles.formSelect} value={ticker} onChange={e => handleTickerChange(e.target.value)}>
            {positions.map(p => <option key={p.ticker} value={p.ticker}>{p.ticker} ({trimDecimals(p.shares)} sh)</option>)}
          </select>
        ) : (
          <input className={styles.formInput} value={ticker} onChange={e => setTicker(e.target.value.toUpperCase())} placeholder="AAPL" autoFocus />
        )}
        {getStockProfile(ticker)?.isManual === true && (
          <span className={styles.manualStockChip} title="No API data — prices are entered manually">Manual stock</span>
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
        <input className={styles.formInput} type="number" min="0.000001" step="any" value={shares} onChange={e => handleSharesChange(e.target.value)} placeholder="10" autoFocus={!tickerLocked && positions.length === 0} />
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
                    onChange={e => handleLotChange(lot.id, e.target.value)}
                  />
                  <span className={styles.lotMaxHint}>max {trimDecimals(lot.remainingShares)}</span>
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
      {balances.length > 0 && (
        <div className={styles.formRow}>
          <label className={styles.formLabel}>Proceeds into</label>
          <select className={styles.formSelect} value={proceedsBalId} onChange={e => setProceedsBalId(e.target.value)}>
            <option value="">{currency} (matching trade)</option>
            {balances.filter(b => b.currency !== currency).map(b => (
              <option key={b.id} value={b.id}>{b.currency} (exchange after sell)</option>
            ))}
          </select>
        </div>
      )}
      {isCrossProceeds && (
        <div className={styles.crossCurrencyBox}>
          <p className={styles.crossCurrencyLabel}>Exchange triggered — {currency} → {proceedsBal.currency}</p>
          <div className={styles.formRow}>
            <label className={styles.formLabel}>Rate (1 {currency} = ? {proceedsBal.currency})</label>
            <input className={styles.formInput} type="number" min="0.000001" step="any" value={proceedsRate} onChange={e => setProceedsRate(e.target.value)} />
          </div>
          {netProceeds > 0 && Number(proceedsRate) > 0 && (
            <p className={styles.ratePreview}>→ {fmtAmt(netProceeds * Number(proceedsRate))} {proceedsBal.currency} received</p>
          )}
          <div className={styles.formRow}>
            <label className={styles.formLabel}>FX fee ({currency}, optional)</label>
            <input className={styles.formInput} type="number" min="0" step="0.01" value={proceedsFxFee} onChange={e => setProceedsFxFee(e.target.value)} />
          </div>
        </div>
      )}
      <div className={styles.formActions}>
        <button type="button" className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
        <button type="submit" className={styles.saveBtn} disabled={!canSave}>Sell</button>
      </div>
    </form>
  )
}

// ─── Buy edit form (26c) ─────────────────────────────────────────────────────

// Ticker and currency are non-editable. Only the numeric / metadata fields can change.
function BuyEditForm({ txn, onSave, onCancel }) {
  const [date,          setDate]          = useState(txn.date)
  const [stockExchange, setStockExchange] = useState(txn.stockExchange ?? '')
  const [shares,        setShares]        = useState(String(txn.shares))
  const [price,         setPrice]         = useState(String(txn.price))
  const [fee,           setFee]           = useState(String(txn.fee ?? 0))
  const [extId,         setExtId]         = useState(txn.transactionExternalId ?? '')
  const [saveError,     setSaveError]     = useState(null)

  const feeMismatch = txn.feeCurrency && txn.feeCurrency !== txn.currency
  const total  = Number(shares || 0) * Number(price || 0) + Number(fee || 0)
  const canSave = Number(shares) > 0 && Number(price) > 0 && !feeMismatch

  function handleSubmit(e) {
    e.preventDefault()
    if (!canSave) return
    setSaveError(null)
    try {
      onSave({ date, stockExchange: stockExchange.trim() || null, shares: Number(shares), price: Number(price), fee: Number(fee || 0), transactionExternalId: extId.trim() || null })
    } catch (err) {
      setSaveError(err.message)
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <h3 className={styles.formTitle}>Edit buy — {txn.ticker}</h3>
      <p className={styles.formSubtitle}>{txn.currency} · ticker and currency cannot be changed here</p>
      {feeMismatch && (
        <p className={styles.formError}>Fee currency ({txn.feeCurrency}) differs from trade currency ({txn.currency}) — this record cannot be edited until the mismatch is corrected.</p>
      )}
      {saveError && <p className={styles.formError}>{saveError}</p>}
      <div className={styles.formRow}>
        <label className={styles.formLabel}>Date</label>
        <input className={styles.formInput} type="date" value={date} onChange={e => setDate(e.target.value)} />
      </div>
      <div className={styles.formRow}>
        <label className={styles.formLabel}>Exchange (optional)</label>
        <input className={styles.formInput} value={stockExchange} onChange={e => setStockExchange(e.target.value)} placeholder="NASDAQ" />
      </div>
      <div className={styles.formRow}>
        <label className={styles.formLabel}>Shares</label>
        <input className={styles.formInput} type="number" min="0.000001" step="any" value={shares} onChange={e => setShares(e.target.value)} autoFocus />
      </div>
      <div className={styles.formRow}>
        <label className={styles.formLabel}>Price per share ({txn.currency})</label>
        <input className={styles.formInput} type="number" min="0.000001" step="any" value={price} onChange={e => setPrice(e.target.value)} />
      </div>
      <div className={styles.formRow}>
        <label className={styles.formLabel}>Fee ({txn.currency})</label>
        <input className={styles.formInput} type="number" min="0" step="0.01" value={fee} onChange={e => setFee(e.target.value)} />
      </div>
      <div className={styles.formRow}>
        <label className={styles.formLabel}>Transaction ID (optional)</label>
        <input className={styles.formInput} value={extId} onChange={e => setExtId(e.target.value)} placeholder="Broker reference" />
      </div>
      {total > 0 && <p className={styles.ratePreview}>Total cost: {fmtAmt(total)} {txn.currency}</p>}
      <div className={styles.formActions}>
        <button type="button" className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
        <button type="submit" className={styles.saveBtn} disabled={!canSave}>Save</button>
      </div>
    </form>
  )
}

// ─── Sell edit form (26c) ─────────────────────────────────────────────────────

function SellEditForm({ txn, accountId, onSave, onCancel }) {
  const [date,          setDate]          = useState(txn.date)
  const [stockExchange, setStockExchange] = useState(txn.stockExchange ?? '')
  const [shares,        setShares]        = useState(String(txn.shares))
  const [price,         setPrice]         = useState(String(txn.price))
  const [fee,           setFee]           = useState(String(txn.fee ?? 0))
  const [extId,         setExtId]         = useState(txn.transactionExternalId ?? '')
  const [saveError,     setSaveError]     = useState(null)

  const feeMismatch = txn.feeCurrency && txn.feeCurrency !== txn.currency
  const [showLots,      setShowLots]      = useState(false)
  const [lotInputs,     setLotInputs]     = useState(() => {
    const inputs = {}
    for (const alloc of txn.lotAllocations ?? []) inputs[alloc.sourceBuyId] = String(alloc.sharesFromLot)
    return inputs
  })
  // Phase 32c / item 368: lot-edit toggles manual mode (lots → total). Closing +
  // reopening the picker resets to auto-mode (total → lots via FIFO).
  const [manualMode,    setManualMode]    = useState(false)

  // Open lots EXCLUDING the shares being sold (they're currently "consumed" by this sell record).
  // updateSell deletes and recreates the movements, so for UI purposes we show the lots as if this sell didn't exist.
  const openLots = getOpenLots(accountId, txn.ticker)
  // Add back the shares from the existing allocation so the user can redistribute them
  const lotsWithCredit = openLots.map(lot => {
    const existingAlloc = txn.lotAllocations?.find(a => a.sourceBuyId === lot.id)
    return existingAlloc
      ? { ...lot, remainingShares: lot.remainingShares + existingAlloc.sharesFromLot }
      : lot
  })

  function handleSharesChange(value) {
    setShares(value)
    if (showLots && !manualMode && lotsWithCredit.length > 0) {
      const sharesToSell = Number(value || 0)
      const inputs = {}
      if (sharesToSell > 0) {
        const { allocations } = computeFifoAllocations(lotsWithCredit, sharesToSell)
        for (const alloc of allocations) inputs[alloc.sourceBuyId] = String(alloc.sharesFromLot)
      }
      for (const lot of lotsWithCredit) if (!(lot.id in inputs)) inputs[lot.id] = '0'
      setLotInputs(inputs)
    }
  }

  function handleLotChange(lotId, raw) {
    const lot = lotsWithCredit.find(l => l.id === lotId)
    if (!lot) return
    // Phase 32c / item 367: clamp to lot's remaining shares (including the credit-back
    // from the existing allocation, so the user can redistribute up to what's truly available).
    let clamped = raw
    const numVal = Number(raw)
    if (Number.isFinite(numVal) && numVal > lot.remainingShares) {
      clamped = String(lot.remainingShares)
    }
    const nextInputs = { ...lotInputs, [lotId]: clamped }
    setLotInputs(nextInputs)
    setManualMode(true)
    const sum = Object.values(nextInputs).reduce((s, v) => s + Number(v || 0), 0)
    setShares(sum > 0 ? trimDecimals(sum) : '')
  }

  function toggleLots() {
    if (!showLots) {
      const sharesToSell = Number(shares || 0)
      const inputs = {}
      if (sharesToSell > 0 && lotsWithCredit.length > 0) {
        const { allocations } = computeFifoAllocations(lotsWithCredit, sharesToSell)
        for (const alloc of allocations) inputs[alloc.sourceBuyId] = String(alloc.sharesFromLot)
      }
      for (const lot of lotsWithCredit) if (!(lot.id in inputs)) inputs[lot.id] = '0'
      setLotInputs(inputs)
      setManualMode(false)
    }
    setShowLots(v => !v)
  }

  const lotTotal = Object.values(lotInputs).reduce((s, v) => s + Number(v || 0), 0)
  const lotValid = !showLots || Math.abs(lotTotal - Number(shares || 0)) < 0.000001
  const proceeds = Number(shares || 0) * Number(price || 0)
  const canSave  = Number(shares) > 0 && Number(price) > 0 && lotValid && !feeMismatch

  function handleSubmit(e) {
    e.preventDefault()
    if (!canSave) return
    setSaveError(null)
    try {
      const lotAllocations = showLots
        ? Object.entries(lotInputs).filter(([, v]) => Number(v) > 0).map(([sourceBuyId, v]) => ({ sourceBuyId, sharesFromLot: Number(v) }))
        : null
      onSave({ date, stockExchange: stockExchange.trim() || null, shares: Number(shares), price: Number(price), fee: Number(fee || 0), transactionExternalId: extId.trim() || null, lotAllocations })
    } catch (err) {
      setSaveError(err.message)
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <h3 className={styles.formTitle}>Edit sell — {txn.ticker}</h3>
      <p className={styles.formSubtitle}>{txn.currency} · ticker and currency cannot be changed here</p>
      {feeMismatch && (
        <p className={styles.formError}>Fee currency ({txn.feeCurrency}) differs from trade currency ({txn.currency}) — this record cannot be edited until the mismatch is corrected.</p>
      )}
      {saveError && <p className={styles.formError}>{saveError}</p>}
      <div className={styles.formRow}>
        <label className={styles.formLabel}>Date</label>
        <input className={styles.formInput} type="date" value={date} onChange={e => setDate(e.target.value)} />
      </div>
      <div className={styles.formRow}>
        <label className={styles.formLabel}>Exchange (optional)</label>
        <input className={styles.formInput} value={stockExchange} onChange={e => setStockExchange(e.target.value)} placeholder="NASDAQ" />
      </div>
      <div className={styles.formRow}>
        <label className={styles.formLabel}>Shares</label>
        <input className={styles.formInput} type="number" min="0.000001" step="any" value={shares} onChange={e => handleSharesChange(e.target.value)} autoFocus />
      </div>
      <div className={styles.formRow}>
        <label className={styles.formLabel}>Price per share ({txn.currency})</label>
        <input className={styles.formInput} type="number" min="0.000001" step="any" value={price} onChange={e => setPrice(e.target.value)} />
      </div>
      <div className={styles.formRow}>
        <label className={styles.formLabel}>Fee ({txn.currency})</label>
        <input className={styles.formInput} type="number" min="0" step="0.01" value={fee} onChange={e => setFee(e.target.value)} />
      </div>
      <div className={styles.formRow}>
        <label className={styles.formLabel}>Transaction ID (optional)</label>
        <input className={styles.formInput} value={extId} onChange={e => setExtId(e.target.value)} placeholder="Broker reference" />
      </div>
      {proceeds > 0 && <p className={styles.ratePreview}>Net proceeds: {fmtAmt(proceeds - Number(fee || 0))} {txn.currency}</p>}
      {lotsWithCredit.length > 0 && (
        <div className={styles.lotPickerSection}>
          <button type="button" className={styles.lotPickerToggle} onClick={toggleLots}>
            {showLots ? '▲' : '▼'} Advanced: choose lots
          </button>
          {showLots && (
            <div className={styles.lotList}>
              {lotsWithCredit.map(lot => (
                <div key={lot.id} className={styles.lotRow}>
                  <span className={styles.lotMeta}>{lot.date} · {trimDecimals(lot.remainingShares)} sh @ {fmtAmt(lot.price)}</span>
                  <input
                    className={styles.lotInput}
                    type="number" min="0" max={lot.remainingShares} step="any"
                    value={lotInputs[lot.id] ?? '0'}
                    onChange={e => handleLotChange(lot.id, e.target.value)}
                  />
                  <span className={styles.lotMaxHint}>max {trimDecimals(lot.remainingShares)}</span>
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
        <button type="submit" className={styles.saveBtn} disabled={!canSave}>Save</button>
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

// ─── Transfer edit form (item 286) ───────────────────────────────────────────

function TransferEditForm({ txn, balances, onSave, onCancel }) {
  const [date,         setDate]         = useState(txn.date)
  const [shares,       setShares]       = useState(String(txn.shares))
  const [fee,          setFee]          = useState(String(txn.fee ?? 0))
  const [feeBalanceId, setFeeBalanceId] = useState(txn.feeCashBalanceId ?? (balances[0]?.id ?? ''))
  const [extId,        setExtId]        = useState(txn.transactionExternalId ?? '')
  const [showLots,     setShowLots]     = useState(false)
  const [manualMode,   setManualMode]   = useState(false)
  const [lotInputs,    setLotInputs]    = useState(() => {
    const inputs = {}
    for (const alloc of txn.lotAllocations ?? []) inputs[alloc.sourceBuyId] = String(alloc.sharesFromLot)
    return inputs
  })

  const destAccount = getInvestingAccount(txn.destinationInvestingAccountId)

  // Open lots excluding shares already consumed by THIS transfer — add them back for redistribution.
  const openLots = getOpenLots(txn.investingAccountId, txn.ticker)
  const lotsWithCredit = openLots.map(lot => {
    const existing = txn.lotAllocations?.find(a => a.sourceBuyId === lot.id)
    return existing ? { ...lot, remainingShares: lot.remainingShares + existing.sharesFromLot } : lot
  })
  const maxShares = lotsWithCredit.reduce((s, l) => s + l.remainingShares, 0)

  function handleSharesChange(value) {
    setShares(value)
    if (showLots && !manualMode && lotsWithCredit.length > 0) {
      const n = Number(value || 0)
      const inputs = {}
      if (n > 0) {
        const { allocations } = computeFifoAllocations(lotsWithCredit, n)
        for (const alloc of allocations) inputs[alloc.sourceBuyId] = String(alloc.sharesFromLot)
      }
      for (const lot of lotsWithCredit) if (!(lot.id in inputs)) inputs[lot.id] = '0'
      setLotInputs(inputs)
    }
  }

  function handleLotChange(lotId, raw) {
    const lot = lotsWithCredit.find(l => l.id === lotId)
    if (!lot) return
    const clamped = Number.isFinite(Number(raw)) && Number(raw) > lot.remainingShares ? String(lot.remainingShares) : raw
    const nextInputs = { ...lotInputs, [lotId]: clamped }
    setLotInputs(nextInputs)
    setManualMode(true)
    const sum = Object.values(nextInputs).reduce((s, v) => s + Number(v || 0), 0)
    setShares(sum > 0 ? trimDecimals(sum) : '')
  }

  function toggleLots() {
    if (!showLots) {
      const n = Number(shares || 0)
      const inputs = {}
      if (n > 0 && lotsWithCredit.length > 0) {
        const { allocations } = computeFifoAllocations(lotsWithCredit, n)
        for (const alloc of allocations) inputs[alloc.sourceBuyId] = String(alloc.sharesFromLot)
      }
      for (const lot of lotsWithCredit) if (!(lot.id in inputs)) inputs[lot.id] = '0'
      setLotInputs(inputs)
      setManualMode(false)
    }
    setShowLots(v => !v)
  }

  const lotTotal = Object.values(lotInputs).reduce((s, v) => s + Number(v || 0), 0)
  const lotValid = !showLots || Math.abs(lotTotal - Number(shares || 0)) < 0.000001
  const canSave  = Number(shares) > 0 && Number(shares) <= maxShares + 0.000001 && lotValid

  function handleSubmit(e) {
    e.preventDefault()
    if (!canSave) return
    const lotAllocations = showLots
      ? Object.entries(lotInputs).filter(([, v]) => Number(v) > 0).map(([sourceBuyId, v]) => ({ sourceBuyId, sharesFromLot: Number(v) }))
      : null
    onSave({
      date,
      destinationInvestingAccountId: txn.destinationInvestingAccountId,
      shares: Number(shares),
      fee: Number(fee || 0),
      feeCashBalanceId: Number(fee) > 0 ? feeBalanceId : null,
      transactionExternalId: extId.trim() || null,
      lotAllocations,
    })
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <h3 className={styles.formTitle}>Edit transfer — {txn.ticker}</h3>
      <p className={styles.formSubtitle}>
        To: {destAccount?.name ?? txn.destinationInvestingAccountId} · ticker and destination cannot be changed
      </p>
      <div className={styles.formRow}>
        <label className={styles.formLabel}>Date</label>
        <input className={styles.formInput} type="date" value={date} onChange={e => setDate(e.target.value)} />
      </div>
      <div className={styles.formRow}>
        <label className={styles.formLabel}>
          Shares {maxShares > 0 && <span className={styles.available}>({trimDecimals(maxShares)} available)</span>}
        </label>
        <input className={styles.formInput} type="number" min="0.000001" max={maxShares} step="any" value={shares} onChange={e => handleSharesChange(e.target.value)} autoFocus />
      </div>
      <div className={styles.formRow}>
        <label className={styles.formLabel}>Fee</label>
        <input className={styles.formInput} type="number" min="0" step="0.01" value={fee} onChange={e => setFee(e.target.value)} />
      </div>
      {Number(fee) > 0 && balances.length > 0 && (
        <div className={styles.formRow}>
          <label className={styles.formLabel}>Fee paid from</label>
          <select className={styles.formSelect} value={feeBalanceId} onChange={e => setFeeBalanceId(e.target.value)}>
            {balances.map(b => (
              <option key={b.id} value={b.id}>{b.currency} ({fmtAmt(getCurrentBalance(b.id))})</option>
            ))}
          </select>
        </div>
      )}
      <div className={styles.formRow}>
        <label className={styles.formLabel}>Transaction ID (optional)</label>
        <input className={styles.formInput} value={extId} onChange={e => setExtId(e.target.value)} placeholder="Broker reference" />
      </div>
      {lotsWithCredit.length > 0 && (
        <div className={styles.lotPickerSection}>
          <button type="button" className={styles.lotPickerToggle} onClick={toggleLots}>
            {showLots ? '▲' : '▼'} Advanced: choose lots
          </button>
          {showLots && (
            <div className={styles.lotList}>
              {lotsWithCredit.map(lot => (
                <div key={lot.id} className={styles.lotRow}>
                  <span className={styles.lotMeta}>{lot.date} · {trimDecimals(lot.remainingShares)} sh @ {fmtAmt(lot.price)}</span>
                  <input
                    className={styles.lotInput}
                    type="number" min="0" max={lot.remainingShares} step="any"
                    value={lotInputs[lot.id] ?? '0'}
                    onChange={e => handleLotChange(lot.id, e.target.value)}
                  />
                  <span className={styles.lotMaxHint}>max {trimDecimals(lot.remainingShares)}</span>
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
        <button type="submit" className={styles.saveBtn} disabled={!canSave}>Save</button>
      </div>
    </form>
  )
}

export { BuyForm, SellForm, DividendForm }
