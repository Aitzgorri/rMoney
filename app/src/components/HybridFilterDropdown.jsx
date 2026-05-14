import { useState, useRef, useEffect } from 'react'
import styles from './HybridFilterDropdown.module.css'

/**
 * Multi-select dropdown with inline search.
 *
 * Props:
 *   label         — pill label when nothing is selected (e.g. "Type")
 *   options       — [{ id, label, secondary? }]
 *   selected      — string[] of selected ids
 *   onChange      — (newSelected: string[]) => void
 *   disabled?     — boolean
 */
export default function HybridFilterDropdown({ label, options, selected, onChange, disabled = false }) {
  const [open, setOpen]     = useState(false)
  const [search, setSearch] = useState('')
  const [pending, setPending] = useState(selected)
  const containerRef = useRef(null)

  // Sync pending with external selected when the dropdown is closed
  useEffect(() => {
    if (!open) setPending(selected)
  }, [selected, open])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handleClick(e) {
      if (!containerRef.current?.contains(e.target)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const filtered = options.filter(o => {
    const q = search.toLowerCase()
    return o.label.toLowerCase().includes(q) || (o.secondary ?? '').toLowerCase().includes(q)
  })

  function handleApply() {
    onChange(pending)
    setOpen(false)
    setSearch('')
  }

  function handleClear() {
    setPending([])
  }

  function toggleItem(id) {
    setPending(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  function openPanel() {
    if (disabled) return
    setPending(selected)
    setSearch('')
    setOpen(true)
  }

  const count = selected.length
  const pillLabel = count > 0 ? `${label} (${count})` : label
  const active = count > 0

  return (
    <div className={styles.container} ref={containerRef}>
      <button
        className={`${styles.pill} ${active ? styles.pillActive : ''} ${disabled ? styles.pillDisabled : ''}`}
        onClick={openPanel}
        type="button"
      >
        {pillLabel}
        <span className={styles.chevron}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className={styles.panel}>
          <div className={styles.searchRow}>
            <input
              className={styles.searchInput}
              type="text"
              placeholder="Search…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              autoFocus
            />
          </div>
          <div className={styles.list}>
            {filtered.length === 0 ? (
              <div className={styles.empty}>No matches</div>
            ) : filtered.map(o => (
              <label key={o.id} className={styles.item}>
                <input
                  type="checkbox"
                  className={styles.checkbox}
                  checked={pending.includes(o.id)}
                  onChange={() => toggleItem(o.id)}
                />
                <span className={styles.itemLabel}>{o.label}</span>
                {o.secondary && (
                  <span className={styles.itemSecondary}>{o.secondary}</span>
                )}
              </label>
            ))}
          </div>
          <div className={styles.footer}>
            <button className={styles.clearBtn} onClick={handleClear} type="button">Clear</button>
            <button className={styles.applyBtn} onClick={handleApply} type="button">Apply</button>
          </div>
        </div>
      )}
    </div>
  )
}
