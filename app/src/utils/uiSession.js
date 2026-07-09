// Session-only UI state shared across screens. Deliberately NOT persisted
// (no appStorage): it mirrors live component state — the Transactions screen's
// account filter — which itself resets on app restart, so persisting it would
// let a stale value disagree with the visible filter UI after a relaunch.
//
// Phase 53a: the ＋-menu "New transaction" route (AddTransaction) mounts outside
// the Transactions screen, so the active account filter is mirrored here for it
// to read — same filter → last-used prefill rule as the desktop inline form.

let txAccountFilter = ''

export function setTxAccountFilter(accountId) {
  txAccountFilter = accountId || ''
}

export function getTxAccountFilter() {
  return txAccountFilter
}
