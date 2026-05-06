const KEY = 'rmoney_investment_report_presets'

function load() { try { return JSON.parse(localStorage.getItem(KEY)) ?? [] } catch { return [] } }
function save(data) { localStorage.setItem(KEY, JSON.stringify(data)) }

export function getReportPresets() { return load() }

export function getReportPreset(id) { return load().find(p => p.id === id) ?? null }

export function createReportPreset({ name, config }) {
  const preset = {
    id: crypto.randomUUID(),
    name: name.trim(),
    config,
    createdAt: new Date().toISOString(),
  }
  save([...load(), preset])
  return preset
}

export function updateReportPreset(id, fields) {
  save(load().map(p => p.id === id ? { ...p, ...fields } : p))
}

export function deleteReportPreset(id) {
  save(load().filter(p => p.id !== id))
}

export function getReportPresetsStorageBytes() {
  const raw = localStorage.getItem(KEY) ?? '[]'
  return new Blob([raw]).size
}

export function deleteAllReportPresets() {
  save([])
}
