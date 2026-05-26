import { useState } from 'react'
import CurrencyDropdown from './CurrencyDropdown'
import styles from './AccountForm.module.css'

const ACCOUNT_TYPES = [
  { value: 'savings',  label: 'Savings',     icon: '🏦' },
  { value: 'debit',    label: 'Debit',        icon: '💳' },
  { value: 'cash',     label: 'Cash',         icon: '💵' },
  { value: 'credit',   label: 'Credit Card',  icon: '💳' },
]

const EMPTY = {
  type: 'savings',
  companyName: '',
  accountName: '',
  currency: 'EUR',
  startingBalance: '',
}

export default function AccountForm({ initial, onSave, onCancel, onDelete, onArchive }) {
  const [form, setForm] = useState(initial ?? EMPTY)

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (!form.accountName.trim()) return
    onSave(form)
  }

  const isEdit = !!initial

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <div className={styles.header}>
        <button type="button" className={styles.backBtn} onClick={onCancel}>← Back</button>
        <h2 className={styles.title}>{isEdit ? 'Edit Account' : 'New Account'}</h2>
        <span style={{ width: 60 }} />
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Account Type</label>
        <div className={styles.typeGrid}>
          {ACCOUNT_TYPES.map(t => (
            <button
              key={t.value}
              type="button"
              className={`${styles.typeOption} ${form.type === t.value ? styles.selected : ''}`}
              onClick={() => set('type', t.value)}
            >
              <span className={styles.typeIcon}>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Company / Bank Name</label>
        <input
          className={styles.input}
          value={form.companyName}
          onChange={e => set('companyName', e.target.value)}
          placeholder="e.g. My Bank"
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Account Name <span className={styles.required}>*</span></label>
        <input
          className={styles.input}
          value={form.accountName}
          onChange={e => set('accountName', e.target.value)}
          placeholder="e.g. Main Account"
          required
        />
      </div>

      <div className={styles.row}>
        <div className={styles.field} style={{ flex: 1 }}>
          <label className={styles.label}>Currency</label>
          <CurrencyDropdown className={styles.input} value={form.currency} onChange={v => set('currency', v)} />
        </div>
        <div className={styles.field} style={{ flex: 2 }}>
          <label className={styles.label}>Starting Balance</label>
          <input
            className={styles.input}
            type="number"
            step="0.01"
            value={form.startingBalance}
            onChange={e => set('startingBalance', e.target.value)}
            placeholder="0.00"
          />
        </div>
      </div>

      <div className={styles.actions}>
        <button type="button" className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
        <button type="submit" className={styles.saveBtn}>Save Account</button>
      </div>

      {isEdit && onArchive && (
        <button type="button" className={styles.archiveBtn} onClick={onArchive}>
          {initial.isArchived ? 'Unarchive Account' : 'Archive Account'}
        </button>
      )}

      {isEdit && onDelete && (
        <button type="button" className={styles.deleteBtn} onClick={onDelete}>
          Delete Account
        </button>
      )}
    </form>
  )
}
