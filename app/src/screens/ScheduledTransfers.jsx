import { useState } from 'react'
import {
  getScheduledTransfers,
  getActiveEnvelopes,
  getEnvelopesFlat,
  deleteScheduledTransfer,
  nextScheduledOccurrenceInfo,
} from '../data/envelopes'
import { getPlannedExpenses, updatePlannedExpense } from '../data/planning'
import EnvelopeTransferForm from '../components/EnvelopeTransferForm'
import TransferOccurrenceDialog from '../components/TransferOccurrenceDialog'
import InlineFormRow from '../components/InlineFormRow'
import { useMediaQuery, DESKTOP } from '../utils/mediaQuery'
import { formatDate } from '../utils/dates'
import { FREQUENCY_LABELS, dayLabel } from '../utils/frequency'
import { INDENT } from '../utils/hierarchy'
import styles from './ScheduledTransfers.module.css'
import { fmtAmt } from '../utils/format'

const SORT_OPTIONS = [
  { value: 'nextDate', label: 'Next date' },
  { value: 'amount',   label: 'Amount' },
  { value: 'source',   label: 'Source envelope' },
]

export default function ScheduledTransfers({ onBack }) {
  const isDesktop = useMediaQuery(DESKTOP)
  const [sort, setSort] = useState('nextDate')
  const [filterFrom, setFilterFrom] = useState('')        // '' | fromEnvelopeId (Phase 50e)
  const [filterTo, setFilterTo] = useState('')            // '' | toEnvelopeId (Phase 50e)
  const [editTransfer, setEditTransfer] = useState(null)  // null | 'new' | transfer object
  const [deleteTarget, setDeleteTarget] = useState(null)  // null | transfer object
  const [inlineOpen, setInlineOpen] = useState(false)
  const [occurrenceTarget, setOccurrenceTarget] = useState(null)  // null | enriched transfer (Phase 64b)
  const [, bumpTick] = useState(0)  // re-read after an occurrence override is saved

  // Always read fresh from storage
  const transfers = getScheduledTransfers()
  const envelopesFlat = getEnvelopesFlat(getActiveEnvelopes())
  const plannedExpenses = getPlannedExpenses()

  // Map envelopeId → name for quick lookups
  const envelopeMap = Object.fromEntries(envelopesFlat.map(e => [e.id, e]))

  // Build a lookup: scheduledTransferId → planned expense item.
  // (Planned incomes are scratchpad-only and do not generate scheduled transfers — SPEC-009.)
  const planLinkMap = {}
  for (const exp of plannedExpenses) {
    if (exp.linkedScheduledTransferId) planLinkMap[exp.linkedScheduledTransferId] = { type: 'expense', item: exp }
  }

  // Enrich each transfer with derived fields. `nextInfo` is override-aware
  // (Phase 64b): a moved/adjusted next occurrence shows its effective date and
  // amount, a skipped one is passed over — matching what the engine will fire.
  const enriched = transfers.map(t => {
    const nextInfo = nextScheduledOccurrenceInfo(t)
    return {
      ...t,
      fromName: envelopeMap[t.fromEnvelopeId]?.name ?? '(unknown)',
      toName:   envelopeMap[t.toEnvelopeId]?.name   ?? '(unknown)',
      nextInfo,
      nextDate: nextInfo?.date ?? '9999-12-31',
      planLink: planLinkMap[t.id] ?? null,
    }
  })

  // Filter by source / destination envelope (Phase 50e)
  const filtered = enriched.filter(t =>
    (!filterFrom || t.fromEnvelopeId === filterFrom) &&
    (!filterTo   || t.toEnvelopeId   === filterTo)
  )

  // Sort
  const sorted = [...filtered].sort((a, b) => {
    if (sort === 'amount')   return b.amount - a.amount
    if (sort === 'source')   return a.fromName.localeCompare(b.fromName)
    return a.nextDate.localeCompare(b.nextDate)  // nextDate (default)
  })

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleSave() {
    setEditTransfer(null)
  }

  function handleDeleteRequest(transfer) {
    setDeleteTarget(transfer)
  }

  function confirmDelete() {
    if (!deleteTarget) return
    // If linked to a planning expense, clear the link before deleting the transfer.
    const link = planLinkMap[deleteTarget.id]
    if (link) {
      updatePlannedExpense(link.item.id, { linkedScheduledTransferId: null })
    }
    deleteScheduledTransfer(deleteTarget.id)
    setDeleteTarget(null)
    setEditTransfer(null)
  }

  // ── Edit / new view ────────────────────────────────────────────────────────

  if (editTransfer !== null) {
    const isNew = editTransfer === 'new'
    const initial = isNew ? null : editTransfer
    const planLink = isNew ? null : planLinkMap[editTransfer.id]

    return (
      <div className={styles.screen}>
        {planLink && (
          <div className={styles.planBanner}>
            Linked to planning item: <strong>{planLink.item.name}</strong>
          </div>
        )}
        <EnvelopeTransferForm
          initial={initial}
          defaultMode="regular"
          onSave={handleSave}
          onCancel={() => setEditTransfer(null)}
          onDelete={initial ? () => handleDeleteRequest(initial) : undefined}
        />
        {deleteTarget && (
          <div className={styles.dialogBackdrop}>
            <div className={styles.dialog}>
              <h3 className={styles.dialogTitle}>Delete this scheduled transfer?</h3>
              {planLinkMap[deleteTarget.id] && (
                <p className={styles.dialogText}>
                  This transfer was generated by the planning item <strong>{planLinkMap[deleteTarget.id].item.name}</strong>.
                  Deleting it will detach it from the plan — the planning item will show as "not yet applied".
                </p>
              )}
              <p className={styles.dialogWarning}>This cannot be undone.</p>
              <div className={styles.dialogActions}>
                <button className={styles.cancelBtn} onClick={() => setDeleteTarget(null)} title="Cancel — keep the scheduled transfer">Cancel</button>
                <button className={styles.deleteBtn} onClick={confirmDelete} title="Confirm deletion — this cannot be undone">Delete</button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── List view ──────────────────────────────────────────────────────────────

  return (
    <div className={styles.screen}>
      <div className={styles.header}>
        <button className={styles.backBtn} onClick={onBack} title="Back to the previous screen">←</button>
        <h1 className={styles.title}>Scheduled transfers</h1>
        <button className={styles.newBtn} onClick={() => isDesktop ? setInlineOpen(true) : setEditTransfer('new')} title="Create a new scheduled transfer">+ New</button>
      </div>

      <div className={styles.toolbar}>
        <span className={styles.sortLabel}>Sort:</span>
        {SORT_OPTIONS.map(opt => (
          <button
            key={opt.value}
            className={`${styles.sortBtn} ${sort === opt.value ? styles.sortActive : ''}`}
            onClick={() => setSort(opt.value)}
            title={`Sort the list by ${opt.label.toLowerCase()}`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* From / To envelope filters (Phase 50e) */}
      <div className={styles.filterRow}>
        <select className={styles.filterSelect} value={filterFrom} onChange={e => setFilterFrom(e.target.value)}>
          <option value="">From: all source envelopes</option>
          {envelopesFlat.map(e => (
            <option key={e.id} value={e.id}>{INDENT.repeat(e.depth)}{e.name}</option>
          ))}
        </select>
        <select className={styles.filterSelect} value={filterTo} onChange={e => setFilterTo(e.target.value)}>
          <option value="">To: all destination envelopes</option>
          {envelopesFlat.map(e => (
            <option key={e.id} value={e.id}>{INDENT.repeat(e.depth)}{e.name}</option>
          ))}
        </select>
        {(filterFrom || filterTo) && (
          <button className={styles.filterClear} onClick={() => { setFilterFrom(''); setFilterTo('') }} title="Clear the envelope filters">Clear</button>
        )}
      </div>

      {isDesktop && (
        <InlineFormRow label="Add scheduled transfer" open={inlineOpen} onOpenChange={setInlineOpen}>
          {onCollapse => (
            <EnvelopeTransferForm
              inline
              defaultMode="regular"
              onSave={onCollapse}
              onCancel={onCollapse}
            />
          )}
        </InlineFormRow>
      )}

      {sorted.length === 0 ? (
        <p className={styles.empty}>
          {filterFrom || filterTo
            ? 'No scheduled transfers match the selected envelope filter.'
            : 'No scheduled transfers yet. Create one from here or from the Planning screen.'}
        </p>
      ) : (
        <div className={styles.list}>
          <div className={styles.listHeader}>
            <span className={styles.colRoute}>Route</span>
            <span className={styles.colAmount}>Amount</span>
            <span className={styles.colFreq}>Freq</span>
            <span className={styles.colDay}>Day</span>
            <span className={styles.colSrc}>Src</span>
          </div>
          {sorted.map(t => (
            <div key={t.id} className={styles.rowWrap}>
              <button className={styles.row} onClick={() => setEditTransfer(t)} title="Edit this scheduled transfer">
                <span className={styles.colRoute}>
                  <span className={styles.routeText}>
                    {t.fromName} → {t.toName}
                  </span>
                  <span className={styles.nextDate}>
                    next: {formatDate(t.nextDate)}
                    {t.nextInfo?.overridden && (
                      <span className={styles.overriddenTag}
                        title={`Next occurrence adjusted one-time: ${formatDate(t.nextInfo.date)} · ${fmtAmt(t.nextInfo.amount)} (the series keeps its schedule)`}>
                        {' '}↻ {fmtAmt(t.nextInfo.amount)}
                      </span>
                    )}
                  </span>
                </span>
                <span className={styles.colAmount}>{fmtAmt(t.amount)}</span>
                <span className={styles.colFreq}>{FREQUENCY_LABELS[t.frequency] ?? t.frequency ?? '—'}</span>
                <span className={styles.colDay}>{t.dayOfExecution != null ? dayLabel(t.frequency, t.dayOfExecution) || '—' : '—'}</span>
                <span className={`${styles.colSrc} ${t.planLink ? styles.srcPlan : styles.srcManual}`}>
                  {t.planLink ? 'plan' : 'man.'}
                </span>
              </button>
              {t.nextInfo && (
                <button className={styles.occBtn} onClick={() => setOccurrenceTarget(t)}
                  title="Adjust or skip the next occurrence only (one-time — the series keeps its schedule)">
                  ↻
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {occurrenceTarget && (
        <TransferOccurrenceDialog
          rule={occurrenceTarget}
          occurrence={occurrenceTarget.nextInfo}
          routeLabel={`${occurrenceTarget.fromName} → ${occurrenceTarget.toName}`}
          onEditSeries={() => { setEditTransfer(occurrenceTarget); setOccurrenceTarget(null) }}
          onClose={() => setOccurrenceTarget(null)}
          onSaved={() => { setOccurrenceTarget(null); bumpTick(n => n + 1) }}
        />
      )}
    </div>
  )
}
