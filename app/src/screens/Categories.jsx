import { useState } from 'react'
import {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  archiveBuiltInCategory,
  getDescendants,
} from '../data/categories'
import { getBudgetForCategory, computeBudgetProgress } from '../data/budgets'
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
import styles from './Categories.module.css'
import { fmtAmt } from '../utils/format'

export default function Categories() {
  const [categories, setCategories] = useState(() => getCategories())
  const [activeType, setActiveType] = useState('expense')
  const [collapsed, setCollapsed] = useState({})
  const [adding, setAdding] = useState(null)       // parentId we're adding under (null = root)
  const [addingType, setAddingType] = useState(null)
  const [newName, setNewName] = useState('')
  const [editing, setEditing] = useState(null)     // { id, name }
  const [confirmDelete, setConfirmDelete] = useState(null) // { category, descendants }
  const [confirmArchive, setConfirmArchive] = useState(null) // { category }
  const [archiveSuccessorId, setArchiveSuccessorId] = useState('')

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 500, tolerance: 5 } }),
  )

  function refresh() {
    setCategories(getCategories())
  }

  function handleDragEnd({ active, over }) {
    if (!over) return
    const dragId = active.id
    const targetId = over.id
    const all = getCategories()
    const drag = all.find(c => c.id === dragId)
    if (!drag || drag.isBuiltIn) return

    if (targetId === '__root__') {
      if (drag.parentId === null) return  // already at root — no-op
      updateCategory(dragId, { parentId: null })
      refresh()
      return
    }

    if (dragId === targetId) return
    const target = all.find(c => c.id === targetId)
    if (!target || target.isArchived) return
    if (drag.type !== target.type) return
    if (getDescendantIds(dragId, all).has(targetId)) return
    if (drag.parentId === targetId) return  // already a child of target — no-op
    updateCategory(dragId, { parentId: targetId })
    refresh()
  }

  function toggleCollapse(id) {
    setCollapsed(prev => ({ ...prev, [id]: !prev[id] }))
  }

  function startAdding(parentId, type) {
    setAdding(parentId)
    setAddingType(type)
    setNewName('')
    setEditing(null)
  }

  function startEditing(category) {
    setEditing({ id: category.id, name: category.name })
    setAdding(null)
  }

  function handleAdd(e) {
    e.preventDefault()
    if (!newName.trim()) return
    const parentId = adding === 'root' ? null : adding
    createCategory({ type: addingType, name: newName.trim(), parentId })
    refresh()
    setAdding(null)
    setNewName('')
  }

  function handleEditSave(e) {
    e.preventDefault()
    if (!editing.name.trim()) return
    updateCategory(editing.id, { name: editing.name.trim() })
    refresh()
    setEditing(null)
  }

  function handleDeleteRequest(category) {
    const all = getCategories()
    const descendants = getDescendants(category.id, all)
    setConfirmDelete({ category, descendants })
  }

  function handleDeleteConfirm() {
    deleteCategory(confirmDelete.category.id)
    refresh()
    setConfirmDelete(null)
  }

  function handleArchiveRequest(category) {
    setArchiveSuccessorId('')
    setConfirmArchive({ category })
  }

  function handleArchiveConfirm() {
    if (!archiveSuccessorId) return
    archiveBuiltInCategory(confirmArchive.category.id, archiveSuccessorId)
    refresh()
    setConfirmArchive(null)
  }

  // Build tree: get root categories of activeType, recursively render
  // Archived categories are excluded from the active tree
  const roots = categories.filter(c => c.type === activeType && !c.parentId && !c.isArchived)

  return (
    <div className={styles.screen}>
      {confirmDelete && (
        <div className={styles.overlay}>
          <div className={styles.dialog}>
            <h3>Delete "{confirmDelete.category.name}"?</h3>
            {confirmDelete.descendants.length > 0 && (
              <>
                <p>This will also delete:</p>
                <ul className={styles.deleteList}>
                  {confirmDelete.descendants.map(d => (
                    <li key={d.id}>{d.name}</li>
                  ))}
                </ul>
              </>
            )}
            <p className={styles.warning}>This cannot be undone.</p>
            <div className={styles.dialogActions}>
              <button className={styles.cancelBtn} onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button className={styles.deleteConfirmBtn} onClick={handleDeleteConfirm}>Delete all</button>
            </div>
          </div>
        </div>
      )}

      {confirmArchive && (() => {
        const successorOptions = categories.filter(
          c => c.type === confirmArchive.category.type && !c.isArchived && c.id !== confirmArchive.category.id
        )
        return (
          <div className={styles.overlay}>
            <div className={styles.dialog}>
              <h3>Archive "{confirmArchive.category.name}"?</h3>
              <p>Choose a replacement default for new {confirmArchive.category.type} transactions:</p>
              <select
                className={styles.input}
                value={archiveSuccessorId}
                onChange={e => setArchiveSuccessorId(e.target.value)}
              >
                <option value="">— Select a category —</option>
                {successorOptions.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              {successorOptions.length === 0 && (
                <p className={styles.warning}>No other {confirmArchive.category.type} categories exist. Add one first.</p>
              )}
              <div className={styles.dialogActions}>
                <button className={styles.cancelBtn} onClick={() => setConfirmArchive(null)}>Cancel</button>
                <button
                  className={styles.deleteConfirmBtn}
                  onClick={handleArchiveConfirm}
                  disabled={!archiveSuccessorId}
                >Archive</button>
              </div>
            </div>
          </div>
        )
      })()}

      <div className={styles.header}>
        <h1 className={styles.title}>Categories</h1>
      </div>

      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeType === 'income' ? styles.activeTab : ''}`}
          onClick={() => setActiveType('income')}
        >
          Income
        </button>
        <button
          className={`${styles.tab} ${activeType === 'expense' ? styles.activeTab : ''}`}
          onClick={() => setActiveType('expense')}
        >
          Expense
        </button>
      </div>

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className={styles.tree}>
          {roots.map(cat => (
            <CategoryNode
              key={cat.id}
              category={cat}
              all={categories}
              depth={0}
              collapsed={collapsed}
              onToggle={toggleCollapse}
              adding={adding}
              addingType={addingType}
              newName={newName}
              onNewNameChange={setNewName}
              onStartAdding={startAdding}
              onAdd={handleAdd}
              onCancelAdd={() => setAdding(null)}
              editing={editing}
              onStartEditing={startEditing}
              onEditChange={name => setEditing(prev => ({ ...prev, name }))}
              onEditSave={handleEditSave}
              onCancelEdit={() => setEditing(null)}
              onDeleteRequest={handleDeleteRequest}
              onArchiveRequest={handleArchiveRequest}
              activeType={activeType}
            />
          ))}

          {adding === 'root' && addingType === activeType ? (
            <AddForm
              value={newName}
              onChange={setNewName}
              onSubmit={handleAdd}
              onCancel={() => setAdding(null)}
            />
          ) : (
            <button className={styles.addRoot} onClick={() => startAdding('root', activeType)}>
              + Add {activeType} category
            </button>
          )}

          <CategoryRootDropZone />
        </div>
      </DndContext>
    </div>
  )
}

function CategoryNode({
  category, all, depth,
  collapsed, onToggle,
  adding, addingType, newName, onNewNameChange, onStartAdding, onAdd, onCancelAdd,
  editing, onStartEditing, onEditChange, onEditSave, onCancelEdit,
  onDeleteRequest, onArchiveRequest, activeType,
}) {
  const children = all.filter(c => c.parentId === category.id && !c.isArchived)
  const hasChildren = children.length > 0
  const isCollapsed = collapsed[category.id]
  const isEditing = editing?.id === category.id
  const isAdding = adding === category.id

  // Drag-and-drop
  const { active } = useDndContext()
  const activeId = active?.id
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: category.id,
    disabled: !!category.isBuiltIn,
  })
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: category.id })
  const mergedRef = node => { setDragRef(node); setDropRef(node) }

  const isValidTarget = activeId && activeId !== category.id
    && !getDescendantIds(activeId, all).has(category.id)
    && all.find(c => c.id === activeId)?.type === category.type

  const dropClass = isOver
    ? (isValidTarget ? styles.dropValid : styles.dropInvalid)
    : ''

  return (
    <div
      ref={mergedRef}
      className={`${styles.node} ${isDragging ? styles.dragging : ''} ${dropClass}`}
      style={{ marginLeft: depth * 16 }}
    >
      <div className={styles.row}>
        {category.isBuiltIn ? (
          <span className={styles.dragHandleHidden} />
        ) : (
          <span className={styles.dragHandle} {...listeners} {...attributes} title="Drag to reparent">≡</span>
        )}

        <button
          className={styles.collapseBtn}
          onClick={() => hasChildren && onToggle(category.id)}
          style={{ visibility: hasChildren ? 'visible' : 'hidden' }}
        >
          {isCollapsed ? '▶' : '▼'}
        </button>

        {isEditing ? (
          <form className={styles.inlineForm} onSubmit={onEditSave}>
            <input
              className={styles.inlineInput}
              value={editing.name}
              onChange={e => onEditChange(e.target.value)}
              autoFocus
            />
            <button type="submit" className={styles.inlineSave} disabled={!editing.name.trim()}>✓</button>
            <button type="button" className={styles.inlineCancel} onClick={onCancelEdit}>✕</button>
          </form>
        ) : (
          <span className={styles.name} onClick={() => onStartEditing(category)}>{category.name}</span>
        )}

        <BudgetBadge categoryId={category.id} all={all} />

        <div className={styles.actions}>
          <button className={styles.actionBtn} onClick={() => onStartAdding(category.id, activeType)} title="Add subcategory">+</button>
          {category.isBuiltIn
            ? <button className={styles.actionBtn} onClick={() => onArchiveRequest(category)} title="Archive">⊘</button>
            : <button className={styles.actionBtnDelete} onClick={() => onDeleteRequest(category)} title="Delete">×</button>
          }
        </div>
      </div>

      {isAdding && (
        <div style={{ marginLeft: 16 }}>
          <AddForm
            value={newName}
            onChange={onNewNameChange}
            onSubmit={onAdd}
            onCancel={onCancelAdd}
          />
        </div>
      )}

      {!isCollapsed && children.map(child => (
        <CategoryNode
          key={child.id}
          category={child}
          all={all}
          depth={depth + 1}
          collapsed={collapsed}
          onToggle={onToggle}
          adding={adding}
          addingType={addingType}
          newName={newName}
          onNewNameChange={onNewNameChange}
          onStartAdding={onStartAdding}
          onAdd={onAdd}
          onCancelAdd={onCancelAdd}
          editing={editing}
          onStartEditing={onStartEditing}
          onEditChange={onEditChange}
          onEditSave={onEditSave}
          onCancelEdit={onCancelEdit}
          onDeleteRequest={onDeleteRequest}
          onArchiveRequest={onArchiveRequest}
          activeType={activeType}
        />
      ))}
    </div>
  )
}

function CategoryRootDropZone() {
  const { active } = useDndContext()
  const { setNodeRef, isOver } = useDroppable({ id: '__root__' })
  if (!active) return null
  return (
    <div
      ref={setNodeRef}
      className={`${styles.rootDropZone} ${isOver ? styles.rootDropZoneOver : ''}`}
    >
      Drop here to move to top level
    </div>
  )
}

function AddForm({ value, onChange, onSubmit, onCancel }) {
  return (
    <form className={styles.addForm} onSubmit={onSubmit}>
      <input
        className={styles.inlineInput}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Category name"
        autoFocus
      />
      <button type="submit" className={styles.inlineSave} disabled={!value.trim()}>✓</button>
      <button type="button" className={styles.inlineCancel} onClick={onCancel}>✕</button>
    </form>
  )
}

const BUDGET_BADGE_STATUS = {
  ok:           styles.budgetBadgeOk,
  'near-limit': styles.budgetBadgeNear,
  over:         styles.budgetBadgeOver,
}

function BudgetBadge({ categoryId, all }) {
  // Only show badge on leaf categories (no active children)
  const hasChildren = all.some(c => c.parentId === categoryId)
  if (hasChildren) return null
  const budget = getBudgetForCategory(categoryId)
  if (!budget) return null
  const progress = computeBudgetProgress(budget)
  if (!progress) return null

  const pct = Math.round(progress.percentUsed * 100)
  const barPct = Math.min(progress.percentUsed * 100, 100)
  const statusClass = BUDGET_BADGE_STATUS[progress.status] ?? styles.budgetBadgeOk

  return (
    <span className={`${styles.budgetBadge} ${statusClass}`} title={`Budget: ${fmtAmt(progress.actual)} / ${fmtAmt(budget.amount)} ${budget.currency} (${pct}%)`}>
      <span className={styles.budgetBadgeBar}>
        <span className={styles.budgetBadgeFill} style={{ width: `${barPct}%` }} />
      </span>
      <span className={styles.budgetBadgePct}>{pct}%</span>
    </span>
  )
}
