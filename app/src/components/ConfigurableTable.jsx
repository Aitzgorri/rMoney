import { useState, useRef, useEffect } from 'react'
import styles from './ConfigurableTable.module.css'

/**
 * A configurable table with:
 * - Column picker (show/hide per column)
 * - Drag-to-reorder columns in the picker
 * - Sort by any visible column (click header)
 * - Max-height scrollable body (~20 rows)
 * - Fullscreen expand button
 *
 * Props:
 *   columns        — [{ id, label, render, sortValue?, align?, minWidth?, defaultHidden? }]
 *   rows           — any[]  (passed to column.render(row))
 *   rowKey         — (row) => string
 *   storageKey?    — localStorage key for persisting column config
 *   emptyMessage?  — string
 *   maxHeight?     — css string (default "440px")
 */
export default function ConfigurableTable({
  columns,
  rows,
  rowKey,
  storageKey,
  emptyMessage = 'No data.',
  maxHeight = '440px',
}) {
  const [pickerOpen, setPickerOpen]     = useState(false)
  const [fullscreen, setFullscreen]     = useState(false)
  const [sortCol,    setSortCol]        = useState(null)
  const [sortAsc,    setSortAsc]        = useState(true)

  // Column config: { order: string[], hidden: Set<string> }
  const [colConfig, setColConfig] = useState(() => loadColConfig(storageKey, columns))
  const dragItem   = useRef(null)
  const dragOver   = useRef(null)
  const pickerRef  = useRef(null)

  useEffect(() => {
    if (!pickerOpen) return
    function handleOutsideClick(e) {
      if (!pickerRef.current?.contains(e.target)) setPickerOpen(false)
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [pickerOpen])

  const visibleIds = colConfig.order.filter(id => !colConfig.hidden.has(id))
  const visibleCols = visibleIds.map(id => columns.find(c => c.id === id)).filter(Boolean)

  // Sort rows
  const sortedRows = [...rows].sort((a, b) => {
    if (!sortCol) return 0
    const col = columns.find(c => c.id === sortCol)
    if (!col?.sortValue) return 0
    const va = col.sortValue(a)
    const vb = col.sortValue(b)
    if (va == null && vb == null) return 0
    if (va == null) return sortAsc ? 1 : -1
    if (vb == null) return sortAsc ? -1 : 1
    if (typeof va === 'string') return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va)
    return sortAsc ? va - vb : vb - va
  })

  function toggleSort(colId) {
    const col = columns.find(c => c.id === colId)
    if (!col?.sortValue) return
    if (sortCol === colId) setSortAsc(v => !v)
    else { setSortCol(colId); setSortAsc(true) }
  }

  function toggleHidden(id) {
    setColConfig(prev => {
      const hidden = new Set(prev.hidden)
      if (hidden.has(id)) hidden.delete(id)
      else hidden.add(id)
      const next = { ...prev, hidden }
      saveColConfig(storageKey, next)
      return next
    })
  }

  function handleDragStart(id) { dragItem.current = id }
  function handleDragEnter(id) { dragOver.current = id }
  function handleDragEnd() {
    const from = dragItem.current
    const to   = dragOver.current
    if (!from || !to || from === to) { dragItem.current = null; dragOver.current = null; return }
    setColConfig(prev => {
      const order = [...prev.order]
      const fi = order.indexOf(from)
      const ti = order.indexOf(to)
      order.splice(fi, 1)
      order.splice(ti, 0, from)
      const next = { ...prev, order }
      saveColConfig(storageKey, next)
      return next
    })
    dragItem.current = null
    dragOver.current = null
  }

  const tableContent = (
    <div className={`${styles.tableWrap} ${fullscreen ? styles.fullscreenWrap : ''}`}
         style={fullscreen ? {} : { maxHeight }}>
      <table className={styles.table}>
        <thead>
          <tr>
            {visibleCols.map(col => (
              <th
                key={col.id}
                className={`${styles.th} ${col.sortValue ? styles.sortable : ''} ${sortCol === col.id ? styles.sorted : ''}`}
                style={{ minWidth: col.minWidth, textAlign: col.align ?? 'left' }}
                onClick={() => toggleSort(col.id)}
              >
                {col.label}
                {col.sortValue && (
                  <span className={styles.sortIcon}>
                    {sortCol === col.id ? (sortAsc ? ' ↑' : ' ↓') : ' ↕'}
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedRows.length === 0 ? (
            <tr>
              <td colSpan={visibleCols.length} className={styles.empty}>{emptyMessage}</td>
            </tr>
          ) : sortedRows.map(row => (
            <tr key={rowKey(row)} className={styles.tr}>
              {visibleCols.map(col => (
                <td
                  key={col.id}
                  className={styles.td}
                  style={{ textAlign: col.align ?? 'left' }}
                >
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  const toolbar = (
    <div className={styles.toolbar}>
      <div ref={pickerRef} style={{ position: 'relative', display: 'inline-block' }}>
        <button
          className={styles.pickerBtn}
          onClick={() => setPickerOpen(v => !v)}
          type="button"
        >
          ⊞ Columns
        </button>
        {pickerOpen && (
          <div className={styles.pickerPanel}>
            <div className={styles.pickerTitle}>Visible columns</div>
            {colConfig.order.map(id => {
              const col = columns.find(c => c.id === id)
              if (!col) return null
              return (
                <div
                  key={id}
                  className={styles.pickerItem}
                  draggable
                  onDragStart={() => handleDragStart(id)}
                  onDragEnter={() => handleDragEnter(id)}
                  onDragEnd={handleDragEnd}
                >
                  <span className={styles.dragHandle}>⠿</span>
                  <label className={styles.pickerLabel}>
                    <input
                      type="checkbox"
                      checked={!colConfig.hidden.has(id)}
                      onChange={() => toggleHidden(id)}
                    />
                    {col.label}
                  </label>
                </div>
              )
            })}
            <button
              className={styles.pickerClose}
              onClick={() => setPickerOpen(false)}
              type="button"
            >Done</button>
          </div>
        )}
      </div>
      <button
        className={styles.fullscreenBtn}
        onClick={() => setFullscreen(v => !v)}
        title={fullscreen ? 'Exit fullscreen' : 'Expand'}
        type="button"
      >{fullscreen ? '✕ Exit fullscreen' : '⛶ Fullscreen'}</button>
    </div>
  )

  if (fullscreen) {
    return (
      <div className={styles.fullscreenOverlay}>
        {toolbar}
        {tableContent}
      </div>
    )
  }

  return (
    <div className={styles.root}>
      {toolbar}
      {tableContent}
    </div>
  )
}

// ── Storage helpers ───────────────────────────────────────────────────────────

function loadColConfig(key, columns) {
  const defaults = {
    order:  columns.map(c => c.id),
    hidden: new Set(columns.filter(c => c.defaultHidden).map(c => c.id)),
  }
  if (!key) return defaults
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return defaults
    const parsed = JSON.parse(raw)
    // Merge: keep only known columns; add any new columns at the end
    const knownIds = new Set(columns.map(c => c.id))
    const savedOrder = (parsed.order ?? []).filter(id => knownIds.has(id))
    const missing = columns.filter(c => !savedOrder.includes(c.id)).map(c => c.id)
    return {
      order:  [...savedOrder, ...missing],
      hidden: new Set(parsed.hidden ?? []),
    }
  } catch {
    return defaults
  }
}

function saveColConfig(key, config) {
  if (!key) return
  localStorage.setItem(key, JSON.stringify({
    order:  config.order,
    hidden: [...config.hidden],
  }))
}
