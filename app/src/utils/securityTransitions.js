// Security-mode transitions (SPEC-031 § Mode selection and transitions, Phases
// 39d & 39f). Each transition moves secrets — and, for `app` mode, all app data
// — between the encrypted vault and the plaintext backends, then records the new
// mode. The Settings → Security tab drives these via a passphrase dialog that
// supplies whichever passphrases the transition needs.
//
// All transitions finish by reloading the page so App.jsx re-establishes the
// correct startup state (e.g. `app` mode shows the unlock gate on next launch).

import {
  snapshotMemory, dropMemoryBackend, isMemoryBackendActive,
} from './appStorage'
import { migrateLocalDataIntoVault, flushAppStore } from './appData'
import {
  openVault, deleteVaultFile, setSecurityMode, changePassphrase,
  vaultGet, vaultSet, vaultRemove, plainGet, plainSet, plainDelete,
  ALL_SECRET_KEYS,
} from './secrets'

const SNAPSHOT_KEY = 'appData/snapshot'
const SNAPSHOT_VERSION_KEY = 'appData/snapshotVersion'

// What a given transition asks the user for.
//   needCurrent — the source has a vault, so the current passphrase confirms identity.
//   needNew     — a new vault is created, so a new passphrase (+confirm) is set.
export function transitionRequirements(from, to) {
  if (from === to) return { needCurrent: true, needNew: true }   // change passphrase
  return {
    needCurrent: from === 'app' || from === 'keys',
    needNew: from === 'none' && (to === 'app' || to === 'keys'),
  }
}

// Move every API-key record from the plaintext backend into the open vault.
async function plaintextKeysToVault() {
  for (const key of ALL_SECRET_KEYS) {
    const v = plainGet(key)
    if (v) {
      await vaultSet(key, v)
      plainDelete(key)
    }
  }
}

// Move every API-key record from the open vault out to the plaintext backend.
async function vaultKeysToPlaintext() {
  for (const key of ALL_SECRET_KEYS) {
    const v = await vaultGet(key)
    if (v) plainSet(key, v)
  }
}

// Copy the in-memory (`app`-mode) store back to plaintext localStorage and stop
// using the in-memory backend. Used when leaving `app` mode.
function memoryToLocalStorage() {
  const data = snapshotMemory()
  dropMemoryBackend()                 // reads/writes now hit localStorage again
  for (const [k, v] of Object.entries(data)) localStorage.setItem(k, v)
}

// Remove the encrypted app-data snapshot from the vault (when leaving `app` mode
// but keeping the vault for `keys` mode).
async function dropVaultSnapshot() {
  await vaultRemove(SNAPSHOT_KEY)
  await vaultRemove(SNAPSHOT_VERSION_KEY)
}

// Perform one transition. `current`/`next` are passphrases (whichever the
// requirements call for). Throws on a wrong current passphrase (openVault fails)
// so the caller can surface it. Reloads the page on success.
export async function performTransition(from, to, { current, next } = {}) {
  if (from === to) {
    // Change passphrase. Flush first so the re-keyed vault carries current data.
    await flushAppStore()
    await changePassphrase(current, next)
    return reload()
  }

  switch (`${from}->${to}`) {
    case 'none->keys': {
      await openVault(next)             // create vault
      await plaintextKeysToVault()
      setSecurityMode('keys')
      break
    }
    case 'none->app': {
      await openVault(next)             // create vault
      await plaintextKeysToVault()
      await migrateLocalDataIntoVault() // migrate localStorage data → encrypted snapshot
      setSecurityMode('app')
      break
    }
    case 'keys->app': {
      await openVault(current)          // verify + open existing vault
      await migrateLocalDataIntoVault() // migrate localStorage data → encrypted snapshot
      setSecurityMode('app')
      break
    }
    case 'keys->none': {
      await openVault(current)          // verify + open to read keys
      await vaultKeysToPlaintext()
      setSecurityMode('none')
      await deleteVaultFile()
      break
    }
    case 'app->keys': {
      await openVault(current)          // verify identity (vault already open)
      await flushAppStore()
      memoryToLocalStorage()            // decrypt data back to plaintext
      await dropVaultSnapshot()         // keep keys, drop the data snapshot
      setSecurityMode('keys')
      break
    }
    case 'app->none': {
      await openVault(current)          // verify identity
      memoryToLocalStorage()            // decrypt data back to plaintext
      await vaultKeysToPlaintext()
      setSecurityMode('none')
      await deleteVaultFile()
      break
    }
    default:
      throw new Error(`Unsupported transition: ${from} → ${to}`)
  }
  reload()
}

function reload() {
  // Ensure no half-migrated in-memory backend lingers if we somehow continue.
  if (isMemoryBackendActive()) { try { dropMemoryBackend() } catch { /* noop */ } }
  window.location.reload()
}
