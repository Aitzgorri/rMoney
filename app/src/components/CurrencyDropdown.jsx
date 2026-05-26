import { getFavoriteCurrencies } from '../data/settings'
import { ISO4217 } from '../utils/iso4217'

const DIVIDER = '──────────'

// All ISO 4217 codes as a Set for fast lookup
const ALL_CODES = new Set(ISO4217.map(c => c.code))

/**
 * A <select> that shows favorite currencies first (bold, in user order),
 * a non-selectable divider, then every other currency alphabetically.
 *
 * Props:
 *   value       — current ISO 4217 code
 *   onChange    — called with the new code string
 *   disabled?   — boolean
 *   className?  — extra class for the <select> element
 *   excludeMinorUnits? — when true, minor-unit codes (e.g. GBp) are hidden
 *                        (already excluded from iso4217.js, kept for future use)
 */
export default function CurrencyDropdown({ value, onChange, disabled, className, excludeMinorUnits: _unused }) {
  const favorites = getFavoriteCurrencies()
  const favSet = new Set(favorites)

  const others = ISO4217
    .filter(c => !favSet.has(c.code))
    .sort((a, b) => a.code.localeCompare(b.code))

  // Ensure the current value is selectable even if it's not in iso4217.js
  const currentIsKnown = favSet.has(value) || ALL_CODES.has(value)

  return (
    <select
      className={className}
      value={value}
      onChange={e => onChange(e.target.value)}
      disabled={disabled}
    >
      {/* If value is an unknown code (legacy free-text), show it first */}
      {value && !currentIsKnown && (
        <option value={value}>{value}</option>
      )}

      {favorites.map(code => (
        <option key={code} value={code}>{code}</option>
      ))}

      <option value="" disabled>{DIVIDER}</option>

      {others.map(c => (
        <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
      ))}
    </select>
  )
}
