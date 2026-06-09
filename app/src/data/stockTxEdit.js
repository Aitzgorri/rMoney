// Shared save helpers for editing a buy/sell from any screen (SPEC-019).
//
// The cost-basis cascade itself lives in `updateBuy` / `updateSell` (data layer): they guard
// share-reduction below what downstream sells consumed, recreate the linked cash movements, and
// — because positions / open lots / realized P/L are all derived at read time — every downstream
// number recomputes automatically. These helpers only add the one host-agnostic concern: refresh
// the FX snapshot when the trade date changed (so main-currency conversions stay accurate).
import { updateBuy, updateSell } from './stockTransactions'
import { getMainCurrency } from './settings'
import { snapshotFxRates } from '../utils/currency'

async function resolveRates(txn, date) {
  // Re-snapshot only when the date moved or the record never had a snapshot.
  if (date === txn.date && txn.exchangeRates) return txn.exchangeRates
  return snapshotFxRates(txn.currency, date, getMainCurrency())
}

export async function applyBuyEdit(txn, params) {
  const exchangeRates = await resolveRates(txn, params.date)
  updateBuy(txn.id, { ...params, exchangeRates })
}

export async function applySellEdit(txn, params) {
  const exchangeRates = await resolveRates(txn, params.date)
  updateSell(txn.id, { ...params, exchangeRates })
}
