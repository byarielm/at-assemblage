/**
 * Semble's connection vocabulary, mirrored from Semble's own
 * `ConnectionTypeEnum` (cosmik-network/semble, src/modules/cards/domain/
 * value-objects/ConnectionType.ts). The lexicon stores `connectionType` as a
 * free string, so any other value must still render — see `styleForType`.
 */
export type ConnectionTypeInfo = {
  value: string
  label: string
  description: string
  /** Semble treats these as symmetric; we still store and draw them directed. */
  directional: boolean
  /** Stroke colour. Paired with `dash` and a text label so colour is never the only cue. */
  colour: string
  dash?: string
}

export const CONNECTION_TYPES: readonly ConnectionTypeInfo[] = [
  { value: 'RELATED', label: 'Related', description: 'Loosely related', directional: false, colour: '#64748b' },
  { value: 'SUPPORTS', label: 'Supports', description: 'Source supports target', directional: true, colour: '#15803d' },
  { value: 'OPPOSES', label: 'Opposes', description: 'Source argues against target', directional: true, colour: '#c2410c', dash: '8 4' },
  { value: 'ADDRESSES', label: 'Addresses', description: 'Source responds to target', directional: true, colour: '#7c3aed' },
  { value: 'HELPFUL', label: 'Helpful', description: 'Helpful together', directional: false, colour: '#0e7490', dash: '2 3' },
  { value: 'EXPLAINER', label: 'Explainer', description: 'Source explains target', directional: true, colour: '#2563eb' },
  { value: 'LEADS_TO', label: 'Leads to', description: 'Read source, then target', directional: true, colour: '#b45309', dash: '12 3 2 3' },
  { value: 'SUPPLEMENT', label: 'Supplement', description: 'Source adds to target', directional: true, colour: '#0f766e', dash: '6 2' },
  { value: 'REFERENCES', label: 'References', description: 'Source cites target', directional: true, colour: '#9d174d', dash: '1 3' },
  { value: 'SAME_AS', label: 'Same as', description: 'Same resource or claim', directional: false, colour: '#1e293b', dash: '10 2 2 2 2 2' },
]

export const DEFAULT_CONNECTION_TYPE = 'RELATED'

const BY_VALUE = new Map(CONNECTION_TYPES.map((t) => [t.value, t]))

const UNKNOWN_TYPE_STYLE = { colour: '#94a3b8', dash: '4 4' } as const

export type EdgeStyle = { colour: string; dash?: string; label: string; known: boolean; directional: boolean }

export function typeInfo(raw: string | undefined): ConnectionTypeInfo | undefined {
  if (!raw) return undefined
  return BY_VALUE.get(raw.trim().toUpperCase())
}

/** Visual style for any stored type value, including ones this client has never seen. */
export function styleForType(raw: string | undefined): EdgeStyle {
  const info = typeInfo(raw)
  if (info) return { colour: info.colour, dash: info.dash, label: info.label, known: true, directional: info.directional }
  return {
    ...UNKNOWN_TYPE_STYLE,
    label: raw?.trim() ? raw.trim() : 'Untyped',
    known: false,
    directional: true,
  }
}
