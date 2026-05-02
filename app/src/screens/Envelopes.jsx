import { useState, useEffect } from 'react'
import { useMediaQuery, DESKTOP } from '../utils/mediaQuery'
import {
  getEnvelopes,
  getEnvelopesFlat,
  getEnvelopeBalance,
  getTotalEnvelopeBalance,
  getEnvelopesTotalByCurrency,
  createEnvelope,
  updateEnvelope,
  archiveEnvelope,
  deleteEnvelope,
  getDescendants,
} from '../data/envelopes'
import { convertToMain, ensureRates } from '../utils/currency'
import { getMainCurrency } from '../data/settings'
import { INDENT } from '../utils/hierarchy'
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
import EnvelopeHistory from './EnvelopeHistory'
import styles from './Envelopes.module.css'
import { fmtAmt } from '../utils/format'

export default function Envelopes() {
  const isDesktop = useMediaQuery(DESKTOP)
  const [envelopes, setEnvelopes] = useState(() => getEnvelopes())
  const [view, setView]             = useState('list')  // 'list' | 'transfer' | 'history'
  const mainCurrency = getMainCurrency()
  const [, rerender] = useState(0)
  useEffect(() => {
    let cancelled = false
    ensureRates(mainCurrency).then(() => { if (!cancelled) rerender(n => n + 1) }).catch(() => {})
    return () => { cancelled = true }
  }, [mainCurrency])
  const [historyEnvelope, setHistoryEnvelope] = useState(null)
  const [collapsed, setCollapsed]   = useState({})
  const [adding, setAdding]         = useState(null)   // parentId | 'root'
  const [newName, setNewName]       = useState('')
  const [editing, setEditing]       = useState(null)   // { id, name }
  const [showArchived, setShowArchived] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [confirmArchiveBuiltIn, setConfirmArchiveBuiltIn] = useState(null) // { envelope, newDefaultId }

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 500, tolerance: 5 } }),
  )

  function refresh() { setEnvelopes(getEnvelopes()) }

  function handleDragEnd({ active, over }) {
    if (!over) return
    const dragId = active.id
    const targetId = over.id
    const all = getEnvelopes()
    const drag = all.find(e => e.id === dragId)
    if (!drag || drag.isBuiltIn || drag.isArchived) return

    if (targetId === '__root__') {
      if (drag.parentId === null) return  // already at root — no-op
      updateEnvelope(dragId, { parentId: null })
      refresh()
      return
    }

    if (dragId === targetId) return
    const target = all.find(e => e.id === targetId)
    if (!target || target.isBuiltIn || target.isArchived) return
    if (getDescendantIds(dragId, all).has(targetId)) return
    if (drag.parentId === targetId) return  // already a child of target — no-op
    updateEnvelope(dragId, { parentId: targetId })
    refresh()
  }

  if (view === 'transfer') {
    return (
      <EnvelopeTransferForm
        onSave={() => { refresh(); setView('list') }}
        onCancel={() => setView('list')}
      />
    )
  }

  if (view === 'history' && historyEnvelope && !isDesktop) {
    return (
      <EnvelopeHistory
        envelope={historyEnvelope}
        onBack={() => { setView('list'); setHistoryEnvelope(null) }}
      />
    )
  }

  function openHistory(envelope) {
    setHistoryEnvelope(envelope)
    if (!isDesktop) setView('history')
  }

  function toggleCollapse(id) {
    setCollapsed(prev => ({ ...prev, [id]: !prev[id] }))
  }

  function startAdding(parentId) {
    setAdding(parentId)
    setNewName('')
    setEditing(null)
  }

  function startEditing(envelope) {
    setEditing({ id: envelope.id, name: envelope.name })
    setAdding(null)
  }

  function handleAdd(e) {
    e.preventDefault()
    if (!newName.trim()) return
    const parentId = adding === 'root' ? null : adding
    createEnvelope({ name: newName.trim(), parentId })
    refresh()
    setAdding(null)
    setNewName('')
  }

  function handleEditSave(e) {
    e.preventDefault()
    if (!editing.name.trim()) return
    updateEnvelope(editing.id, { name: editing.name.trim() })
    refresh()
    setEditing(null)
  }

  function handleDeleteRequest(envelope) {
    const all = getEnvelopes()
    const descendants = getDescendants(envelope.id, all)
    setConfirmDelete({ envelope, descendants })
  }

  function handleDeleteConfirm() {
    deleteEnvelope(confirmDelete.envelope.id)
    refresh()
    setConfirmDelete(null)
  }

  function handleArchive(envelope) {
    archiveEnvelope(envelope.id)
    refresh()
    setEditing(null)
  }

  function handleBuiltInArchiveRequest(envelope) {
    setConfirmArchiveBuiltIn({ envelope, newDefaultId: '' })
  }

  function handleBuiltInArchiveConfirm() {
    const { envelope, newDefaultId } = confirmArchiveBuiltIn
    const opts = envelope.isDefaultIncome
      ? { newDefaultIncomeId: newDefaultId }
      : { newDefaultExpenseId: newDefaultId }
    archiveEnvelope(envelope.id, opts)
    refresh()
    setConfirmArchiveBuiltIn(null)
  }

  const active   = envelopes.filter(e => !e.isArchived)
  const archived = envelopes.filter(e => e.isArchived)
  const builtIns = active.filter(e => e.isBuiltIn)
  const roots    = active.filter(e => !e.isBuiltIn && !e.parentId)

  return (
    <div className={styles.screen}>
      {confirmDelete && (
        <div className={styles.overlay}>
          <div className={styles.dialog}>
            <h3>Delete "{confirmDelete.envelope.name}"?</h3>
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

      {confirmArchiveBuiltIn && (() => {
        const { envelope, newDefaultId } = confirmArchiveBuiltIn
        const type = envelope.isDefaultIncome ? 'income' : 'expense'
        const candidates = getEnvelopesFlat(envelopes.filter(e => !e.isArchived && e.id !== envelope.id))
        return (
          <div className={styles.overlay}>
            <div className={styles.dialog}>
              <h3>Archive "{envelope.name}"?</h3>
              <p>Before archiving, choose a new default {type} envelope:</p>
              {candidates.length === 0 ? (
                <p className={styles.warning}>Create another envelope first, then archive this one.</p>
              ) : (
                <select
                  className={styles.defaultSelect}
                  value={newDefaultId}
                  onChange={e => setConfirmArchiveBuiltIn(prev => ({ ...prev, newDefaultId: e.target.value }))}
                >
                  <option value="">— select —</option>
                  {candidates.map(e => (
                    <option key={e.id} value={e.id}>{INDENT.repeat(e.depth)}{e.name}</option>
                  ))}
                </select>
              )}
              <div className={styles.dialogActions}>
                <button className={styles.cancelBtn} onClick={() => setConfirmArchiveBuiltIn(null)}>Cancel</button>
                <button
                  className={styles.archiveConfirmBtn}
                  onClick={handleBuiltInArchiveConfirm}
                  disabled={!newDefaultId}
                >
                  Archive
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      <div className={styles.treePane}>
      <div className={styles.header}>
        <h1 className={styles.title}>Envelopes</h1>
        <button className={styles.transferBtn} onClick={() => setView('transfer')}>
          ⇄ Transfer
        </button>
      </div>

      {/* Built-in envelopes always at top */}
      {builtIns.map(envelope => (
        <EnvelopeRow
          key={envelope.id}
          envelope={envelope}
          balance={getEnvelopeBalance(envelope.id)}
          isBuiltIn
          onClick={() => openHistory(envelope)}
          editing={editing}
          onEditChange={name => setEditing(prev => ({ ...prev, name }))}
          onEditSave={handleEditSave}
          onCancelEdit={() => setEditing(null)}
          onRename={() => startEditing(envelope)}
          onArchive={() => handleBuiltInArchiveRequest(envelope)}
        />
      ))}

      <div className={styles.divider} />

      {/* User envelopes tree */}
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className={styles.tree}>
          {roots.map(env => (
            <EnvelopeNode
              key={env.id}
              envelope={env}
              all={active}
              depth={0}
              collapsed={collapsed}
              onToggle={toggleCollapse}
              adding={adding}
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
              onArchive={handleArchive}
              onOpenHistory={openHistory}
            />
          ))}

          {adding === 'root' ? (
            <AddForm value={newName} onChange={setNewName} onSubmit={handleAdd} onCancel={() => setAdding(null)} />
          ) : (
            <button className={styles.addRoot} onClick={() => startAdding('root')}>
              + Add envelope
            </button>
          )}

          <EnvelopeRootDropZone />
        </div>
      </DndContext>

      <EnvelopesGrandTotal mainCurrency={mainCurrency} styles={styles} />

      {archived.length > 0 && (
        <button className={styles.archivedToggle} onClick={() => setShowArchived(v => !v)}>
          {showArchived ? 'Hide archived' : `Show archived (${archived.length})`}
        </button>
      )}
      {showArchived && archived.map(envelope => (
        <EnvelopeRow key={envelope.id} envelope={envelope} balance={getEnvelopeBalance(envelope.id)} isArchived />
      ))}
      </div>

      {isDesktop && (
        <div className={styles.detailPane}>
          {historyEnvelope ? (
            <EnvelopeHistory
              envelope={historyEnvelope}
              onBack={() => setHistoryEnvelope(null)}
              embedded
            />
          ) : (
            <p className={styles.selectHint}>Select an envelope to view its details.</p>
          )}
        </div>
      )}
    </div>
  )
}

function EnvelopeRow({ envelope, balance, isBuiltIn, isArchived, onClick, editing, onEditChange, onEditSave, onCancelEdit, onRename, onArchive }) {
  const isEditing = editing?.id === envelope.id
  return (
    <div className={`${styles.builtInRow} ${isArchived ? styles.archivedRow : ''}`}>
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
        <>
          <span className={styles.builtInName} onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default', flex: 1 }}>
            {envelope.name}
            {isBuiltIn && <span className={styles.builtInBadge}>default</span>}
          </span>
          <span className={balance < 0 ? styles.negative : styles.positive} style={{ marginRight: 8 }}>
            {balance < 0 ? '−' : ''}{fmtAmt(Math.abs(balance))}
          </span>
          {isBuiltIn && !isArchived && (
            <div className={styles.actions}>
              <button className={styles.actionBtn} onClick={onRename} title="Rename">✎</button>
              <button className={styles.actionBtn} onClick={onArchive} title="Archive">⊘</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function EnvelopeNode({
  envelope, all, depth,
  collapsed, onToggle,
  adding, newName, onNewNameChange, onStartAdding, onAdd, onCancelAdd,
  editing, onStartEditing, onEditChange, onEditSave, onCancelEdit,
  onDeleteRequest, onArchive, onOpenHistory,
}) {
  const children    = all.filter(e => e.parentId === envelope.id)
  const hasChildren = children.length > 0
  const isCollapsed = collapsed[envelope.id]
  const isEditing   = editing?.id === envelope.id
  const isAdding    = adding === envelope.id
  const ownBalance  = getEnvelopeBalance(envelope.id)
  const balance     = hasChildren ? getTotalEnvelopeBalance(envelope.id) : ownBalance

  // Drag-and-drop
  const { active } = useDndContext()
  const activeId = active?.id
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({ id: envelope.id })
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: envelope.id })
  const mergedRef = node => { setDragRef(node); setDropRef(node) }

  const isValidTarget = activeId && activeId !== envelope.id
    && !getDescendantIds(activeId, all).has(envelope.id)

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
        <span className={styles.dragHandle} {...listeners} {...attributes} title="Drag to reparent">≡</span>

        <button
          className={styles.collapseBtn}
          onClick={() => hasChildren && onToggle(envelope.id)}
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
          <span className={styles.name} onClick={() => onOpenHistory(envelope)}>
            {envelope.name}
          </span>
        )}

        <div className={styles.balanceGroup}>
          {hasChildren && ownBalance !== 0 && (
            <span className={`${styles.ownBalance} ${ownBalance < 0 ? styles.negative : styles.positive}`}>
              {ownBalance < 0 ? '−' : '+'}{fmtAmt(Math.abs(ownBalance))}
            </span>
          )}
          <span className={`${styles.balance} ${balance < 0 ? styles.negative : styles.positive}`}>
            {balance < 0 ? '−' : ''}{fmtAmt(Math.abs(balance))}
          </span>
        </div>

        <div className={styles.actions}>
          <button className={styles.actionBtn} onClick={() => onStartEditing(envelope)} title="Rename">✎</button>
          <button className={styles.actionBtn} onClick={() => onStartAdding(envelope.id)} title="Add sub-envelope">+</button>
          <button className={styles.actionBtnDelete} onClick={() => onDeleteRequest(envelope)} title="Delete">×</button>
        </div>
      </div>

      {isAdding && (
        <div style={{ marginLeft: 16 }}>
          <AddForm value={newName} onChange={onNewNameChange} onSubmit={onAdd} onCancel={onCancelAdd} />
        </div>
      )}

      {!isCollapsed && children.map(child => (
        <EnvelopeNode
          key={child.id}
          envelope={child}
          all={all}
          depth={depth + 1}
          collapsed={collapsed}
          onToggle={onToggle}
          adding={adding}
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
          onArchive={onArchive}
          onOpenHistory={onOpenHistory}
        />
      ))}
    </div>
  )
}

function EnvelopeRootDropZone() {
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
        placeholder="Envelope name"
        autoFocus
      />
      <button type="submit" className={styles.inlineSave} disabled={!value.trim()}>✓</button>
      <button type="button" className={styles.inlineCancel} onClick={onCancel}>✕</button>
    </form>
  )
}

function EnvelopesGrandTotal({ mainCurrency, styles }) {
  const byCurrency = getEnvelopesTotalByCurrency()
  const currencies = Object.keys(byCurrency)
  if (currencies.length === 0) return null

  const isSingleNative = currencies.length === 1 && currencies[0] === mainCurrency
  let mainTotal = null
  if (!isSingleNative) {
    let sum = 0, ok = true
    for (const [cur, amt] of Object.entries(byCurrency)) {
      const c = convertToMain(amt, cur, mainCurrency)
      if (c === null) { ok = false; break }
      sum += c
    }
    if (ok) mainTotal = sum
  }

  const nativeTotal = isSingleNative ? byCurrency[currencies[0]] : null

  return (
    <div className={styles.grandTotal}>
      <span className={styles.grandTotalLabel}>Total</span>
      <span className={styles.grandTotalValue}>
        {isSingleNative
          ? `${nativeTotal < 0 ? '−' : ''}${fmtAmt(Math.abs(nativeTotal))} ${mainCurrency}`
          : mainTotal !== null
            ? `≈ ${mainTotal < 0 ? '−' : ''}${fmtAmt(Math.abs(mainTotal))} ${mainCurrency}`
            : '—'
        }
      </span>
    </div>
  )
}
