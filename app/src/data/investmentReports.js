import { recordDeletion } from './syncMeta'
import appStorage from '../utils/appStorage'

const KEY = 'rmoney_investment_report_presets'

function load() { try { return JSON.parse(appStorage.getItem(KEY)) ?? [] } catch { return [] } }
function save(data) { appStorage.setItem(KEY, JSON.stringify(data)) }

export function getReportPresets() { return load() }

export function getReportPreset(id) { return load().find(p => p.id === id) ?? null }

export function createReportPreset({ name, config }) {
  const preset = {
    id: crypto.randomUUID(),
    name: name.trim(),
    config,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  save([...load(), preset])
  return preset
}

export function updateReportPreset(id, fields) {
  save(load().map(p => p.id === id ? { ...p, ...fields, updatedAt: new Date().toISOString() } : p))
}

export function deleteReportPreset(id) {
  recordDeletion(KEY, id)
  save(load().filter(p => p.id !== id))
}

export function getReportPresetsStorageBytes() {
  const raw = appStorage.getItem(KEY) ?? '[]'
  return new Blob([raw]).size
}

export function deleteAllReportPresets() {
  load().forEach(p => recordDeletion(KEY, p.id))
  save([])
}
