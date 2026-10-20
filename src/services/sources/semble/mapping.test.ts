import type { StoredRecord } from '../records'
import { styleForType, typeInfo } from './connectionTypes'
import { buildConnectionRecord, buildSembleGraph, endpointFor, isDuplicateLink, planConnectionEdit } from './mapping'
import type { CardRecord, CollectionLinkRecord, ConnectionRecord, SembleLibrary } from './types'

const CID = 'bafyreidmfvmmnzqxgkwexzt73uopc4kiycmdogbedw4ijduxobwvla6sua'
const DID = 'did:plc:testuser1234567890abcdef'
const uri = (coll: string, rkey: string) => `at://${DID}/${coll}/${rkey}`
const COLL_A = uri('network.cosmik.collection', 'colla')
const COLL_B = uri('network.cosmik.collection', 'collb')

function urlCard(rkey: string, url: string, title?: string): StoredRecord<CardRecord> {
  return {
    uri: uri('network.cosmik.card', rkey),
    cid: CID,
    value: {
      $type: 'network.cosmik.card',
      type: 'URL',
      url: url as CardRecord['url'],
      content: {
        $type: 'network.cosmik.card#urlContent',
        url: url as CardRecord['url'] & string,
        ...(title ? { metadata: { title } } : {}),
      },
    } as CardRecord,
  }
}

function noteCard(rkey: string, text: string, parent?: string): StoredRecord<CardRecord> {
  return {
    uri: uri('network.cosmik.card', rkey),
    cid: CID,
    value: {
      $type: 'network.cosmik.card',
      type: 'NOTE',
      content: { $type: 'network.cosmik.card#noteContent', text },
      ...(parent ? { parentCard: { uri: parent, cid: CID } } : {}),
    } as CardRecord,
  }
}

function link(rkey: string, collection: string, card: string): StoredRecord<CollectionLinkRecord> {
  return {
    uri: uri('network.cosmik.collectionLink', rkey),
    cid: CID,
    value: {
      $type: 'network.cosmik.collectionLink',
      collection: { uri: collection, cid: CID },
      card: { uri: card, cid: CID },
      addedBy: DID,
      addedAt: '2026-01-01T00:00:00.000Z',
    } as CollectionLinkRecord,
  }
}

function connection(rkey: string, source: string, target: string, type?: string): StoredRecord<ConnectionRecord> {
  return {
    uri: uri('network.cosmik.connection', rkey),
    cid: CID,
    value: { $type: 'network.cosmik.connection', source, target, ...(type ? { connectionType: type } : {}) },
  }
}

const a = urlCard('a', 'https://example.com/a', 'Article A')
const b = urlCard('b', 'https://www.Example.org/b/')
const c = urlCard('c', 'https://elsewhere.net/c')
const noteOnA = noteCard('n1', 'My thoughts on A', a.uri)
const standaloneNote = noteCard('n2', 'A loose idea\nwith more lines')

const library: SembleLibrary = {
  cards: [a, b, c, noteOnA, standaloneNote],
  links: [
    link('l1', COLL_A, a.uri),
    link('l2', COLL_A, b.uri),
    link('l3', COLL_B, b.uri),
    link('l4', COLL_B, c.uri),
    link('l5', COLL_A, standaloneNote.uri),
    link('l6', COLL_A, uri('network.cosmik.card', 'deleted')),
  ],
  invalid: 0,
}

describe('buildSembleGraph', () => {
  const connections = {
    invalid: 1,
    connections: [
      connection('k1', 'https://example.com/a', 'https://www.example.org/b', 'SUPPORTS'), // URL endpoints, normalised
      connection('k2', b.uri, standaloneNote.uri, 'MYSTERY'), // AT URI endpoints, unknown type
      connection('k3', 'https://example.com/a', 'https://elsewhere.net/c'), // c not selected
      connection('k4', 'https://unrelated.example', 'https://example.com/a'),
    ],
  }

  it('includes cards linked to the selected collections as regular items', () => {
    const graph = buildSembleGraph([COLL_A], library, connections)
    const regular = graph.items.filter((i) => !i.external).map((i) => i.id)
    expect(regular.sort()).toEqual([a.uri, b.uri, standaloneNote.uri].sort())
  })

  it('records every selected collection a card belongs to', () => {
    const graph = buildSembleGraph([COLL_A, COLL_B], library, connections)
    expect(graph.items.find((i) => i.id === b.uri)?.groupIds.sort()).toEqual([COLL_A, COLL_B].sort())
  })

  it('folds note cards into their parent and keeps standalone notes as items', () => {
    const graph = buildSembleGraph([COLL_A], library, connections)
    const itemA = graph.items.find((i) => i.id === a.uri)!
    expect(itemA.notes).toEqual(['My thoughts on A'])
    expect(itemA.title).toBe('Article A')
    const note = graph.items.find((i) => i.id === standaloneNote.uri)!
    expect(note.kind).toBe('NOTE')
    expect(note.title).toBe('A loose idea')
  })

  it('falls back to a cleaned URL when there is no title', () => {
    const graph = buildSembleGraph([COLL_A], library, connections)
    expect(graph.items.find((i) => i.id === b.uri)?.title).toBe('example.org/b')
    expect(graph.items.find((i) => i.id === b.uri)?.domain).toBe('example.org')
  })

  it('resolves connection endpoints by URL or AT URI', () => {
    const graph = buildSembleGraph([COLL_A], library, connections)
    expect(graph.links.slice(0, 2).map((l) => [l.sourceId, l.targetId, l.type])).toEqual([
      [a.uri, b.uri, 'SUPPORTS'],
      [b.uri, standaloneNote.uri, 'MYSTERY'],
    ])
  })

  it('turns off-selection endpoints into external items', () => {
    const graph = buildSembleGraph([COLL_A], library, connections)
    // k3: a → c, where c is in the library but only in COLL_B
    const toC = graph.links.find((l) => l.id.endsWith('/k3'))!
    expect(toC.targetId).toBe(c.uri)
    const itemC = graph.items.find((i) => i.id === c.uri)!
    expect(itemC.external?.label).toMatch(/not in the selected collections/)
    expect(itemC.groupIds).toEqual([])
    // k4: a bare URL that is not a card at all
    const fromUrl = graph.links.find((l) => l.id.endsWith('/k4'))!
    expect(fromUrl.sourceId).toBe('url:https://unrelated.example')
    expect(graph.items.find((i) => i.id === fromUrl.sourceId)).toMatchObject({
      title: 'unrelated.example',
      external: { label: expect.stringMatching(/not saved/) },
    })
  })

  it('ignores connections that do not touch the selection and shares external items', () => {
    const extra = {
      invalid: 0,
      connections: [
        connection('x1', 'https://far.example/1', 'https://far.example/2'),
        connection('x2', 'https://example.com/a', 'at://did:plc:someoneelse/network.cosmik.card/zz'),
        connection('x3', 'https://www.example.org/b', 'at://did:plc:someoneelse/network.cosmik.card/zz'),
      ],
    }
    const graph = buildSembleGraph([COLL_A], library, extra)
    expect(graph.links.map((l) => l.id.split('/').pop())).toEqual(['x2', 'x3'])
    const externals = graph.items.filter((i) => i.external)
    expect(externals).toHaveLength(1)
    expect(externals[0]!.external?.label).toMatch(/outside your library/)
  })

  it('reports missing cards and invalid records as warnings', () => {
    const graph = buildSembleGraph([COLL_A], library, connections)
    expect(graph.warnings).toHaveLength(2)
    expect(graph.warnings[0]).toMatch(/1 collection entry points to cards that no longer exist/)
    expect(graph.warnings[1]).toMatch(/1 record skipped/)
  })
})

describe('buildConnectionRecord', () => {
  const now = new Date('2026-10-20T12:00:00.000Z')

  it('builds a valid record using URLs as endpoints, like Semble', () => {
    const record = buildConnectionRecord(
      { source: { id: a.uri, url: 'https://example.com/a' }, target: { id: b.uri, url: 'https://example.org/b' }, type: 'supports', note: '  why  ' },
      now,
    )
    expect(record).toEqual({
      $type: 'network.cosmik.connection',
      source: 'https://example.com/a',
      target: 'https://example.org/b',
      connectionType: 'SUPPORTS',
      note: 'why',
      createdAt: '2026-10-20T12:00:00.000Z',
      updatedAt: '2026-10-20T12:00:00.000Z',
    })
  })

  it('falls back to the AT URI for cards without a URL and omits empty notes', () => {
    const record = buildConnectionRecord({ source: { id: a.uri }, target: { id: b.uri }, type: 'RELATED', note: '   ' }, now)
    expect(record.source).toBe(a.uri)
    expect(record).not.toHaveProperty('note')
  })

  it('rejects records that violate the lexicon', () => {
    expect(() =>
      buildConnectionRecord({ source: { id: a.uri }, target: { id: b.uri }, type: 'RELATED', note: 'x'.repeat(1001) }, now),
    ).toThrow()
  })

  it('endpointFor prefers URL', () => {
    expect(endpointFor({ id: 'at://x', url: 'https://y' })).toBe('https://y')
    expect(endpointFor({ id: 'at://x' })).toBe('at://x')
  })
})

describe('connection types', () => {
  it('styles known types case-insensitively', () => {
    expect(typeInfo('supports')?.value).toBe('SUPPORTS')
    expect(styleForType('LEADS_TO')).toMatchObject({ known: true, label: 'Leads to' })
  })

  it('renders unknown and missing types with a neutral dashed style and their raw value', () => {
    expect(styleForType('CONTRADICTS')).toMatchObject({ known: false, label: 'CONTRADICTS', colour: '#94a3b8', dash: '4 4' })
    expect(styleForType(undefined)).toMatchObject({ known: false, label: 'Untyped' })
  })

  it('detects duplicates by direction and type', () => {
    const links = [{ id: '1', sourceId: 'a', targetId: 'b', type: 'SUPPORTS' }]
    expect(isDuplicateLink(links, 'a', 'b', 'supports')).toBe(true)
    expect(isDuplicateLink(links, 'b', 'a', 'SUPPORTS')).toBe(false)
    expect(isDuplicateLink(links, 'a', 'b', 'OPPOSES')).toBe(false)
  })
})

describe('planConnectionEdit', () => {
  const existing: ConnectionRecord = {
    $type: 'network.cosmik.connection',
    source: 'https://a.example',
    target: 'https://b.example',
    connectionType: 'SUPPORTS',
    note: 'old note',
    createdAt: '2026-01-01T00:00:00.000Z' as ConnectionRecord['createdAt'],
  }
  const now = new Date('2026-10-20T12:00:00.000Z')

  it('is a no-op when nothing meaningful changes', () => {
    expect(planConnectionEdit(existing, { type: 'supports', note: ' old note ' }, now)).toEqual({ kind: 'noop' })
  })

  it('updates in place when only the note changes, keeping createdAt', () => {
    const plan = planConnectionEdit(existing, { note: 'new note' }, now)
    expect(plan.kind).toBe('update')
    expect(plan.kind !== 'noop' && plan.record).toMatchObject({
      note: 'new note',
      connectionType: 'SUPPORTS',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-10-20T12:00:00.000Z',
    })
  })

  it('removes an emptied note', () => {
    const plan = planConnectionEdit(existing, { note: '  ' }, now)
    expect(plan.kind === 'update' && plan.record).not.toHaveProperty('note')
  })

  it('replaces when the type changes (Semble ignores type changes in updates)', () => {
    const plan = planConnectionEdit(existing, { type: 'opposes', note: 'changed too' }, now)
    expect(plan).toMatchObject({ kind: 'replace', record: { connectionType: 'OPPOSES', note: 'changed too' } })
  })

  it('replaces when reversed or re-pointed', () => {
    expect(planConnectionEdit(existing, { source: existing.target, target: existing.source }, now)).toMatchObject({
      kind: 'replace',
      record: { source: 'https://b.example', target: 'https://a.example' },
    })
    expect(planConnectionEdit(existing, { target: 'https://c.example' }, now).kind).toBe('replace')
  })

  it('validates the new record', () => {
    expect(() => planConnectionEdit(existing, { note: 'x'.repeat(1001) }, now)).toThrow()
  })
})
