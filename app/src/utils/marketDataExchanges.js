// Canonical exchange identifiers (MIC codes) and per-provider translators.
//
// resolveExchange() accepts any synonym (user input, provider response, etc.)
// and returns the canonical 4-letter MIC code. Provider adapters then call
// PROVIDER_EXCHANGE[id](mic) to get the format that particular API expects.

const MIC_SYNONYMS = {
  // London Stock Exchange
  LSE: 'XLON', LON: 'XLON', LONDON: 'XLON', XLON: 'XLON',
  // Deutsche Börse / XETRA (Frankfurt)
  FRA: 'XFRA', FSE: 'XFRA', FRANKFURT: 'XFRA', XFRA: 'XFRA',
  XETR: 'XETR', ETR: 'XETR', GER: 'XETR', EXX: 'XETR',
  // Euronext Amsterdam
  AMS: 'XAMS', AMSTERDAM: 'XAMS', XAMS: 'XAMS',
  // Euronext Paris
  PAR: 'XPAR', PARIS: 'XPAR', XPAR: 'XPAR',
  // NYSE (and NYSE-adjacent venues treated as XNYS for routing)
  NYSE: 'XNYS', XNYS: 'XNYS', NYQ: 'XNYS', PCX: 'XNYS', ASE: 'XNYS',
  // NASDAQ
  NASDAQ: 'XNAS', NMS: 'XNAS', NGM: 'XNAS', XNAS: 'XNAS',
  // SIX Swiss Exchange
  SWX: 'XSWX', ZURICH: 'XSWX', XSWX: 'XSWX',
  // Bolsa de Madrid
  BME: 'XMAD', MADRID: 'XMAD', XMAD: 'XMAD',
  // Borsa Italiana (Milan)
  MIL: 'XMIL', MILAN: 'XMIL', XMIL: 'XMIL',
  // Euronext Brussels
  BRU: 'XBRU', BRUSSELS: 'XBRU', XBRU: 'XBRU',
  // Euronext Lisbon
  LIS: 'XLIS', LISBON: 'XLIS', XLIS: 'XLIS',
  // OMX Stockholm
  STO: 'XSTO', STOCKHOLM: 'XSTO', XSTO: 'XSTO',
  // OMX Helsinki
  HEL: 'XHEL', HELSINKI: 'XHEL', XHEL: 'XHEL',
  // Oslo Børs
  OSL: 'XOSL', OSLO: 'XOSL', XOSL: 'XOSL',
  // Nasdaq Copenhagen
  CPH: 'XCSE', COPENHAGEN: 'XCSE', XCSE: 'XCSE',
  // ASX
  ASX: 'XASX', XASX: 'XASX',
  // Tokyo Stock Exchange
  TSE: 'XTKS', TOKYO: 'XTKS', XTKS: 'XTKS',
  // Toronto Stock Exchange
  TSX: 'XTSE', TORONTO: 'XTSE', XTSE: 'XTSE',
  // Hong Kong
  HKG: 'XHKG', HONGKONG: 'XHKG', XHKG: 'XHKG',
}

export function resolveExchange(input) {
  if (!input) return null
  const key = input.toUpperCase().trim()
  return MIC_SYNONYMS[key] ?? key
}

// Values from PROVIDER_EXCHANGE.yahoo — used to recognise and strip embedded suffixes.
const YAHOO_SUFFIX_SET = new Set(['L','DE','AS','PA','SW','MC','MI','BR','LS','ST','HE','OL','CO','AX','T','TO','HK'])

// Strip any provider-embedded exchange indicator from a ticker before applying a new one.
// Handles Polygon-style prefix ("XLON:SGRO" → "SGRO") and Yahoo-style suffix ("SGRO.L" → "SGRO").
export function stripProviderSuffix(ticker) {
  if (!ticker) return ticker
  const colonIdx = ticker.indexOf(':')
  if (colonIdx !== -1) return ticker.slice(colonIdx + 1)
  const dotIdx = ticker.lastIndexOf('.')
  if (dotIdx !== -1 && YAHOO_SUFFIX_SET.has(ticker.slice(dotIdx + 1).toUpperCase())) {
    return ticker.slice(0, dotIdx)
  }
  return ticker
}

// Per-provider translators: MIC code → provider-specific string.
// Returns null when the exchange is the provider's home (US) and no suffix is needed.
export const PROVIDER_EXCHANGE = {
  yahoo: mic => ({
    XLON: 'L',  XFRA: 'DE', XETR: 'DE', XAMS: 'AS', XPAR: 'PA',
    XSWX: 'SW', XMAD: 'MC', XMIL: 'MI', XBRU: 'BR', XLIS: 'LS',
    XSTO: 'ST', XHEL: 'HE', XOSL: 'OL', XCSE: 'CO', XASX: 'AX',
    XTKS: 'T',  XTSE: 'TO', XHKG: 'HK',
  })[mic] ?? null,

  polygon: mic => ({
    XLON: 'XLON', XFRA: 'XFRA', XETR: 'XETR', XAMS: 'XAMS', XPAR: 'XPAR',
    XSWX: 'XSWX', XMAD: 'XMAD', XMIL: 'XMIL', XSTO: 'XSTO', XHEL: 'XHEL',
    XOSL: 'XOSL', XCSE: 'XCSE', XASX: 'XASX', XTKS: 'XTKS', XTSE: 'XTSE',
    XHKG: 'XHKG', XNYS: 'XNYS', XNAS: 'XNAS',
  })[mic] ?? mic,

  twelveData: mic => ({
    XLON: 'LSE',  XFRA: 'XFRA', XETR: 'XETR', XAMS: 'XAMS', XPAR: 'XPAR',
    XSWX: 'SWX',  XMAD: 'BME',  XMIL: 'MIL',  XSTO: 'STO',  XHEL: 'HEL',
    XOSL: 'OSL',  XCSE: 'XCSE', XASX: 'ASX',  XTKS: 'TSE',  XTSE: 'TSX',
    XHKG: 'HKEX', XNYS: 'NYSE', XNAS: 'NASDAQ',
  })[mic] ?? mic,

  finnhub: mic => ({
    XLON: 'L',   XFRA: 'F',   XETR: 'DE',  XAMS: 'AS',  XPAR: 'PA',
    XSWX: 'SW',  XMAD: 'MC',  XMIL: 'MI',  XSTO: 'ST',  XHEL: 'HE',
    XOSL: 'OL',  XCSE: 'CO',  XASX: 'AX',  XTKS: 'T',   XTSE: 'TO',
    XHKG: 'HK',
  })[mic] ?? null,
}
