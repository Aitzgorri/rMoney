import { useState } from 'react'
import {
  getAccounts,
  createAccount,
  updateAccount,
  archiveAccount,
  unarchiveAccount,
  deleteAccount,
} from '../data/accounts'
import { getAccountBalance, hasTransactionsForAccount } from '../data/transactions'
import AccountForm from '../components/AccountForm'
import styles from './Accounts.module.css'
import { fmtAmt } from '../utils/format'

const TYPE_ICON = {
  savings: '🏦',
  debit:   '💳',
  cash:    '💵',
  credit:  '💳',
}

const TYPE_LABEL = {
  savings: 'Savings',
  debit:   'Debit',
  cash:    'Cash',
  credit:  'Credit Card',
}

export default function Accounts() {
  const [accounts, setAccounts] = useState(() => getAccounts())
  const [view, setView] = useState('list')        // 'list' | 'new' | 'edit'
  const [editing, setEditing] = useState(null)
  const [showArchived, setShowArchived] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [deleteError, setDeleteError] = useState(false)

  function refresh() {
    setAccounts(getAccounts())
  }

  function handleSave(form) {
    if (view === 'new') {
      createAccount(form)
    } else {
      updateAccount(editing.id, form)
    }
    refresh()
    setView('list')
    setEditing(null)
  }

  function handleEdit(account) {
    setEditing(account)
    setView('edit')
  }

  function handleDeleteRequest() {
    if (hasTransactionsForAccount(editing.id)) {
      setDeleteError(true)
      return
    }
    setConfirmDelete(editing)
  }

  function handleDeleteConfirm() {
    deleteAccount(confirmDelete.id)
    refresh()
    setConfirmDelete(null)
    setView('list')
    setEditing(null)
  }

  function handleArchive(account) {
    if (account.isArchived) {
      unarchiveAccount(account.id)
    } else {
      archiveAccount(account.id)
    }
    refresh()
    setView('list')
    setEditing(null)
  }

  const active   = accounts.filter(a => !a.isArchived)
  const archived = accounts.filter(a => a.isArchived)

  if (view === 'new' || view === 'edit') {
    return (
      <AccountForm
        initial={view === 'edit' ? editing : null}
        onSave={handleSave}
        onCancel={() => { setView('list'); setEditing(null) }}
        onDelete={view === 'edit' ? handleDeleteRequest : null}
        onArchive={view === 'edit' ? () => handleArchive(editing) : null}
      />
    )
  }

  return (
    <div className={styles.screen}>
      {deleteError && (
        <div className={styles.overlay}>
          <div className={styles.dialog}>
            <h3>Cannot delete account</h3>
            <p>This account has transactions linked to it. Delete or reassign those transactions first.</p>
            <div className={styles.dialogActions}>
              <button className={styles.cancelBtn} onClick={() => setDeleteError(false)} title="Close this message">OK</button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className={styles.overlay}>
          <div className={styles.dialog}>
            <h3>Delete "{confirmDelete.accountName}"?</h3>
            <p>This cannot be undone.</p>
            <div className={styles.dialogActions}>
              <button className={styles.cancelBtn} onClick={() => setConfirmDelete(null)} title="Keep this account">Cancel</button>
              <button className={styles.deleteConfirmBtn} onClick={handleDeleteConfirm} title="Permanently delete this account">Delete</button>
            </div>
          </div>
        </div>
      )}

      <div className={styles.header}>
        <h1 className={styles.title}>Accounts</h1>
        <button className={styles.newBtn} onClick={() => setView('new')} title="Create a new account">+ New</button>
      </div>

      <div className={styles.sectionLabel}>Active</div>

      {active.length === 0 && (
        <p className={styles.empty}>No accounts yet. Add one to get started.</p>
      )}

      {active.map(account => (
        <AccountCard
          key={account.id}
          account={account}
          onClick={() => handleEdit(account)}
        />
      ))}

      {archived.length > 0 && (
        <>
          <button className={styles.archivedToggle} onClick={() => setShowArchived(v => !v)} title={showArchived ? 'Hide the archived accounts' : 'Show the archived accounts'}>
            {showArchived ? 'Hide archived' : `Show archived (${archived.length})`}
          </button>
          {showArchived && archived.map(account => (
            <AccountCard
              key={account.id}
              account={account}
              onClick={() => handleEdit(account)}
              isArchived
            />
          ))}
        </>
      )}
    </div>
  )
}

function AccountCard({ account, onClick, isArchived }) {
  const balance = getAccountBalance(account.id, account.startingBalance)
  const isCredit = account.type === 'credit'
  const balanceClass = isCredit || balance < 0 ? styles.negative : styles.positive

  return (
    <div className={`${styles.card} ${isArchived ? styles.archivedCard : ''}`} onClick={onClick}>
      <div className={styles.cardLeft}>
        <div className={`${styles.icon} ${styles['icon_' + account.type]}`}>
          {TYPE_ICON[account.type]}
        </div>
        <div>
          <div className={styles.accountName}>{account.accountName}</div>
          {account.companyName && (
            <div className={styles.companyName}>{account.companyName}</div>
          )}
          <span className={styles.badge}>{TYPE_LABEL[account.type]}</span>
        </div>
      </div>
      <div className={styles.cardRight}>
        <div className={`${styles.balance} ${balanceClass}`}>
          {isCredit && balance > 0 ? '−' : ''}{fmtAmt(Math.abs(balance))}
        </div>
        <div className={styles.currency}>{account.currency}</div>
      </div>
    </div>
  )
}
