import { useState } from 'react'
import {
  getWatchlists, createWatchlist, updateWatchlist, deleteWatchlist,
} from '../data/watchlists'
import WatchlistDetail from './WatchlistDetail'
import styles from './Watchlists.module.css'

export default function Watchlists({ onNavigate }) {
  const [lists,        setLists]        = useState(() => getWatchlists())
  const [selected,     setSelected]     = useState(null)  // watchlist id
  const [newName,      setNewName]      = useState('')
  const [creating,     setCreating]     = useState(false)
  const [renamingId,   setRenamingId]   = useState(null)
  const [renameVal,    setRenameVal]    = useState('')
  const [deletingId,   setDeletingId]   = useState(null)

  function refresh() { setLists(getWatchlists()) }

  function handleCreate() {
    if (!newName.trim()) return
    const list = createWatchlist(newName.trim())
    refresh()
    setNewName('')
    setCreating(false)
    setSelected(list.id)
  }

  function startRename(list) {
    setRenamingId(list.id)
    setRenameVal(list.name)
  }

  function saveRename() {
    if (renameVal.trim()) {
      updateWatchlist(renamingId, { name: renameVal.trim() })
      refresh()
    }
    setRenamingId(null)
  }

  function handleDelete(id) {
    deleteWatchlist(id)
    // If last list deleted, auto-create default
    const remaining = getWatchlists()
    if (remaining.length === 0) {
      createWatchlist('My watchlist')
    }
    if (selected === id) setSelected(null)
    refresh()
    setDeletingId(null)
  }

  if (selected) {
    const list = lists.find(l => l.id === selected)
    if (list) {
      return (
        <WatchlistDetail
          watchlist={list}
          onBack={() => { setSelected(null); refresh() }}
          onNavigate={onNavigate}
        />
      )
    }
  }

  return (
    <div className={styles.screen}>
      <div className={styles.header}>
        <h1 className={styles.title}>Watchlists</h1>
        <button className={styles.newBtn} onClick={() => setCreating(true)}>+ New list</button>
      </div>

      {creating && (
        <div className={styles.createRow}>
          <input
            className={styles.nameInput}
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') { setCreating(false); setNewName('') } }}
            placeholder="List name…"
            autoFocus
          />
          <button className={styles.saveBtn} onClick={handleCreate} disabled={!newName.trim()}>Save</button>
          <button className={styles.cancelBtn} onClick={() => { setCreating(false); setNewName('') }}>Cancel</button>
        </div>
      )}

      <div className={styles.listGrid}>
        {lists.length === 0 ? (
          <p className={styles.empty}>No watchlists yet. Create one above.</p>
        ) : (
          lists.map(list => (
            <div key={list.id} className={styles.listCard}>
              {renamingId === list.id ? (
                <div className={styles.renameRow}>
                  <input
                    className={styles.nameInput}
                    value={renameVal}
                    onChange={e => setRenameVal(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveRename(); if (e.key === 'Escape') setRenamingId(null) }}
                    autoFocus
                  />
                  <button className={styles.saveBtn} onClick={saveRename}>Save</button>
                  <button className={styles.cancelBtn} onClick={() => setRenamingId(null)}>Cancel</button>
                </div>
              ) : deletingId === list.id ? (
                <div className={styles.deleteConfirm}>
                  <span className={styles.deleteMsg}>Delete "{list.name}"?</span>
                  <button className={styles.cancelBtn} onClick={() => setDeletingId(null)}>Cancel</button>
                  <button className={styles.deleteBtn} onClick={() => handleDelete(list.id)}>Delete</button>
                </div>
              ) : (
                <>
                  <button className={styles.listName} onClick={() => setSelected(list.id)}>
                    {list.name}
                  </button>
                  <div className={styles.listActions}>
                    <button className={styles.actionBtn} onClick={() => startRename(list)}>Rename</button>
                    <button className={styles.actionBtnDanger} onClick={() => setDeletingId(list.id)}>Delete</button>
                  </div>
                </>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
