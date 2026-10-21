import type { Client } from '@atproto/lex-client'
import { network } from '../../../lexicons'
import { rkeyOf } from '../../atproto/aturi'
import type { StoredRecord } from '../records'
import type { CardRecord } from './types'

export const NOTE_MAX = 10000

/**
 * The user's Semble note on a card is a NOTE card pointing at it through
 * `parentCard`. Semble's indexer applies updates to NOTE cards (unlike URL
 * cards), so editing in place keeps Semble in sync.
 */
export function buildNoteRecord(
  parent: StoredRecord<CardRecord>,
  text: string,
  existing?: CardRecord,
  now = new Date(),
): CardRecord {
  const content = { $type: 'network.cosmik.card#noteContent' as const, text: text.trim() }
  const url = parent.value.url ?? (network.cosmik.card.urlContent.isTypeOf(parent.value.content) ? parent.value.content.url : undefined)
  return network.cosmik.card.$parse(
    existing
      ? { ...existing, content }
      : network.cosmik.card.$build({
          type: 'NOTE',
          content,
          ...(url ? { url } : {}),
          parentCard: { uri: parent.uri as never, cid: parent.cid as never },
          createdAt: now.toISOString() as never,
        }),
  )
}

/** Creates the note, or rewrites it in place (refused if it changed elsewhere). */
export async function saveNote(
  client: Client,
  parent: StoredRecord<CardRecord>,
  text: string,
  existing?: StoredRecord<CardRecord>,
): Promise<StoredRecord<CardRecord>> {
  const record = buildNoteRecord(parent, text, existing?.value)
  const { $type: _type, ...input } = record
  if (existing) {
    const { uri, cid } = await client.put(network.cosmik.card, input, { rkey: rkeyOf(existing.uri), swapRecord: existing.cid })
    return { uri, cid, value: record }
  }
  const { uri, cid } = await client.create(network.cosmik.card, input)
  return { uri, cid, value: record }
}
