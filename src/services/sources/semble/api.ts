import type { Client } from '@atproto/lex-client'
import { network } from '../../../lexicons'
import { rkeyOf } from '../../atproto/aturi'
import { listAllRecords, type StoredRecord } from '../records'
import type { CollectionRecord, ConnectionRecord, SembleConnections, SembleLibrary } from './types'

export async function fetchCollections(client: Client, did: string) {
  return listAllRecords<CollectionRecord>(client, network.cosmik.collection, did)
}

/**
 * Cards are not stored inside collections: membership is a separate
 * `network.cosmik.collectionLink` record pointing at both. We read both sets
 * from the user's repo and join them client-side.
 */
export async function fetchLibrary(client: Client, did: string): Promise<SembleLibrary> {
  const [cards, links] = await Promise.all([
    listAllRecords<SembleLibrary['cards'][number]['value']>(client, network.cosmik.card, did),
    listAllRecords<SembleLibrary['links'][number]['value']>(client, network.cosmik.collectionLink, did),
  ])
  return { cards: cards.records, links: links.records, invalid: cards.invalid + links.invalid }
}

/** Connections are repo-wide, not per collection; the graph keeps those whose endpoints are visible. */
export async function fetchConnections(client: Client, did: string): Promise<SembleConnections> {
  const { records, invalid } = await listAllRecords<ConnectionRecord>(client, network.cosmik.connection, did)
  return { connections: records, invalid }
}

/** Writes a record already validated by `buildConnectionRecord`. */
export async function createConnection(client: Client, record: ConnectionRecord): Promise<StoredRecord<ConnectionRecord>> {
  const { $type: _type, ...input } = record
  const { uri, cid } = await client.create(network.cosmik.connection, input)
  return { uri, cid, value: record }
}

export async function deleteConnection(client: Client, uri: string): Promise<void> {
  await client.delete(network.cosmik.connection, { rkey: rkeyOf(uri) })
}

/** In-place update (note-only edits). `swapRecord` refuses the write if the record changed elsewhere. */
export async function updateConnection(
  client: Client,
  existing: StoredRecord<ConnectionRecord>,
  record: ConnectionRecord,
): Promise<StoredRecord<ConnectionRecord>> {
  const { $type: _type, ...input } = record
  const { uri, cid } = await client.put(network.cosmik.connection, input, {
    rkey: rkeyOf(existing.uri),
    swapRecord: existing.cid,
  })
  return { uri, cid, value: record }
}

export type ConnectionWrite =
  | { kind: 'replace'; oldUri: string; record: ConnectionRecord }
  | { kind: 'delete'; uri: string }

/** Reference PDS limit is 200 operations per applyWrites; stay well under it. */
const MAX_OPS_PER_COMMIT = 100

/**
 * Applies deletes and replacements with `com.atproto.repo.applyWrites`.
 * A replacement's delete and create always share one commit, so a
 * connection is never lost half-way. Large batches are split into several
 * commits; each commit is atomic on its own.
 *
 * Returns the new record for each replacement, in input order.
 */
export async function applyConnectionWrites(
  client: Client,
  writes: readonly ConnectionWrite[],
): Promise<Map<string, StoredRecord<ConnectionRecord>>> {
  const created = new Map<string, StoredRecord<ConnectionRecord>>()
  const chunks: ConnectionWrite[][] = [[]]
  let opsInChunk = 0
  for (const write of writes) {
    const ops = write.kind === 'replace' ? 2 : 1
    if (opsInChunk + ops > MAX_OPS_PER_COMMIT) {
      chunks.push([])
      opsInChunk = 0
    }
    chunks.at(-1)!.push(write)
    opsInChunk += ops
  }

  for (const chunk of chunks) {
    if (chunk.length === 0) continue
    const res = await client.applyWrites((op) =>
      chunk.flatMap((w) => {
        if (w.kind === 'delete') return [op.delete(network.cosmik.connection, { rkey: rkeyOf(w.uri) })]
        const { $type: _type, ...input } = w.record
        return [op.delete(network.cosmik.connection, { rkey: rkeyOf(w.oldUri) }), op.create(network.cosmik.connection, input)]
      }),
    )
    const results = res.body.results ?? []
    const replacements = chunk.filter((w) => w.kind === 'replace')
    type Result = (typeof results)[number]
    const creates = results.filter(
      (r): r is Extract<Result, { $type: 'com.atproto.repo.applyWrites#createResult' }> =>
        r.$type === 'com.atproto.repo.applyWrites#createResult',
    )
    replacements.forEach((w, i) => {
      const result = creates[i]
      if (result) created.set(w.oldUri, { uri: result.uri, cid: result.cid, value: w.record })
    })
  }
  return created
}
