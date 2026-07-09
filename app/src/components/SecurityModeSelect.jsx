import { useState } from 'react'
import { SECURITY_MODES, SECURITY_MODE_INFO, isEncryptionAvailable } from '../utils/secrets'
import styles from './SecurityModeSelect.module.css'

// First-launch mode-selection screen (SPEC-031 § Access and password modes,
// Phase 39c). Shown only on a brand-new install before any vault exists. The
// caller (App.jsx) records the chosen mode and routes: 'app'/'keys' continue to
// PassphraseSetup to create the vault; 'none' goes straight into the app.
export default function SecurityModeSelect({ onChoose }) {
  const encryptionAvailable = isEncryptionAvailable()
  const [selected, setSelected] = useState('app')

  return (
    <div className={styles.backdrop}>
      <div className={styles.modal}>
        <h2 className={styles.title}>How should rMoney protect your data?</h2>
        <p className={styles.description}>
          Choose how a passphrase guards this app. You can change this later in
          Settings → Security.
        </p>

        <div className={styles.modeList}>
          {SECURITY_MODES.map(mode => {
            const info = SECURITY_MODE_INFO[mode]
            const unavailable = !encryptionAvailable && mode !== 'none'
            const isSelected = mode === selected
            return (
              <button
                key={mode}
                type="button"
                className={`${styles.modeCard} ${isSelected ? styles.modeSelected : ''}`}
                onClick={() => setSelected(mode)}
                disabled={unavailable}
                aria-pressed={isSelected}
                title={`Select the ${info.label} mode`}
              >
                <div className={styles.modeHead}>
                  <span className={styles.modeName}>{info.label}</span>
                  {unavailable && <span className={styles.modeNa}>Desktop only</span>}
                </div>
                <div className={styles.modeProtects}>Protects: {info.protects}</div>
                <p className={styles.modeDesc}>{info.desc}</p>
              </button>
            )
          })}
        </div>

        {selected === 'none' && (
          <p className={styles.warning}>
            Your keys and data will not be encrypted on this device. Avoid storing
            real API keys you care about while in this mode.
          </p>
        )}

        <div className={styles.actions}>
          <button className={styles.primaryBtn} onClick={() => onChoose(selected)} title="Confirm the selected security mode and continue">
            {selected === 'none' ? 'Continue without a password' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  )
}
