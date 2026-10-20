import type { Positions } from './layout'

/**
 * Manual node positions are presentation state only. They live in this
 * browser, keyed by DID and the exact set of selected collections, and are
 * never written to the PDS.
 */
export function layoutStorageKey(did: string, groupIds: readonly string[]): string {
  return `assemblage:layout:v1:${did}:${[...groupIds].sort().join('|')}`
}

export function loadPositions(key: string): Positions {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    const out: Positions = {}
    for (const [id, pos] of Object.entries(parsed as Record<string, unknown>)) {
      const p = pos as { x?: unknown; y?: unknown }
      if (typeof p?.x === 'number' && typeof p?.y === 'number') out[id] = { x: p.x, y: p.y }
    }
    return out
  } catch {
    return {}
  }
}

export function savePositions(key: string, positions: Positions): void {
  try {
    localStorage.setItem(key, JSON.stringify(positions))
  } catch {
    // Storage unavailable: positions still hold for this session.
  }
}

const selectionKey = (did: string) => `assemblage:selection:v1:${did}`

export function loadSelectedGroups(did: string): string[] {
  try {
    const raw = localStorage.getItem(selectionKey(did))
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

export function saveSelectedGroups(did: string, ids: readonly string[]): void {
  try {
    localStorage.setItem(selectionKey(did), JSON.stringify(ids))
  } catch {
    // ignore
  }
}
