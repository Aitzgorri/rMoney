import { useState, useRef, useEffect } from 'react'
import { useMediaQuery, DESKTOP } from '../utils/mediaQuery'
import { useCollapseState } from '../utils/useCollapseState'
import InlineFormRow from '../components/InlineFormRow'
import { getActiveEnvelopes, getEnvelopesFlat, getScheduledTransfers, createScheduledTransfer, updateScheduledTransfer, deleteScheduledTransfer, createEnvelopeTransfer } from '../data/envelopes'
import { getActiveAccounts } from '../data/accounts'
import {
  getPlannedIncomes, createPlannedIncome, updatePlannedIncome, deletePlannedIncome,
  getPlannedExpenses, createPlannedExpense, updatePlannedExpense, deletePlannedExpense,
  getExpenseDescendants, deletePlannedExpenseTree, convertLeafToParent,
} from '../data/planning'
import { convertAmount, PERIOD_LABELS, FREQUENCY_LABELS } from '../utils/frequency'
import { INDENT } from '../utils/hierarchy'
import { formatDate } from '../utils/dates'
import {
  DndContext,
  useDraggable,
  useDroppable,
  useDndContext,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { getDescendantIds } from '../utils/treeDnd'
import EnvelopeTransferForm from '../components/EnvelopeTransferForm'
import { convertToMain, ensureRates } from '../utils/currency'
import { getMainCurrency } from '../data/settings'
import CurrencyDropdown from '../components/CurrencyDropdown'
import styles from './Planning.module.css'
import { fmtAmt } from '../utils/format'

const DAYS = Array.from({ length: 28 }, (_, i) => i + 1)
const TODAY = new Date().toISOString().split('T')[0]

// ─── Sync helpers ─────────────────────────────────────────────────────────────
// Note: planned incomes are scratchpad-only (SPEC-009) — they do not sync to
// scheduled envelope transfers, so there is no incomeSyncStatus.

function expenseSyncStatus(expense, scheduledTransfers) {
  if (!expense.linkedScheduledTransferId) return 'not-applied'
  const t = scheduledTransfers.find(s => s.id === expense.linkedScheduledTransferId)
  if (!t) return 'not-applied'
  const planned = convertAmount(expense.amount, expense.amountBasis, 'monthly')
  const actual  = convertAmount(t.amount, t.frequency, 'monthly')
  return Math.abs(planned - actual) < 0.005 ? 'in-sync' : 'out-of-sync'
}

// ─── Period totals ────────────────────────────────────────────────────────────

function buildTotals(incomes, expenses, period) {
  // Group by currency
  const totals = {}

  for (const inc of incomes) {
    const cur = inc.currency || '?'
    if (!totals[cur]) totals[cur] = { income: 0, expenses: 0 }
    if (inc.frequency === 'one-time') {
      totals[cur].income += Number(inc.amount)
    } else {
      totals[cur].income += convertAmount(inc.amount, inc.frequency, period)
    }
  }

  const leaves = expenses.filter(e => !expenses.some(x => x.parentId === e.id))
  for (const exp of leaves) {
    if (exp.amount == null || !exp.currency) continue
    const cur = exp.currency
    if (!totals[cur]) totals[cur] = { income: 0, expenses: 0 }
    totals[cur].expenses += convertAmount(exp.amount, exp.amountBasis, period)
  }

  return totals
}

// ─── Expense tree helpers ─────────────────────────────────────────────────────

function calcExpenseAmounts(item, allExpenses, period) {
  const children = allExpenses.filter(e => e.parentId === item.id)
  if (children.length === 0) {
    // leaf
    if (item.amount == null) return { yearly: null, quarterly: null, monthly: null }
    return {
      yearly:    convertAmount(item.amount, item.amountBasis, 'yearly'),
      quarterly: convertAmount(item.amount, item.amountBasis, 'quarterly'),
      monthly:   convertAmount(item.amount, item.amountBasis, 'monthly'),
    }
  }
  // parent — sum children
  const sums = { yearly: 0, quarterly: 0, monthly: 0 }
  for (const child of children) {
    const childAmts = calcExpenseAmounts(child, allExpenses, period)
    if (childAmts.monthly != null) {
      sums.yearly    += childAmts.yearly
      sums.quarterly += childAmts.quarterly
      sums.monthly   += childAmts.monthly
    }
  }
  return sums
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Planning() {
  const isDesktop = useMediaQuery(DESKTOP)
  const [period, setPeriod] = useState('monthly')
  const mainCurrency = getMainCurrency()
  const [, rerender] = useState(0)
  useEffect(() => {
    let cancelled = false
    ensureRates(mainCurrency).then(() => { if (!cancelled) rerender(n => n + 1) }).catch(() => {})
    return () => { cancelled = true }
  }, [mainCurrency])

  // Data (re-loaded on each state update via refresh key)
  const [, setRefreshKey] = useState(0)
  function refresh() { setRefreshKey(k => k + 1) }

  const incomes  = getPlannedIncomes()
  const expenses = getPlannedExpenses()
  const scheduledTransfers = getScheduledTransfers()
  const envelopes    = getActiveEnvelopes()
  const envelopesFlat = getEnvelopesFlat(envelopes)
  const undistributed = envelopes.find(e => e.isDefaultIncome)
  const accounts = getActiveAccounts()
  const defaultCurrency = accounts[0]?.currency ?? 'EUR'

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 500, tolerance: 5 } }),
  )

  // UI modals (mobile + desktop edit)
  const [incomeModal, setIncomeModal]   = useState(null)  // null | 'new' | income record
  const [expenseModal, setExpenseModal] = useState(null)  // null | { mode: 'new'|'edit', item?, parentId? }

  // Desktop inline forms
  const [incomeInlineOpen, setIncomeInlineOpen]   = useState(false)
  const [expenseInlineOpen, setExpenseInlineOpen] = useState(false)
  const [convertDialog, setConvertDialog] = useState(null) // null | { leafItem, newChildData }
  const [applyDialog, setApplyDialog]   = useState(null)  // null | { items, scope }
  const [deleteConfirm, setDeleteConfirm] = useState(null) // null | { type, item, descendants? }
  const [addTransfer, setAddTransfer]     = useState(false)
  const [pendingReparent, setPendingReparent] = useState(null) // null | { dragId, dragName, targetLeaf }

  // Expense tree expand/collapse — persisted "expanded" id set (Phase 45c/45d)
  const expand = useCollapseState('rmoney_planning_expanded')
  // Parent expenses (have children) drive the Expand/Collapse-all toggle
  const parentExpenseIds = expenses.filter(e => expenses.some(c => c.parentId === e.id)).map(e => e.id)
  const allExpanded = parentExpenseIds.length > 0 && parentExpenseIds.every(id => expand.has(id))

  // ─── Totals ────────────────────────────────────────────────────────────────
  const totals = buildTotals(incomes, expenses, period)
  const isDeficit = Object.values(totals).some(t => t.expenses > t.income)

  const totalsEntries = Object.entries(totals)
  const planningNeedsConversion = totalsEntries.some(([cur]) => cur !== mainCurrency) && totalsEntries.length > 0
  let planningMainIncome = null, planningMainExpenses = null
  if (planningNeedsConversion) {
    let iSum = 0, eSum = 0, ok = true
    for (const [cur, { income, expenses: exp }] of totalsEntries) {
      const ci = convertToMain(income, cur, mainCurrency)
      const ce = convertToMain(exp, cur, mainCurrency)
      if (ci === null || ce === null) { ok = false; break }
      iSum += ci; eSum += ce
    }
    if (ok) { planningMainIncome = iSum; planningMainExpenses = eSum }
  }

  // Per-currency monthly totals for % column
  const expenseMonthlyTotals = {}
  const leaves = expenses.filter(e => !expenses.some(x => x.parentId === e.id))
  for (const exp of leaves) {
    if (exp.amount == null || !exp.currency) continue
    const monthly = convertAmount(exp.amount, exp.amountBasis, 'monthly')
    expenseMonthlyTotals[exp.currency] = (expenseMonthlyTotals[exp.currency] ?? 0) + monthly
  }

  // ─── Income actions ────────────────────────────────────────────────────────

  function handleSaveIncome(data) {
    if (data.id) {
      updatePlannedIncome(data.id, data)
    } else {
      createPlannedIncome(data)
    }
    setIncomeModal(null)
    refresh()
  }

  function handleDeleteIncome(income) {
    deletePlannedIncome(income.id)
    refresh()
  }

  // ─── Expense actions ───────────────────────────────────────────────────────

  function handleSaveExpense(data) {
    if (data.id) {
      updatePlannedExpense(data.id, data)
    } else {
      // Check if the selected parent is currently a leaf → conversion needed
      if (data.parentId) {
        const parent = expenses.find(e => e.id === data.parentId)
        const parentIsLeaf = parent && !expenses.some(e => e.parentId === parent.id)
        if (parentIsLeaf) {
          setConvertDialog({ leafItem: parent, newChildData: data })
          setExpenseModal(null)
          return
        }
      }
      createPlannedExpense(data)
    }
    setExpenseModal(null)
    refresh()
  }

  function handleConfirmConvert() {
    const { leafItem, newChildData } = convertDialog
    // Delete linked scheduled transfer if any
    if (leafItem.linkedScheduledTransferId) {
      deleteScheduledTransfer(leafItem.linkedScheduledTransferId)
    }
    // Convert leaf to parent
    convertLeafToParent(leafItem.id)
    // Create new child
    createPlannedExpense(newChildData)
    setConvertDialog(null)
    refresh()
  }

  function handleDeleteExpense(item) {
    const descendants = getExpenseDescendants(item.id, expenses)
    if (descendants.length > 0) {
      setDeleteConfirm({ type: 'expense-tree', item, descendants })
    } else {
      if (item.linkedScheduledTransferId) deleteScheduledTransfer(item.linkedScheduledTransferId)
      deletePlannedExpense(item.id)
      refresh()
    }
  }

  function handleConfirmDeleteExpense() {
    const { item, descendants } = deleteConfirm
    // Clean up linked transfers
    for (const d of [item, ...descendants]) {
      if (d.linkedScheduledTransferId) deleteScheduledTransfer(d.linkedScheduledTransferId)
    }
    deletePlannedExpenseTree(item.id)
    setDeleteConfirm(null)
    refresh()
  }

  function handleExpenseDragEnd({ active, over }) {
    if (!over) return
    const dragId = active.id
    const targetId = over.id
    const all = getPlannedExpenses()
    const drag = all.find(e => e.id === dragId)
    if (!drag) return

    if (targetId === '__root__') {
      if (drag.parentId === null) return  // already at root — no-op
      updatePlannedExpense(dragId, { parentId: null })
      refresh()
      return
    }

    if (dragId === targetId) return
    const target = all.find(e => e.id === targetId)
    if (!target) return
    if (getDescendantIds(dragId, all).has(targetId)) return
    if (drag.parentId === targetId) return  // no-op
    const targetIsLeaf = !all.some(e => e.parentId === targetId)
    if (targetIsLeaf) {
      setPendingReparent({ dragId, dragName: drag.name, targetLeaf: target })
      return
    }
    updatePlannedExpense(dragId, { parentId: targetId })
    refresh()
  }

  function handleConfirmDndReparent() {
    const { dragId, targetLeaf } = pendingReparent
    if (targetLeaf.linkedScheduledTransferId) {
      deleteScheduledTransfer(targetLeaf.linkedScheduledTransferId)
    }
    convertLeafToParent(targetLeaf.id)
    updatePlannedExpense(dragId, { parentId: targetLeaf.id })
    setPendingReparent(null)
    refresh()
  }

  function handleResetExpense(expense) {
    if (!expense.linkedScheduledTransferId) {
      updatePlannedExpense(expense.id, { amount: null })
    } else {
      const t = scheduledTransfers.find(s => s.id === expense.linkedScheduledTransferId)
      if (t) updatePlannedExpense(expense.id, { amount: t.amount, amountBasis: t.frequency })
    }
    refresh()
  }

  // ─── Reset all ────────────────────────────────────────────────────────────
  // Planned incomes are scratchpad-only and are not touched by reset/apply.

  function handleResetAll() {
    for (const exp of expenses) {
      if (expenses.some(e => e.parentId === exp.id)) continue // parent
      if (!exp.linkedScheduledTransferId) {
        updatePlannedExpense(exp.id, { amount: null })
      } else {
        const t = scheduledTransfers.find(s => s.id === exp.linkedScheduledTransferId)
        if (t) updatePlannedExpense(exp.id, { amount: t.amount, amountBasis: t.frequency })
      }
    }
    refresh()
  }

  // ─── Apply all transfers ──────────────────────────────────────────────────

  function gatherOutOfSync() {
    const items = []
    for (const exp of expenses) {
      if (expenses.some(e => e.parentId === exp.id)) continue // skip parents
      const status = expenseSyncStatus(exp, scheduledTransfers)
      if (status === 'not-applied' || status === 'out-of-sync') {
        items.push({ kind: 'expense', item: exp, status })
      }
    }
    return items
  }

  function handleApplyAll() {
    const outOfSync = gatherOutOfSync()
    if (outOfSync.length === 0) return
    setApplyDialog({ items: outOfSync, scope: 'whole' })
  }

  function handleApplySingleExpense(expense) {
    const status = expenseSyncStatus(expense, scheduledTransfers)
    if (status === 'in-sync') return
    setApplyDialog({ items: [{ kind: 'expense', item: expense, status }], scope: 'whole' })
  }

  function handleConfirmApply() {
    const { items, scope } = applyDialog
    const hasExisting = items.some(i => i.status === 'out-of-sync')

    for (const { item, status } of items) {
      applyExpense(item, status, scope, hasExisting)
    }
    setApplyDialog(null)
    refresh()
  }

  function applyExpense(expense, status, scope) {
    const monthlyAmount = convertAmount(expense.amount, expense.amountBasis, 'monthly')

    const day = expense.dayOfExecution ?? 1

    if (status === 'not-applied') {
      const t = createScheduledTransfer({
        fromEnvelopeId: expense.sourceEnvelopeId,
        toEnvelopeId:   expense.envelopeId,
        amount:         monthlyAmount,
        frequency:      'monthly',
        dayOfExecution: day,
      })
      updatePlannedExpense(expense.id, { linkedScheduledTransferId: t.id })
    } else {
      if (scope === 'next') {
        createEnvelopeTransfer({ fromEnvelopeId: expense.sourceEnvelopeId, toEnvelopeId: expense.envelopeId, amount: monthlyAmount, date: TODAY, note: 'Planning: next occurrence' })
        updateScheduledTransfer(expense.linkedScheduledTransferId, { amount: monthlyAmount, dayOfExecution: day })
      } else {
        updateScheduledTransfer(expense.linkedScheduledTransferId, { amount: monthlyAmount, dayOfExecution: day })
      }
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className={styles.screen}>
      {/* Sticky header */}
      <div className={styles.stickyHeader}>
        <div className={styles.headerRow}>
          <h1 className={styles.title}>Envelope planning</h1>
          <select
            className={styles.periodSelect}
            value={period}
            onChange={e => setPeriod(e.target.value)}
          >
            {Object.entries(PERIOD_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>

        <div className={`${styles.summaryBar} ${isDeficit ? styles.summaryDeficit : ''}`}>
          {Object.keys(totals).length === 0 ? (
            <span className={styles.summaryEmpty}>No planned items yet</span>
          ) : (
            <>
              {Object.entries(totals).map(([cur, { income, expenses: exp }]) => {
                const diff = income - exp
                return (
                  <div key={cur} className={styles.summaryGroup}>
                    <span className={styles.summaryItem}>
                      <span className={styles.summaryLabel}>Income</span>
                      <span className={styles.summaryValue}>{fmtAmt(income)} {cur}</span>
                    </span>
                    <span className={styles.summarySep}>·</span>
                    <span className={styles.summaryItem}>
                      <span className={styles.summaryLabel}>Expenses</span>
                      <span className={styles.summaryValue}>{fmtAmt(exp)} {cur}</span>
                    </span>
                    <span className={styles.summarySep}>·</span>
                    <span className={styles.summaryItem}>
                      <span className={styles.summaryLabel}>Diff</span>
                      <span className={`${styles.summaryValue} ${diff < 0 ? styles.deficitValue : styles.surplusValue}`}>
                        {diff >= 0 ? '+' : '−'}{fmtAmt(Math.abs(diff))} {cur}
                      </span>
                    </span>
                  </div>
                )
              })}
              {planningNeedsConversion && (
                <div className={styles.summaryGroup}>
                  <span className={styles.summaryItem}>
                    <span className={styles.summaryLabel}>≈ {mainCurrency}</span>
                    <span className={styles.summaryValue}>
                      {planningMainIncome !== null
                        ? `${fmtAmt(planningMainIncome)} / ${fmtAmt(planningMainExpenses)}`
                        : '—'}
                    </span>
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Planned incomes */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTitle}>Planned incomes</span>
          <button className={styles.addBtn} onClick={() => isDesktop ? setIncomeInlineOpen(true) : setIncomeModal('new')}>+ Add</button>
        </div>

        {isDesktop && (
          <InlineFormRow label="Add income" open={incomeInlineOpen} onOpenChange={setIncomeInlineOpen}>
            {onCollapse => (
              <IncomeFormModal
                inline
                initial={null}
                envelopesFlat={envelopesFlat}
                defaultEnvelopeId={undistributed?.id ?? ''}
                defaultCurrency={defaultCurrency}
                onSave={data => { handleSaveIncome(data); onCollapse() }}
                onCancel={onCollapse}
              />
            )}
          </InlineFormRow>
        )}

        {incomes.length === 0 ? (
          <p className={styles.empty}>No planned incomes yet.</p>
        ) : (
          <div className={styles.incomeList}>
            {incomes.map(income => {
              const displayAmount = income.frequency === 'one-time'
                ? income.amount
                : convertAmount(income.amount, income.frequency, period)

              return (
                <div key={income.id} className={styles.incomeRow}>
                  <div className={styles.incomeInfo}>
                    <span className={styles.incomeName}>{income.name}</span>
                    <span className={styles.incomeFreq}>
                      {income.frequency === 'one-time'
                        ? `${formatDate(income.date)} · one-time`
                        : `day ${income.dayOfExecution} · ${FREQUENCY_LABELS[income.frequency] ?? income.frequency}`}
                    </span>
                  </div>
                  <div className={styles.incomeRight}>
                    <span className={styles.incomeAmount}>
                      {displayAmount != null ? fmtAmt(displayAmount) : '—'} {income.currency}
                    </span>
                    <div className={styles.incomeActions}>
                      <button className={styles.rowBtn} onClick={() => setIncomeModal(income)}>✎</button>
                      <button className={`${styles.rowBtn} ${styles.rowBtnDanger}`} onClick={() => handleDeleteIncome(income)}>×</button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Planned expenses */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTitle}>Planned expenses</span>
          <div className={styles.sectionHeaderActions}>
            {parentExpenseIds.length > 0 && (
              <button className={styles.addBtn} onClick={() => allExpanded ? expand.clear() : expand.setAll(parentExpenseIds)}>
                {allExpanded ? 'Collapse all' : 'Expand all'}
              </button>
            )}
            <button className={styles.addBtn} onClick={() => isDesktop ? setExpenseInlineOpen(true) : setExpenseModal({ mode: 'new', parentId: null })}>+ Add</button>
          </div>
        </div>

        {isDesktop && (
          <InlineFormRow label="Add expense" open={expenseInlineOpen} onOpenChange={setExpenseInlineOpen}>
            {onCollapse => (
              <ExpenseFormModal
                inline
                initial={null}
                defaultParentId={null}
                expenses={expenses}
                envelopesFlat={envelopesFlat}
                defaultSourceEnvelopeId={undistributed?.id ?? ''}
                defaultCurrency={defaultCurrency}
                onSave={data => { handleSaveExpense(data); onCollapse() }}
                onCancel={onCollapse}
              />
            )}
          </InlineFormRow>
        )}

        {expenses.length === 0 ? (
          <p className={styles.empty}>No planned expenses yet.</p>
        ) : (
          <div className={styles.expenseTable}>
            <div className={styles.expenseTableHeader}>
              <span className={styles.expenseHeaderName}>Name</span>
              <span className={styles.pctCell} title="Percentage">%</span>
              <span className={styles.amountCell} title="Yearly">YR</span>
              <span className={styles.amountCell} title="Quarterly">QTR</span>
              <span className={styles.amountCell} title="Monthly">MON</span>
              <span className={styles.expenseHeaderActions} />
            </div>
            <DndContext sensors={sensors} onDragEnd={handleExpenseDragEnd}>
              {expenses
                .filter(e => !e.parentId)
                .sort((a, b) => a.name.localeCompare(b.name))
                .map(item => (
                  <ExpenseNode
                    key={item.id}
                    item={item}
                    allExpenses={expenses}
                    depth={0}
                    period={period}
                    expenseMonthlyTotals={expenseMonthlyTotals}
                    scheduledTransfers={scheduledTransfers}
                    expanded={expand}
                    onToggleExpand={expand.toggle}
                    onApplySingle={handleApplySingleExpense}
                    onResetExpense={handleResetExpense}
                    onAdd={parentId => setExpenseModal({ mode: 'new', parentId })}
                    onEdit={item => setExpenseModal({ mode: 'edit', item })}
                    onDelete={handleDeleteExpense}
                  />
                ))}
              <ExpenseRootDropZone />
            </DndContext>
          </div>
        )}
      </section>

      {/* One-time / scheduled transfer shortcut */}
      <div className={styles.transferRow}>
        <button className={styles.addTransferBtn} onClick={() => setAddTransfer(true)}>
          + Add envelope transfer
        </button>
      </div>

      {/* Action bar */}
      <div className={styles.actionBar}>
        <button className={styles.resetAllBtn} onClick={handleResetAll}>↺ Reset all</button>
        <button className={styles.applyAllBtn} onClick={handleApplyAll}>✓ Apply all transfers</button>
      </div>

      {/* ── Modals ─────────────────────────────────────────────────────────── */}

      {incomeModal && (
        <IncomeFormModal
          initial={incomeModal === 'new' ? null : incomeModal}
          envelopesFlat={envelopesFlat}
          defaultEnvelopeId={undistributed?.id ?? ''}
          defaultCurrency={defaultCurrency}
          onSave={handleSaveIncome}
          onCancel={() => setIncomeModal(null)}
        />
      )}

      {expenseModal && (
        <ExpenseFormModal
          initial={expenseModal.mode === 'edit' ? expenseModal.item : null}
          defaultParentId={expenseModal.parentId ?? null}
          expenses={expenses}
          envelopesFlat={envelopesFlat}
          defaultSourceEnvelopeId={undistributed?.id ?? ''}
          defaultCurrency={defaultCurrency}
          onSave={handleSaveExpense}
          onCancel={() => setExpenseModal(null)}
        />
      )}

      {convertDialog && (
        <ConvertLeafDialog
          leafItem={convertDialog.leafItem}
          newChildName={convertDialog.newChildData?.name ?? ''}
          onConfirm={handleConfirmConvert}
          onCancel={() => setConvertDialog(null)}
        />
      )}

      {pendingReparent && (
        <ConvertLeafDialog
          leafItem={pendingReparent.targetLeaf}
          newChildName={pendingReparent.dragName}
          onConfirm={handleConfirmDndReparent}
          onCancel={() => setPendingReparent(null)}
        />
      )}

      {applyDialog && (
        <ApplyDialog
          items={applyDialog.items}
          scope={applyDialog.scope}
          onScopeChange={scope => setApplyDialog(d => ({ ...d, scope }))}
          onConfirm={handleConfirmApply}
          onCancel={() => setApplyDialog(null)}
        />
      )}

      {addTransfer && (
        <EnvelopeTransferForm
          defaultMode="regular"
          onSave={() => { setAddTransfer(false); refresh() }}
          onCancel={() => setAddTransfer(false)}
        />
      )}

      {deleteConfirm && (
        <DeleteConfirmDialog
          item={deleteConfirm.item}
          descendants={deleteConfirm.descendants}
          onConfirm={handleConfirmDeleteExpense}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
    </div>
  )
}

// ─── Expense root drop zone ───────────────────────────────────────────────────

function ExpenseRootDropZone() {
  const { active } = useDndContext()
  const { setNodeRef, isOver } = useDroppable({ id: '__root__' })
  if (!active) return null
  return (
    <div
      ref={setNodeRef}
      className={`${styles.expenseRootDropZone} ${isOver ? styles.expenseRootDropZoneOver : ''}`}
    >
      Drop here to move to top level
    </div>
  )
}

// ─── Expense tree node (with drag-and-drop) ──────────────────────────────────

function ExpenseNode({
  item, allExpenses, depth, period, expenseMonthlyTotals, scheduledTransfers, expanded,
  onToggleExpand, onApplySingle, onResetExpense, onAdd, onEdit, onDelete,
}) {
  const children = allExpenses.filter(e => e.parentId === item.id)
  const isGroupOnly = item.envelopeId == null && item.amount == null
  const isParent = isGroupOnly || children.length > 0
  const isExpanded = expanded.has(item.id)
  const amounts = calcExpenseAmounts(item, allExpenses, period)
  const syncStatus = isParent ? null : expenseSyncStatus(item, scheduledTransfers)
  const isOutOfSync = syncStatus === 'out-of-sync' || syncStatus === 'not-applied'

  let cur = item.currency
  if (!cur) {
    const desc = getExpenseDescendants(item.id, allExpenses)
    cur = desc.find(d => d.currency)?.currency ?? null
  }
  const total = cur ? (expenseMonthlyTotals[cur] ?? 0) : 0
  const pct = amounts.monthly != null && total > 0 ? amounts.monthly / total * 100 : null

  // Whole-row click toggles collapse for parents (Phase 45c); ignore clicks on
  // the action buttons and the drag handle.
  function handleExpenseRowClick(e) {
    if (e.target.closest('button, input, [data-rowignore]')) return
    if (isParent) onToggleExpand(item.id)
  }

  // Long-press tooltip for sync buttons (mobile)
  const [tooltipText, setTooltipText] = useState(null)
  const longPressTimer = useRef(null)

  function handleSyncTouchStart(text) {
    longPressTimer.current = setTimeout(() => setTooltipText(text), 600)
  }
  function handleSyncTouchEnd() {
    clearTimeout(longPressTimer.current)
    if (tooltipText) setTimeout(() => setTooltipText(null), 1500)
  }
  function handleSyncTouchCancel() {
    clearTimeout(longPressTimer.current)
    setTooltipText(null)
  }

  // Drag-and-drop
  const { active } = useDndContext()
  const activeId = active?.id
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({ id: item.id })
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: item.id })
  const mergedRef = node => { setDragRef(node); setDropRef(node) }

  const isValidTarget = activeId && activeId !== item.id
    && !getDescendantIds(activeId, allExpenses).has(item.id)

  const wrapClass = [
    isOver && isValidTarget  ? styles.expenseDropValid   : '',
    isOver && !isValidTarget ? styles.expenseDropInvalid : '',
  ].filter(Boolean).join(' ')

  return (
    <div ref={mergedRef} className={wrapClass}>
      <div
        className={`${styles.expenseRow} ${isDragging ? styles.dragging : ''} ${isParent ? styles.expenseRowParent : ''}`}
        style={{ paddingLeft: `${8 + depth * 20}px` }}
        onClick={handleExpenseRowClick}
      >
        <div className={styles.expenseNameCell}>
          <span className={styles.expenseDragHandle} data-rowignore="1" {...listeners} {...attributes} title="Drag to reparent">≡</span>
          {isParent && (
            <button className={styles.expandBtn} onClick={() => onToggleExpand(item.id)}>
              {isExpanded ? '▾' : '▸'}
            </button>
          )}
          {!isParent && <span className={styles.leafDot} />}
          <span className={styles.expenseName}>{item.name}</span>
        </div>
        <span className={styles.pctCell}>{pct != null ? `${pct.toFixed(1)}%` : '—'}</span>
        <span className={styles.amountCell}>{amounts.yearly    != null ? fmtAmt(amounts.yearly)    : '—'}</span>
        <span className={styles.amountCell}>{amounts.quarterly != null ? fmtAmt(amounts.quarterly) : '—'}</span>
        <span className={styles.amountCell}>{amounts.monthly   != null ? fmtAmt(amounts.monthly)   : '—'}</span>
        <div className={styles.expenseActions}>
          {!isParent && isOutOfSync && (
            <span className={styles.syncActions}>
              {tooltipText && <span className={styles.syncTooltip}>{tooltipText}</span>}
              <button
                className={styles.syncBtn}
                title={syncStatus === 'not-applied' ? 'Not yet applied — click to create transfer' : 'Out of sync — click to apply'}
                onClick={() => onApplySingle(item)}
                onTouchStart={() => handleSyncTouchStart(syncStatus === 'not-applied' ? 'Not yet applied — click to create transfer' : 'Out of sync — click to apply')}
                onTouchEnd={handleSyncTouchEnd}
                onTouchCancel={handleSyncTouchCancel}
              >●</button>
              <button
                className={styles.resetBtn}
                title={syncStatus === 'not-applied' ? 'Clear amount' : 'Reset to current transfer amount'}
                onClick={() => onResetExpense(item)}
                onTouchStart={() => handleSyncTouchStart(syncStatus === 'not-applied' ? 'Clear amount' : 'Reset to current transfer amount')}
                onTouchEnd={handleSyncTouchEnd}
                onTouchCancel={handleSyncTouchCancel}
              >↺</button>
            </span>
          )}
          <button className={styles.rowBtn} onClick={() => onAdd(item.id)}>+</button>
          <button className={styles.rowBtn} onClick={() => onEdit(item)}>✎</button>
          <button className={`${styles.rowBtn} ${styles.rowBtnDanger}`} onClick={() => onDelete(item)}>×</button>
        </div>
      </div>
      {isParent && isExpanded && (
        children
          .sort((a, b) => a.name.localeCompare(b.name))
          .map(child => (
            <ExpenseNode
              key={child.id}
              item={child}
              allExpenses={allExpenses}
              depth={depth + 1}
              period={period}
              expenseMonthlyTotals={expenseMonthlyTotals}
              scheduledTransfers={scheduledTransfers}
              expanded={expanded}
              onToggleExpand={onToggleExpand}
              onApplySingle={onApplySingle}
              onResetExpense={onResetExpense}
              onAdd={onAdd}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))
      )}
    </div>
  )
}

// ─── Income form modal ────────────────────────────────────────────────────────

function IncomeFormModal({ initial, envelopesFlat, defaultEnvelopeId, defaultCurrency, onSave, onCancel, inline = false }) {
  const [form, setForm] = useState(() => initial ?? {
    name: '',
    amount: '',
    currency: defaultCurrency,
    frequency: 'monthly',
    dayOfExecution: 1,
    startDate: TODAY,
    endDate: '',
    date: TODAY,
    envelopeId: defaultEnvelopeId,
  })

  function set(field, value) { setForm(prev => ({ ...prev, [field]: value })) }

  function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim() || !form.amount) return
    onSave({ ...form, ...(initial ? { id: initial.id } : {}) })
  }

  const isOneTime = form.frequency === 'one-time'

  return (
    <div className={inline ? styles.inlineWrap : styles.backdrop}>
      <div className={inline ? styles.inlineBox : styles.modal}>
        <div className={styles.modalBody}>
          {!inline && <h2 className={styles.modalTitle}>{initial ? 'Edit planned income' : 'New planned income'}</h2>}
          <form id="income-form" onSubmit={handleSubmit} className={styles.form}>
            <label className={styles.label}>Name
              <input className={styles.input} value={form.name} onChange={e => set('name', e.target.value)} required />
            </label>

            <div className={styles.row}>
              <label className={styles.label} style={{ flex: 1 }}>Amount
                <input className={styles.input} type="number" min="0" step="0.01" value={form.amount} onChange={e => set('amount', e.target.value)} required />
              </label>
              <label className={styles.label} style={{ width: 100 }}>Currency
                <CurrencyDropdown className={styles.input} value={form.currency} onChange={v => set('currency', v)} />
              </label>
            </div>

            <label className={styles.label}>Frequency
              <select className={styles.select} value={form.frequency} onChange={e => set('frequency', e.target.value)}>
                <option value="one-time">One-time</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="yearly">Yearly</option>
              </select>
            </label>

            {isOneTime ? (
              <label className={styles.label}>Date
                <input className={styles.input} type="date" value={form.date} onChange={e => set('date', e.target.value)} />
              </label>
            ) : (
              <>
                <label className={styles.label}>Day of month
                  <select className={styles.select} value={form.dayOfExecution} onChange={e => set('dayOfExecution', Number(e.target.value))}>
                    {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </label>
                <div className={styles.row}>
                  <label className={styles.label} style={{ flex: 1 }}>Start date
                    <input className={styles.input} type="date" value={form.startDate} onChange={e => set('startDate', e.target.value)} />
                  </label>
                  <label className={styles.label} style={{ flex: 1 }}>End date (optional)
                    <input className={styles.input} type="date" value={form.endDate} onChange={e => set('endDate', e.target.value)} />
                  </label>
                </div>
              </>
            )}

            <label className={styles.label}>Lands in envelope
              <select className={styles.select} value={form.envelopeId} onChange={e => set('envelopeId', e.target.value)}>
                <option value="">— select envelope —</option>
                {envelopesFlat.map(e => (
                  <option key={e.id} value={e.id}>{INDENT.repeat(e.depth)}{e.name}</option>
                ))}
              </select>
            </label>
          </form>
        </div>
        <div className={styles.modalActions}>
          <button type="button" className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
          <button type="submit" form="income-form" className={styles.saveBtn}>Save</button>
        </div>
      </div>
    </div>
  )
}

// ─── Expense form modal ───────────────────────────────────────────────────────

function ExpenseFormModal({ initial, defaultParentId, expenses, envelopesFlat, defaultSourceEnvelopeId, defaultCurrency, onSave, onCancel, inline = false }) {
  const [form, setForm] = useState(() => {
    const base = {
      name: '',
      parentId: defaultParentId ?? '',
      envelopeId: '',
      sourceEnvelopeId: defaultSourceEnvelopeId,
      currency: defaultCurrency,
      amountBasis: 'monthly',
      dayOfExecution: 1,
      yearly: '',
      quarterly: '',
      monthly: '',
    }
    if (!initial) return base
    const amounts = initial.amount != null
      ? {
          yearly:    convertAmount(initial.amount, initial.amountBasis, 'yearly').toFixed(2),
          quarterly: convertAmount(initial.amount, initial.amountBasis, 'quarterly').toFixed(2),
          monthly:   convertAmount(initial.amount, initial.amountBasis, 'monthly').toFixed(2),
        }
      : { yearly: '', quarterly: '', monthly: '' }
    return { ...base, ...initial, ...amounts }
  })

  // "Group only" — when on, the item is saved as a parent (no envelope/amount/day/currency).
  // Default: on for new items under a parent that is already a group, otherwise off.
  // For existing items: on if the item has no envelopeId AND no amount.
  const [groupOnly, setGroupOnly] = useState(() => {
    if (initial) return initial.envelopeId == null && initial.amount == null
    return false
  })

  function set(field, value) { setForm(prev => ({ ...prev, [field]: value })) }

  function handleAmountChange(field, value) {
    // Store raw input — do NOT auto-format or recalculate while the user is typing.
    // Recalculation happens on blur (handleAmountBlur).
    setForm(prev => ({ ...prev, [field]: value, amountBasis: field }))
  }

  function handleAmountBlur(field) {
    const raw = form[field]
    if (raw === '' || raw == null) return
    const num = parseFloat(raw)
    if (isNaN(num)) return
    const yearly    = field === 'yearly'    ? num : convertAmount(num, field, 'yearly')
    const quarterly = field === 'quarterly' ? num : convertAmount(num, field, 'quarterly')
    const monthly   = field === 'monthly'   ? num : convertAmount(num, field, 'monthly')
    setForm(prev => ({
      ...prev,
      amountBasis: field,
      yearly:    yearly.toFixed(2),
      quarterly: quarterly.toFixed(2),
      monthly:   monthly.toFixed(2),
    }))
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim()) return

    if (groupOnly) {
      // Saved as a parent: all leaf-specific fields null.
      onSave({
        ...form,
        parentId:         form.parentId || null,
        envelopeId:       null,
        sourceEnvelopeId: null,
        currency:         null,
        amount:           null,
        amountBasis:      null,
        dayOfExecution:   null,
        ...(initial ? { id: initial.id, linkedScheduledTransferId: initial.linkedScheduledTransferId } : {}),
      })
      return
    }

    const basis = form.amountBasis || 'monthly'
    const rawAmount = basis === 'yearly' ? form.yearly : basis === 'quarterly' ? form.quarterly : form.monthly
    onSave({
      ...form,
      parentId:        form.parentId || null,
      envelopeId:      form.envelopeId || null,
      amount:          rawAmount !== '' ? Number(rawAmount) : null,
      ...(initial ? { id: initial.id, linkedScheduledTransferId: initial.linkedScheduledTransferId } : {}),
    })
  }

  // Build parent options as a depth-ordered flat list so the dropdown mirrors
  // the tree structure (children appear indented under their parent).
  function buildFlatOptions(items, parentId, depth, excludeId) {
    const children = items
      .filter(e => (e.parentId ?? null) === (parentId ?? null) && e.id !== excludeId)
      .sort((a, b) => a.name.localeCompare(b.name))
    const result = []
    for (const child of children) {
      result.push({ ...child, depth })
      result.push(...buildFlatOptions(items, child.id, depth + 1, excludeId))
    }
    return result
  }
  const parentOptions = buildFlatOptions(expenses, null, 0, initial?.id ?? null)

  return (
    <div className={inline ? styles.inlineWrap : styles.backdrop}>
      <div className={inline ? styles.inlineBox : styles.modal}>
        <div className={styles.modalBody}>
          {!inline && <h2 className={styles.modalTitle}>{initial ? 'Edit planned expense' : 'New planned expense'}</h2>}
          <form id="expense-form" onSubmit={handleSubmit} className={styles.form}>
            <label className={styles.label}>Name
              <input className={styles.input} value={form.name} onChange={e => set('name', e.target.value)} required />
            </label>

            <label className={styles.label}>Parent item (optional)
              <select className={styles.select} value={form.parentId ?? ''} onChange={e => set('parentId', e.target.value || null)}>
                <option value="">(root — no parent)</option>
                {parentOptions.map(e => <option key={e.id} value={e.id}>{INDENT.repeat(e.depth)}{e.name}</option>)}
              </select>
            </label>

            <label className={styles.groupOnlyLabel}>
              <input type="checkbox" checked={groupOnly} onChange={e => setGroupOnly(e.target.checked)} />
              <span>Group only (no envelope/amount)</span>
            </label>

            {!groupOnly && (
              <>
                <label className={styles.label}>From envelope (source)
                  <select className={styles.select} value={form.sourceEnvelopeId ?? ''} onChange={e => set('sourceEnvelopeId', e.target.value)}>
                    <option value="">— select —</option>
                    {envelopesFlat.map(e => (
                      <option key={e.id} value={e.id}>{INDENT.repeat(e.depth)}{e.name}</option>
                    ))}
                  </select>
                </label>

                <label className={styles.label}>To envelope (destination)
                  <select className={styles.select} value={form.envelopeId ?? ''} onChange={e => set('envelopeId', e.target.value)}>
                    <option value="">— select —</option>
                    {envelopesFlat.map(e => (
                      <option key={e.id} value={e.id}>{INDENT.repeat(e.depth)}{e.name}</option>
                    ))}
                  </select>
                </label>

                <label className={styles.label}>Day of month
                  <select className={styles.select} value={form.dayOfExecution} onChange={e => set('dayOfExecution', Number(e.target.value))}>
                    {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </label>

                <div className={styles.amountRow}>
                  <label className={styles.amountLabel}>YR
                    <input className={styles.amountInput} type="number" min="0" step="0.01" value={form.yearly} onChange={e => handleAmountChange('yearly', e.target.value)} onBlur={() => handleAmountBlur('yearly')} />
                  </label>
                  <label className={styles.amountLabel}>QTR
                    <input className={styles.amountInput} type="number" min="0" step="0.01" value={form.quarterly} onChange={e => handleAmountChange('quarterly', e.target.value)} onBlur={() => handleAmountBlur('quarterly')} />
                  </label>
                  <label className={styles.amountLabel}>MON
                    <input className={styles.amountInput} type="number" min="0" step="0.01" value={form.monthly} onChange={e => handleAmountChange('monthly', e.target.value)} onBlur={() => handleAmountBlur('monthly')} />
                  </label>
                  <label className={styles.amountLabel}>
                    <CurrencyDropdown className={styles.currencySelect} value={form.currency} onChange={v => set('currency', v)} />
                  </label>
                </div>
              </>
            )}
          </form>
        </div>
        <div className={styles.modalActions}>
          <button type="button" className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
          <button type="submit" form="expense-form" className={styles.saveBtn}>Save</button>
        </div>
      </div>
    </div>
  )
}

// ─── Leaf → parent conversion dialog ─────────────────────────────────────────

function ConvertLeafDialog({ leafItem, newChildName, onConfirm, onCancel }) {
  return (
    <div className={styles.backdrop}>
      <div className={styles.modal}>
        <div className={styles.modalBody}>
          <h2 className={styles.modalTitle}>Convert "{leafItem.name}" to a parent?</h2>
          <p className={styles.dialogText}>
            Adding <strong>{newChildName}</strong> as a child will convert <strong>{leafItem.name}</strong> into a parent item.
          </p>
          <p className={styles.dialogText}>This will delete:</p>
          <ul className={styles.dialogList}>
            {leafItem.amount != null && (
              <li>Planned amount: {leafItem.amount} {leafItem.currency} / {leafItem.amountBasis}</li>
            )}
            {leafItem.linkedScheduledTransferId && (
              <li>Linked scheduled transfer</li>
            )}
          </ul>
          <p className={styles.dialogWarning}>This cannot be undone.</p>
        </div>
        <div className={styles.modalActions}>
          <button className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
          <button className={styles.dangerBtn} onClick={onConfirm}>Convert</button>
        </div>
      </div>
    </div>
  )
}

// ─── Apply dialog ─────────────────────────────────────────────────────────────

function ApplyDialog({ items, scope, onScopeChange, onConfirm, onCancel }) {
  const toCreate = items.filter(i => i.status === 'not-applied')
  const toUpdate = items.filter(i => i.status === 'out-of-sync')
  const hasExisting = toUpdate.length > 0

  return (
    <div className={styles.backdrop}>
      <div className={styles.modal}>
        <div className={styles.modalBody}>
          <h2 className={styles.modalTitle}>Apply changes to transfers</h2>

          {toCreate.length > 0 && (
            <>
              <p className={styles.dialogSubtitle}>{toCreate.length} item{toCreate.length !== 1 ? 's' : ''} will be created:</p>
              <ul className={styles.dialogList}>
                {toCreate.map(({ kind, item }) => (
                  <li key={item.id}>{item.name} ({kind})</li>
                ))}
              </ul>
            </>
          )}

          {toUpdate.length > 0 && (
            <>
              <p className={styles.dialogSubtitle}>{toUpdate.length} item{toUpdate.length !== 1 ? 's' : ''} will be updated:</p>
              <ul className={styles.dialogList}>
                {toUpdate.map(({ kind, item }) => (
                  <li key={item.id}>{item.name} ({kind})</li>
                ))}
              </ul>
            </>
          )}

          {hasExisting && (
            <div className={styles.scopeChoice}>
              <p className={styles.dialogSubtitle}>For existing transfers:</p>
              <label className={styles.radioLabel}>
                <input type="radio" name="scope" value="next" checked={scope === 'next'} onChange={() => onScopeChange('next')} />
                Next occurrence only
              </label>
              <label className={styles.radioLabel}>
                <input type="radio" name="scope" value="whole" checked={scope === 'whole'} onChange={() => onScopeChange('whole')} />
                The whole series
              </label>
            </div>
          )}
        </div>
        <div className={styles.modalActions}>
          <button className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
          <button className={styles.saveBtn} onClick={onConfirm}>Apply</button>
        </div>
      </div>
    </div>
  )
}

// ─── Delete confirm dialog ────────────────────────────────────────────────────

function DeleteConfirmDialog({ item, descendants, onConfirm, onCancel }) {
  return (
    <div className={styles.backdrop}>
      <div className={styles.modal}>
        <div className={styles.modalBody}>
          <h2 className={styles.modalTitle}>Delete "{item.name}"?</h2>
          <p className={styles.dialogText}>This will also delete {descendants.length} descendant{descendants.length !== 1 ? 's' : ''}:</p>
          <ul className={styles.dialogList}>
            {descendants.map(d => <li key={d.id}>{d.name}</li>)}
          </ul>
          <p className={styles.dialogWarning}>This cannot be undone.</p>
        </div>
        <div className={styles.modalActions}>
          <button className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
          <button className={styles.dangerBtn} onClick={onConfirm}>Delete all</button>
        </div>
      </div>
    </div>
  )
}
