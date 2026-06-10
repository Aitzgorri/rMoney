import { useState } from 'react'
import { SECURITY_MODE_INFO } from '../utils/secrets'
import { transitionRequirements, performTransition } from '../utils/securityTransitions'
import styles from './PassphraseModal.module.css'

// Passphrase dialog that drives a security-mode transition (Phases 39d/39f).
// `from`/`to` are security modes; `from === to` means "change passphrase".
// On success performTransition reloads the page, so this component normally
// unmounts mid-call; it only stays mounted long enough to surface an error.

// Plain-language summary of what each transition does.
function describe(from, to) {
  if (from === to) return 'Set a new passphrase for your vault. Your current passphrase is required.'
  return {
    'none->keys': 'Creates an encrypted vault protected by a new passphrase. Your API keys move into it; your financial data stays as it is.',
    'none->app': 'Creates an encrypted vault. All your data and API keys are encrypted into it, and a passphrase will be required every time you open rMoney.',
    'keys->app': 'Encrypts all your financial data into the existing vault. A passphrase will be required every time you open rMoney.',
    'keys->none': 'Removes the vault. Your API keys are written back to unencrypted storage and no passphrase will be asked.',
    'app->keys': 'Decrypts your financial data back to unencrypted storage, keeping your API keys in the vault. rMoney will open without asking for a passphrase.',
    'app->none': 'Removes the vault. All data and API keys are written back to unencrypted storage and no passphrase will be asked.',
  }[`${from}->${to}`] ?? ''
}

// Whether the transition reduces protection (warn before proceeding).
function reducesSecurity(from, to) {
  if (from === to) return false
  return to === 'none' || (from === 'app' && to === 'keys')
}

export default function SecurityModeChange({ from, to, onClose }) {
  const isChange = from === to
  const { needCurrent, needNew } = transitionRequirements(from, to)
  const [current, setCurrent] = useState('')
  const [next, setNext]       = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy]   = useState(false)

  const title = isChange ? 'Change passphrase' : `Switch to ${SECURITY_MODE_INFO[to].label}`

  async function handleApply() {
    if (needNew) {
      if (next.length < 12) { setError('New passphrase must be at least 12 characters.'); return }
      if (next !== confirm) { setError('New passphrases do not match.'); return }
    }
    if (needCurrent && !current) { setError('Enter your current passphrase.'); return }
    setError('')
    setBusy(true)
    try {
      await performTransition(from, to, { current, next })
      // performTransition reloads on success — we don't normally return here.
    } catch (err) {
      // A wrong current passphrase makes the vault load throw; treat that as the
      // most likely cause when a current passphrase was required.
      setError(needCurrent
        ? 'Could not complete: your current passphrase may be incorrect. (' + (err.message || 'error') + ')'
        : 'Could not complete the change: ' + (err.message || 'Unknown error'))
      setBusy(false)
    }
  }

  return (
    <div className={styles.backdrop}>
      <div className={styles.modal}>
        <h2 className={styles.title}>{title}</h2>
        <p className={styles.description}>{describe(from, to)}</p>

        {reducesSecurity(from, to) && (
          <p className={styles.warning}>
            This lowers your protection — data moved to unencrypted storage can be
            read by anyone with access to this device.
          </p>
        )}

        {needCurrent && (
          <div className={styles.field}>
            <label className={styles.label}>Current passphrase</label>
            <input
              className={styles.input}
              type={showPass ? 'text' : 'password'}
              value={current}
              onChange={e => setCurrent(e.target.value)}
              autoComplete="current-password"
              autoFocus
              placeholder="Enter your current passphrase"
            />
          </div>
        )}

        {needNew && (
          <>
            <div className={styles.field}>
              <label className={styles.label}>New passphrase (min. 12 characters)</label>
              <div className={styles.inputRow}>
                <input
                  className={styles.input}
                  type={showPass ? 'text' : 'password'}
                  value={next}
                  onChange={e => setNext(e.target.value)}
                  autoComplete="new-password"
                  autoFocus={!needCurrent}
                  placeholder="Enter a strong passphrase"
                />
                <button className={styles.toggleBtn} onClick={() => setShowPass(v => !v)}>
                  {showPass ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Confirm new passphrase</label>
              <input
                className={styles.input}
                type={showPass ? 'text' : 'password'}
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                autoComplete="new-password"
                placeholder="Re-enter passphrase"
              />
            </div>
          </>
        )}

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.actions}>
          <button className={styles.cancelBtn} onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className={styles.primaryBtn} onClick={handleApply} disabled={busy}>
            {busy ? 'Working…' : (isChange ? 'Change passphrase' : 'Switch mode')}
          </button>
        </div>
      </div>
    </div>
  )
}
