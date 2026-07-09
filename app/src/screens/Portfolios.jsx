import { useState } from 'react'
import {
  getPortfolios,
  getAllPortfolioAssignments,
  createPortfolio,
  updatePortfolio,
  deletePortfolio,
  reorderPortfolio,
  reparentPortfolio,
  getPortfolioDeletePreview,
  createPortfolioAssignment,
  updatePortfolioAssignment,
  deletePortfolioAssignment,
  getKnownTickers,
} from '../data/portfolios'
import { getDescendantIds } from '../utils/treeDnd'
import {
  DndContext,
  useDraggable,
  useDroppable,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import styles from './Portfolios.module.css'

export default function Portfolios({ onBack }) {
  const [portfolios, setPortfolios] = useState(() => getPortfolios())
  const [assignments, setAssignments] = useState(() => getAllPortfolioAssignments())
  const [adding, setAdding] = useState(null)      // { type: 'node', parentId } | { type: 'assignment', portfolioId }
  const [editing, setEditing] = useState(null)    // { type: 'node', id, name, targetPercent } | { type: 'assignment', id }
  const [confirmDelete, setConfirmDelete] = useState(null)  // { id, name, preview }

  const knownTickers = getKnownTickers()

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 500, tolerance: 5 } }),
  )

  function refresh() {
    setPortfolios(getPortfolios())
    setAssignments(getAllPortfolioAssignments())
  }

  function handleDragEnd({ active, over }) {
    if (!over) return
    const dragId = active.id
    const targetId = over.id
    if (dragId === targetId) return
    const all = getPortfolios()
    if (targetId !== '__root__' && getDescendantIds(dragId, all).has(targetId)) return
    reparentPortfolio(dragId, targetId)
    refresh()
  }

  function handleDeleteRequest(node) {
    setConfirmDelete({ id: node.id, name: node.name, preview: getPortfolioDeletePreview(node.id) })
  }

  function handleDeleteConfirm() {
    deletePortfolio(confirmDelete.id)
    refresh()
    setConfirmDelete(null)
  }

  function handleAddNode(parentId, { name, targetPercent }) {
    createPortfolio({ parentId: parentId ?? null, name, targetPercent })
    refresh()
    setAdding(null)
  }

  function handleEditNodeSave({ name, targetPercent }) {
    updatePortfolio(editing.id, { name, targetPercent })
    refresh()
    setEditing(null)
  }

  function handleAddAssignment(portfolioId, { ticker, targetPercent }) {
    const result = createPortfolioAssignment({ portfolioId, ticker, targetPercent })
    if (!result) return 'duplicate'
    refresh()
    setAdding(null)
    return null
  }

  function closeAll() { setAdding(null); setEditing(null) }

  // Recursive tree renderer — not a component, just a helper called inside JSX
  function renderTree(parentId, depth) {
    const sorted = portfolios
      .filter(p => p.parentId === parentId)
      .sort((a, b) => a.order - b.order)

    if (sorted.length === 0 && parentId === null) return null

    // Sibling node % validation
    const nodesWithTarget = sorted.filter(p => p.targetPercent !== null)
    const siblingSum = nodesWithTarget.reduce((s, p) => s + p.targetPercent, 0)
    const showSiblingWarning = nodesWithTarget.length > 1 && Math.abs(siblingSum - 100) > 0.001

    return (
      <>
        {sorted.map((node, idx) => {
          const nodeAssignments = assignments.filter(a => a.portfolioId === node.id)
          const assignTargets = nodeAssignments.filter(a => a.targetPercent !== null)
          const assignSum = assignTargets.reduce((s, a) => s + a.targetPercent, 0)
          const showAssignWarning = assignTargets.length > 1 && Math.abs(assignSum - 100) > 0.001

          const isEditingNode  = editing?.type === 'node' && editing.id === node.id
          const isAddingChild  = adding?.type === 'node' && adding.parentId === node.id
          const isAddingAssign = adding?.type === 'assignment' && adding.portfolioId === node.id

          return (
            <div key={node.id}>
              {isEditingNode ? (
                <NodeInlineForm
                  depth={depth}
                  initialName={editing.name}
                  initialTarget={editing.targetPercent}
                  onSave={handleEditNodeSave}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <PortfolioNodeRow
                  node={node}
                  depth={depth}
                  isFirst={idx === 0}
                  isLast={idx === sorted.length - 1}
                  showWarning={showSiblingWarning && node.targetPercent !== null}
                  onEdit={() => { closeAll(); setEditing({ type: 'node', id: node.id, name: node.name, targetPercent: node.targetPercent }) }}
                  onAddChild={() => { closeAll(); setAdding({ type: 'node', parentId: node.id }) }}
                  onAddStock={() => { closeAll(); setAdding({ type: 'assignment', portfolioId: node.id }) }}
                  onDelete={() => { closeAll(); handleDeleteRequest(node) }}
                  onMoveUp={() => { reorderPortfolio(node.id, 'up'); refresh() }}
                  onMoveDown={() => { reorderPortfolio(node.id, 'down'); refresh() }}
                />
              )}

              {/* Recursive child portfolios */}
              {renderTree(node.id, depth + 1)}

              {/* Stock assignments */}
              {nodeAssignments.map(a => (
                <AssignmentRow
                  key={a.id}
                  assignment={a}
                  depth={depth + 1}
                  isEditing={editing?.type === 'assignment' && editing.id === a.id}
                  onEditStart={() => { closeAll(); setEditing({ type: 'assignment', id: a.id }) }}
                  onEditSave={targetPercent => { updatePortfolioAssignment(a.id, { targetPercent }); refresh(); setEditing(null) }}
                  onEditCancel={() => setEditing(null)}
                  onDelete={() => { deletePortfolioAssignment(a.id); refresh() }}
                />
              ))}

              {showAssignWarning && (
                <div
                  className={styles.warningLine}
                  style={{ paddingLeft: `${(depth + 1) * 20 + 20}px` }}
                >
                  ⚠ stock targets sum to {fmtPct(assignSum)} — expected 100%
                </div>
              )}

              {isAddingChild && (
                <NodeInlineForm
                  depth={depth + 1}
                  onSave={fields => handleAddNode(node.id, fields)}
                  onCancel={() => setAdding(null)}
                />
              )}

              {isAddingAssign && (
                <AssignmentAddForm
                  depth={depth + 1}
                  existingTickers={nodeAssignments.map(a => a.ticker)}
                  knownTickers={knownTickers}
                  portfolioId={node.id}
                  onSave={(ticker, targetPercent) => handleAddAssignment(node.id, { ticker, targetPercent })}
                  onCancel={() => setAdding(null)}
                />
              )}
            </div>
          )
        })}

        {showSiblingWarning && (
          <div
            className={styles.warningLine}
            style={{ paddingLeft: `${depth * 20 + 8}px` }}
          >
            ⚠ portfolio targets sum to {fmtPct(siblingSum)} — expected 100%
          </div>
        )}
      </>
    )
  }

  const hasAny = portfolios.length > 0

  return (
    <div className={styles.screen}>
      {/* Delete dialog */}
      {confirmDelete && (
        <div className={styles.overlay}>
          <div className={styles.dialog}>
            <h3>Delete "{confirmDelete.name}"?</h3>
            {(confirmDelete.preview.descendantCount > 0 || confirmDelete.preview.assignmentCount > 0) && (
              <>
                <p>This will also remove:</p>
                <ul className={styles.dialogList}>
                  {confirmDelete.preview.descendantCount > 0 && (
                    <li>
                      {confirmDelete.preview.descendantCount} sub-portfolio{confirmDelete.preview.descendantCount !== 1 ? 's' : ''}
                    </li>
                  )}
                  {confirmDelete.preview.assignmentCount > 0 && (
                    <li>
                      {confirmDelete.preview.assignmentCount} stock assignment{confirmDelete.preview.assignmentCount !== 1 ? 's' : ''}{' '}
                      ({confirmDelete.preview.affectedTickers.join(', ')})
                    </li>
                  )}
                </ul>
              </>
            )}
            {confirmDelete.preview.sharedElsewhere.length > 0 && (
              <p className={styles.dialogNote}>
                {confirmDelete.preview.sharedElsewhere.join(', ')}{' '}
                {confirmDelete.preview.sharedElsewhere.length === 1 ? 'is' : 'are'} also in other portfolios — those assignments will remain.
              </p>
            )}
            <div className={styles.dialogActions}>
              <button className={styles.cancelBtn} onClick={() => setConfirmDelete(null)} title="Keep this portfolio">Cancel</button>
              <button className={styles.deleteBtn} onClick={handleDeleteConfirm} title="Delete this portfolio permanently">Delete</button>
            </div>
          </div>
        </div>
      )}

      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <button className={styles.backBtn} onClick={onBack} title="Go back to the previous screen">←</button>
          <h1 className={styles.title}>Portfolios</h1>
        </div>
        <button
          className={styles.newBtn}
          onClick={() => { closeAll(); setAdding({ type: 'node', parentId: null }) }}
          title="Create a new top-level portfolio"
        >
          + New portfolio
        </button>
      </div>

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <RootDropZone />
        <div className={styles.tree}>
          {adding?.type === 'node' && adding.parentId === null && (
            <NodeInlineForm
              depth={0}
              onSave={fields => handleAddNode(null, fields)}
              onCancel={() => setAdding(null)}
            />
          )}
          {hasAny || adding ? renderTree(null, 0) : (
            <p className={styles.empty}>No portfolios yet. Create one to organise your holdings.</p>
          )}
        </div>
      </DndContext>
    </div>
  )
}

// ─── Root drop zone ───────────────────────────────────────────────────────────

function RootDropZone() {
  const { isOver, setNodeRef } = useDroppable({ id: '__root__' })
  return (
    <div
      ref={setNodeRef}
      className={`${styles.rootDropZone} ${isOver ? styles.rootDropZoneActive : ''}`}
    />
  )
}

// ─── Portfolio node row ───────────────────────────────────────────────────────

function PortfolioNodeRow({ node, depth, isFirst, isLast, showWarning, onEdit, onAddChild, onAddStock, onDelete, onMoveUp, onMoveDown }) {
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({ id: node.id })
  const { isOver, setNodeRef: setDropRef } = useDroppable({ id: node.id })

  return (
    <div
      ref={setDropRef}
      className={`${styles.nodeRow} ${isOver ? styles.nodeRowDragOver : ''} ${isDragging ? styles.nodeDragging : ''}`}
      style={{ paddingLeft: `${depth * 20 + 6}px` }}
    >
      <span
        ref={setDragRef}
        className={styles.dragHandle}
        {...attributes}
        {...listeners}
        title="Drag to reparent"
      >⠿</span>

      <span className={styles.nodeName}>{node.name}</span>

      {node.targetPercent !== null && (
        <span className={styles.nodeTarget}>{node.targetPercent}%</span>
      )}

      {showWarning && (
        <span className={styles.nodeWarning} title="Sibling targets don't sum to 100%">⚠</span>
      )}

      <div className={styles.nodeActions}>
        <button className={styles.moveBtn} onClick={onMoveUp} disabled={isFirst} title="Move up" aria-label="Move up">↑</button>
        <button className={styles.moveBtn} onClick={onMoveDown} disabled={isLast} title="Move down" aria-label="Move down">↓</button>
        <button className={styles.actionBtn} onClick={onEdit} title="Edit this portfolio's name and target %">Edit</button>
        <button className={styles.actionBtn} onClick={onAddChild} title="Add a sub-portfolio inside this one">+ Group</button>
        <button className={styles.actionBtn} onClick={onAddStock} title="Add a stock to this portfolio">+ Stock</button>
        <button
          className={`${styles.actionBtn} ${styles.actionBtnDelete}`}
          onClick={onDelete}
          title="Delete"
          aria-label="Delete portfolio node"
        >×</button>
      </div>
    </div>
  )
}

// ─── Assignment row ───────────────────────────────────────────────────────────

function AssignmentRow({ assignment, depth, isEditing, onEditStart, onEditSave, onEditCancel, onDelete }) {
  if (isEditing) {
    return (
      <AssignmentEditForm
        assignment={assignment}
        depth={depth}
        onSave={onEditSave}
        onCancel={onEditCancel}
      />
    )
  }

  return (
    <div
      className={styles.assignRow}
      style={{ paddingLeft: `${depth * 20 + 20}px` }}
    >
      <span className={styles.assignBullet}>–</span>
      <span className={styles.assignTicker}>{assignment.ticker}</span>
      <span className={styles.assignTarget}>
        {assignment.targetPercent !== null ? `${assignment.targetPercent}%` : ''}
      </span>
      <div className={styles.assignActions}>
        <button className={styles.actionBtn} onClick={onEditStart} title="Edit this stock's target %">Edit %</button>
        <button className={`${styles.actionBtn} ${styles.actionBtnDelete}`} onClick={onDelete} title="Remove this stock from the portfolio" aria-label="Remove stock assignment">×</button>
      </div>
    </div>
  )
}

function AssignmentEditForm({ assignment, depth, onSave, onCancel }) {
  const [targetStr, setTargetStr] = useState(assignment.targetPercent?.toString() ?? '')

  return (
    <div
      className={styles.inlineForm}
      style={{ marginLeft: `${depth * 20 + 8}px` }}
    >
      <span style={{ fontSize: 13, color: '#94a3b8', fontWeight: 500, minWidth: 56, flexShrink: 0 }}>
        {assignment.ticker}
      </span>
      <input
        className={styles.inlinePct}
        type="number"
        min="0"
        max="100"
        step="0.1"
        value={targetStr}
        onChange={e => setTargetStr(e.target.value)}
        placeholder="%"
        autoFocus
        onKeyDown={e => {
          if (e.key === 'Enter') onSave(targetStr === '' ? null : Number(targetStr))
          if (e.key === 'Escape') onCancel()
        }}
      />
      <span className={styles.inlinePctLabel}>%</span>
      <button
        className={styles.inlineConfirm}
        onClick={() => onSave(targetStr === '' ? null : Number(targetStr))}
        title="Save the target %"
      >✓</button>
      <button className={styles.inlineCancel} onClick={onCancel} title="Cancel editing">✕</button>
    </div>
  )
}

// ─── Inline node add/edit form ────────────────────────────────────────────────

function NodeInlineForm({ depth, initialName = '', initialTarget = null, onSave, onCancel }) {
  const [name, setName] = useState(initialName)
  const [targetStr, setTargetStr] = useState(initialTarget?.toString() ?? '')

  function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) return
    onSave({ name: name.trim(), targetPercent: targetStr === '' ? null : Number(targetStr) })
  }

  return (
    <form
      className={styles.inlineForm}
      style={{ marginLeft: `${depth * 20}px` }}
      onSubmit={handleSubmit}
    >
      <input
        className={styles.inlineInput}
        type="text"
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Portfolio name"
        autoFocus
      />
      <input
        className={styles.inlinePct}
        type="number"
        min="0"
        max="100"
        step="0.1"
        value={targetStr}
        onChange={e => setTargetStr(e.target.value)}
        placeholder="%"
      />
      <span className={styles.inlinePctLabel}>%</span>
      <button type="submit" className={styles.inlineConfirm} disabled={!name.trim()} title="Save this portfolio">✓</button>
      <button type="button" className={styles.inlineCancel} onClick={onCancel} title="Cancel without saving">✕</button>
    </form>
  )
}

// ─── Inline assignment add form ───────────────────────────────────────────────

function AssignmentAddForm({ depth, portfolioId, existingTickers, knownTickers, onSave, onCancel }) {
  const [ticker, setTicker] = useState('')
  const [targetStr, setTargetStr] = useState('')
  const [error, setError] = useState(null)

  const listId = `known-tickers-${portfolioId}`

  function handleSubmit(e) {
    e.preventDefault()
    const norm = ticker.trim().toUpperCase()
    if (!norm) return
    if (existingTickers.includes(norm)) { setError(`${norm} is already in this portfolio`); return }
    const result = onSave(norm, targetStr === '' ? null : Number(targetStr))
    if (result === 'duplicate') { setError(`${norm} is already in this portfolio`); return }
  }

  return (
    <form
      className={styles.inlineForm}
      style={{ marginLeft: `${depth * 20}px` }}
      onSubmit={handleSubmit}
    >
      <datalist id={listId}>
        {knownTickers.filter(t => !existingTickers.includes(t)).map(t => (
          <option key={t} value={t} />
        ))}
      </datalist>
      <input
        className={styles.inlineInput}
        list={listId}
        type="text"
        value={ticker}
        onChange={e => { setTicker(e.target.value.toUpperCase()); setError(null) }}
        placeholder="Ticker (e.g. AAPL)"
        autoFocus
        style={{ textTransform: 'uppercase' }}
      />
      <input
        className={styles.inlinePct}
        type="number"
        min="0"
        max="100"
        step="0.1"
        value={targetStr}
        onChange={e => setTargetStr(e.target.value)}
        placeholder="%"
      />
      <span className={styles.inlinePctLabel}>%</span>
      <button type="submit" className={styles.inlineConfirm} disabled={!ticker.trim()} title="Add this stock to the portfolio">✓</button>
      <button type="button" className={styles.inlineCancel} onClick={onCancel} title="Cancel without adding">✕</button>
      {error && <span className={styles.inlineError}>{error}</span>}
    </form>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtPct(n) {
  return n % 1 === 0 ? `${n}%` : `${n.toFixed(1)}%`
}
