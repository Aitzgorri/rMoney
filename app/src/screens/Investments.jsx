import { useState } from 'react'
import { useMediaQuery, DESKTOP } from '../utils/mediaQuery'
import {
  getInvestingAccounts,
  createInvestingAccount,
  updateInvestingAccount,
  canDeleteInvestingAccount,
  deleteInvestingAccount,
  getCashBalances,
  getCurrentBalance,
} from '../data/investingAccounts'
import { convertToMain } from '../utils/currency'
import {
  getMainCurrency,
  getLastSelectedInvestingAccountId,
  setLastSelectedInvestingAccountId,
} from '../data/settings'
import { fmtAmt } from '../utils/format'
import { getPositions } from '../data/stockTransactions'
import { resetPageCaches } from '../utils/marketDataCache'
import InvestingAccountDetail from './InvestingAccountDetail'
import styles from './Investments.module.css'

// ─── Investments home ─────────────────────────────────────────────────────────

export default function Investments({ onNavigate }) {
  const isDesktop = useMediaQuery(DESKTOP)
  const [accounts, setAccounts] = useState(() => getInvestingAccounts())
  const [selectedId, setSelectedId] = useState(() => {
    const saved = getLastSelectedInvestingAccountId()
    const accts = getInvestingAccounts()
    return accts.some(a => a.id === saved) ? saved : null
  })
  const [formMode, setFormMode] = useState(null)   // null | 'new' | account (for edit)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [resetState, setResetState] = useState('idle')

  function handleResetApi() {
    setResetState('running')
    resetPageCaches('investments')
    setTimeout(() => { setResetState('done') }, 300)
    setTimeout(() => { setResetState('idle') }, 2300)
  }

  const mainCurrency = getMainCurrency()

  function selectAccount(id) {
    setSelectedId(id)
    setLastSelectedInvestingAccountId(id)
  }

  function refresh() { setAccounts(getInvestingAccounts()) }

  function handleSaved() { refresh(); setFormMode(null) }

  function handleDeleteRequest(account) {
    const { canDelete, reason } = canDeleteInvestingAccount(account.id)
    if (!canDelete) { setConfirmDelete({ account, blocked: true, reason }); return }
    setConfirmDelete({ account, blocked: false })
  }

  function handleDeleteConfirm() {
    deleteInvestingAccount(confirmDelete.account.id)
    if (selectedId === confirmDelete.account.id) selectAccount(null)
    refresh()
    setConfirmDelete(null)
  }

  if (selectedId && !isDesktop) {
    return (
      <InvestingAccountDetail
        accountId={selectedId}
        onBack={() => selectAccount(null)}
        onNavigate={onNavigate}
      />
    )
  }

  return (
    <div className={`${styles.screen} ${isDesktop && selectedId ? styles.splitScreen : ''}`}>
      {/* Confirm delete dialog */}
      {confirmDelete && (
        <div className={styles.overlay}>
          <div className={styles.dialog}>
            {confirmDelete.blocked ? (
              <>
                <h3>Cannot delete</h3>
                <p>{confirmDelete.reason}</p>
                <div className={styles.dialogActions}>
                  <button className={styles.cancelBtn} onClick={() => setConfirmDelete(null)}>OK</button>
                </div>
              </>
            ) : (
              <>
                <h3>Delete "{confirmDelete.account.name}"?</h3>
                <p>This will remove the account and all its cash balances. This cannot be undone.</p>
                <div className={styles.dialogActions}>
                  <button className={styles.cancelBtn} onClick={() => setConfirmDelete(null)}>Cancel</button>
                  <button className={styles.deleteBtn} onClick={handleDeleteConfirm}>Delete</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Left pane: account list */}
      <div className={styles.listPane}>
        <div className={styles.header}>
          <h1 className={styles.title}>Investments</h1>
          <div className={styles.headerActions}>
            <button
              className={styles.resetBtn}
              onClick={handleResetApi}
              disabled={resetState !== 'idle'}
              title="Clear cached prices and forex rates so the next load fetches fresh data"
            >
              {resetState === 'running' ? 'Resetting…' : resetState === 'done' ? 'Refreshed ✓' : 'Reset API'}
            </button>
            <button className={styles.newBtn} onClick={() => setFormMode('new')}>+ New account</button>
          </div>
        </div>

        {formMode && (
          <AccountForm
            initial={formMode === 'new' ? null : formMode}
            onSave={handleSaved}
            onCancel={() => setFormMode(null)}
            styles={styles}
          />
        )}

        {accounts.length === 0 && !formMode ? (
          <p className={styles.empty}>No investing accounts yet. Add one to get started.</p>
        ) : (
          <div className={styles.accountList}>
            {accounts.map(account => (
              <AccountCard
                key={account.id}
                account={account}
                mainCurrency={mainCurrency}
                isSelected={selectedId === account.id}
                onClick={() => selectAccount(account.id)}
                onEdit={() => setFormMode(account)}
                onDelete={() => handleDeleteRequest(account)}
                styles={styles}
              />
            ))}
          </div>
        )}

      </div>

      {/* Right pane: detail (desktop only) */}
      {isDesktop && (
        <div className={styles.detailPane}>
          {selectedId ? (
            <InvestingAccountDetail
              key={selectedId}
              accountId={selectedId}
              onBack={() => selectAccount(null)}
              onNavigate={onNavigate}
              embedded
            />
          ) : (
            <p className={styles.selectHint}>Select an account to view details.</p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Account card ─────────────────────────────────────────────────────────────

function AccountCard({ account, mainCurrency, isSelected, onClick, onEdit, onDelete, styles }) {
  const balances  = getCashBalances(account.id)
  const positions = getPositions(account.id)

  let mainTotal = null
  if (balances.length > 0) {
    let sum = 0, ok = true
    for (const bal of balances) {
      const current = getCurrentBalance(bal.id)
      const converted = convertToMain(current, bal.currency, mainCurrency)
      if (converted === null) { ok = false; break }
      sum += converted
    }
    if (ok) mainTotal = sum
  }

  return (
    <div
      className={`${styles.accountCard} ${isSelected ? styles.accountCardSelected : ''}`}
      onClick={onClick}
    >
      <div className={styles.cardTop}>
        <div className={styles.cardNames}>
          <span className={styles.cardName}>{account.name}</span>
          <span className={styles.cardInstitution}>{account.institution}</span>
        </div>
        <div className={styles.cardRight}>
          {mainTotal !== null && (
            <span className={`${styles.cardTotal} ${mainTotal < 0 ? styles.negative : ''}`}>
              {mainTotal < 0 ? '−' : ''}{fmtAmt(Math.abs(mainTotal))} {mainCurrency}
            </span>
          )}
          <div className={styles.cardActions}>
            <button className={styles.actionBtn} onClick={e => { e.stopPropagation(); onEdit() }} title="Edit" aria-label="Edit account">✎</button>
            <button className={styles.actionBtnDelete} onClick={e => { e.stopPropagation(); onDelete() }} title="Delete" aria-label="Delete account">×</button>
          </div>
        </div>
      </div>

      {(balances.length > 0 || positions.length > 0) && (
        <div className={styles.cardSections}>
          {balances.length > 0 && (
            <div className={styles.cardSectionRow}>
              <span className={styles.cardSectionLabel}>Cash</span>
              <div className={styles.cardBalances}>
                {balances.map(bal => {
                  const cur = getCurrentBalance(bal.id)
                  return (
                    <span key={bal.id} className={`${styles.balancePill} ${cur < 0 ? styles.negativePill : ''}`}>
                      {cur < 0 ? '−' : ''}{fmtAmt(Math.abs(cur))} {bal.currency}
                      {cur < 0 && ' ⚠'}
                    </span>
                  )
                })}
              </div>
            </div>
          )}
          {positions.length > 0 && (
            <div className={styles.cardSectionRow}>
              <span className={styles.cardSectionLabel}>Positions</span>
              <span className={styles.cardPositionCount}>
                {positions.length} stock{positions.length !== 1 ? 's' : ''}
              </span>
            </div>
          )}
        </div>
      )}

      {account.note && <p className={styles.cardNote}>{account.note}</p>}
    </div>
  )
}

// ─── Account form (create / edit) ────────────────────────────────────────────

function AccountForm({ initial, onSave, onCancel, styles }) {
  const [institution, setInstitution] = useState(initial?.institution ?? '')
  const [name, setName]               = useState(initial?.name ?? '')
  const [note, setNote]               = useState(initial?.note ?? '')

  function handleSubmit(e) {
    e.preventDefault()
    if (!institution.trim() || !name.trim()) return
    if (initial) {
      updateInvestingAccount(initial.id, { institution: institution.trim(), name: name.trim(), note: note.trim() || null })
    } else {
      createInvestingAccount({ institution, name, note })
    }
    onSave()
  }

  return (
    <form className={styles.accountForm} onSubmit={handleSubmit}>
      <div className={styles.formRow}>
        <label className={styles.formLabel}>Institution</label>
        <input className={styles.formInput} value={institution} onChange={e => setInstitution(e.target.value)}
          placeholder="e.g. Interactive Brokers" autoFocus />
      </div>
      <div className={styles.formRow}>
        <label className={styles.formLabel}>Account name</label>
        <input className={styles.formInput} value={name} onChange={e => setName(e.target.value)}
          placeholder="e.g. IBKR Roth" />
      </div>
      <div className={styles.formRow}>
        <label className={styles.formLabel}>Note</label>
        <input className={styles.formInput} value={note} onChange={e => setNote(e.target.value)}
          placeholder="Optional" />
      </div>
      <div className={styles.formActions}>
        <button type="button" className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
        <button type="submit" className={styles.saveBtn} disabled={!institution.trim() || !name.trim()}>
          {initial ? 'Save' : 'Create'}
        </button>
      </div>
    </form>
  )
}
