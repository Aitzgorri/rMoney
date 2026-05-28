const KEY = 'rmoney_dividend_chart_presets'

function load() { try { return JSON.parse(localStorage.getItem(KEY)) ?? [] } catch { return [] } }
function save(data) { localStorage.setItem(KEY, JSON.stringify(data)) }

export function getDividendChartPresets() { return load() }

export function createDividendChartPreset(fields) {
  const presets = load()
  const preset = {
    id: crypto.randomUUID(),
    name:     fields.name     ?? 'New chart',
    xBucket:  fields.xBucket  ?? 'month',
    yType:    fields.yType    ?? 'gross',
    chartType: fields.chartType ?? 'bar',
    groupedByPeriod: fields.groupedByPeriod ?? false,
    filters:  fields.filters  ?? {
      companies:   [],
      portfolioIds: [],
      countries:   [],
      regions:     [],
      continents:  [],
      yearFrom:    null,
      yearTo:      null,
    },
    datasets: fields.datasets ?? [],
  }
  save([...presets, preset])
  return preset
}

export function updateDividendChartPreset(id, fields) {
  save(load().map(p => p.id === id ? { ...p, ...fields } : p))
}

export function deleteDividendChartPreset(id) {
  save(load().filter(p => p.id !== id))
}

export function getDividendChartPresetsStorageBytes() {
  const raw = localStorage.getItem(KEY) ?? '[]'
  return new Blob([raw]).size
}

export function deleteAllDividendChartPresets() {
  save([])
}
