import type { GraphData, GraphGroup, GraphItem, GraphLink } from '../../../graph/model'
import { network } from '../../../lexicons'
import { cleanUrl, domainOf, normaliseUrl } from '../url'
import type { StoredRecord } from '../records'
import type {
  CardRecord,
  CollectionRecord,
  ConnectionRecord,
  SembleConnections,
  SembleLibrary,
} from './types'

export function collectionToGroup(rec: StoredRecord<CollectionRecord>, itemCount?: number): GraphGroup {
  return { id: rec.uri, name: rec.value.name, description: rec.value.description, itemCount }
}

/** Number of cards linked to each collection URI. */
export function countCardsByCollection(library: SembleLibrary): Map<string, number> {
  const counts = new Map<string, number>()
  for (const link of library.links) {
    const id = link.value.collection.uri
    counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  return counts
}

type UrlContent = network.cosmik.card.UrlContent
type NoteContent = network.cosmik.card.NoteContent

function urlContent(card: CardRecord): UrlContent | undefined {
  return network.cosmik.card.urlContent.isTypeOf(card.content) ? card.content : undefined
}

function noteContent(card: CardRecord): NoteContent | undefined {
  return network.cosmik.card.noteContent.isTypeOf(card.content) ? card.content : undefined
}

function firstLine(text: string, max = 80): string {
  const line = text.trim().split('\n')[0] ?? ''
  return line.length > max ? `${line.slice(0, max - 1)}…` : line
}

function cardToItem(rec: StoredRecord<CardRecord>, groupIds: string[], notes: string[]): GraphItem {
  const card = rec.value
  const content = urlContent(card)
  const note = noteContent(card)
  const url = card.url ?? content?.url
  const meta = content?.metadata
  const endpoints = [rec.uri]
  if (url) endpoints.push(normaliseUrl(url))
  return {
    id: rec.uri,
    kind: String(card.type),
    title: meta?.title?.trim() || (url ? cleanUrl(url) : note ? firstLine(note.text) : 'Untitled card'),
    url,
    domain: domainOf(url),
    description: meta?.description ?? (note && !url ? note.text : undefined),
    imageUrl: meta?.imageUrl,
    siteName: meta?.siteName,
    notes,
    groupIds,
    endpoints,
    createdAt: card.createdAt,
  }
}

function connectionToLink(rec: StoredRecord<ConnectionRecord>, sourceId: string, targetId: string): GraphLink {
  return {
    id: rec.uri,
    sourceId,
    targetId,
    type: rec.value.connectionType,
    note: rec.value.note,
    createdAt: rec.value.createdAt,
    pending: rec.pending,
  }
}

/**
 * Joins Semble records into the generic graph for the selected collections.
 *
 * - Items: cards linked (via collectionLink) to any selected collection.
 *   NOTE cards with a `parentCard` are folded into their parent as notes.
 * - Links: connections whose source and target both resolve to a visible
 *   item, matched by card AT URI or by normalised URL.
 */
export function buildSembleGraph(
  selectedCollectionIds: readonly string[],
  library: SembleLibrary,
  connections: SembleConnections,
): GraphData {
  const selected = new Set(selectedCollectionIds)
  const warnings: string[] = []
  const cardsByUri = new Map(library.cards.map((c) => [c.uri, c]))

  const notesByParent = new Map<string, string[]>()
  for (const card of library.cards) {
    const parent = card.value.parentCard?.uri
    const note = noteContent(card.value)
    if (parent && note?.text.trim()) {
      notesByParent.set(parent, [...(notesByParent.get(parent) ?? []), note.text.trim()])
    }
  }

  const groupsByCard = new Map<string, string[]>()
  let missingCards = 0
  for (const link of library.links) {
    const collectionId = link.value.collection.uri
    if (!selected.has(collectionId)) continue
    const cardUri = link.value.card.uri
    if (!cardsByUri.has(cardUri)) {
      missingCards++
      continue
    }
    const groups = groupsByCard.get(cardUri) ?? []
    if (!groups.includes(collectionId)) groups.push(collectionId)
    groupsByCard.set(cardUri, groups)
  }
  if (missingCards) {
    warnings.push(`${missingCards} collection entr${missingCards === 1 ? 'y points' : 'ies point'} to cards that no longer exist.`)
  }

  const items: GraphItem[] = []
  const itemByEndpoint = new Map<string, string>()
  for (const [cardUri, groupIds] of groupsByCard) {
    const item = cardToItem(cardsByUri.get(cardUri)!, groupIds, notesByParent.get(cardUri) ?? [])
    items.push(item)
    for (const endpoint of item.endpoints) {
      if (!itemByEndpoint.has(endpoint)) itemByEndpoint.set(endpoint, item.id)
    }
  }

  const resolve = (endpoint: string) => itemByEndpoint.get(endpoint) ?? itemByEndpoint.get(normaliseUrl(endpoint))
  const links: GraphLink[] = []
  for (const rec of connections.connections) {
    const sourceId = resolve(rec.value.source)
    const targetId = resolve(rec.value.target)
    if (sourceId && targetId) links.push(connectionToLink(rec, sourceId, targetId))
  }

  const invalid = library.invalid + connections.invalid
  if (invalid) warnings.push(`${invalid} record${invalid === 1 ? '' : 's'} skipped because they do not match the Semble schema.`)

  return { items, links, warnings }
}

/** The value a new connection stores for an item: its URL when it has one (as Semble does), else its AT URI. */
export function endpointFor(item: Pick<GraphItem, 'id' | 'url'>): string {
  return item.url ?? item.id
}

export type ConnectionDraft = {
  source: Pick<GraphItem, 'id' | 'url'>
  target: Pick<GraphItem, 'id' | 'url'>
  type: string
  note?: string
}

/**
 * Builds and validates a `network.cosmik.connection` record. Throws a
 * LexValidationError if the result does not conform to the lexicon.
 */
export function buildConnectionRecord(draft: ConnectionDraft, now = new Date()): ConnectionRecord {
  const timestamp = now.toISOString() as ConnectionRecord['createdAt']
  const note = draft.note?.trim()
  const record = network.cosmik.connection.$build({
    source: endpointFor(draft.source),
    target: endpointFor(draft.target),
    connectionType: draft.type.trim().toUpperCase() || undefined,
    ...(note ? { note } : {}),
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  return network.cosmik.connection.$parse(record)
}

export function isDuplicateLink(links: readonly GraphLink[], sourceId: string, targetId: string, type: string): boolean {
  const t = type.trim().toUpperCase()
  return links.some((l) => l.sourceId === sourceId && l.targetId === targetId && (l.type ?? '').toUpperCase() === t)
}
