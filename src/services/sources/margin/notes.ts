import type { Client } from '@atproto/lex-client'
import { config } from '../../../config'
import type { Annotation } from '../../../graph/model'
import { at } from '../../../lexicons'
import { listAllRecords, type StoredRecord } from '../records'
import { normaliseUrl } from '../url'

export type MarginNoteRecord = at.margin.note.Main

/**
 * Margin notes are `at.margin.note` records (W3C Web Annotation model).
 * Beta scope: the signed-in user's own notes only, read from their repo.
 * Reading other people's notes needs Margin's AppView and is out of scope.
 */
export async function fetchMarginNotes(client: Client, did: string) {
  return listAllRecords<MarginNoteRecord>(client, at.margin.note, did)
}

export function noteToAnnotation(rec: StoredRecord<MarginNoteRecord>): Annotation {
  return {
    id: rec.uri,
    url: rec.value.target.source,
    text: rec.value.body?.value ?? '',
    motivation: String(rec.value.motivation),
    createdAt: rec.value.createdAt,
    pending: rec.pending,
  }
}

/** Groups annotations by normalised target URL. */
export function indexAnnotationsByUrl(notes: readonly Annotation[]): Map<string, Annotation[]> {
  const map = new Map<string, Annotation[]>()
  for (const note of notes) {
    const key = normaliseUrl(note.url)
    map.set(key, [...(map.get(key) ?? []), note])
  }
  return map
}

export type MarginNoteDraft = { url: string; title?: string; text: string }

/** Builds and validates a basic commenting note. Throws LexValidationError if invalid. */
export function buildMarginNoteRecord(draft: MarginNoteDraft, now = new Date()): MarginNoteRecord {
  const text = draft.text.trim()
  const title = draft.title?.trim().slice(0, 500)
  const record = at.margin.note.$build({
    motivation: 'commenting',
    target: { source: draft.url as MarginNoteRecord['target']['source'], ...(title ? { title } : {}) },
    body: { value: text, format: 'text/plain' },
    generator: { name: config.appName },
    createdAt: now.toISOString() as MarginNoteRecord['createdAt'],
  })
  return at.margin.note.$parse(record)
}

export async function createMarginNote(client: Client, record: MarginNoteRecord): Promise<StoredRecord<MarginNoteRecord>> {
  const { $type: _type, ...input } = record
  const { uri, cid } = await client.create(at.margin.note, input)
  return { uri, cid, value: record }
}
