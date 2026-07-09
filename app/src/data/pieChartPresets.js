import { recordDeletion } from './syncMeta'
import appStorage from '../utils/appStorage'

const KEY = 'rmoney_pie_chart_presets'

function load() { try { return JSON.parse(appStorage.getItem(KEY)) ?? [] } catch { return [] } }
function save(data) { appStorage.setItem(KEY, JSON.stringify(data)) }

export function getPieChartPresets() { return load() }

export function createPieChartPreset(fields) {
  const presets = load()
  const preset = {
    id: crypto.randomUUID(),
    name: fields.name ?? 'New chart',
    gridPosition: presets.length,
    grouping: fields.grouping ?? 'currency',
    filters: fields.filters ?? { portfolioId: null, currencies: [], regions: [], continents: [] },
    displayCurrency: fields.displayCurrency ?? null,
    otherThresholdPct: fields.otherThresholdPct ?? 1,
    showTableBelow: fields.showTableBelow ?? false,
    chartType: fields.chartType ?? 'pie',
    updatedAt: new Date().toISOString(),
  }
  save([...presets, preset])
  return preset
}

export function updatePieChartPreset(id, fields) {
  save(load().map(p => p.id === id ? { ...p, ...fields, updatedAt: new Date().toISOString() } : p))
}

export function deletePieChartPreset(id) {
  recordDeletion(KEY, id)
  const presets = load().filter(p => p.id !== id)
  save(presets.map((p, i) => (p.gridPosition === i ? p : { ...p, gridPosition: i, updatedAt: new Date().toISOString() })))
}

export function reorderPieChartPresets(orderedIds) {
  const presets = load()
  const byId = Object.fromEntries(presets.map(p => [p.id, p]))
  save(orderedIds.filter(id => byId[id]).map((id, i) => (
    byId[id].gridPosition === i ? byId[id] : { ...byId[id], gridPosition: i, updatedAt: new Date().toISOString() }
  )))
}

export function getPieChartPresetsStorageBytes() {
  const raw = appStorage.getItem(KEY) ?? '[]'
  return new Blob([raw]).size
}

export function deleteAllPieChartPresets() {
  load().forEach(p => recordDeletion(KEY, p.id))
  save([])
}
