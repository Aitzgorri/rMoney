---
id: SPEC-038
name: Untracked Accounts
status: done
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
- [x] Account model gains `countedInEnvelopes: bool` — default **true**, absent = true, so existing data is untouched (additive; no backup-format bump). Editable on the account form ("Counted in envelopes" checkbox with an explanatory tooltip); `isAccountTracked(account)` is the shared helper.
- [x] Transfer tracked→untracked: the transfer form shows a **"Counts as expense from envelope"** picker (Favorites group + full indented tree; empty = the default expense envelope) with a helper line naming the untracked account; the note auto-fills "Transfer from {source account} to {destination account}" when left empty.
- [x] Transfer untracked→tracked: recorded as envelope **income** into a user-chosen envelope (default: Undistributed income; same auto-note pattern).
- [x] Transfers tracked↔tracked or untracked↔untracked: no envelope effect; the envelope picker is hidden and any stale `envelopeId`/`envelopeFlow` is stripped on save.
- [x] Boundary postings are stored ON the transfer transaction (`envelopeFlow: 'expense' | 'income'` + `envelopeId`) — the direction is captured at write time, so toggling an account's flag later never rewrites history. They count in `getEnvelopeBalance` (expense = `sourceAmount` out, income = `destinationAmount` in), in `getEnvelopesTotalByCurrency` (per the tracked side's currency), and render in the envelope history (⇄ icon, "→ to account X" / "← from account X", running balance included; click opens the transfer for editing).
- [x] The Undistributed-income starting-balance seed excludes untracked accounts' starting balances (both in `getEnvelopeBalance` and the per-currency totals).
- [x] Existing historical transfers are left alone — the feature applies from when the flag is set (optional later enhancement: a review screen to backfill selected past transfers).
- [x] **Unallocated reconciliation figure** (`getUnallocatedByCurrency`): tracked-account current balances minus envelope totals, per currency; **placement: the Envelopes page grand-total area**, shown only when some currency is non-zero (a healthy setup stays uncluttered), with a tooltip explaining what a non-zero value means. Unit-tested: the identity holds (0) when boundary crossings are recorded and reveals legacy unrecorded ones.

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
- ~~Data shape for the envelope posting~~ → decided: fields on the transfer transaction (`envelopeFlow` + `envelopeId`), direction captured at write time.
- ~~Where the unallocated figure lives~~ → decided: Envelopes page grand-total area, shown only when non-zero.
- **Income/expense transactions ON an untracked account** currently still post to envelopes (only *transfers* were in scope per the notes). This drifts the unallocated figure when an untracked account has direct income/expenses. If that bites in practice, a follow-up could exclude untracked accounts' transactions from envelope math — a behaviour change needing its own decision.
