// Payee management (Phase 44g). Payees are free-text `payeeName` strings on
// transactions plus a `payee` string on Bills & Income planned items, with a
// secondary `rmoney_payees` registry. Everything here matches by NORMALISED
// name (trimmed, lower-cased) so case/whitespace variants are treated as one
// payee, and rewrites transactions + planned items + the registry together.
import appStorage from '../utils/appStorage'
import { getPlannedItems, updatePlannedItem } from './bills'

const KEY_TX     = 'rmoney_transactions'
const KEY_PAYEES = 'rmoney_payees'

function load(key) { try { return JSON.parse(appStorage.getItem(key)) ?? [] } catch { return [] } }
function save(key, data) { appStorage.setItem(key, JSON.stringify(data)) }

export function normPayee(name) { return (name ?? '').trim().toLowerCase() }

// Does a payee with this normalised name already exist (in a transaction or the
// registry)? Used to warn that a rename will MERGE into an existing payee.
export function payeeExists(name) {
  const n = normPayee(name)
  if (!n) return false
  return load(KEY_PAYEES).some(p => normPayee(p.name) === n)
      || load(KEY_TX).some(t => normPayee(t.payeeName) === n)
}

// How many transactions + planned items reference a payee (for confirmations).
export function getPayeeUsage(name) {
  const n = normPayee(name)
  return {
    txCount:   load(KEY_TX).filter(t => normPayee(t.payeeName) === n).length,
    itemCount: getPlannedItems().filter(i => normPayee(i.payee) === n).length,
  }
}

// Rename a payee across transactions + planned items + registry. If newName
// normalises to an existing payee this naturally MERGES the two (both end up
// under newName and the old registry record is dropped).
export function renamePayee(oldName, newName) {
  const o  = normPayee(oldName)
  const nn = (newName ?? '').trim()
  if (!o || !nn) return
  save(KEY_TX, load(KEY_TX).map(t => normPayee(t.payeeName) === o ? { ...t, payeeName: nn } : t))
  for (const item of getPlannedItems()) {
    if (normPayee(item.payee) === o) updatePlannedItem(item.id, { payee: nn })
  }
  const reg = load(KEY_PAYEES).filter(p => normPayee(p.name) !== o)
  if (!reg.some(p => normPayee(p.name) === normPayee(nn))) {
    reg.push({ id: crypto.randomUUID(), name: nn, createdAt: new Date().toISOString() })
  }
  save(KEY_PAYEES, reg)
}

// Delete a payee: matching transactions + planned items become payee-less
// (records are NOT deleted); the registry record is removed.
export function deletePayee(name) {
  const n = normPayee(name)
  if (!n) return
  save(KEY_TX, load(KEY_TX).map(t => normPayee(t.payeeName) === n ? { ...t, payeeName: '' } : t))
  for (const item of getPlannedItems()) {
    if (normPayee(item.payee) === n) updatePlannedItem(item.id, { payee: '' })
  }
  save(KEY_PAYEES, load(KEY_PAYEES).filter(p => normPayee(p.name) !== n))
}

// ─── Storage stats (Settings → Storage tab, Phase 44h) ───────────────────────
export function getPayeesStorageBytes() {
  return new Blob([appStorage.getItem(KEY_PAYEES) ?? '[]']).size
}
export function getPayeesStats() {
  return { count: load(KEY_PAYEES).length, bytes: getPayeesStorageBytes() }
}
