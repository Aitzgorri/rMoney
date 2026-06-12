import { useState, useEffect } from 'react'
import BottomNav from './components/BottomNav'
import TopNav from './components/TopNav'
import PassphraseSetup from './components/PassphraseSetup'
import PassphraseUnlock from './components/PassphraseUnlock'
import SecurityModeSelect from './components/SecurityModeSelect'
import { vaultExists, readVaultBytes, writeVaultBytes, getSecurityMode, setSecurityMode, isSecurityModeSet, setVaultUnlockHandler } from './utils/secrets'
import { hydrateAppStore, flushAppStore, installAppStoreLifecycle } from './utils/appData'
import FullBackupPassphrasePrompt from './components/FullBackupPassphrasePrompt'
import { useMediaQuery, DESKTOP } from './utils/mediaQuery'
import { runDueScheduledTransfers } from './data/envelopes'
import { checkAndGeneratePending } from './data/bills'
import { migrateConfirmedField } from './data/stockProfiles'
import { migrateFavoriteCurrencies, migrateFavoriteCountries } from './data/settings'
import { migrateDividendStatuses, promoteDividends, autoCreatePendingFromApi } from './data/dividends'
import { migrateFeeCurrencyInvariant } from './data/stockTransactions'
import { exportAppData, saveDataFile, openDataFile, importAppData, redactExportData, base64ToBytes } from './data/portability'
import ResetDataDialog from './components/ResetDataDialog'
import Dashboard from './screens/Dashboard'
import Envelopes from './screens/Envelopes'
import AddTransaction from './screens/AddTransaction'
import Transactions from './screens/Transactions'
import Accounts from './screens/Accounts'
import Settings from './screens/Settings'
import Planning from './screens/Planning'
import ScheduledTransfers from './screens/ScheduledTransfers'
import BillsAndIncome from './screens/BillsAndIncome'
import Payees from './screens/Payees'
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

  // Vault startup: 'checking' → 'mode-select' | 'setup' | 'unlock' | 'dev' → 'ready'
  const [vaultStatus, setVaultStatus] = useState('checking')

  // Lazy 'keys'-mode unlock: when a secret is needed and the vault is closed,
  // secrets.js calls our registered handler, which shows this modal and resolves
  // once the user unlocks (or cancels). Holds the pending promise resolver.
  const [lazyUnlockResolve, setLazyUnlockResolve] = useState(null)

  const [saveBanner, setSaveBanner] = useState(null)    // { filename, redacted } or null
  const [saveDialog, setSaveDialog] = useState(false)
  const [saveMode, setSaveMode] = useState('sharable')  // 'sharable' | 'full'
  const [awaitingPassphrase, setAwaitingPassphrase] = useState(false)  // Full Backup vault embed step
  const [loadDialog, setLoadDialog] = useState(null)    // { filename, exportedAt, data } or null
  const [loadError, setLoadError] = useState(null)      // error string or null
  const [resetDialog, setResetDialog] = useState(false)
  const [keysNotRestored, setKeysNotRestored] = useState(false)
  const [droppedDividends, setDroppedDividends] = useState([])

  useEffect(() => {
    // Determine vault startup path (SPEC-031 § Access and password modes).
    if (!IS_TAURI) {
      // Web/Capacitor: no Stronghold, keys are plaintext — always 'none' mode.
      setVaultStatus('dev')
      return
    }
    // Brand-new install (no explicit mode AND no vault): choose how to protect.
    if (!isSecurityModeSet() && !vaultExists()) {
      setVaultStatus('mode-select')
      return
    }
    // getSecurityMode() infers 'app' for an existing pre-39 vault (upgrade users
    // keep their startup-prompt experience).
    const mode = getSecurityMode()
    if (mode === 'none') {
      setVaultStatus('ready')              // no vault, no prompt
    } else if (mode === 'keys') {
      setVaultStatus('ready')              // open immediately; vault unlocked lazily
    } else if (vaultExists()) {
      setVaultStatus('unlock')             // 'app' mode: prompt, then hydrate
    } else {
      setVaultStatus('setup')              // 'app'/'keys' chosen but vault not created yet
    }
  }, [])

  // First-launch mode choice (Phase 39c): record the mode, then route. 'app' and
  // 'keys' create a vault via PassphraseSetup; 'none' enters the app directly.
  function handleModeChosen(mode) {
    setSecurityMode(mode)
    setVaultStatus(mode === 'none' ? 'ready' : 'setup')
  }

  // Called after the vault is opened at startup (setup or unlock). In 'app' mode
  // the encrypted snapshot must be decrypted into the in-memory store before any
  // screen renders, so we await hydration here (Phase 39e). Other modes go
  // straight to ready.
  async function finishVaultOpen() {
    if (IS_TAURI && getSecurityMode() === 'app') {
      try {
        await hydrateAppStore()
      } catch (err) {
        // Hydration failed (corrupt/unreadable snapshot). The setup/unlock
        // screens render before the main app, so a banner there would be
        // invisible — surface it with a blocking alert instead of silently
        // rendering an empty app over real encrypted data, and stay on the
        // unlock screen so the user can retry or restart.
        window.alert('Could not load your encrypted data: ' + (err.message || 'Unknown error') +
          '\n\nClose and reopen rMoney to try again.')
        return
      }
    }
    setVaultStatus('ready')
  }

  // Register the lazy-unlock handler and 'app'-mode lifecycle flushes once.
  useEffect(() => {
    setVaultUnlockHandler(() => new Promise(resolve => {
      // Store the resolver; the modal calls it with true (unlocked) or false.
      setLazyUnlockResolve(() => resolve)
    }))
    const cleanup = installAppStoreLifecycle()
    return () => {
      setVaultUnlockHandler(null)
      cleanup()
    }
  }, [])

  useEffect(() => {
    if (vaultStatus !== 'ready' && vaultStatus !== 'dev') return
    runDueScheduledTransfers()
    checkAndGeneratePending()
    migrateConfirmedField()
    migrateFavoriteCurrencies()
    migrateFavoriteCountries()
    migrateDividendStatuses()
    migrateFeeCurrencyInvariant()
    const { dropped } = promoteDividends()
    if (dropped.length > 0) setDroppedDividends(dropped)
    autoCreatePendingFromApi()
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
    } else if (action === 'reset') {
      setResetDialog(true)
    }
  }

  // Triggered by the "Back up first…" button inside the Reset dialog.
  // Closes the Reset dialog, opens the Save flow in Full backup mode; after the
  // save flow completes the user can re-open Reset from the More menu with their
  // toggles intact (we don't try to round-trip preserve state through the save flow).
  function handleResetBackup() {
    setResetDialog(false)
    setSaveMode('full')
    setSaveDialog(true)
  }

  async function handleSave() {
    // Full Backup with a real vault → require passphrase confirmation before
    // embedding the encrypted snapshot (SPEC-031 § 241a).
    if (saveMode === 'full' && IS_TAURI && vaultExists()) {
      setSaveDialog(false)
      setAwaitingPassphrase(true)
      return
    }
    setSaveDialog(false)
    await writeBackupFile(null)
  }

  // Continuation after the passphrase prompt verifies. Reads the vault bytes
  // and embeds them in the Full Backup payload. Called only when verifyPassphrase
  // already succeeded, so readVaultBytes will resolve to the on-disk snapshot.
  async function handlePassphraseConfirmed() {
    setAwaitingPassphrase(false)
    try {
      // In 'app' mode the latest in-memory data must be encrypted into the vault
      // snapshot record before we read the vault bytes, or the embedded vault
      // would carry a stale snapshot (Phase 39e/39f).
      await flushAppStore()
      const vaultBytes = await readVaultBytes()
      await writeBackupFile(vaultBytes)
    } catch (err) {
      setLoadError('Backup save failed: ' + (err.message || 'Unknown error'))
    }
  }

  // Shared writer: builds the payload (with optional vault embed), redacts if
  // sharable, then hands off to saveDataFile.
  async function writeBackupFile(strongholdVault) {
    const raw = exportAppData({ mode: saveMode, strongholdVault })
    const data = saveMode === 'sharable' ? redactExportData(raw) : raw
    try {
      const filename = await saveDataFile(data)
      if (filename) setSaveBanner({ filename, redacted: saveMode === 'sharable' })
    } catch (err) {
      setLoadError('Backup save failed: ' + (err.message || 'Unknown error'))
    }
  }

  async function handleLoadConfirm() {
    const data = loadDialog.data
    if (data._redacted) {
      sessionStorage.setItem('rmoney_keys_not_restored', '1')
    }
    // Restore the embedded Stronghold vault (Full Backup on Tauri only). After
    // reload, the existing unlock flow will prompt the user for the master
    // passphrase associated with the restored vault.
    if (IS_TAURI && typeof data._strongholdVault === 'string') {
      try {
        await writeVaultBytes(base64ToBytes(data._strongholdVault))
      } catch (err) {
        setLoadError('Vault restore failed: ' + (err.message || 'Unknown error'))
        return
      }
    }
    importAppData(data)
    setLoadDialog(null)
    window.location.reload()
  }

  function renderScreen() {
    switch (activeTab) {
      case 'dashboard':           return <Dashboard onNavigate={navigate} />
      case 'envelopes':          return <Envelopes />
      case 'add':                return <AddTransaction onClose={() => setActiveTab('dashboard')} />
      case 'transactions':       return <Transactions initialAccountId={navParams.accountId} openInline={navParams.openInline} />
      case 'accounts':           return <Accounts onBack={goBack} />
      case 'settings':           return <Settings initialTab={navParams.tab} focusPromptId={navParams.focusPromptId} onNavigate={navigate} />
      case 'planning':           return <Planning />
      case 'scheduled-transfers':return <ScheduledTransfers onBack={goBack} />
      case 'bills':              return <BillsAndIncome onBack={goBack} />
      case 'payees':             return <Payees />
      case 'budgets':            return <Budgets onBack={goBack} />
      case 'investments':        return <Investments onNavigate={navigate} />
      case 'portfolios':         return <Portfolios onBack={() => navigate('investments')} />
      case 'watchlists':         return <Watchlists onNavigate={navigate} />
      case 'benchmarks':         return <Benchmarks />
      case 'reports':            return <InvestmentReports />
      case 'dividends':          return <DividendPage initialTab={navParams.initialTab} onNavigate={navigate} />
      case 'stock':              return <StockPage ticker={navParams.ticker} onBack={goBack} onNavigate={navigate} />
      case 'csv-import':         return <CsvImport accountId={navParams.accountId} onBack={goBack} onNavigate={navigate} />
      case 'stock-inventory':    return <StockInventory onNavigate={navigate} initialConfirmFilter={navParams.confirmFilter} />
      case 'planning-trades':    return <BuySellPlanning onNavigate={navigate} />
      default:                   return <Dashboard onNavigate={navigate} />
    }
  }

  if (vaultStatus === 'checking') return null

  if (vaultStatus === 'mode-select') {
    return <SecurityModeSelect onChoose={handleModeChosen} />
  }

  if (vaultStatus === 'setup') {
    return <PassphraseSetup onDone={finishVaultOpen} />
  }

  if (vaultStatus === 'unlock') {
    return (
      <PassphraseUnlock
        mode={getSecurityMode()}
        onDone={finishVaultOpen}
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

      {droppedDividends.length > 0 && (
        <div className={styles.keysNotRestored}>
          <span>
            {droppedDividends.length === 1
              ? `1 pending dividend for ${droppedDividends[0].ticker} was removed — no shares held on the ex-dividend date.`
              : `${droppedDividends.length} pending dividends were removed — no shares held on their ex-dividend dates (${[...new Set(droppedDividends.map(d => d.ticker))].join(', ')}).`}
          </span>
          <button className={styles.saveBannerClose} onClick={() => setDroppedDividends([])}>✕</button>
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

      {awaitingPassphrase && (
        <FullBackupPassphrasePrompt
          onConfirm={handlePassphraseConfirmed}
          onCancel={() => setAwaitingPassphrase(false)}
        />
      )}

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

      {resetDialog && (
        <ResetDataDialog
          onBackup={handleResetBackup}
          onClose={() => setResetDialog(false)}
        />
      )}

      {/* Lazy 'keys'-mode unlock (Phase 39d): shown on demand when a secret is
          needed and the vault is still locked this session. */}
      {lazyUnlockResolve && (
        <PassphraseUnlock
          mode={getSecurityMode()}
          onDone={() => { const r = lazyUnlockResolve; setLazyUnlockResolve(null); r(true) }}
          onCancel={() => { const r = lazyUnlockResolve; setLazyUnlockResolve(null); r(false) }}
          onReset={() => { const r = lazyUnlockResolve; setLazyUnlockResolve(null); r(false); window.location.reload() }}
        />
      )}
    </div>
  )
}
