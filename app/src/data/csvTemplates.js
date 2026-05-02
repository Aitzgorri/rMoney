const KEY = 'rmoney_csv_templates'

function load() { try { return JSON.parse(localStorage.getItem(KEY)) ?? [] } catch { return [] } }
function save(data) { localStorage.setItem(KEY, JSON.stringify(data)) }

export function getCsvTemplates() {
  return load().sort((a, b) => a.name.localeCompare(b.name))
}

export function getCsvTemplate(id) {
  return load().find(t => t.id === id) ?? null
}

export function createCsvTemplate({ name, dateFormat, decimalSeparator, mapping, typeValueMap = null, defaultTransactionType = null }) {
  const item = {
    id: crypto.randomUUID(),
    name: name.trim(),
    format: 'csv',
    dateFormat,
    decimalSeparator,
    mapping,                   // { csvColumnName: appField }
    typeValueMap,              // { csvTypeValue: 'buy'|'sell'|'dividend'|'transfer' } | null
    defaultTransactionType,    // 'buy'|'sell'|'dividend'|'transfer'|null
    createdAt: new Date().toISOString(),
  }
  save([...load(), item])
  return item
}

export function updateCsvTemplate(id, fields) {
  save(load().map(t => t.id === id ? { ...t, ...fields } : t))
}

// Returns { canDelete, reason, users } — blocked when accounts reference it
export function canDeleteCsvTemplate(id) {
  const users = getTemplateUsers(id)
  if (users.length > 0) {
    const names = users.map(a => a.name).join(', ')
    return { canDelete: false, reason: `This template is the default for: ${names}. Unlink it there first.`, users }
  }
  return { canDelete: true, users: [] }
}

export function deleteCsvTemplate(id) {
  save(load().filter(t => t.id !== id))
}

// Returns investing accounts that use this template as their default
export function getTemplateUsers(templateId) {
  try {
    const accounts = JSON.parse(localStorage.getItem('rmoney_investing_accounts')) ?? []
    return accounts.filter(a => a.defaultCsvTemplateId === templateId)
  } catch { return [] }
}
