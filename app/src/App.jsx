import { useState, useEffect } from 'react'
import BottomNav from './components/BottomNav'
import TopNav from './components/TopNav'
import PassphraseSetup from './components/PassphraseSetup'
import PassphraseUnlock from './components/PassphraseUnlock'
import { vaultExists } from './utils/secrets'
import { useMediaQuery, DESKTOP } from './utils/mediaQuery'
import { runDueScheduledTransfers } from './data/envelopes'
import { checkAndGeneratePending } from './data/bills'
import { migrateConfirmedField } from './data/stockProfiles'
import { migrateFavoriteCurrencies } from './data/settings'
import { exportAppData, saveDataFile, openDataFile, importAppData, redactExportData } from './data/portability'
import Dashboard from './screens/Dashboard'
import Envelopes from './screens/Envelopes'
import AddTransaction from './screens/AddTransaction'
import Categories from './screens/Categories'
import Transactions from './screens/Transactions'
import Accounts from './screens/Accounts'
import Settings from './screens/Settings'
import Planning from './screens/Planning'
import ScheduledTransfers from './screens/ScheduledTransfers'
import BillsAndIncome from './screens/BillsAndIncome'
import Budgets from './screens/Budgets'
import Investments from './screens/Investments'
import Portfolios from './screens/Portfolios'
import StockPage from './screens/StockPage'
import CsvImport from './screens/CsvImport'
import Watchlists from './screens/Watchlists'
import Benchmarks from './screens/Benchmarks'
import InvestmentReports from './screens/InvestmentReports'
import StockInventory from './screens/StockInventory'
import DividendPage from './screens/DividendPage'
import BuySellPlanning from './screens/BuySellPlanning'
import styles from './App.module.css'

const IS_TAURI = typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard')
  const isDesktop = useMediaQuery(DESKTOP)
  const [prevTab, setPrevTab] = useState(null)
  const [navParams, setNavParams] = useState({})

  // Vault startup: 'checking' → 'setup' | 'unlock' | 'dev' → 'ready'
  const [vaultStatus, setVaultStatus] = useState('checking')

  const [saveBanner, setSaveBanner] = useState(null)    // { filename, redacted } or null
  const [saveDialog, setSaveDialog] = useState(false)
  const [saveMode, setSaveMode] = useState('sharable')  // 'sharable' | 'full'
  const [loadDialog, setLoadDialog] = useState(null)    // { filename, exportedAt, data } or null
  const [loadError, setLoadError] = useState(null)      // error string or null
  const [keysNotRestored, setKeysNotRestored] = useState(false)

  useEffect(() => {
    // Determine vault startup path
    if (!IS_TAURI) {
      setVaultStatus('dev')
    } else if (vaultExists()) {
      setVaultStatus('unlock')
    } else {
      setVaultStatus('setup')
    }
  }, [])

  useEffect(() => {
    if (vaultStatus !== 'ready' && vaultStatus !== 'dev') return
    runDueScheduledTransfers()
    checkAndGeneratePending()
    migrateConfirmedField()
    migrateFavoriteCurrencies()
    if (sessionStorage.getItem('rmoney_keys_not_restored')) {
      sessionStorage.removeItem('rmoney_keys_not_restored')
      setKeysNotRestored(true)
    }
  }, [vaultStatus])

  function navigate(tab, params = {}) {
    setPrevTab(activeTab)
    setActiveTab(tab)
    setNavParams(params)
  }

  function goBack() {
    setActiveTab(prevTab ?? 'dashboard')
    setPrevTab(null)
  }

  async function handleAction(action) {
    if (action === 'save') {
      setSaveMode('sharable')
      setSaveDialog(true)
    } else if (action === 'load') {
      setLoadError(null)
      const result = await openDataFile()
      if (!result) return                     // user cancelled
      if (result.error) { setLoadError(result.error); return }
      setLoadDialog(result)                   // { data, filename, exportedAt }
    }
  }

  async function handleSave() {
    setSaveDialog(false)
    const raw = exportAppData({ mode: saveMode })
    const data = saveMode === 'sharable' ? redactExportData(raw) : raw
    const filename = await saveDataFile(data)
    if (filename) setSaveBanner({ filename, redacted: saveMode === 'sharable' })
  }

  function handleLoadConfirm() {
    if (loadDialog.data._redacted) {
      sessionStorage.setItem('rmoney_keys_not_restored', '1')
    }
    importAppData(loadDialog.data)
    setLoadDialog(null)
    window.location.reload()
  }

  function renderScreen() {
    switch (activeTab) {
      case 'dashboard':           return <Dashboard onNavigate={navigate} />
      case 'envelopes':          return <Envelopes />
      case 'add':                return <AddTransaction onClose={() => setActiveTab('dashboard')} />
      case 'categories':         return <Categories />
      case 'transactions':       return <Transactions initialAccountId={navParams.accountId} openInline={navParams.openInline} />
      case 'accounts':           return <Accounts onBack={goBack} />
      case 'settings':           return <Settings initialTab={navParams.tab} focusPromptId={navParams.focusPromptId} onNavigate={navigate} />
      case 'planning':           return <Planning />
      case 'scheduled-transfers':return <ScheduledTransfers onBack={goBack} />
      case 'bills':              return <BillsAndIncome onBack={goBack} />
      case 'budgets':            return <Budgets onBack={goBack} />
      case 'investments':        return <Investments onNavigate={navigate} />
      case 'portfolios':         return <Portfolios onBack={() => navigate('investments')} />
      case 'watchlists':         return <Watchlists onNavigate={navigate} />
      case 'benchmarks':         return <Benchmarks />
      case 'reports':            return <InvestmentReports />
      case 'dividends':          return <DividendPage />
      case 'stock':              return <StockPage ticker={navParams.ticker} onBack={goBack} onNavigate={navigate} />
      case 'csv-import':         return <CsvImport accountId={navParams.accountId} onBack={goBack} onNavigate={navigate} />
      case 'stock-inventory':    return <StockInventory onNavigate={navigate} initialConfirmFilter={navParams.confirmFilter} />
      case 'planning-trades':    return <BuySellPlanning onNavigate={navigate} />
      default:                   return <Dashboard onNavigate={navigate} />
    }
  }

  if (vaultStatus === 'checking') return null

  if (vaultStatus === 'setup') {
    return <PassphraseSetup onDone={() => setVaultStatus('ready')} />
  }

  if (vaultStatus === 'unlock') {
    return (
      <PassphraseUnlock
        onDone={() => setVaultStatus('ready')}
        onReset={() => setVaultStatus('setup')}
      />
    )
  }

  return (
    <div className={styles.app}>
      {vaultStatus === 'dev' && (
        <div className={styles.devKeysBanner}>
          Dev mode — API keys are stored in plain text (localStorage). Not for real credentials.
        </div>
      )}
      {isDesktop && <TopNav activeTab={activeTab} onTabChange={navigate} onAction={handleAction} />}

      {saveBanner && (
        <div className={styles.saveBanner}>
          <span>
            Saved <strong>{saveBanner.filename}</strong>.{' '}
            {saveBanner.redacted
              ? 'Keys not included — safe to share.'
              : 'This file contains your API keys — keep it private.'}
          </span>
          <button className={styles.saveBannerClose} onClick={() => setSaveBanner(null)}>✕</button>
        </div>
      )}

      {keysNotRestored && (
        <div className={styles.keysNotRestored}>
          <span>
            Keys were not restored from this backup. Re-enter them in Settings → Market data and Settings → AI.
          </span>
          <button className={styles.saveBannerClose} onClick={() => setKeysNotRestored(false)}>✕</button>
        </div>
      )}

      {loadError && (
        <div className={styles.loadError}>
          <span>{loadError}</span>
          <button className={styles.saveBannerClose} onClick={() => setLoadError(null)}>✕</button>
        </div>
      )}

      <main className={`${styles.main} ${isDesktop ? styles.mainDesktop : ''}`}>
        {renderScreen()}
      </main>

      {!isDesktop && <BottomNav activeTab={activeTab} onTabChange={navigate} onAction={handleAction} />}

      {saveDialog && (
        <div className={styles.dialogBackdrop}>
          <div className={styles.dialog}>
            <h2 className={styles.dialogTitle}>Save backup</h2>
            <div className={styles.saveOptions}>
              <label className={`${styles.saveOption} ${saveMode === 'sharable' ? styles.saveOptionSelected : ''}`}>
                <input type="radio" name="saveMode" value="sharable"
                  checked={saveMode === 'sharable'}
                  onChange={() => setSaveMode('sharable')} />
                <div>
                  <div className={styles.saveOptionTitle}>Sharable export (recommended)</div>
                  <div className={styles.saveOptionDesc}>Keys are removed — safe to share</div>
                </div>
              </label>
              <label className={`${styles.saveOption} ${saveMode === 'full' ? styles.saveOptionSelected : ''}`}>
                <input type="radio" name="saveMode" value="full"
                  checked={saveMode === 'full'}
                  onChange={() => setSaveMode('full')} />
                <div>
                  <div className={styles.saveOptionTitle}>Full backup</div>
                  <div className={styles.saveOptionDesc}>Keys are included — keep this file private</div>
                </div>
              </label>
            </div>
            <div className={styles.dialogActions}>
              <button className={styles.dialogCancel} onClick={() => setSaveDialog(false)}>Cancel</button>
              <button className={styles.dialogPrimary} onClick={handleSave}>Save</button>
            </div>
          </div>
        </div>
      )}

      {loadDialog && (
        <div className={styles.dialogBackdrop}>
          <div className={styles.dialog}>
            <h2 className={styles.dialogTitle}>Load data from file</h2>
            <div className={styles.dialogMeta}>
              <div><span className={styles.metaLabel}>File:</span> {loadDialog.filename}</div>
              <div><span className={styles.metaLabel}>Exported:</span> {loadDialog.exportedAt}</div>
              <div><span className={styles.metaLabel}>Version:</span> {loadDialog.data.version}</div>
            </div>
            <p className={styles.dialogWarning}>
              This will <strong>REPLACE</strong> all current app data.<br />
              This cannot be undone.
            </p>
            <div className={styles.dialogActions}>
              <button className={styles.dialogCancel} onClick={() => setLoadDialog(null)}>Cancel</button>
              <button className={styles.dialogConfirm} onClick={handleLoadConfirm}>Replace all data</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
