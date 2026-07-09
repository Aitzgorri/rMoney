---
id: SPEC-038
name: Untracked Accounts
status: draft
created: 2026-07-09
---

# Untracked Accounts (envelope scope)

## Goal
Let the user choose which accounts count toward envelope budgeting (the classic "off-budget" concept). Money moving between the tracked world and an untracked account is real spending/income from the envelopes' perspective and must be visible there — today account-to-account transfers never touch envelopes at all, so such moves silently distort envelope truth.

From the 08 Jul 2026 notes (`scratch_notes/notes_8.md` #18–21); planned as **Phase 56** in the implementation plan.

## User Stories
- As a user, I can mark an account (e.g. a long-term savings or investment funding account) as not counted in envelopes, so my envelope totals reflect only the money envelopes are supposed to govern.
- As a user, when I transfer money from a tracked account to an untracked one, I choose which envelope shows it as an expense — because that money left my budgeted world.
- As a user, when money arrives from an untracked account into a tracked one, I choose which envelope receives it as income.
- As a user, I can see at a glance how much tracked money is not yet allocated to any envelope.

## Acceptance Criteria
- [ ] Account model gains `countedInEnvelopes: bool` — default **true**, absent = true, so existing data is untouched (additive; no backup-format bump). Editable on the account form.
- [ ] Transfer tracked→untracked: the transfer form asks which envelope records it as an **expense**, with an auto-generated note "Transfer from {source account} to {destination account}".
- [ ] Transfer untracked→tracked: recorded as envelope **income** into a user-chosen envelope (same auto-note pattern).
- [ ] Transfers tracked↔tracked or untracked↔untracked: no envelope effect; the envelope picker is hidden.
- [ ] These boundary postings count in `getEnvelopeBalance` / envelope history.
- [ ] The Undistributed-income starting-balance seed excludes untracked accounts' starting balances.
- [ ] Existing historical transfers are left alone — the feature applies from when the flag is set (optional later enhancement: a review screen to backfill selected past transfers).
- [ ] **Unallocated reconciliation figure:** tracked-accounts total minus total envelope balances, per currency, 0 when every tracked unit is enveloped; placement decided during build (Envelopes header and/or Dashboard).

## UI / Screens
- Account form: a "Counted in envelopes" toggle (with an explanation line).
- Transfer form (SPEC-005): a conditional envelope picker + read-only auto-note preview, shown only when the transfer crosses the tracked/untracked boundary.
- Envelopes page and/or Dashboard: the unallocated figure.

## Data
- `countedInEnvelopes` on accounts (additive field, default true).
- Boundary transfers carry an `envelopeId` (+ direction) for the envelope posting — exact shape decided during build (field on the transfer transaction vs a linked envelope-flow record).

## Out of Scope
- Retroactive re-posting of historical transfers (see the optional enhancement above).
- Per-envelope account restrictions or multi-envelope splits of one transfer.

## Open Questions
- Data shape for the envelope posting on a boundary transfer (field on the transaction vs separate linked record) — decide when Phase 56 starts.
- Where the unallocated figure lives (Envelopes header, Dashboard, or both).
