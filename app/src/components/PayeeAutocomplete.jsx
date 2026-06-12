import { useState, useRef, useMemo } from 'react'
import { getPayeesRanked } from '../data/transactions'
import styles from './PayeeAutocomplete.module.css'

// Free-text payee field with a suggestion dropdown (Phase 44a/44b). Shared by
// the transaction form, the envelope-history payee filter, and the Payee report.
// - Shows the top-10 payees ranked by most-used (on focus, even when empty),
//   filtered by what's typed.
// - Keyboard: ArrowUp/Down move the highlight, Enter or Tab select the
//   highlighted payee, Esc closes. Mouse click also selects.
// - Stays freely editable: typing a brand-new payee is fine.
//
// `value` / `onChange(string)` mirror a plain input; pass `className` for the
// input so it matches the host form. The full ranked list is read once on mount.
export default function PayeeAutocomplete({ value, onChange, className, placeholder, id, required }) {
  const ranked = useMemo(() => getPayeesRanked(), [])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const blurTimer = useRef(null)

  const suggestions = useMemo(() => {
    const q = (value ?? '').trim().toLowerCase()
    const list = q ? ranked.filter(p => p.name.toLowerCase().includes(q)) : ranked
    return list.slice(0, 10)
  }, [value, ranked])

  function select(name) {
    onChange(name)
    setOpen(false)
    setActive(-1)
  }

  function handleKeyDown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!open) { setOpen(true); return }
      setActive(a => Math.min(a + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive(a => Math.max(a - 1, 0))
    } else if (e.key === 'Enter') {
      if (open && active >= 0 && suggestions[active]) {
        e.preventDefault()                 // select instead of submitting the form
        select(suggestions[active].name)
      }
    } else if (e.key === 'Tab') {
      if (open && active >= 0 && suggestions[active]) {
        select(suggestions[active].name)   // let focus move on to the next field
      }
    } else if (e.key === 'Escape') {
      setOpen(false); setActive(-1)
    }
  }

  return (
    <div className={styles.wrap}>
      <input
        id={id}
        className={className}
        value={value ?? ''}
        required={required}
        placeholder={placeholder}
        autoComplete="off"
        onChange={e => { onChange(e.target.value); setOpen(true); setActive(-1) }}
        onFocus={() => setOpen(true)}
        onBlur={() => { blurTimer.current = setTimeout(() => setOpen(false), 120) }}
        onKeyDown={handleKeyDown}
      />
      {open && suggestions.length > 0 && (
        <div className={styles.suggestions} onMouseDown={() => clearTimeout(blurTimer.current)}>
          {suggestions.map((p, i) => (
            <button
              key={p.name}
              type="button"
              className={`${styles.suggestion} ${i === active ? styles.active : ''}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => select(p.name)}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
