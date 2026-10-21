import type { IconName } from '../../../components/ui/Icon'

/**
 * Semble's connection vocabulary, matching what Semble shows today: values
 * from `ConnectionTypeEnum` (src/modules/cards/domain/value-objects/
 * ConnectionType.ts); labels, descriptions, order, note placeholders and
 * icon meanings from the web app (src/webapp/features/connections/const/
 * connectionTypes.ts). Values are what is stored, so renamed labels (e.g.
 * HELPFUL → "Adds context to") never affect existing records. The lexicon
 * allows any string, so other values must still render — see `styleForType`.
 */
export type ConnectionTypeInfo = {
  value: string
  /** Reads as a verb from source to target: "A explains B". */
  label: string
  description: string
  notePlaceholder: string
  icon: IconName
  /** Stroke colour. Paired with `dash`, an icon and a text label so colour is never the only cue. */
  colour: string
  dash?: string
}

export const CONNECTION_TYPES: readonly ConnectionTypeInfo[] = [
  {
    value: 'RELATED',
    label: 'Relates to',
    description: 'Generally connected or associated',
    notePlaceholder: 'Describe how these are related…',
    icon: 'typeRelated',
    colour: '#64748b',
  },
  {
    value: 'SUPPORTS',
    label: 'Supports',
    description: 'Provides evidence or reasoning in favour',
    notePlaceholder: 'Explain how this supports or provides evidence…',
    icon: 'typeSupports',
    colour: '#15803d',
  },
  {
    value: 'OPPOSES',
    label: 'Opposes',
    description: 'Provides counter-evidence or reasoning against',
    notePlaceholder: 'Describe the counter-argument or opposing view…',
    icon: 'typeOpposes',
    colour: '#c2410c',
    dash: '8 4',
  },
  {
    value: 'ADDRESSES',
    label: 'Addresses',
    description: 'Responds to or answers a question or topic',
    notePlaceholder: 'Explain how this responds to or answers the topic…',
    icon: 'typeAddresses',
    colour: '#7c3aed',
  },
  {
    value: 'HELPFUL',
    label: 'Adds context to',
    description: 'Provides useful context or background',
    notePlaceholder: 'Describe what context or background this provides…',
    icon: 'typeContext',
    colour: '#0e7490',
    dash: '2 3',
  },
  {
    value: 'LEADS_TO',
    label: 'Leads to',
    description: 'Led me to discover this',
    notePlaceholder: 'Explain how this link leads to the other…',
    icon: 'typeLeadsTo',
    colour: '#b45309',
    dash: '12 3 2 3',
  },
  {
    value: 'EXPLAINER',
    label: 'Explains',
    description: 'Explains or summarises for a broader audience',
    notePlaceholder: 'Describe how this explains or clarifies…',
    icon: 'typeExplains',
    colour: '#2563eb',
  },
  {
    value: 'SUPPLEMENT',
    label: 'Supplements',
    description: 'Accompanying resources (e.g. data, code, other supplemental material)',
    notePlaceholder: 'Explain what additional information this adds…',
    icon: 'typeSupplements',
    colour: '#0f766e',
    dash: '6 2',
  },
  {
    value: 'SAME_AS',
    label: 'Same as',
    description: 'The same thing in a different place (mirror, reupload, DOI)',
    notePlaceholder: 'Note where this version differs, if at all…',
    icon: 'typeSameAs',
    colour: '#1e293b',
    dash: '10 2 2 2 2 2',
  },
  {
    value: 'REFERENCES',
    label: 'References',
    description: 'Cites or points to the other',
    notePlaceholder: 'Describe what is referenced or cited…',
    icon: 'typeReferences',
    colour: '#9d174d',
    dash: '1 3',
  },
]

export const DEFAULT_CONNECTION_TYPE = 'RELATED'

const BY_VALUE = new Map(CONNECTION_TYPES.map((t) => [t.value, t]))

const UNKNOWN_TYPE_STYLE = { colour: '#94a3b8', dash: '4 4' } as const

export type EdgeStyle = { colour: string; dash?: string; label: string; icon: IconName; known: boolean }

export function typeInfo(raw: string | undefined): ConnectionTypeInfo | undefined {
  if (!raw) return undefined
  return BY_VALUE.get(raw.trim().toUpperCase())
}

/** Visual style for any stored type value, including ones this client has never seen. */
export function styleForType(raw: string | undefined): EdgeStyle {
  const info = typeInfo(raw)
  if (info) return { colour: info.colour, dash: info.dash, label: info.label, icon: info.icon, known: true }
  return {
    ...UNKNOWN_TYPE_STYLE,
    label: raw?.trim() ? raw.trim() : 'Untyped',
    icon: 'typeUnknown',
    known: false,
  }
}
