// CRUD for AI system prompts. One prompt is selected at a time (id in app settings).
// The collection is seeded with a "Default" prompt that cannot be deleted but can be edited.

const KEY = 'rmoney_ai_system_prompts'

const DEFAULT_ID = 'default'
const DEFAULT_CONTENT = 'You are a concise financial advisor. Analyse the provided portfolio data and give a brief, honest evaluation of the stock position. Focus on key metrics, risks, and opportunities. 3–5 paragraphs max.'

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) ?? [] } catch { return [] }
}
function save(rows) { localStorage.setItem(KEY, JSON.stringify(rows)) }

// Seed the default prompt if the collection is empty or the default id is missing.
function ensureSeeded() {
  const rows = load()
  if (rows.some(r => r.id === DEFAULT_ID)) return rows
  const seeded = [{
    id: DEFAULT_ID,
    name: 'Default',
    content: DEFAULT_CONTENT,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }, ...rows]
  save(seeded)
  return seeded
}

export function getAiSystemPrompts() {
  return ensureSeeded().slice().sort((a, b) => {
    if (a.id === DEFAULT_ID) return -1
    if (b.id === DEFAULT_ID) return 1
    return a.name.localeCompare(b.name)
  })
}

export function getAiSystemPrompt(id) {
  return ensureSeeded().find(r => r.id === id) ?? null
}

export function createAiSystemPrompt({ name, content }) {
  const rows = ensureSeeded()
  const row = {
    id: crypto.randomUUID(),
    name: name?.trim() || 'Untitled',
    content: content ?? '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  save([...rows, row])
  return row
}

export function updateAiSystemPrompt(id, patch) {
  const rows = ensureSeeded()
  const idx = rows.findIndex(r => r.id === id)
  if (idx < 0) return null
  const updated = {
    ...rows[idx],
    ...(patch.name !== undefined ? { name: patch.name.trim() || rows[idx].name } : {}),
    ...(patch.content !== undefined ? { content: patch.content } : {}),
    updatedAt: new Date().toISOString(),
  }
  const next = rows.slice()
  next[idx] = updated
  save(next)
  return updated
}

export function canDeleteAiSystemPrompt(id) {
  if (id === DEFAULT_ID) return { canDelete: false, reason: 'The Default prompt cannot be deleted, only edited.' }
  return { canDelete: true }
}

export function deleteAiSystemPrompt(id) {
  const { canDelete, reason } = canDeleteAiSystemPrompt(id)
  if (!canDelete) throw new Error(reason)
  save(ensureSeeded().filter(r => r.id !== id))
}

export function getDefaultAiSystemPromptId() {
  ensureSeeded()
  return DEFAULT_ID
}
