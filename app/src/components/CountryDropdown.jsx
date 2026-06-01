import { getFavoriteCountries } from '../data/settings'
import { ISO3166, ISO3166_MAP } from '../utils/iso3166'

const DIVIDER_VALUE = '__divider__'
const DIVIDER_LABEL = '──────────'

// All alpha-2 codes as a Set for fast lookup.
const ALL_CODES = new Set(ISO3166.map(c => c.code))

/**
 * A <select> that shows favorite countries first (in user order), a
 * non-selectable divider, then every other country sorted by name.
 * Option labels render as "DE — Germany"; the stored value is the ISO 3166-1
 * alpha-2 code. An empty selectable option is always offered first because
 * HQ country and per-country tax are optional.
 *
 * Props:
 *   value        — current alpha-2 code (may be '' / null)
 *   onChange     — called with the new code string ('' when cleared)
 *   disabled?    — boolean
 *   className?   — extra class for the <select> element
 *   style?       — inline style for the <select> element
 *   placeholder? — label for the empty option (default "— none —")
 */
export default function CountryDropdown({ value, onChange, disabled, className, style, placeholder = '— none —' }) {
  const favorites = getFavoriteCountries()
  const favSet = new Set(favorites)

  const others = ISO3166
    .filter(c => !favSet.has(c.code))
    .sort((a, b) => a.name.localeCompare(b.name))

  // Ensure the current value is selectable even if it's a legacy free-text
  // value that isn't a valid alpha-2 code (e.g. a typed "UK" or "german").
  const currentIsKnown = !value || favSet.has(value) || ALL_CODES.has(value)

  return (
    <select
      className={className}
      style={style}
      value={value ?? ''}
      onChange={e => onChange(e.target.value)}
      disabled={disabled}
    >
      <option value="">{placeholder}</option>

      {/* Legacy / unknown stored value shown so existing data still displays */}
      {value && !currentIsKnown && (
        <option value={value}>{value} (unrecognised)</option>
      )}

      {favorites.map(code => (
        <option key={code} value={code}>{code} — {ISO3166_MAP[code] ?? code}</option>
      ))}

      <option value={DIVIDER_VALUE} disabled>{DIVIDER_LABEL}</option>

      {others.map(c => (
        <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
      ))}
    </select>
  )
}
