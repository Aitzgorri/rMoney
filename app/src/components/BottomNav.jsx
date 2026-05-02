import { useState } from 'react'
import { getTriggeredAlertCount } from '../data/watchlists'
import styles from './BottomNav.module.css'

const INVESTMENTS_IDS = new Set(['investments', 'portfolios', 'watchlists', 'benchmarks', 'stock', 'csv-import'])

const investmentItems = [
  { id: 'investments', label: 'Investments overview', icon: '📈' },
  { id: 'portfolios',  label: 'Portfolios',           icon: '🗂️' },
  { id: 'watchlists',  label: 'Watchlists',           icon: '👁️' },
  { id: 'benchmarks',  label: 'Benchmarks',           icon: '📊' },
]

const tabs = [
  { id: 'dashboard',    label: 'Dashboard',    icon: '🏠' },
  { id: 'envelopes',   label: 'Envelopes',    icon: '📋' },
  { id: 'add',          label: '',             icon: '+',  isAdd: true },
  { id: 'investments',  label: 'Investments',  icon: '📈', isInvestments: true },
  { id: 'more',         label: 'More',         icon: '⋯',  isMore: true },
]

const moreItems = [
  { id: 'planning',            label: 'Envelope planning',   icon: '📊' },
  { id: 'budgets',             label: 'Category budgets',    icon: '🎯' },
  { id: 'scheduled-transfers', label: 'Scheduled transfers', icon: '🔁' },
  { id: 'bills',               label: 'Bills & Income',      icon: '💳' },
  { id: 'categories',          label: 'Categories',          icon: '🏷️' },
  { id: 'settings',            label: 'Settings',            icon: '⚙️' },
  { id: 'save-to-file',        label: 'Save to file',        icon: '💾', action: 'save' },
  { id: 'load-from-file',      label: 'Load from file',      icon: '📂', action: 'load' },
]

export default function BottomNav({ activeTab, onTabChange, onAction }) {
  const [moreOpen,    setMoreOpen]    = useState(false)
  const [investOpen,  setInvestOpen]  = useState(false)
  const alertBadge = getTriggeredAlertCount()

  function handleMoreSelect(item) {
    setMoreOpen(false)
    if (item.action) {
      onAction?.(item.action)
    } else {
      onTabChange(item.id)
    }
  }

  function handleInvestSelect(item) {
    setInvestOpen(false)
    onTabChange(item.id)
  }

  const moreActive = moreItems.filter(i => !i.action).some(i => i.id === activeTab)
  const investActive = INVESTMENTS_IDS.has(activeTab)

  return (
    <>
      {moreOpen && (
        <div className={styles.backdrop} onClick={() => setMoreOpen(false)}>
          <div className={styles.moreMenu} onClick={e => e.stopPropagation()}>
            {moreItems.map(item => (
              <button
                key={item.id}
                className={styles.moreItem}
                onClick={() => handleMoreSelect(item)}
              >
                <span className={styles.moreIcon}>{item.icon}</span>
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {investOpen && (
        <div className={styles.backdrop} onClick={() => setInvestOpen(false)}>
          <div className={styles.moreMenu} onClick={e => e.stopPropagation()}>
            {investmentItems.map(item => (
              <button
                key={item.id}
                className={`${styles.moreItem} ${activeTab === item.id ? styles.moreItemActive : ''}`}
                onClick={() => handleInvestSelect(item)}
              >
                <span className={styles.moreIcon}>{item.icon}</span>
                <span>{item.label}</span>
                {item.id === 'watchlists' && alertBadge > 0 && (
                  <span className={styles.badge}>{alertBadge}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      <nav className={styles.nav}>
        {tabs.map(tab => {
          if (tab.isAdd) {
            return (
              <button
                key={tab.id}
                className={styles.addBtn}
                onClick={() => { setMoreOpen(false); setInvestOpen(false); onTabChange('add') }}
                aria-label="Add transaction"
              >
                +
              </button>
            )
          }
          if (tab.isMore) {
            return (
              <button
                key={tab.id}
                className={`${styles.tab} ${moreActive ? styles.active : ''}`}
                onClick={() => { setInvestOpen(false); setMoreOpen(o => !o) }}
              >
                <span className={styles.icon}>{tab.icon}</span>
                <span className={styles.label}>{tab.label}</span>
              </button>
            )
          }
          if (tab.isInvestments) {
            return (
              <button
                key={tab.id}
                className={`${styles.tab} ${investActive ? styles.active : ''}`}
                onClick={() => { setMoreOpen(false); setInvestOpen(o => !o) }}
              >
                <span className={styles.iconWrap}>
                  <span className={styles.icon}>{tab.icon}</span>
                  {alertBadge > 0 && <span className={styles.badge}>{alertBadge}</span>}
                </span>
                <span className={styles.label}>{tab.label}</span>
              </button>
            )
          }
          return (
            <button
              key={tab.id}
              className={`${styles.tab} ${activeTab === tab.id ? styles.active : ''}`}
              onClick={() => { setMoreOpen(false); setInvestOpen(false); onTabChange(tab.id) }}
            >
              <span className={styles.icon}>{tab.icon}</span>
              <span className={styles.label}>{tab.label}</span>
            </button>
          )
        })}
      </nav>
    </>
  )
}
