import { normaliseUrl } from '../url'
import type { SembleConnectionView, SembleUrlView, SembleUser } from './appview'

export type SuggestionReason =
  | {
      kind: 'connected'
      /** Semble connection type, upper-case, if any. */
      type?: string
      /** Relative to the selected card: outgoing means card → suggestion. */
      direction: 'outgoing' | 'incoming'
      curators: SembleUser[]
      note?: string
    }
  | { kind: 'similar' }

export type Suggestion = {
  key: string
  url: string
  title?: string
  description?: string
  siteName?: string
  imageUrl?: string
  /** How many Semble libraries hold this URL. */
  libraryCount: number
  reason: SuggestionReason
  /** The user's own card for this URL, if they already have one. */
  myCardId?: string
  /** The user already has this connection (same direction and type, or any for similar pages). */
  alreadyConnected: boolean
}

export type SuggestionGroups = { connected: Suggestion[]; similar: Suggestion[] }

export type SuggestionContext = {
  /** The selected card's URL. */
  url: string
  /** The signed-in user's DID: their own connections are already on the canvas. */
  did: string
  /** Normalised URL → the user's card id. */
  myCards: ReadonlyMap<string, string>
  /**
   * The user's own connections as normalised "source>target>TYPE" keys
   * (TYPE may be empty), for spotting suggestions they already acted on.
   */
  myConnectionKeys: ReadonlySet<string>
}

/** Looser than normaliseUrl: also ignores a leading "www.". Only used to tell which end is the card. */
const looseKey = (url: string) => normaliseUrl(url).replace(/^(https?:\/\/)www\./, '$1')

const upper = (t?: string) => t?.trim().toUpperCase() || undefined

export function connectionKey(source: string, target: string, type?: string): string {
  return `${normaliseUrl(source)}>${normaliseUrl(target)}>${upper(type) ?? ''}`
}

function hasAnyConnection(keys: ReadonlySet<string>, a: string, b: string): boolean {
  const ab = `${normaliseUrl(a)}>${normaliseUrl(b)}>`
  const ba = `${normaliseUrl(b)}>${normaliseUrl(a)}>`
  for (const k of keys) if (k.startsWith(ab) || k.startsWith(ba)) return true
  return false
}

function fromView(view: SembleUrlView) {
  const m = view.metadata
  return {
    url: view.url,
    title: m?.title?.trim() || undefined,
    description: m?.description?.trim() || undefined,
    siteName: m?.siteName?.trim() || undefined,
    imageUrl: m?.imageUrl,
    libraryCount: view.urlLibraryCount ?? 0,
  }
}

/**
 * Turns Semble's answers for one URL into suggestion groups:
 *
 * - **connected**: pages other people connected to or from this one, grouped
 *   by page + type + direction (several curators merge into one suggestion),
 *   ranked by how many people made that connection, then by popularity.
 * - **similar**: semantically similar pages, in Semble's order, without the
 *   card itself or anything already suggested above.
 */
export function buildSuggestions(
  ctx: SuggestionContext,
  connections: readonly SembleConnectionView[],
  similar: readonly SembleUrlView[],
): SuggestionGroups {
  const selfLoose = looseKey(ctx.url)
  const grouped = new Map<string, Suggestion & { reason: Extract<SuggestionReason, { kind: 'connected' }> }>()

  for (const c of connections) {
    if (c.connection.curator.id === ctx.did) continue
    // Semble already matched one end to this URL, possibly with a www. variant.
    const sourceKey = looseKey(c.source.url)
    const targetKey = looseKey(c.target.url)
    let direction: 'outgoing' | 'incoming'
    let other: SembleUrlView
    if (sourceKey === selfLoose && targetKey !== selfLoose) {
      direction = 'outgoing'
      other = c.target
    } else if (targetKey === selfLoose && sourceKey !== selfLoose) {
      direction = 'incoming'
      other = c.source
    } else continue

    const type = upper(c.connection.type)
    const otherKey = normaliseUrl(other.url)
    const key = `${otherKey}|${type ?? ''}|${direction}`
    const existing = grouped.get(key)
    if (existing) {
      if (!existing.reason.curators.some((u) => u.id === c.connection.curator.id)) existing.reason.curators.push(c.connection.curator)
      existing.reason.note ??= c.connection.note?.trim() || undefined
      continue
    }
    const [from, to] = direction === 'outgoing' ? [ctx.url, other.url] : [other.url, ctx.url]
    grouped.set(key, {
      key: `connected:${key}`,
      ...fromView(other),
      reason: { kind: 'connected', type, direction, curators: [c.connection.curator], note: c.connection.note?.trim() || undefined },
      myCardId: ctx.myCards.get(otherKey),
      alreadyConnected: ctx.myConnectionKeys.has(connectionKey(from, to, type)),
    })
  }

  const connected = [...grouped.values()].sort(
    (a, b) => b.reason.curators.length - a.reason.curators.length || b.libraryCount - a.libraryCount,
  )

  const seen = new Set([selfLoose, ...connected.map((s) => looseKey(s.url))])
  const similarSuggestions: Suggestion[] = []
  for (const view of similar) {
    const key = normaliseUrl(view.url)
    if (seen.has(looseKey(view.url))) continue
    seen.add(looseKey(view.url))
    similarSuggestions.push({
      key: `similar:${key}`,
      ...fromView(view),
      reason: { kind: 'similar' },
      myCardId: ctx.myCards.get(key),
      alreadyConnected: hasAnyConnection(ctx.myConnectionKeys, ctx.url, view.url),
    })
  }

  return { connected, similar: similarSuggestions }
}
