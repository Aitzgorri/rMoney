import { describe, it, expect, afterEach } from 'vitest'
import { getEnvelopeBalance, getEnvelopesTotalByCurrency, getUnallocatedByCurrency } from './envelopes'
import { createAccount, isAccountTracked } from './accounts'
import { seedStorage, resetStorage, readStorage } from '../test/storage'

// SPEC-038 (Phase 56) — untracked accounts and boundary transfers.
afterEach(resetStorage)

const ENVELOPES = [
  { id: 'env-undist', name: 'Undistributed income', isBuiltIn: true, isDefaultIncome: true, parentId: null },
  { id: 'env-a', name: 'Groceries', parentId: null },
]

describe('account tracked flag (56a)', () => {
  it('createAccount defaults to tracked; explicit false is stored', () => {
    seedStorage({})
    createAccount({ type: 'debit', companyName: '', accountName: 'Main', currency: 'EUR', startingBalance: 10 })
    createAccount({ type: 'savings', companyName: '', accountName: 'Vault', currency: 'EUR', startingBalance: 5, countedInEnvelopes: false })
    const [a, b] = readStorage('rmoney_accounts')
    expect(a.countedInEnvelopes).toBe(true)
    expect(b.countedInEnvelopes).toBe(false)
  })

  it('isAccountTracked treats a missing flag as tracked (legacy records)', () => {
    expect(isAccountTracked({})).toBe(true)
    expect(isAccountTracked({ countedInEnvelopes: false })).toBe(false)
  })
})

describe('starting-balance seed excludes untracked accounts (56c)', () => {
  it('only tracked accounts seed Undistributed income', () => {
    seedStorage({
      rmoney_envelopes: ENVELOPES,
      rmoney_accounts: [
        { id: 'acc-t', accountName: 'Main',  currency: 'EUR', startingBalance: 100 },
        { id: 'acc-u', accountName: 'Vault', currency: 'EUR', startingBalance: 50, countedInEnvelopes: false },
      ],
    })
    expect(getEnvelopeBalance('env-undist')).toBe(100)
    expect(getEnvelopesTotalByCurrency()).toEqual({ EUR: 100 })
  })
})

describe('boundary transfers post to envelopes (56b)', () => {
  it('expense/income flows count in the envelope balance; same-side transfers never do', () => {
    seedStorage({
      rmoney_envelopes: ENVELOPES,
      rmoney_accounts: [],
      rmoney_transactions: [
        { id: 't1', type: 'transfer', date: '2026-07-01', sourceAccountId: 'acc-t', destinationAccountId: 'acc-u',
          sourceAmount: 30, destinationAmount: 30, envelopeFlow: 'expense', envelopeId: 'env-a', createdAt: 'c1' },
        { id: 't2', type: 'transfer', date: '2026-07-02', sourceAccountId: 'acc-u', destinationAccountId: 'acc-t',
          sourceAmount: 20, destinationAmount: 20, envelopeFlow: 'income', envelopeId: 'env-a', createdAt: 'c2' },
        { id: 't3', type: 'transfer', date: '2026-07-03', sourceAccountId: 'acc-t', destinationAccountId: 'acc-t2',
          sourceAmount: 99, destinationAmount: 99, createdAt: 'c3' },   // tracked↔tracked — no envelope effect
      ],
    })
    expect(getEnvelopeBalance('env-a')).toBe(-10)   // −30 out, +20 in
    expect(getEnvelopesTotalByCurrency()).toEqual({ EUR: -10 })
  })
})

describe('unallocated reconciliation figure (56e)', () => {
  it('is 0 when boundary crossings are recorded, and reveals unrecorded ones', () => {
    seedStorage({
      rmoney_envelopes: ENVELOPES,
      rmoney_accounts: [
        { id: 'acc-t', accountName: 'Main',  currency: 'EUR', startingBalance: 100 },
        { id: 'acc-u', accountName: 'Vault', currency: 'EUR', startingBalance: 0, countedInEnvelopes: false },
      ],
      rmoney_transactions: [
        // Recorded boundary crossing: 30 leaves the tracked world AND the envelopes.
        { id: 't1', type: 'transfer', date: '2026-07-01', sourceAccountId: 'acc-t', destinationAccountId: 'acc-u',
          sourceAmount: 30, destinationAmount: 30, envelopeFlow: 'expense', envelopeId: 'env-a', createdAt: 'c1' },
      ],
    })
    expect(getUnallocatedByCurrency()).toEqual({ EUR: 0 })   // identity holds

    // A legacy crossing WITHOUT the envelope posting: tracked money drops, envelopes don't.
    seedStorage({
      rmoney_envelopes: ENVELOPES,
      rmoney_accounts: [
        { id: 'acc-t', accountName: 'Main',  currency: 'EUR', startingBalance: 100 },
        { id: 'acc-u', accountName: 'Vault', currency: 'EUR', startingBalance: 0, countedInEnvelopes: false },
      ],
      rmoney_transactions: [
        { id: 't1', type: 'transfer', date: '2026-07-01', sourceAccountId: 'acc-t', destinationAccountId: 'acc-u',
          sourceAmount: 30, destinationAmount: 30, createdAt: 'c1' },
      ],
    })
    expect(getUnallocatedByCurrency()).toEqual({ EUR: -30 })
  })
})
