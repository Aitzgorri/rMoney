import TransactionForm from '../components/TransactionForm'
import { getTxAccountFilter } from '../utils/uiSession'
import { getLastUsedAccountId } from '../data/transactions'

// Standalone add route (mobile ＋ menu → New transaction). Prefills the account
// from the Transactions screen's active account filter, else the last-used
// account — the same filter → last-used rule as the desktop inline form (Phase 53a).
export default function AddTransaction({ onClose }) {
  return (
    <TransactionForm
      defaultAccountId={getTxAccountFilter() || getLastUsedAccountId()}
      onSave={onClose}
      onCancel={onClose}
    />
  )
}
