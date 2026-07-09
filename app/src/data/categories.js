import appStorage from '../utils/appStorage'
import { recordDeletion } from './syncMeta'

const KEY          = 'rmoney_categories'
const KEY_DEFAULTS = 'rmoney_default_categories'

function load() {
  try {
    return JSON.parse(appStorage.getItem(KEY)) ?? []
  } catch {
    return []
  }
}

function save(categories) {
  appStorage.setItem(KEY, JSON.stringify(categories))
}

function generateId() {
  return crypto.randomUUID()
}

function sortAlpha(items) {
  return [...items].sort((a, b) => a.name.localeCompare(b.name))
}

function loadDefaults() {
  try {
    return JSON.parse(appStorage.getItem(KEY_DEFAULTS)) ?? {}
  } catch {
    return {}
  }
}

function saveDefaults(defaults) {
  appStorage.setItem(KEY_DEFAULTS, JSON.stringify(defaults))
}

// ─── Built-in categories ─────────────────────────────────────────────────────

// Seeds the two built-in categories if they are not already present.
// Safe to call multiple times — only creates what is missing.
export function ensureBuiltInCategories() {
  const all = load()
  const hasIncome  = all.some(c => c.isBuiltIn && c.type === 'income')
  const hasExpense = all.some(c => c.isBuiltIn && c.type === 'expense')
  const toAdd = []
  if (!hasIncome) {
    toAdd.push({
      id: generateId(),
      type: 'income',
      name: 'Uncategorized income',
      parentId: null,
      isBuiltIn: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
  }
  if (!hasExpense) {
    toAdd.push({
      id: generateId(),
      type: 'expense',
      name: 'Uncategorized expense',
      parentId: null,
      isBuiltIn: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
  }
  if (toAdd.length > 0) save([...all, ...toAdd])
}

// Returns the id of the active default category for a given type.
// Prefers a user-chosen successor; falls back to the built-in.
export function getDefaultCategoryId(type) {
  const stored = loadDefaults()[type]
  const all = load()
  if (stored) {
    const cat = all.find(c => c.id === stored && !c.isArchived)
    if (cat) return cat.id
  }
  const builtin = all.find(c => c.isBuiltIn && c.type === type && !c.isArchived)
  return builtin?.id ?? null
}

// Archives a built-in category and designates a successor as the new default.
export function archiveBuiltInCategory(id, successorId) {
  const all = load()
  const target = all.find(c => c.id === id)
  if (!target?.isBuiltIn) return
  save(all.map(c => c.id === id ? { ...c, isArchived: true, updatedAt: new Date().toISOString() } : c))
  saveDefaults({ ...loadDefaults(), [target.type]: successorId })
}

// ─── Queries ─────────────────────────────────────────────────────────────────

export function getCategories() {
  return sortAlpha(load())
}

export function getActiveCategories() {
  return load().filter(c => !c.isDeleted && !c.isArchived)
}

// Returns categories as a flat list in tree order with depth, alphabetical within each level.
// Optionally filter by type ('income' | 'expense'). Used for indented dropdowns.
export function getCategoriesFlat(type) {
  const all = load().filter(c => !c.isDeleted && !c.isArchived && (!type || c.type === type))
  const result = []
  function walk(parentId, depth) {
    const children = sortAlpha(all.filter(c => c.parentId === parentId))
    for (const c of children) {
      result.push({ ...c, depth })
      walk(c.id, depth + 1)
    }
  }
  walk(null, 0)
  return result
}

// Returns all descendant ids of a given category (children, grandchildren, etc.)
export function getDescendants(id, all) {
  const children = all.filter(c => c.parentId === id)
  return children.flatMap(child => [child, ...getDescendants(child.id, all)])
}

export function createCategory({ type, name, parentId }) {
  const categories = load()
  const category = {
    id: generateId(),
    type,       // 'income' | 'expense'
    name,
    parentId: parentId ?? null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  save([...categories, category])
  return category
}

export function updateCategory(id, fields) {
  const categories = load()
  save(categories.map(c => c.id === id ? { ...c, ...fields, updatedAt: new Date().toISOString() } : c))
}

// Deletes a category and all its descendants. Built-in categories cannot be deleted.
export function deleteCategory(id) {
  const categories = load()
  if (categories.find(c => c.id === id)?.isBuiltIn) return
  const toDelete = new Set([id, ...getDescendants(id, categories).map(c => c.id)])
  save(categories.filter(c => !toDelete.has(c.id)))
  for (const c of categories.filter(c => toDelete.has(c.id))) {
    recordDeletion(KEY, c.id)
  }
}
