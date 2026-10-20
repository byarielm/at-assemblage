import { TID } from '@atproto/common-web'
import { cidForLex } from '@atproto/lex-cbor'
import type { Client } from '@atproto/lex-client'
import { network } from '../../../lexicons'
import { isHttpUrl, normaliseUrl } from '../url'
import type { StoredRecord } from '../records'
import type { CardRecord, CollectionLinkRecord, CollectionRecord, SembleLibrary } from './types'

const NS = {
  card: 'network.cosmik.card',
  collectionLink: 'network.cosmik.collectionLink',
} as const

/** A record to be created with a known rkey, so its URI and CID exist before the commit. */
export type PlannedRecord<V> = StoredRecord<V> & { rkey: string }

export type NewCardInput = {
  url: string
  title?: string
  description?: string
  imageUrl?: string
  note?: string
  collections: readonly StoredRecord<CollectionRecord>[]
}

export type NewCardPlan = {
  /** The new URL card, or undefined when the URL is already in the library. */
  card?: PlannedRecord<CardRecord>
  /** The card that ends up holding the URL (new or existing). */
  cardRef: { uri: string; cid: string }
  existing: boolean
  note?: PlannedRecord<CardRecord>
  /** Semble keeps one note per URL; a second one is not written. */
  noteSkipped: boolean
  links: PlannedRecord<CollectionLinkRecord>[]
}

const recordCid = async (value: object) => (await cidForLex(value as never)).toString()

const isoNow = (now: Date) => now.toISOString() as NonNullable<CardRecord['createdAt']>

/**
 * Plans every record for "add a URL", mirroring what Semble writes:
 * a URL card (metadata inside `content`), an optional NOTE card pointing at
 * it via `parentCard`, and one `collectionLink` per chosen collection.
 *
 * Record keys are TIDs chosen here and CIDs are computed locally, so the
 * note and links can reference the new card by strong ref and everything
 * can be written in a single atomic commit.
 */
export async function planNewCard(
  did: string,
  input: NewCardInput,
  library: SembleLibrary,
  now = new Date(),
  nextTid: () => string = () => TID.nextStr(),
): Promise<NewCardPlan> {
  const url = input.url.trim()
  if (!isHttpUrl(url)) throw new Error('Enter a full web address starting with https://')
  const key = normaliseUrl(url)
  const timestamp = isoNow(now)

  const existingCard = library.cards.find((c) => {
    if (c.value.parentCard || c.value.type !== 'URL') return false
    const content = network.cosmik.card.urlContent.isTypeOf(c.value.content) ? c.value.content : undefined
    const cardUrl = c.value.url ?? content?.url
    return !!cardUrl && normaliseUrl(cardUrl) === key
  })

  let card: PlannedRecord<CardRecord> | undefined
  let cardRef: { uri: string; cid: string }
  if (existingCard) {
    cardRef = { uri: existingCard.uri, cid: existingCard.cid }
  } else {
    const title = input.title?.trim()
    const description = input.description?.trim()
    const imageUrl = input.imageUrl && isHttpUrl(input.imageUrl) ? input.imageUrl : undefined
    const metadata = title || description || imageUrl
      ? {
          ...(title ? { title } : {}),
          ...(description ? { description } : {}),
          ...(imageUrl ? { imageUrl: imageUrl as never } : {}),
          retrievedAt: timestamp,
        }
      : undefined
    const value = network.cosmik.card.$parse(
      network.cosmik.card.$build({
        type: 'URL',
        content: { $type: 'network.cosmik.card#urlContent', url: url as never, ...(metadata ? { metadata } : {}) },
        createdAt: timestamp,
      }),
    )
    const rkey = nextTid()
    card = { rkey, uri: `at://${did}/${NS.card}/${rkey}`, cid: await recordCid(value), value }
    cardRef = { uri: card.uri, cid: card.cid }
  }

  const noteText = input.note?.trim()
  const hasNote = !!existingCard && library.cards.some((c) => c.value.parentCard?.uri === existingCard.uri)
  let note: PlannedRecord<CardRecord> | undefined
  if (noteText && !hasNote) {
    const value = network.cosmik.card.$parse(
      network.cosmik.card.$build({
        type: 'NOTE',
        content: { $type: 'network.cosmik.card#noteContent', text: noteText },
        url: url as never,
        parentCard: cardRef as never,
        createdAt: timestamp,
      }),
    )
    const rkey = nextTid()
    note = { rkey, uri: `at://${did}/${NS.card}/${rkey}`, cid: await recordCid(value), value }
  }

  const linked = new Set<string>(
    library.links.filter((l) => l.value.card.uri === cardRef.uri).map((l) => l.value.collection.uri),
  )
  const links: PlannedRecord<CollectionLinkRecord>[] = []
  for (const collection of input.collections) {
    if (linked.has(collection.uri)) continue
    const value = network.cosmik.collectionLink.$parse(
      network.cosmik.collectionLink.$build({
        collection: { uri: collection.uri as never, cid: collection.cid as never },
        card: cardRef as never,
        addedBy: did as never,
        addedAt: timestamp,
        createdAt: timestamp,
      }),
    )
    const rkey = nextTid()
    links.push({ rkey, uri: `at://${did}/${NS.collectionLink}/${rkey}`, cid: await recordCid(value), value })
  }

  return { card, cardRef, existing: !!existingCard, note, noteSkipped: !!noteText && hasNote, links }
}

/**
 * Writes a plan in one `applyWrites` commit (all or nothing). The PDS's CIDs
 * replace our computed ones in the returned records.
 */
export async function commitNewCard(client: Client, plan: NewCardPlan): Promise<NewCardPlan> {
  const cards = [plan.card, plan.note].filter((r): r is PlannedRecord<CardRecord> => !!r)
  if (cards.length === 0 && plan.links.length === 0) return plan
  const res = await client.applyWrites((op) => [
    ...cards.map((c) => {
      const { $type: _type, ...value } = c.value
      return op.create(network.cosmik.card, value, { rkey: c.rkey })
    }),
    ...plan.links.map((l) => {
      const { $type: _type, ...value } = l.value
      return op.create(network.cosmik.collectionLink, value, { rkey: l.rkey })
    }),
  ])
  const cids = new Map<string, string>()
  for (const r of res.body.results ?? []) {
    if (r.$type === 'com.atproto.repo.applyWrites#createResult') cids.set(r.uri, r.cid)
  }
  const confirm = <V>(r: PlannedRecord<V>): PlannedRecord<V> => ({ ...r, cid: cids.get(r.uri) ?? r.cid })
  return {
    ...plan,
    card: plan.card && confirm(plan.card),
    note: plan.note && confirm(plan.note),
    links: plan.links.map(confirm),
  }
}

export type NewCollectionInput = { name: string; description?: string; accessType: 'CLOSED' | 'OPEN' }

export function buildCollectionRecord(input: NewCollectionInput, now = new Date()): CollectionRecord {
  const description = input.description?.trim()
  const timestamp = isoNow(now)
  return network.cosmik.collection.$parse(
    network.cosmik.collection.$build({
      name: input.name.trim(),
      ...(description ? { description } : {}),
      accessType: input.accessType,
      createdAt: timestamp,
      updatedAt: timestamp,
    }),
  )
}

export async function createCollection(client: Client, record: CollectionRecord): Promise<StoredRecord<CollectionRecord>> {
  const { $type: _type, ...input } = record
  const { uri, cid } = await client.create(network.cosmik.collection, input)
  return { uri, cid, value: record }
}
