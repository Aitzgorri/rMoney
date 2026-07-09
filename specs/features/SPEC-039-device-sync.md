---
id: SPEC-039
name: Device Sync
status: draft
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

### Groundwork (data model)
- [ ] Every create/update in the data layer stamps `updatedAt` (ISO timestamp) on the record; existing records without `updatedAt` are treated as older than any stamped record.
- [ ] Deletions in synced collections write a tombstone `{ collection, id, deletedAt }` to a new `rmoney_deletions` log; tombstones are pruned after a retention window once synced.
- [ ] The last successfully synced snapshot is stored locally as the merge **base** (latest base only).
- [ ] The `rmoney_deletions` collection appears as a card in Settings → Storage (SPEC-026 convention) and is included in the SPEC-016 backup (format bump to `rmoney-data-v6`).

### Merge engine
- [ ] A pure module `mergeSnapshots(base, local, remote)` returns the merged snapshot plus a structured change/conflict log; it performs no I/O.
- [ ] Records added on either side are all present after merge (union by id).
- [ ] A record edited on both sides resolves to the newer `updatedAt`; the losing version is recorded in the change log.
- [ ] A record deleted on one side and untouched on the other stays deleted (tombstone honoured); deleted on one side and *edited* on the other resolves by newest timestamp.
- [ ] The engine has an exhaustive unit-test suite (both-added, edit-vs-edit, edit-vs-delete, resurrection, empty/first-sync, per-collection shapes) — written before the engine is wired to transport.

### Transport + UX
- [ ] Settings → Sync card: WebDAV URL, username, password. The password is stored per SPEC-031 (Stronghold record, `webdavSet: bool` flag, masked UI); the host is added to the CSP the same way as the user-configured AI host.
- [ ] Sync cycle: pull remote file → three-way merge → write merged result back with an ETag/`If-Match` precondition (retry on precondition failure) → update local base. A missing remote file (first sync) uploads the local snapshot.
- [ ] After every data mutation a debounced push is attempted; an unreachable NAS leaves a persistent dirty flag and the app retries on next mutation, app focus, and manual "Sync now". No error dialogs for routine unreachability.
- [ ] A status indicator shows: last successful sync time, "pending changes" when dirty, and "unreachable" state; a manual **Sync now** action exists.
- [ ] Sync works from both the Tauri desktop build and the Android build against a Synology WebDAV share over HTTPS.
- [ ] Setup documentation (README or in-app help): dedicated single-folder Synology user, WebDAV package, Let's Encrypt certificate, optional Tailscale for away-from-home syncing.

## UI / Screens
- Settings → new **Sync** section: URL/user/password fields (password masked per SPEC-031), Test connection button, Sync now button, last-sync status line.
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
