// Maps ISO 2-letter country codes (or common English country names) to investment regions.
// country-detail buckets: US, Canada, Latin America, Europe, Africa, Russia, China, India, Australia+NZ, Global
// continent buckets: North America, South America, Europe, Africa, Asia, Australia+NZ, Global

const ISO_TO_DETAIL = {
  US: 'US',
  CA: 'Canada',
  // Latin America
  MX: 'Latin America', BR: 'Latin America', AR: 'Latin America', CL: 'Latin America',
  CO: 'Latin America', PE: 'Latin America', VE: 'Latin America', EC: 'Latin America',
  UY: 'Latin America', PY: 'Latin America', BO: 'Latin America', CR: 'Latin America',
  PA: 'Latin America', DO: 'Latin America', GT: 'Latin America', CU: 'Latin America',
  HN: 'Latin America', NI: 'Latin America', SV: 'Latin America', TT: 'Latin America',
  JM: 'Latin America', HT: 'Latin America', BZ: 'Latin America', GY: 'Latin America',
  SR: 'Latin America', BB: 'Latin America', LC: 'Latin America',
  // Europe
  GB: 'Europe', DE: 'Europe', FR: 'Europe', IT: 'Europe', ES: 'Europe', NL: 'Europe',
  BE: 'Europe', SE: 'Europe', NO: 'Europe', DK: 'Europe', FI: 'Europe', PL: 'Europe',
  CZ: 'Europe', HU: 'Europe', AT: 'Europe', CH: 'Europe', PT: 'Europe', IE: 'Europe',
  GR: 'Europe', LU: 'Europe', SK: 'Europe', RO: 'Europe', BG: 'Europe', HR: 'Europe',
  SI: 'Europe', EE: 'Europe', LV: 'Europe', LT: 'Europe', CY: 'Europe', MT: 'Europe',
  IS: 'Europe', TR: 'Europe', UA: 'Europe', RS: 'Europe', BA: 'Europe', AL: 'Europe',
  MK: 'Europe', ME: 'Europe', XK: 'Europe', MD: 'Europe',
  // Africa
  ZA: 'Africa', NG: 'Africa', EG: 'Africa', KE: 'Africa', GH: 'Africa', MA: 'Africa',
  TZ: 'Africa', ET: 'Africa', UG: 'Africa', DZ: 'Africa', TN: 'Africa', CM: 'Africa',
  AO: 'Africa', MZ: 'Africa', ZM: 'Africa', ZW: 'Africa', SD: 'Africa', MW: 'Africa',
  SN: 'Africa', CI: 'Africa', MG: 'Africa', GA: 'Africa', BJ: 'Africa', TG: 'Africa',
  RW: 'Africa', BI: 'Africa', SO: 'Africa', DJ: 'Africa', ER: 'Africa', SS: 'Africa',
  LY: 'Africa', MR: 'Africa', ML: 'Africa', NE: 'Africa', BF: 'Africa', TD: 'Africa',
  // Russia / CIS
  RU: 'Russia', BY: 'Russia', KZ: 'Russia', AZ: 'Russia', UZ: 'Russia',
  // China (mainland + SAR + Taiwan grouped together)
  CN: 'China', HK: 'China', MO: 'China', TW: 'China',
  // India
  IN: 'India',
  // Australia + NZ
  AU: 'Australia+NZ', NZ: 'Australia+NZ', PG: 'Australia+NZ',
}

// Maps country-detail region → continent-level region
const DETAIL_TO_CONTINENT = {
  'US':           'North America',
  'Canada':       'North America',
  'Latin America':'South America',
  'Europe':       'Europe',
  'Africa':       'Africa',
  'Russia':       'Europe',
  'China':        'Asia',
  'India':        'Asia',
  'Australia+NZ': 'Australia+NZ',
  'Global':       'Global',
}

// ISO codes not in ISO_TO_DETAIL (rest of Asia, Middle East, Pacific) but with a known continent
const ISO_TO_CONTINENT_ONLY = {
  JP: 'Asia', KR: 'Asia', SG: 'Asia', MY: 'Asia', ID: 'Asia', TH: 'Asia',
  VN: 'Asia', PH: 'Asia', MM: 'Asia', KH: 'Asia', LA: 'Asia', BD: 'Asia',
  LK: 'Asia', PK: 'Asia', NP: 'Asia', BT: 'Asia', MV: 'Asia', MN: 'Asia',
  SA: 'Asia', AE: 'Asia', IL: 'Asia', QA: 'Asia', KW: 'Asia', BH: 'Asia',
  OM: 'Asia', JO: 'Asia', LB: 'Asia', IQ: 'Asia', IR: 'Asia', SY: 'Asia',
  YE: 'Asia', AF: 'Asia', TJ: 'Asia', TM: 'Asia', KG: 'Asia',
  GE: 'Asia', AM: 'Asia',
  FJ: 'Australia+NZ', WS: 'Australia+NZ', TO: 'Australia+NZ', VU: 'Australia+NZ',
}

// Common English country names → ISO codes for robustness
const NAME_TO_ISO = {
  'united states': 'US', 'usa': 'US', 'u.s.': 'US', 'u.s.a.': 'US',
  'united kingdom': 'GB', 'uk': 'GB', 'great britain': 'GB', 'england': 'GB',
  'germany': 'DE', 'france': 'FR', 'italy': 'IT', 'spain': 'ES',
  'netherlands': 'NL', 'sweden': 'SE', 'norway': 'NO', 'denmark': 'DK',
  'finland': 'FI', 'poland': 'PL', 'czech republic': 'CZ', 'czechia': 'CZ',
  'hungary': 'HU', 'austria': 'AT', 'switzerland': 'CH', 'portugal': 'PT',
  'ireland': 'IE', 'belgium': 'BE', 'luxembourg': 'LU', 'greece': 'GR',
  'canada': 'CA', 'australia': 'AU', 'new zealand': 'NZ',
  'china': 'CN', "people's republic of china": 'CN',
  'hong kong': 'HK', 'taiwan': 'TW', 'india': 'IN',
  'japan': 'JP', 'south korea': 'KR', 'korea': 'KR', 'singapore': 'SG',
  'malaysia': 'MY', 'indonesia': 'ID', 'thailand': 'TH', 'vietnam': 'VN',
  'philippines': 'PH', 'bangladesh': 'BD', 'pakistan': 'PK',
  'brazil': 'BR', 'argentina': 'AR', 'chile': 'CL', 'colombia': 'CO',
  'mexico': 'MX', 'peru': 'PE', 'venezuela': 'VE',
  'russia': 'RU', 'russian federation': 'RU',
  'south africa': 'ZA', 'nigeria': 'NG', 'egypt': 'EG', 'kenya': 'KE',
  'israel': 'IL', 'saudi arabia': 'SA', 'united arab emirates': 'AE', 'uae': 'AE',
  'turkey': 'TR', 'ukraine': 'UA', 'denmark': 'DK',
}

function toISO(hqCountry) {
  if (!hqCountry) return null
  const raw = String(hqCountry).trim()
  if (raw.length === 2) return raw.toUpperCase()
  if (raw.length === 3) {
    // Could be a 3-letter ISO code — return as-is; won't match our table, falls through to 'Global'
    return raw.toUpperCase()
  }
  return NAME_TO_ISO[raw.toLowerCase()] ?? null
}

export function countryDetailRegion(hqCountry) {
  const iso = toISO(hqCountry)
  if (!iso) return 'Global'
  return ISO_TO_DETAIL[iso] ?? 'Global'
}

export function continentRegion(hqCountry) {
  const iso = toISO(hqCountry)
  if (!iso) return 'Global'
  const detail = ISO_TO_DETAIL[iso]
  if (detail) return DETAIL_TO_CONTINENT[detail] ?? 'Global'
  return ISO_TO_CONTINENT_ONLY[iso] ?? 'Global'
}

export const COUNTRY_DETAIL_REGIONS = [
  'US', 'Canada', 'Latin America', 'Europe', 'Africa', 'Russia', 'China', 'India', 'Australia+NZ', 'Global',
]

export const CONTINENT_REGIONS = [
  'North America', 'South America', 'Europe', 'Africa', 'Asia', 'Australia+NZ', 'Global',
]
