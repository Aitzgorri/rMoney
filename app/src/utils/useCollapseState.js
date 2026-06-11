import { useState, useCallback } from 'react'
import appStorage from './appStorage'

// A persisted Set of ids for tree collapse/expand state (Phase 45). The
// semantics are the caller's choice: the Envelopes tree stores the *collapsed*
// ids (default = everything expanded), while the Planning expense tree stores
// the *expanded* ids (default = everything collapsed). Either way the set is
// persisted to localStorage so the layout is restored when the user returns.
//
// Returns { has, toggle, setAll, clear }.
export function useCollapseState(storageKey) {
  const [ids, setIds] = useState(() => {
    try {
      const arr = JSON.parse(appStorage.getItem(storageKey) ?? '[]')
      return new Set(Array.isArray(arr) ? arr : [])
    } catch {
      return new Set()
    }
  })

  const persist = useCallback((next) => {
    try { appStorage.setItem(storageKey, JSON.stringify([...next])) } catch { /* ignore */ }
    return next
  }, [storageKey])

  const toggle = useCallback((id) => {
    setIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return persist(next)
    })
  }, [persist])

  const setAll = useCallback((arr) => setIds(persist(new Set(arr))), [persist])
  const clear  = useCallback(() => setIds(persist(new Set())), [persist])

  return { has: (id) => ids.has(id), toggle, setAll, clear }
}
