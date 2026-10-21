import { normaliseUrl } from '../url'
import type { SembleConnectionView } from './appview'
import { typeInfo } from './connectionTypes'

export type TypeRecommendation = { type: string; reason: string }

export type Resource = { url?: string; doi?: string; isbn?: string }

const TRACKING_PARAM = /^(utm_[a-z]+|fbclid|gclid|mc_cid|mc_eid|ref|ref_src|igshid|si)$/i

/** A URL with differences that never change the resource removed: scheme, www., tracking params. */
export function canonicalUrl(raw: string): string {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return raw.trim()
  }
  for (const key of [...url.searchParams.keys()]) if (TRACKING_PARAM.test(key)) url.searchParams.delete(key)
  url.protocol = 'https:'
  url.hostname = url.hostname.replace(/^www\./, '')
  url.pathname = url.pathname.replace(/\/+$/, '') || '/'
  return normaliseUrl(url.toString())
}

/** The original URL inside a web-archive link (Wayback Machine, archive.today), if it is one. */
export function unarchive(raw: string): string | null {
  const wayback = raw.match(/^https?:\/\/web\.archive\.org\/web\/[^/]+\/(.+)$/i)
  if (wayback?.[1]) return /^https?:\/\//i.test(wayback[1]) ? wayback[1] : `https://${wayback[1]}`
  const archiveToday = raw.match(/^https?:\/\/archive\.(?:today|ph|is|li|md|vn|fo)\/(?:o\/[^/]+\/|[0-9]{14}\/)(https?:\/\/.+)$/i)
  return archiveToday?.[1] ?? null
}

const normDoi = (doi?: string) => doi?.trim().toLowerCase().replace(/^(https?:\/\/(dx\.)?doi\.org\/|doi:)/, '') || undefined
const normIsbn = (isbn?: string) => isbn?.replace(/[^0-9x]/gi, '').toUpperCase() || undefined

function doiOf(r: Resource): string | undefined {
  if (r.doi) return normDoi(r.doi)
  const m = r.url?.match(/^https?:\/\/(dx\.)?doi\.org\/(.+)$/i)
  return m?.[2] ? normDoi(decodeURIComponent(m[2])) : undefined
}

/**
 * Strong "Same as" signals only: identical DOI or ISBN, an archived copy of
 * the other page, or the same page under a cosmetically different URL.
 */
export function recommendSameAs(a: Resource, b: Resource): TypeRecommendation | null {
  const doiA = doiOf(a)
  const doiB = doiOf(b)
  if (doiA && doiA === doiB) return { type: 'SAME_AS', reason: `Both have the DOI ${doiA}` }
  const isbnA = normIsbn(a.isbn)
  if (isbnA && isbnA === normIsbn(b.isbn)) return { type: 'SAME_AS', reason: `Both have the ISBN ${isbnA}` }
  if (!a.url || !b.url) return null
  const archivedA = unarchive(a.url)
  const archivedB = unarchive(b.url)
  if (archivedA && canonicalUrl(archivedA) === canonicalUrl(b.url)) return { type: 'SAME_AS', reason: 'It is an archived copy of the other page' }
  if (archivedB && canonicalUrl(archivedB) === canonicalUrl(a.url)) return { type: 'SAME_AS', reason: 'The other page is an archived copy of it' }
  if (canonicalUrl(a.url) === canonicalUrl(b.url)) return { type: 'SAME_AS', reason: 'Same page; only the URL differs' }
  return null
}

/**
 * Other Semble users' choice for this exact pair and direction, only when it
 * is a strong signal: at least two people, and more than half of them used
 * the same (known) type. One vote per person; the user's own are excluded.
 */
export function recommendFromConsensus(
  sourceUrl: string,
  targetUrl: string,
  connections: readonly SembleConnectionView[],
  did: string,
): TypeRecommendation | null {
  const s = canonicalUrl(sourceUrl)
  const t = canonicalUrl(targetUrl)
  const votes = new Map<string, Set<string>>()
  for (const c of connections) {
    if (c.connection.curator.id === did) continue
    if (canonicalUrl(c.source.url) !== s || canonicalUrl(c.target.url) !== t) continue
    const type = c.connection.type?.trim().toUpperCase() ?? ''
    const types = votes.get(c.connection.curator.id) ?? new Set<string>()
    types.add(type)
    votes.set(c.connection.curator.id, types)
  }
  const people = votes.size
  if (people < 2) return null
  const counts = new Map<string, number>()
  for (const types of votes.values()) for (const type of types) counts.set(type, (counts.get(type) ?? 0) + 1)
  const [best, count] = [...counts].sort((x, y) => y[1] - x[1])[0]!
  if (count * 2 <= people || !typeInfo(best)) return null
  return {
    type: typeInfo(best)!.value,
    reason: count === people ? `All ${people} people on Semble who connected these chose this` : `${count} of ${people} people on Semble who connected these chose this`,
  }
}

/** Same-resource first (it is certain), then others' consensus. */
export function recommendType(
  source: Resource,
  target: Resource,
  connections: readonly SembleConnectionView[],
  did: string,
): TypeRecommendation | null {
  return (
    recommendSameAs(source, target) ??
    (source.url && target.url ? recommendFromConsensus(source.url, target.url, connections, did) : null)
  )
}
