import { useState, useEffect } from 'react'
import { useMediaQuery, DESKTOP } from '../utils/mediaQuery'
import InlineFormRow from '../components/InlineFormRow'
import {
  getBudgets,
  createBudget,
  updateBudget,
  deleteBudget,
  computeBudgetProgress,
  computeMonthlyActual,
} from '../data/budgets'
import { getActiveCategories, getCategoriesFlat } from '../data/categories'
import { indentLabel } from '../utils/hierarchy'
import { convertAmount } from '../utils/frequency'
import { convertToMain, ensureRates } from '../utils/currency'
import { getMainCurrency } from '../data/settings'
import CurrencyDropdown from '../components/CurrencyDropdown'
import styles from './Budgets.module.css'
import { fmtAmt } from '../utils/format'

const PERIOD_SHORT = { monthly: 'Monthly', quarterly: 'Quarterly', yearly: 'Yearly' }

const BAR_CLASS    = { ok: 'barOk', 'near-limit': 'barNear', over: 'barOver' }
const PCT_CLASS    = { ok: 'pctOk', 'near-limit': 'pctNear', over: 'pctOver' }

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function Budgets({ onBack }) {
  const isDesktop = useMediaQuery(DESKTOP)
  const [view, setView]               = useState('tree')   // 'tree' | 'form'
  const [editBudget, setEditBudget]   = useState(null)     // null = new
  const mainCurrency = getMainCurrency()
  const [, rerender] = useState(0)
  useEffect(() => {
    let cancelled = false
    ensureRates(mainCurrency).then(() => { if (!cancelled) rerender(n => n + 1) }).catch(() => {})
    return () => { cancelled = true }
  }, [mainCurrency])
  const [formCatId, setFormCatId]     = useState(null)     // pre-fill category when clicking "not set"
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [activeType, setActiveType]   = useState('expense')
  const [collapsed, setCollapsed]     = useState({})       // { id: true } = collapsed
  const [inlineOpen, setInlineOpen]   = useState(false)

  function openLeaf(categoryId, budget) {
    if (isDesktop && !budget) {
      // New budget on desktop: open inline form pre-filled with this category
      setFormCatId(categoryId)
      setEditBudget(null)
      setInlineOpen(true)
    } else {
      setFormCatId(categoryId)
      setEditBudget(budget ?? null)
      setView('form')
    }
  }

  function handleSaved() { setView('tree') }

  function handleDeleteRequest(budget) { setDeleteTarget(budget) }

  function confirmDelete() {
    deleteBudget(deleteTarget.id)
    setDeleteTarget(null)
    setView('tree')
  }

  // ── Collapse / expand all ──────────────────────────────────────────────────

  const allCats    = getActiveCategories().filter(c => c.type === activeType)
  const parentIds  = new Set(allCats.map(c => c.parentId).filter(Boolean))
  const parentCatIds = allCats.filter(c => parentIds.has(c.id)).map(c => c.id)
  const allCollapsed = parentCatIds.length > 0 && parentCatIds.every(id => collapsed[id])

  function toggleCollapseAll() {
    if (allCollapsed) {
      setCollapsed({})
    } else {
      const next = {}
      for (const id of parentCatIds) next[id] = true
      setCollapsed(next)
    }
  }

  function toggleNode(id) {
    setCollapsed(prev => ({ ...prev, [id]: !prev[id] }))
  }

  // ── Form view ──────────────────────────────────────────────────────────────

  if (view === 'form') {
    return (
      <BudgetForm
        initial={editBudget}
        initialCategoryId={formCatId}
        onSave={handleSaved}
        onCancel={() => setView('tree')}
        onDelete={editBudget ? () => handleDeleteRequest(editBudget) : undefined}
        deleteDialog={
          deleteTarget ? (
            <DeleteDialog
              onConfirm={confirmDelete}
              onCancel={() => setDeleteTarget(null)}
            />
          ) : null
        }
      />
    )
  }

  // ── Budget totals (monthly-normalized, per currency) ──────────────────────

  const budgetTotals = {}
  const budgetsForType = getBudgets().filter(b => {
    const cats = getActiveCategories()
    return cats.find(c => c.id === b.categoryId && c.type === activeType)
  })
  for (const b of budgetsForType) {
    const progress = computeBudgetProgress(b)
    if (!progress) continue
    const cur = b.currency
    if (!budgetTotals[cur]) budgetTotals[cur] = { target: 0, actual: 0 }
    budgetTotals[cur].target += convertAmount(b.amount, b.period, 'monthly')
    budgetTotals[cur].actual += convertAmount(progress.actual, b.period, 'monthly')
  }
  const budgetEntries = Object.entries(budgetTotals)
  const budgetNeedsConversion = budgetEntries.some(([cur]) => cur !== mainCurrency)
  let mainTarget = null, mainActual = null
  if (budgetNeedsConversion || (budgetEntries.length === 1 && budgetEntries[0][0] !== mainCurrency)) {
    let tSum = 0, aSum = 0
    for (const [cur, { target, actual }] of budgetEntries) {
      const ct = convertToMain(target, cur, mainCurrency)
      const ca = convertToMain(actual, cur, mainCurrency)
      if (ct === null || ca === null) { tSum = null; break }
      tSum += ct; aSum += ca
    }
    mainTarget = tSum; mainActual = aSum
  } else if (budgetEntries.length === 1) {
    mainTarget = budgetEntries[0][1].target
    mainActual = budgetEntries[0][1].actual
  }

  // ── Tree view ──────────────────────────────────────────────────────────────

  const budgets   = getBudgets()
  const budgetMap = Object.fromEntries(budgets.map(b => [b.categoryId, b]))
  const roots     = allCats.filter(c => !c.parentId)

  return (
    <div className={styles.screen}>
      {deleteTarget && (
        <DeleteDialog
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      <div className={styles.header}>
        <button className={styles.backBtn} onClick={onBack}>←</button>
        <h1 className={styles.title}>Category budgets</h1>
        <div style={{ width: 32 }} />
      </div>

      <div className={styles.typeTabs}>
        <button
          className={`${styles.typeTab} ${activeType === 'expense' ? styles.typeTabActive : ''}`}
          onClick={() => { setActiveType('expense'); setCollapsed({}) }}
        >
          Expense
        </button>
        <button
          className={`${styles.typeTab} ${activeType === 'income' ? styles.typeTabActive : ''}`}
          onClick={() => { setActiveType('income'); setCollapsed({}) }}
        >
          Income
        </button>
      </div>

      {parentCatIds.length > 0 && (
        <div className={styles.toolbar}>
          <button className={styles.collapseAllBtn} onClick={toggleCollapseAll}>
            {allCollapsed ? 'Expand all' : 'Collapse all'}
          </button>
        </div>
      )}

      {isDesktop && (
        <InlineFormRow label="Add budget" open={inlineOpen} onOpenChange={open => {
          setInlineOpen(open)
          if (!open) setFormCatId(null)
        }}>
          {onCollapse => (
            <BudgetForm
              inline
              initial={null}
              initialCategoryId={formCatId}
              onSave={() => { setView('tree'); onCollapse() }}
              onCancel={() => { setFormCatId(null); onCollapse() }}
            />
          )}
        </InlineFormRow>
      )}

      {mainTarget !== null && (
        <div className={styles.budgetTotalsBar}>
          <span className={styles.budgetTotalsLabel}>Monthly total</span>
          <span className={styles.budgetTotalsValues}>
            <span className={styles.budgetTotalsActual}>{fmtAmt(mainActual)}</span>
            <span className={styles.budgetTotalsSep}> / </span>
            <span className={styles.budgetTotalsTarget}>{fmtAmt(mainTarget)} {mainCurrency}</span>
          </span>
        </div>
      )}

      <div className={styles.tree}>
        {roots.length === 0 ? (
          <p className={styles.empty}>No {activeType} categories yet.</p>
        ) : (
          roots.map(cat => (
            <TreeNode
              key={cat.id}
              category={cat}
              all={allCats}
              budgetMap={budgetMap}
              parentIds={parentIds}
              depth={0}
              collapsed={collapsed}
              onToggle={toggleNode}
              onLeafClick={openLeaf}
            />
          ))
        )}
      </div>
    </div>
  )
}

// ─── Tree node ─────────────────────────────────────────────────────────────────

function TreeNode({ category, all, budgetMap, parentIds, depth, collapsed, onToggle, onLeafClick }) {
  const isParent  = parentIds.has(category.id)
  const children  = all.filter(c => c.parentId === category.id)
  const isCollapsed = collapsed[category.id]

  if (!isParent) {
    const budget   = budgetMap[category.id] ?? null
    const progress = budget ? computeBudgetProgress(budget) : null
    const monthly  = budget ? null : computeMonthlyActual(category.id)

    return (
      <div style={{ paddingLeft: depth * 20 }}>
        <button className={styles.leafRow} onClick={() => onLeafClick(category.id, budget)}>
          <span className={styles.leafName}>{category.name}</span>
          {budget && progress
            ? <LeafBudgetInfo budget={budget} progress={progress} />
            : <LeafNotSet actual={monthly} />
          }
        </button>
      </div>
    )
  }

  // Parent
  const monthly = computeMonthlyActual(category.id)

  return (
    <div>
      <div className={styles.parentRow} style={{ paddingLeft: depth * 20 }}>
        <button className={styles.collapseBtn} onClick={() => onToggle(category.id)}>
          {isCollapsed ? '▶' : '▼'}
        </button>
        <span className={styles.parentName}>{category.name}</span>
        <span className={styles.parentActual}>
          {monthly > 0 ? fmtAmt(monthly) : '—'}
        </span>
      </div>

      {!isCollapsed && children.map(child => (
        <TreeNode
          key={child.id}
          category={child}
          all={all}
          budgetMap={budgetMap}
          parentIds={parentIds}
          depth={depth + 1}
          collapsed={collapsed}
          onToggle={onToggle}
          onLeafClick={onLeafClick}
        />
      ))}
    </div>
  )
}

// ─── Leaf sub-components ──────────────────────────────────────────────────────

function LeafBudgetInfo({ budget, progress }) {
  const pct    = Math.round(progress.percentUsed * 100)
  const barPct = Math.min(progress.percentUsed * 100, 100)

  return (
    <div className={styles.leafRight}>
      <div className={styles.leafAmounts}>
        <span className={styles.leafActual}>{fmtAmt(progress.actual)}</span>
        <span className={styles.leafSep}> / </span>
        <span className={styles.leafTarget}>{fmtAmt(budget.amount)} {budget.currency}</span>
        <span className={`${styles.leafPct} ${styles[PCT_CLASS[progress.status]]}`}>{pct}%</span>
      </div>
      <div className={styles.barRow}>
        <span className={styles.periodLabel}>{PERIOD_SHORT[budget.period]}</span>
        <div className={styles.barTrack}>
          <div
            className={`${styles.barFill} ${styles[BAR_CLASS[progress.status]]}`}
            style={{ width: `${barPct}%` }}
          />
        </div>
      </div>
    </div>
  )
}

function LeafNotSet({ actual }) {
  return (
    <div className={`${styles.leafRight} ${styles.leafRightNotSet}`}>
      <span className={styles.notSetActual}>{actual > 0 ? fmtAmt(actual) : '—'}</span>
      <span className={styles.notSetBadge}>not set</span>
    </div>
  )
}

// ─── Budget form ──────────────────────────────────────────────────────────────

function BudgetForm({ initial, initialCategoryId, onSave, onCancel, onDelete, deleteDialog, inline = false }) {
  const allBudgets = getBudgets()
  const allActive  = getActiveCategories()

  // Leaves only: a category is a leaf if nothing uses it as a parentId
  const allParentIds = new Set(allActive.map(c => c.parentId).filter(Boolean))
  const incomeLeavesFlat  = getCategoriesFlat('income').filter(c => !allParentIds.has(c.id))
  const expenseLeavesFlat = getCategoriesFlat('expense').filter(c => !allParentIds.has(c.id))

  // Exclude already-budgeted categories (except the one currently being edited)
  const usedIds = new Set(
    allBudgets
      .filter(b => !initial || b.id !== initial.id)
      .map(b => b.categoryId)
  )
  const availableIncomeCategories  = incomeLeavesFlat.filter(c => !usedIds.has(c.id))
  const availableExpenseCategories = expenseLeavesFlat.filter(c => !usedIds.has(c.id))

  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? initialCategoryId ?? '')
  const [amount, setAmount]         = useState(initial?.amount?.toString() ?? '')
  const [currency, setCurrency]     = useState(initial?.currency ?? 'EUR')
  const [period, setPeriod]         = useState(initial?.period ?? 'monthly')

  function handleSubmit(e) {
    e.preventDefault()
    if (!categoryId || !amount || Number(amount) <= 0) return
    if (initial) {
      updateBudget(initial.id, { categoryId, amount: Number(amount), currency, period })
    } else {
      createBudget({ categoryId, amount: Number(amount), currency, period })
    }
    onSave()
  }

  if (inline) {
    return (
      <form className={styles.form} onSubmit={handleSubmit} style={{ padding: '16px' }}>
        {deleteDialog}
        <div className={styles.field}>
          <label className={styles.label}>Category</label>
          <select className={styles.input} value={categoryId} onChange={e => setCategoryId(e.target.value)} required>
            <option value="">— Select a category —</option>
            {availableIncomeCategories.length > 0 && <option disabled>— Income —</option>}
            {availableIncomeCategories.map(c => <option key={c.id} value={c.id}>{indentLabel(c)}</option>)}
            {availableExpenseCategories.length > 0 && <option disabled>— Expense —</option>}
            {availableExpenseCategories.map(c => <option key={c.id} value={c.id}>{indentLabel(c)}</option>)}
          </select>
        </div>
        <div className={styles.amountRow}>
          <div className={`${styles.field} ${styles.fieldGrow}`}>
            <label className={styles.label}>Amount</label>
            <input className={styles.input} type="number" min="0.01" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" required />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Currency</label>
            <CurrencyDropdown className={styles.input} value={currency} onChange={setCurrency} />
          </div>
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Period</label>
          <select className={styles.input} value={period} onChange={e => setPeriod(e.target.value)}>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="yearly">Yearly</option>
          </select>
        </div>
        <div className={styles.formActions}>
          <button type="button" className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
          <button type="submit" className={styles.saveBtn} disabled={!categoryId || !amount || Number(amount) <= 0}>Save</button>
        </div>
      </form>
    )
  }

  return (
    <div className={styles.screen}>
      {deleteDialog}

      <div className={styles.header}>
        <button className={styles.backBtn} onClick={onCancel}>←</button>
        <h1 className={styles.title}>{initial ? 'Edit budget' : 'New category budget'}</h1>
        <div style={{ width: 32 }} />
      </div>

      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.field}>
          <label className={styles.label}>Category</label>
          <select
            className={styles.input}
            value={categoryId}
            onChange={e => setCategoryId(e.target.value)}
            required
          >
            <option value="">— Select a category —</option>
            {availableIncomeCategories.length > 0 && <option disabled>— Income —</option>}
            {availableIncomeCategories.map(c => (
              <option key={c.id} value={c.id}>{indentLabel(c)}</option>
            ))}
            {availableExpenseCategories.length > 0 && <option disabled>— Expense —</option>}
            {availableExpenseCategories.map(c => (
              <option key={c.id} value={c.id}>{indentLabel(c)}</option>
            ))}
          </select>
        </div>

        <div className={styles.amountRow}>
          <div className={`${styles.field} ${styles.fieldGrow}`}>
            <label className={styles.label}>Amount</label>
            <input
              className={styles.input}
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0.00"
              required
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Currency</label>
            <input
              className={`${styles.input} ${styles.currencyInput}`}
              type="text"
              maxLength={3}
              value={currency}
              onChange={e => setCurrency(e.target.value.toUpperCase())}
              placeholder="EUR"
            />
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Period</label>
          <select
            className={styles.input}
            value={period}
            onChange={e => setPeriod(e.target.value)}
          >
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="yearly">Yearly</option>
          </select>
        </div>

        <div className={styles.formActions}>
          {onDelete && (
            <button type="button" className={styles.deleteBtn} onClick={onDelete}>
              Delete
            </button>
          )}
          <button type="button" className={styles.cancelBtn} onClick={onCancel}>
            Cancel
          </button>
          <button
            type="submit"
            className={styles.saveBtn}
            disabled={!categoryId || !amount || Number(amount) <= 0}
          >
            Save
          </button>
        </div>
      </form>
    </div>
  )
}

// ─── Delete dialog ────────────────────────────────────────────────────────────

function DeleteDialog({ onConfirm, onCancel }) {
  return (
    <div className={styles.dialogBackdrop}>
      <div className={styles.dialog}>
        <h3 className={styles.dialogTitle}>Delete this budget?</h3>
        <p className={styles.dialogText}>
          The budget target will be removed. All historical transactions remain intact.
        </p>
        <p className={styles.dialogWarning}>This cannot be undone.</p>
        <div className={styles.dialogActions}>
          <button className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
          <button className={styles.deleteConfirmBtn} onClick={onConfirm}>Delete</button>
        </div>
      </div>
    </div>
  )
}
