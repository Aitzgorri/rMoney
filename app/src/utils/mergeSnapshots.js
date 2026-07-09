// Three-way snapshot merge (SPEC-039, Phase 58d) — the heart of device sync.
// Pure: no I/O, no clock; everything it needs is in its arguments.
//
// Snapshots are SPEC-016 backup payloads ({ version, exportedAt, accounts: [],
// transactions: [], settings: {}, deletions: [], … }). Field handling:
//   • lists whose records all carry an `id` → per-record three-way merge:
//       – records added on either side are all kept (union by id)
//       – the same record on both sides resolves to the newest timestamp
//         (`updatedAt`, falling back to `createdAt`, falling back to "oldest")
//       – tombstones (the merged `deletions` log) drop a record unless it was
//         edited AFTER the deletion — newest timestamp wins either way
//   • everything else (settings blob, id-less lists, unknown shapes) → blob
//     merge: the side that changed vs the base wins; both changed → local
//     wins and the conflict is logged
//
// Returns { merged, changes } where `changes` is a structured log of every
// non-trivial resolution (kept-local / kept-remote / deleted / kept-edit-over-delete).
import { KEYS } from '../data/portability'

const META_FIELDS = new Set(['version', 'exportedAt', '_redacted', '_strongholdVault', 'deletions'])

// storage key ('rmoney_transactions') → backup field name ('transactions')
const FIELD_BY_STORAGE_KEY = Object.fromEntries(Object.entries(KEYS).map(([field, key]) => [key, field]))

const ts = r => r?.updatedAt ?? r?.createdAt ?? ''
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

function isIdList(...values) {
  const lists = values.filter(v => v !== undefined)
  if (lists.length === 0 || !lists.every(Array.isArray)) return false
  return lists.every(list => list.every(r => r && typeof r === 'object' && r.id != null))
}

// Union of both tombstone logs, newest deletedAt per (collection, id).
function mergeDeletions(a = [], b = []) {
  const byKey = new Map()
  for (const d of [...a, ...b]) {
    const k = `${d.collection}__${d.id}`
    const prev = byKey.get(k)
    if (!prev || d.deletedAt > prev.deletedAt) byKey.set(k, d)
  }
  return [...byKey.values()].sort((x, y) => x.deletedAt.localeCompare(y.deletedAt))
}

function mergeList(field, base = [], local = [], remote = [], tombstones, changes) {
  const baseById   = new Map(base.map(r => [r.id, r]))
  const localById  = new Map(local.map(r => [r.id, r]))
  const remoteById = new Map(remote.map(r => [r.id, r]))
  const ids = [...new Set([...localById.keys(), ...remoteById.keys()])]

  const tombFor = id => tombstones.get(`${field}__${id}`)

  const out = []
  for (const id of ids) {
    const b = baseById.get(id)
    const l = localById.get(id)
    const r = remoteById.get(id)

    // Pick the surviving candidate between the two sides.
    let candidate, origin
    if (l && r) {
      if (same(l, r)) { candidate = l; origin = 'both' }
      else {
        const localWins = ts(l) >= ts(r)
        candidate = localWins ? l : r
        origin = localWins ? 'local' : 'remote'
        // Log only real divergence (both changed vs base, or both added differently).
        if (!b || (!same(l, b) && !same(r, b))) {
          changes.push({ field, id, action: localWins ? 'kept-local' : 'kept-remote' })
        }
      }
    } else {
      candidate = l ?? r
      origin = l ? 'local-only' : 'remote-only'
    }

    // Tombstone check: a deletion drops the record unless it was edited after.
    const tomb = tombFor(id)
    if (tomb) {
      if (ts(candidate) > tomb.deletedAt) {
        changes.push({ field, id, action: 'kept-edit-over-delete' })
        out.push(candidate)
      } else {
        if (origin !== 'both' || b === undefined || !same(candidate, b)) {
          changes.push({ field, id, action: 'deleted' })
        }
      }
      continue
    }
    out.push(candidate)
  }
  return out
}

function mergeBlob(field, base, local, remote, changes) {
  if (same(local, remote)) return local
  if (base !== undefined && same(local, base)) return remote   // only remote changed
  if (base !== undefined && same(remote, base)) return local   // only local changed
  changes.push({ field, action: 'kept-local' })                // both changed → local wins
  return local
}

export function mergeSnapshots(base, local, remote) {
  base   = base   ?? {}
  local  = local  ?? {}
  remote = remote ?? {}
  const changes = []

  // Tombstones first — the merged log drives record deletion below. Keys are
  // stored as storage keys ('rmoney_transactions'); map them to backup fields.
  const deletions = mergeDeletions(local.deletions, remote.deletions)
  const tombstones = new Map(deletions.map(d =>
    [`${FIELD_BY_STORAGE_KEY[d.collection] ?? d.collection}__${d.id}`, d]))

  const fields = new Set([
    ...Object.keys(local), ...Object.keys(remote),
  ].filter(f => !META_FIELDS.has(f)))

  const merged = {
    version: local.version ?? remote.version,
    exportedAt: local.exportedAt ?? remote.exportedAt,
    deletions,
  }

  for (const field of fields) {
    const b = base[field]
    const l = local[field]
    const r = remote[field]
    merged[field] = isIdList(b, l, r)
      ? mergeList(field, b, l ?? [], r ?? [], tombstones, changes)
      : mergeBlob(field, b, l, r, changes)
  }

  return { merged, changes }
}
