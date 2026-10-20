import type { Client } from '@atproto/lex-client'

export type StoredRecord<V> = {
  uri: string
  cid: string
  value: V
  /** Set on optimistic cache entries until the PDS confirms the write. */
  pending?: boolean
}

export type ListResult<V> = { records: StoredRecord<V>[]; invalid: number }

type ListableNs = Parameters<Client['listAll']>[0]

/**
 * Reads every record of one collection from the signed-in user's repo,
 * following cursors. Records that fail lexicon validation are counted, not
 * returned, so the UI never handles untyped data.
 */
export async function listAllRecords<V>(client: Client, ns: ListableNs, repo: string): Promise<ListResult<V>> {
  const records: StoredRecord<V>[] = []
  let invalid = 0
  for await (const item of client.listAll(ns, { repo: repo as never, limit: 100 })) {
    if (item.valid) records.push({ uri: item.uri, cid: item.cid, value: item.value as V })
    else invalid++
  }
  return { records, invalid }
}
