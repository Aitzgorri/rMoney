---
id: SPEC-039
name: Device Sync
status: in-progress
created: 2026-07-09
---

# Device Sync (via NAS / WebDAV)

## Goal
Keep rMoney data in sync between the desktop app (Windows/Tauri) and the mobile app (Android/Capacitor) without any cloud service, using a user-owned Synology NAS (or any WebDAV server) as the meeting point. The primary flow: expenses are captured on the phone on the go and appear on the desktop at home — and vice versa — with **no data loss when devices diverge offline**.

Design agreed 2026-07-09. Local-first: both devices remain fully functional with no connectivity; sync is opportunistic ("try, tolerate failure, retry later").

## Context / decisions (locked 2026-07-09)
- **Use case:** phone captures transactions on the go; desktop mostly on the home LAN. Occasionally the desktop travels while the NAS stays home — so *both* devices can accumulate changes offline for days. This rules out snapshot last-writer-wins (it would lose one side) and requires **record-level merging**.
- **Transport = WebDAV** (Synology WebDAV Server package) over HTTPS, against a dedicated Synology user with access to a single app-specific shared folder only. No new server components; any WebDAV server works.
- **Merge = three-way, client-side, pure function** `(base, local, remote) → merged`: additions union by id; same-record edits resolve silently by newest `updatedAt` (logged, no prompt — single user); deletions via tombstones so deleted records cannot resurrect; edit-vs-delete resolves by newest timestamp.
- **Payload reuses the SPEC-016 backup format** (redaction rules included — secrets never sync). Starts as plain JSON in the access-restricted NAS folder; payload passphrase-encryption is a follow-up, not a blocker.
- **Push semantics:** after every data mutation, a debounced best-effort push ("try"); failures are silent — the dirty flag persists and sync retries on next mutation / app focus / manual "Sync now". Either device may be fully offline at any time.
- **Depends on the test foundation** (SPEC-040 Phase-57 infrastructure): the merge engine is developed test-first.

## User Stories
- As a user, I enter an expense on my phone during the day and see it on my desktop when I'm back home, without exporting/importing anything by hand.
- As a user, I can enter data on my phone and my traveling laptop for a week with no NAS access, and when I get home both sets of entries survive the sync.
- As a user, I configure sync once (URL + dedicated NAS credentials) and then forget about it; a small indicator tells me when the last successful sync happened and whether changes are pending.
- As a user, I never lose a deletion or see a deleted record come back after syncing.

## Acceptance Criteria

### Groundwork (data model) *(Phase 58 ✓ 2026-07-09)*
- [x] Every create/update in the data layer stamps `updatedAt` (ISO timestamp) on the record; existing records without `updatedAt` are treated as older than any stamped record. *(Swept across all 23 data modules covering the backup collections; boot-repair migrations deliberately do NOT stamp — they are not user edits; boot seeds and the recurring engines DO, since they persist genuinely new records.)*
- [x] Deletions in synced collections write a tombstone `{ collection, id, deletedAt }` to a new `rmoney_deletions` log (`data/syncMeta.js` `recordDeletion` — ~54 call sites incl. every cascade: envelope descendants, bill occurrences, watchlist entries+alerts, portfolio assignments, linked cash movements…); `pruneDeletions(retentionDays = 180)` exists and is called by the sync cycle after a successful sync (wired in Phase 59). **Id-less collections** (stock/crypto profiles keyed by ticker, manual prices, dismissed splits) get no per-record tombstones — by design, the merge engine handles those lists as blobs, where the three-way base comparison propagates deletions.
- [x] The last successfully synced snapshot is stored locally as the merge **base** (latest base only — `rmoney_sync_base`), alongside device-local sync metadata (`rmoney_sync_meta`: stable device id, last-sync time, dirty flag). Neither is in the backup — each device keeps its own.
- [x] The `rmoney_deletions` collection appears as a card in Settings → Storage ("Sync deletion log" — no manual delete, deliberately: clearing it could resurrect records on other devices) and is included in the SPEC-016 backup (**format bumped to `rmoney-data-v6`**, both modes; loader defaults absence).

### Merge engine *(Phase 58d ✓ 2026-07-09 — `utils/mergeSnapshots.js`)*
- [x] A pure module `mergeSnapshots(base, local, remote)` returns the merged snapshot plus a structured change/conflict log; it performs no I/O and no clock reads.
- [x] Records added on either side are all present after merge (union by id).
- [x] A record edited on both sides resolves to the newer `updatedAt` (fallback `createdAt`, fallback oldest); the losing version is recorded in the change log (`kept-local` / `kept-remote`).
- [x] A record deleted on one side and untouched on the other stays deleted (tombstone honoured, and the tombstone itself survives the merge for other devices); deleted on one side and *edited* on the other resolves by newest timestamp (`kept-edit-over-delete` / `deleted` logged).
- [x] Blob fields (the settings object, id-less lists, unknown shapes) merge three-way at the field level: the side that changed vs the base wins; both changed → local wins, logged. Tombstone logs from both sides union with the newest `deletedAt` per record.
- [x] The engine has an exhaustive unit-test suite (both-added, edit-vs-edit incl. single-side-silent, legacy-unstamped-vs-stamped, edit-vs-delete both directions, resurrection, empty/first-sync, missing-field, blob conflicts, deletions-log union) — written before any transport exists.

### Transport + UX *(Phase 59 — code + docs ✓ 2026-07-09; real-device verification pending)*
- [x] Settings → **Sync** tab → **Device sync** card *(moved out of General into a dedicated **Sync** tab per the 10 Jul 2026 notes — Phase 61c; matches the UI sketch below)*: WebDAV folder URL + username (non-secret, in the settings blob — they sync, which is desirable), password stored via the mode-aware secrets backend under **`sync/webdav/password`** (added to `ALL_SECRET_KEYS` so passphrase re-keying and mode transitions carry it), `webdavPasswordSet` flag, password field masked with a Set/Change flow that never displays the stored value; enable toggle; **Test connection** (HEAD — 200/404 prove reachability+auth, 401/403 report credentials). **CSP deviation documented:** the NAS host is user-configured and cannot be listed in the static CSP, so Tauri uses the native `plugin-http` (its capability scope widened to `https://**` — recorded in `capabilities/http.json`; the webview CSP stays strict); Android uses CapacitorHttp's native interception; a plain browser cannot sync (no CORS on WebDAV) — documented.
- [x] Sync cycle (`utils/sync.js`): GET remote → `mergeSnapshots(base, local, remote)` → apply merged locally (`importAppData`, write-listener suppressed) → PUT with `If-Match: <etag>` (up to 3 re-pull-re-merge retries on 412) → store base, clear dirty, `pruneDeletions(180d)`. Missing remote (404) → first-sync upload with `If-None-Match: *`. The local payload is the **redacted sharable export** — keys can never sync. Unit-tested with an injected transport (first sync, normal merge cycle, 412 retry, unreachable, 401, unconfigured no-op; asserts SPEC-031 URL-free errors).
- [x] After every data mutation a debounced (3 s) push is attempted — a global `appStorage` write listener marks the device dirty for exactly the synced collections; unreachability is silent (status only), the dirty flag persists, and retries fire on the next mutation, window focus, app open, and manual "Sync now".
- [x] A **global corner indicator** (`SyncStatusDot`, hidden until configured) shows ✓ synced / ● pending / ↻ syncing / ⚠ trouble with a state-aware tooltip incl. last-sync time; clicking syncs now. The Settings card shows the full status line. After a sync applies remote changes, the active screen remounts so it re-reads storage.
- [ ] **Real-device verification:** sync works from both the Tauri desktop build and the Android build against a Synology WebDAV share over HTTPS (first sync from A → B pulls; offline divergence merges; deletion propagates; 412 path exercised by syncing from both at once). *(Cannot be verified in this environment — the transport was verified against an injected fake only. Run this smoke test on the real NAS before relying on sync.)*
- [x] Setup documentation: README → "Device sync (Synology NAS / WebDAV)" — dedicated single-folder user, WebDAV package + HTTPS, Let's Encrypt certificate, Tailscale for away-from-home, behaviour summary, browser limitation.

## UI / Screens
- Settings → dedicated **Sync** tab *(built in Phase 61c)*: URL/user/password fields (password masked per SPEC-031), Test connection button, Sync now button, last-sync status line. Future sync surfaces (e.g. the change/conflict log) belong on this tab too.
- Global status: a small indicator with tooltip — synced ✓ / pending ● / unreachable ⚠.

## Data
- New: `rmoney_deletions` (tombstones), local base snapshot, sync metadata (last sync time, dirty flag, device id).
- Changed: all synced collections gain `updatedAt` on write (additive).
- Remote: one JSON file (SPEC-016 payload + header `{ formatVersion, lastModified, deviceId }`) in the dedicated NAS folder.
- Backup format: bump to `rmoney-data-v6` (tombstones + sync metadata included; loader tolerates absence).

## Out of Scope
- Multi-user or shared budgets (single user, multiple devices only).
- Real-time sync, push notifications, or server-side merging (the NAS stays a dumb file store; CouchDB/PouchDB explicitly rejected for now).
- Syncing secrets/API keys (SPEC-031 forbids it; the payload uses the redacted shape).
- Automatic NAS discovery; VPN/Tailscale setup is documentation, not code.
- Payload encryption at rest on the NAS (follow-up enhancement; the folder is access-restricted).

## Open Questions
- Where the change/conflict log is surfaced (Settings-only view vs a dismissible notice after a merge that resolved conflicts).
- Tombstone retention window length (proposal: 180 days).
- Whether the sync file should be split per-collection later if the single-file payload grows too large for mobile connections.
