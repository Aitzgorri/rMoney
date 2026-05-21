import { getTriggeredAlertCount } from '../data/watchlists'
import styles from './TopNav.module.css'

const INVESTMENTS_TABS = [
  { id: 'investments', label: 'Investments overview' },
  { id: 'portfolios',  label: 'Portfolios' },
  { id: 'watchlists',  label: 'Watchlists' },
  { id: 'benchmarks',  label: 'Benchmarks' },
  { id: 'reports',     label: 'Reports' },
  { id: 'dividends',   label: 'Dividends' },
]

const INVESTMENTS_IDS = new Set(['investments', 'portfolios', 'watchlists', 'benchmarks', 'reports', 'dividends', 'stock', 'csv-import'])

const primaryTabs = [
  { id: 'dashboard',    label: 'Dashboard' },
  { id: 'envelopes',   label: 'Envelopes' },
  { id: 'transactions', label: 'Transactions' },
]

const MORE_NAV_TABS = [
  { id: 'planning',             label: 'Planning' },
  { id: 'budgets',              label: 'Category Budgets' },
  { id: 'scheduled-transfers',  label: 'Scheduled Transfers' },
  { id: 'bills',                label: 'Bills & Income' },
  { id: 'categories',           label: 'Categories' },
  { id: 'stock-inventory',      label: 'Stock inventory' },
  { id: 'settings',             label: 'Settings' },
]

const MORE_ACTION_TABS = [
  { label: 'Save to file',   action: 'save' },
  { label: 'Load from file', action: 'load' },
]

const MORE_NAV_IDS = new Set(MORE_NAV_TABS.map(t => t.id))

export default function TopNav({ activeTab, onTabChange, onAction }) {
  const moreActive   = MORE_NAV_IDS.has(activeTab)
  const investActive = INVESTMENTS_IDS.has(activeTab)
  const alertBadge   = getTriggeredAlertCount()

  return (
    <header className={styles.header}>
      {/* ── Main nav row ───────────────────────────────────────────────── */}
      <div className={styles.headerRow}>
        <span className={styles.brand}>rMoney</span>
        <nav className={styles.nav}>
          {primaryTabs.map(tab => (
            <button
              key={tab.id}
              className={`${styles.tab} ${activeTab === tab.id ? styles.active : ''}`}
              onClick={() => onTabChange(tab.id)}
            >
              {tab.label}
            </button>
          ))}

          <button
            className={`${styles.tab} ${investActive ? styles.active : ''}`}
            onClick={() => onTabChange('investments')}
          >
            Investments
            {alertBadge > 0 && <span className={styles.badge}>{alertBadge}</span>}
          </button>

          <button
            className={`${styles.tab} ${moreActive ? styles.active : ''}`}
            onClick={() => { if (!moreActive) onTabChange('planning') }}
          >
            More
          </button>
        </nav>
        <button
          className={styles.addBtn}
          onClick={() => onTabChange('transactions', { openInline: Date.now() })}
        >
          + Add transaction
        </button>
      </div>

      {/* ── Sub-nav row (only when a grouped section is active) ────────── */}
      {(investActive || moreActive) && (
        <div className={styles.subRow}>
          {investActive && INVESTMENTS_TABS.map(tab => (
            <button
              key={tab.id}
              className={`${styles.subTab} ${activeTab === tab.id ? styles.subTabActive : ''}`}
              onClick={() => onTabChange(tab.id)}
            >
              {tab.label}
            </button>
          ))}

          {moreActive && (
            <>
              {MORE_NAV_TABS.map(tab => (
                <button
                  key={tab.id}
                  className={`${styles.subTab} ${activeTab === tab.id ? styles.subTabActive : ''}`}
                  onClick={() => onTabChange(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
              <div className={styles.subRowSpacer} />
              {MORE_ACTION_TABS.map(tab => (
                <button
                  key={tab.action}
                  className={styles.subTabAction}
                  onClick={() => onAction?.(tab.action)}
                >
                  {tab.label}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </header>
  )
}
