import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { countryDetailRegion, continentRegion } from './regionMap'

describe('region lookups', () => {
  it('resolves ISO codes and English names case-insensitively', () => {
    expect(countryDetailRegion('DK')).toBe('Europe')
    expect(countryDetailRegion('Denmark')).toBe('Europe')
    expect(countryDetailRegion('US')).toBe('US')
    expect(continentRegion('denmark')).toBe('Europe')
    expect(continentRegion('Japan')).toBe('Asia')      // continent-only country
    expect(countryDetailRegion('Japan')).toBe('Global') // no detail bucket for JP
  })

  it('falls back to Global for unknown input', () => {
    expect(countryDetailRegion('Atlantis')).toBe('Global')
    expect(continentRegion(null)).toBe('Global')
  })
})

describe('map literals contain no duplicate keys', () => {
  // A duplicate key in an object literal is invisible at runtime — the later
  // entry silently wins (the 2026-07-09 `'denmark'` duplicate bug class). The
  // runtime object can't reveal it, so scan the source text per map literal.
  const source = readFileSync(new URL('./regionMap.js', import.meta.url), 'utf8')

  const literalNames = ['ISO_TO_DETAIL', 'DETAIL_TO_CONTINENT', 'ISO_TO_CONTINENT_ONLY', 'NAME_TO_ISO']

  it.each(literalNames)('%s', name => {
    const block = source.match(new RegExp(`const ${name} = \\{([\\s\\S]*?)\\n\\}`))
    expect(block, `${name} literal not found — update this test if the file was restructured`).toBeTruthy()

    const keys = []
    // Keys are either quoted ('united states') or bare identifiers (US, CA).
    for (const m of block[1].matchAll(/(?:'([^']+)'|\b([A-Za-z]{2}))\s*:/g)) {
      keys.push(m[1] ?? m[2])
    }
    expect(keys.length).toBeGreaterThan(0)

    const seen = new Set()
    const dupes = keys.filter(k => (seen.has(k) ? true : (seen.add(k), false)))
    expect(dupes).toEqual([])
  })
})
