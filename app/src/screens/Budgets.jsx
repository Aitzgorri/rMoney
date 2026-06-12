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
import {
  getCategories, getActiveCategories, getCategoriesFlat,
  createCategory, updateCategory, deleteCategory, archiveBuiltInCategory, getDescendants,
} from '../data/categories'
import { indentLabel } from '../utils/hierarchy'
import { convertAmount } from '../utils/frequency'
import { convertToMain, ensureRates } from '../utils/currency'
import { getMainCurrency } from '../data/settings'
import {
  DndContext, useDraggable, useDroppable, useDndContext,
  MouseSensor, TouchSensor, useSensor, useSensors,
} from '@dnd-kit/core'
import { getDescendantIds } from '../utils/treeDnd'
import { useCollapseState } from '../utils/useCollapseState'
import CurrencyDropdown from '../components/CurrencyDropdown'
import styles from './Budgets.module.css'
import { fmtAmt, parseAmount } from '../utils/format'
import AmountInput from '../components/AmountInput'

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
  function refresh() { rerender(n => n + 1) }
  useEffect(() => {
    let cancelled = false
    ensureRates(mainCurrency).then(() => { if (!cancelled) rerender(n => n + 1) }).catch(() => {})
    return () => { cancelled = true }
  }, [mainCurrency])
  const [formCatId, setFormCatId]     = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)   // budget delete
  const [activeType, setActiveType]   = useState('expense')
  const collapse = useCollapseState('rmoney_budgets_collapsed')  // persisted collapsed-id set
  const [inlineOpen, setInlineOpen]   = useState(false)

  // ── Category management state (merged from the old Categories page) ──────────
  const [editing, setEditing]         = useState(null)     // { id, name }
  const [adding, setAdding]           = useState(null)     // parentId | 'root'
  const [addingType, setAddingType]   = useState(null)
  const [newName, setNewName]         = useState('')
  const [confirmDeleteCat, setConfirmDeleteCat] = useState(null) // { category, descendants }
  const [confirmArchive, setConfirmArchive]     = useState(null) // { category }
  const [archiveSuccessorId, setArchiveSuccessorId] = useState('')

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 500, tolerance: 5 } }),
  )

  function openLeaf(categoryId, budget) {
    if (isDesktop && !budget) {
      setFormCatId(categoryId); setEditBudget(null); setInlineOpen(true)
    } else {
      setFormCatId(categoryId); setEditBudget(budget ?? null); setView('form')
    }
  }

  function handleSaved() { setView('tree'); refresh() }
  function handleDeleteRequest(budget) { setDeleteTarget(budget) }
  function confirmDelete() { deleteBudget(deleteTarget.id); setDeleteTarget(null); setView('tree'); refresh() }

  // ── Category CRUD ────────────────────────────────────────────────────────────
  function startAdding(parentId, type) { setAdding(parentId); setAddingType(type); setNewName(''); setEditing(null) }
  function startEditing(category) { setEditing({ id: category.id, name: category.name }); setAdding(null) }
  function handleAddCategory(e) {
    e.preventDefault()
    if (!newName.trim()) return
    createCategory({ type: addingType, name: newName.trim(), parentId: adding === 'root' ? null : adding })
    setAdding(null); setNewName(''); refresh()
  }
  function handleEditSave(e) {
    e.preventDefault()
    if (!editing.name.trim()) return
    updateCategory(editing.id, { name: editing.name.trim() })
    setEditing(null); refresh()
  }
  function handleDeleteCatRequest(category) {
    setConfirmDeleteCat({ category, descendants: getDescendants(category.id, getCategories()) })
  }
  function handleDeleteCatConfirm() { deleteCategory(confirmDeleteCat.category.id); setConfirmDeleteCat(null); refresh() }
  function handleArchiveRequest(category) { setArchiveSuccessorId(''); setConfirmArchive({ category }) }
  function handleArchiveConfirm() {
    if (!archiveSuccessorId) return
    archiveBuiltInCategory(confirmArchive.category.id, archiveSuccessorId)
    setConfirmArchive(null); refresh()
  }

  function handleDragEnd({ active, over }) {
    if (!over) return
    const dragId = active.id, targetId = over.id
    const all = getCategories()
    const drag = all.find(c => c.id === dragId)
    if (!drag || drag.isBuiltIn) return
    if (targetId === '__root__') { if (drag.parentId !== null) { updateCategory(dragId, { parentId: null }); refresh() } return }
    if (dragId === targetId) return
    const target = all.find(c => c.id === targetId)
    if (!target || target.isArchived || drag.type !== target.type) return
    if (getDescendantIds(dragId, all).has(targetId)) return
    if (drag.parentId === targetId) return
    updateCategory(dragId, { parentId: targetId }); refresh()
  }

  // ── Collapse / expand all ──────────────────────────────────────────────────
  const allCats    = getActiveCategories().filter(c => c.type === activeType)
  const parentIds  = new Set(allCats.map(c => c.parentId).filter(Boolean))
  const parentCatIds = allCats.filter(c => parentIds.has(c.id)).map(c => c.id)
  const allCollapsed = parentCatIds.length > 0 && parentCatIds.every(id => collapse.has(id))
  function toggleCollapseAll() {
    if (allCollapsed) collapse.clear()
    else collapse.setAll(parentCatIds)
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
        deleteDialog={deleteTarget ? <DeleteDialog onConfirm={confirmDelete} onCancel={() => setDeleteTarget(null)} /> : null}
      />
    )
  }

  // ── Budget totals (monthly-normalized, per currency) ──────────────────────
  const budgetTotals = {}
  const budgetsForType = getBudgets().filter(b => getActiveCategories().find(c => c.id === b.categoryId && c.type === activeType))
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
  const budgetMap = Object.fromEntries(getBudgets().map(b => [b.categoryId, b]))
  const roots     = allCats.filter(c => !c.parentId)

  return (
    <div className={styles.screen}>
      {deleteTarget && <DeleteDialog onConfirm={confirmDelete} onCancel={() => setDeleteTarget(null)} />}

      {confirmDeleteCat && (
        <div className={styles.dialogBackdrop}>
          <div className={styles.dialog}>
            <h3 className={styles.dialogTitle}>Delete "{confirmDeleteCat.category.name}"?</h3>
            {confirmDeleteCat.descendants.length > 0 && (
              <p className={styles.dialogText}>This will also delete: {confirmDeleteCat.descendants.map(d => d.name).join(', ')}.</p>
            )}
            <p className={styles.dialogWarning}>Any budgets on these categories are removed too. This cannot be undone.</p>
            <div className={styles.dialogActions}>
              <button className={styles.cancelBtn} onClick={() => setConfirmDeleteCat(null)}>Cancel</button>
              <button className={styles.deleteConfirmBtn} onClick={handleDeleteCatConfirm}>Delete all</button>
            </div>
          </div>
        </div>
      )}

      {confirmArchive && (() => {
        const successors = allCats.filter(c => !c.isArchived && c.id !== confirmArchive.category.id)
        return (
          <div className={styles.dialogBackdrop}>
            <div className={styles.dialog}>
              <h3 className={styles.dialogTitle}>Archive "{confirmArchive.category.name}"?</h3>
              <p className={styles.dialogText}>Choose a replacement default for new {confirmArchive.category.type} transactions:</p>
              <select className={styles.input} value={archiveSuccessorId} onChange={e => setArchiveSuccessorId(e.target.value)}>
                <option value="">— Select a category —</option>
                {successors.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {successors.length === 0 && <p className={styles.dialogWarning}>No other {confirmArchive.category.type} categories exist. Add one first.</p>}
              <div className={styles.dialogActions}>
                <button className={styles.cancelBtn} onClick={() => setConfirmArchive(null)}>Cancel</button>
                <button className={styles.deleteConfirmBtn} onClick={handleArchiveConfirm} disabled={!archiveSuccessorId}>Archive</button>
              </div>
            </div>
          </div>
        )
      })()}

      <div className={styles.header}>
        <button className={styles.backBtn} onClick={onBack}>←</button>
        <h1 className={styles.title}>Categories &amp; budgets</h1>
        <div style={{ width: 32 }} />
      </div>

      <div className={styles.typeTabs}>
        <button className={`${styles.typeTab} ${activeType === 'expense' ? styles.typeTabActive : ''}`}
          onClick={() => { setActiveType('expense'); setAdding(null); setEditing(null) }}>Expense</button>
        <button className={`${styles.typeTab} ${activeType === 'income' ? styles.typeTabActive : ''}`}
          onClick={() => { setActiveType('income'); setAdding(null); setEditing(null) }}>Income</button>
      </div>

      {parentCatIds.length > 0 && (
        <div className={styles.toolbar}>
          <button className={styles.collapseAllBtn} onClick={toggleCollapseAll}>{allCollapsed ? 'Expand all' : 'Collapse all'}</button>
        </div>
      )}

      {isDesktop && (
        <InlineFormRow label="Add budget" open={inlineOpen} onOpenChange={open => { setInlineOpen(open); if (!open) setFormCatId(null) }}>
          {onCollapse => (
            <BudgetForm inline initial={null} initialCategoryId={formCatId}
              onSave={() => { setView('tree'); refresh(); onCollapse() }}
              onCancel={() => { setFormCatId(null); onCollapse() }} />
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

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className={styles.tree}>
          {roots.length === 0 ? (
            <p className={styles.empty}>No {activeType} categories yet.</p>
          ) : roots.map(cat => (
            <TreeNode
              key={cat.id} category={cat} all={allCats} budgetMap={budgetMap} parentIds={parentIds}
              depth={0} collapse={collapse} onLeafClick={openLeaf}
              editing={editing} onStartEditing={startEditing}
              onEditChange={name => setEditing(prev => ({ ...prev, name }))}
              onEditSave={handleEditSave} onCancelEdit={() => setEditing(null)}
              adding={adding} newName={newName} onNewNameChange={setNewName}
              onStartAdding={startAdding} onAdd={handleAddCategory} onCancelAdd={() => setAdding(null)}
              onDeleteRequest={handleDeleteCatRequest} onArchiveRequest={handleArchiveRequest}
              activeType={activeType}
            />
          ))}

          {adding === 'root' && addingType === activeType ? (
            <AddForm value={newName} onChange={setNewName} onSubmit={handleAddCategory} onCancel={() => setAdding(null)} />
          ) : (
            <button className={styles.addRoot} onClick={() => startAdding('root', activeType)}>+ Add {activeType} category</button>
          )}

          <CategoryRootDropZone />
        </div>
      </DndContext>
    </div>
  )
}

// ─── Tree node (category + budget, with management) ─────────────────────────────

function TreeNode({
  category, all, budgetMap, parentIds, depth, collapse, onLeafClick,
  editing, onStartEditing, onEditChange, onEditSave, onCancelEdit,
  adding, newName, onNewNameChange, onStartAdding, onAdd, onCancelAdd,
  onDeleteRequest, onArchiveRequest, activeType,
}) {
  const isParent    = parentIds.has(category.id)
  const children    = all.filter(c => c.parentId === category.id)
  const isCollapsed = collapse.has(category.id)
  const isEditing   = editing?.id === category.id
  const isAdding    = adding === category.id
  const budget      = !isParent ? (budgetMap[category.id] ?? null) : null
  const progress    = budget ? computeBudgetProgress(budget) : null
  const monthly     = computeMonthlyActual(category.id)

  const { active } = useDndContext()
  const activeId = active?.id
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({ id: category.id, disabled: !!category.isBuiltIn })
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: category.id })
  const mergedRef = node => { setDragRef(node); setDropRef(node) }
  const isValidTarget = activeId && activeId !== category.id
    && !getDescendantIds(activeId, all).has(category.id)
    && all.find(c => c.id === activeId)?.type === category.type
  const dropClass = isOver ? (isValidTarget ? styles.dropValid : styles.dropInvalid) : ''

  function handleRowClick(e) {
    if (isEditing || e.target.closest('button, input, [data-rowignore]')) return
    if (isParent) collapse.toggle(category.id)
    else onLeafClick(category.id, budget)
  }

  return (
    <div ref={mergedRef} className={`${styles.node} ${isDragging ? styles.dragging : ''} ${dropClass}`} style={{ marginLeft: depth * 16 }}>
      <div className={styles.treeRow} onClick={handleRowClick}>
        {category.isBuiltIn
          ? <span className={styles.dragHandleHidden} />
          : <span className={styles.dragHandle} data-rowignore="1" {...listeners} {...attributes} title="Drag to reparent">≡</span>}

        <button className={styles.collapseBtn} onClick={() => isParent && collapse.toggle(category.id)}
          style={{ visibility: isParent ? 'visible' : 'hidden' }}
          title={isParent ? (isCollapsed ? 'Expand' : 'Collapse') : undefined}>
          {isCollapsed ? '▶' : '▼'}
        </button>

        {isEditing ? (
          <form className={styles.inlineForm} onSubmit={onEditSave}>
            <input className={styles.inlineInput} value={editing.name} onChange={e => onEditChange(e.target.value)} autoFocus />
            <button type="submit" className={styles.inlineSave} disabled={!editing.name.trim()}>✓</button>
            <button type="button" className={styles.inlineCancel} onClick={onCancelEdit}>✕</button>
          </form>
        ) : (
          <>
            <span className={styles.treeName}>{category.name}</span>
            {isParent
              ? <span className={styles.parentActual}>{monthly > 0 ? fmtAmt(monthly) : '—'}</span>
              : (budget && progress ? <LeafBudgetInfo budget={budget} progress={progress} /> : <LeafNotSet actual={monthly} />)}
            <div className={styles.actions}>
              <button className={styles.actionBtn} onClick={() => onStartEditing(category)} title="Rename" aria-label="Rename">✎</button>
              <button className={styles.actionBtn} onClick={() => onStartAdding(category.id, activeType)} title="Add subcategory" aria-label="Add subcategory">+</button>
              {category.isBuiltIn
                ? <button className={styles.actionBtn} onClick={() => onArchiveRequest(category)} title="Archive" aria-label="Archive">⊘</button>
                : <button className={styles.actionBtnDelete} onClick={() => onDeleteRequest(category)} title="Delete" aria-label="Delete category">×</button>}
            </div>
          </>
        )}
      </div>

      {isAdding && (
        <div style={{ marginLeft: 16 }}>
          <AddForm value={newName} onChange={onNewNameChange} onSubmit={onAdd} onCancel={onCancelAdd} />
        </div>
      )}

      {isParent && !isCollapsed && children.map(child => (
        <TreeNode
          key={child.id} category={child} all={all} budgetMap={budgetMap} parentIds={parentIds}
          depth={depth + 1} collapse={collapse} onLeafClick={onLeafClick}
          editing={editing} onStartEditing={onStartEditing} onEditChange={onEditChange}
          onEditSave={onEditSave} onCancelEdit={onCancelEdit}
          adding={adding} newName={newName} onNewNameChange={onNewNameChange}
          onStartAdding={onStartAdding} onAdd={onAdd} onCancelAdd={onCancelAdd}
          onDeleteRequest={onDeleteRequest} onArchiveRequest={onArchiveRequest} activeType={activeType}
        />
      ))}
    </div>
  )
}

function CategoryRootDropZone() {
  const { active } = useDndContext()
  const { setNodeRef, isOver } = useDroppable({ id: '__root__' })
  if (!active) return null
  return <div ref={setNodeRef} className={`${styles.rootDropZone} ${isOver ? styles.rootDropZoneOver : ''}`}>Drop here to move to top level</div>
}

function AddForm({ value, onChange, onSubmit, onCancel }) {
  return (
    <form className={styles.addForm} onSubmit={onSubmit}>
      <input className={styles.inlineInput} value={value} onChange={e => onChange(e.target.value)} placeholder="Category name" autoFocus />
      <button type="submit" className={styles.inlineSave} disabled={!value.trim()}>✓</button>
      <button type="button" className={styles.inlineCancel} onClick={onCancel}>✕</button>
    </form>
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
          <div className={`${styles.barFill} ${styles[BAR_CLASS[progress.status]]}`} style={{ width: `${barPct}%` }} />
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
  const allParentIds = new Set(allActive.map(c => c.parentId).filter(Boolean))
  const incomeLeavesFlat  = getCategoriesFlat('income').filter(c => !allParentIds.has(c.id))
  const expenseLeavesFlat = getCategoriesFlat('expense').filter(c => !allParentIds.has(c.id))
  const usedIds = new Set(allBudgets.filter(b => !initial || b.id !== initial.id).map(b => b.categoryId))
  const availableIncomeCategories  = incomeLeavesFlat.filter(c => !usedIds.has(c.id))
  const availableExpenseCategories = expenseLeavesFlat.filter(c => !usedIds.has(c.id))

  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? initialCategoryId ?? '')
  const [amount, setAmount]         = useState(initial?.amount?.toString() ?? '')
  const [currency, setCurrency]     = useState(initial?.currency ?? 'EUR')
  const [period, setPeriod]         = useState(initial?.period ?? 'monthly')

  function handleSubmit(e) {
    e.preventDefault()
    if (!categoryId || !amount || parseAmount(amount) <= 0) return
    if (initial) updateBudget(initial.id, { categoryId, amount: parseAmount(amount), currency, period })
    else createBudget({ categoryId, amount: parseAmount(amount), currency, period })
    onSave()
  }

  const fields = (
    <>
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
          <AmountInput className={styles.input} value={amount} onChange={v => setAmount(v)} placeholder="0,00" required />
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
    </>
  )

  if (inline) {
    return (
      <form className={styles.form} onSubmit={handleSubmit} style={{ padding: '16px' }}>
        {deleteDialog}
        {fields}
        <div className={styles.formActions}>
          <button type="button" className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
          <button type="submit" className={styles.saveBtn} disabled={!categoryId || !amount || parseAmount(amount) <= 0}>Save</button>
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
        {fields}
        <div className={styles.formActions}>
          {onDelete && <button type="button" className={styles.deleteBtn} onClick={onDelete}>Delete</button>}
          <button type="button" className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
          <button type="submit" className={styles.saveBtn} disabled={!categoryId || !amount || parseAmount(amount) <= 0}>Save</button>
        </div>
      </form>
    </div>
  )
}

// ─── Delete dialog (budget) ─────────────────────────────────────────────────────

function DeleteDialog({ onConfirm, onCancel }) {
  return (
    <div className={styles.dialogBackdrop}>
      <div className={styles.dialog}>
        <h3 className={styles.dialogTitle}>Delete this budget?</h3>
        <p className={styles.dialogText}>The budget target will be removed. All historical transactions remain intact.</p>
        <p className={styles.dialogWarning}>This cannot be undone.</p>
        <div className={styles.dialogActions}>
          <button className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
          <button className={styles.deleteConfirmBtn} onClick={onConfirm}>Delete</button>
        </div>
      </div>
    </div>
  )
}
