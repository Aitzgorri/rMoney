// Some exchanges quote in minor currency units (pence, agorot, cents).
// Provider adapters must call this at the boundary so the rest of the app
// always works in major units (GBP, ILS, ZAR, etc.).
const MINOR_UNIT_MAP = {
  GBp: { major: 'GBP', divisor: 100 },
  GBX: { major: 'GBP', divisor: 100 },
  ZAc: { major: 'ZAR', divisor: 100 },
  ILA: { major: 'ILS', divisor: 100 },
}

export function normaliseMinorUnit(price, currency) {
  if (!currency) return { price, currency }
  const m = MINOR_UNIT_MAP[currency]
  if (!m) return { price, currency }
  return { price: price / m.divisor, currency: m.major }
}
