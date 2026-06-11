// Money-entry control (Phase 45g). A text input with `inputmode="decimal"` that
// accepts EITHER a comma or a dot decimal separator regardless of OS/browser
// locale — `<input type="number">` rejects the comma key on a dot-locale
// browser, which is the bug this fixes. The raw typed string is emitted via
// onChange; convert it to a number with `parseAmount` (utils/format) at submit.
//
// Drop-in for the old number input, but onChange receives the STRING value
// (not an event): `<AmountInput value={form.x} onChange={v => set('x', v)} />`.

// Keep only digits, a single decimal separator (comma or dot), and a leading
// minus. Lets the user type "1234,56" or "1234.56" but blocks letters etc.
function cleanAmountInput(raw) {
  let s = String(raw).replace(/[^\d.,-]/g, '')
  s = s.replace(/(?!^)-/g, '')        // keep a minus only at the start
  const i = s.search(/[.,]/)          // collapse to the first separator
  if (i !== -1) s = s.slice(0, i + 1) + s.slice(i + 1).replace(/[.,]/g, '')
  return s
}

// Show a prefilled number with a comma decimal; while typing, show the string as-is.
function display(value) {
  if (value == null || value === '') return ''
  return typeof value === 'number' ? String(value).replace('.', ',') : value
}

export default function AmountInput({ value, onChange, ...rest }) {
  return (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={display(value)}
      onChange={e => onChange(cleanAmountInput(e.target.value))}
      {...rest}
    />
  )
}
