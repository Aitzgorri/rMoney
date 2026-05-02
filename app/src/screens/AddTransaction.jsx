import TransactionForm from '../components/TransactionForm'

export default function AddTransaction({ onClose }) {
  return (
    <TransactionForm
      onSave={onClose}
      onCancel={onClose}
    />
  )
}
