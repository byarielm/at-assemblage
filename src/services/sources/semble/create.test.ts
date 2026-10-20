import { TEST_CID } from '../../../test/fakePds'
import { C, seedCollection, seedLink, seedUrlCard } from '../../../test/fixtures'
import { signedInFakePds } from '../../../test/withAuth'
import { fetchCollections, fetchLibrary } from './api'
import { buildSembleGraph } from './mapping'
import { buildCollectionRecord, commitNewCard, createCollection, planNewCard } from './create'

const now = new Date('2026-10-20T12:00:00.000Z')

async function setup() {
  const { pds, auth } = await signedInFakePds()
  const collA = seedCollection(pds, 'A')
  const collB = seedCollection(pds, 'B')
  const { records } = await fetchCollections(auth.client, auth.did)
  const byUri = new Map(records.map((r) => [r.uri, r]))
  return { pds, auth, a: byUri.get(collA)!, b: byUri.get(collB)! }
}

describe('planNewCard', () => {
  it('plans a URL card, note and links like Semble writes them', async () => {
    const { auth, a, b } = await setup()
    const library = await fetchLibrary(auth.client, auth.did)
    const plan = await planNewCard(
      auth.did,
      { url: 'https://example.com/a', title: 'Example', note: 'Worth reading', collections: [a, b] },
      library,
      now,
    )
    expect(plan.existing).toBe(false)
    expect(plan.card?.value).toEqual({
      $type: 'network.cosmik.card',
      type: 'URL',
      content: {
        $type: 'network.cosmik.card#urlContent',
        url: 'https://example.com/a',
        metadata: { title: 'Example', retrievedAt: '2026-10-20T12:00:00.000Z' },
      },
      createdAt: '2026-10-20T12:00:00.000Z',
    })
    expect(plan.note?.value).toMatchObject({
      type: 'NOTE',
      url: 'https://example.com/a',
      parentCard: { uri: plan.card!.uri, cid: plan.card!.cid },
      content: { text: 'Worth reading' },
    })
    expect(plan.links.map((l) => l.value.collection.uri)).toEqual([a.uri, b.uri])
    expect(plan.links.every((l) => l.value.card.uri === plan.card!.uri && l.value.card.cid === plan.card!.cid)).toBe(true)
  })

  it('rejects anything that is not an http(s) URL', async () => {
    const { auth } = await setup()
    const library = await fetchLibrary(auth.client, auth.did)
    await expect(planNewCard(auth.did, { url: 'example.com', collections: [] }, library)).rejects.toThrow(/https/)
  })

  it('reuses an existing card for the same URL, links only missing collections and keeps one note', async () => {
    const { pds, auth, a, b } = await setup()
    const existing = seedUrlCard(pds, 'https://example.com/a/')
    seedLink(pds, a.uri, existing, TEST_CID)
    pds.putRecord(C.card, {
      type: 'NOTE',
      content: { $type: 'network.cosmik.card#noteContent', text: 'old' },
      parentCard: { uri: existing, cid: TEST_CID },
    })
    const library = await fetchLibrary(auth.client, auth.did)
    const plan = await planNewCard(auth.did, { url: 'https://EXAMPLE.com/a#top', note: 'new', collections: [a, b] }, library)
    expect(plan.existing).toBe(true)
    expect(plan.card).toBeUndefined()
    expect(plan.cardRef.uri).toBe(existing)
    expect(plan.note).toBeUndefined()
    expect(plan.noteSkipped).toBe(true)
    expect(plan.links.map((l) => l.value.collection.uri)).toEqual([b.uri])
  })
})

describe('commitNewCard', () => {
  it('writes everything in one commit, and the locally computed CIDs match the PDS', async () => {
    const { pds, auth, a } = await setup()
    const library = await fetchLibrary(auth.client, auth.did)
    const plan = await planNewCard(
      auth.did,
      { url: 'https://example.com/new', title: 'New', note: 'n', collections: [a] },
      library,
    )
    const saved = await commitNewCard(auth.client, plan)
    expect(pds.count('com.atproto.repo.applyWrites')).toBe(1)
    expect(pds.lastApplyWrites).toBe(3)
    // The PDS hashed what it received; strong refs inside the note and link stay valid.
    expect(saved.card!.cid).toBe(plan.card!.cid)
    expect(saved.note!.cid).toBe(plan.note!.cid)
    expect(saved.links[0]!.cid).toBe(plan.links[0]!.cid)

    const after = await fetchLibrary(auth.client, auth.did)
    const graph = buildSembleGraph([a.uri], after, { connections: [], invalid: 0 })
    expect(graph.items).toHaveLength(1)
    expect(graph.items[0]).toMatchObject({ id: saved.card!.uri, title: 'New', notes: ['n'] })
  })

  it('writes nothing when there is nothing new', async () => {
    const { pds, auth, a } = await setup()
    const existing = seedUrlCard(pds, 'https://example.com/x')
    seedLink(pds, a.uri, existing, TEST_CID)
    const library = await fetchLibrary(auth.client, auth.did)
    await commitNewCard(auth.client, await planNewCard(auth.did, { url: 'https://example.com/x', collections: [a] }, library))
    expect(pds.count('com.atproto.repo.applyWrites')).toBe(0)
  })
})

describe('collections', () => {
  it('builds and creates a valid collection record', async () => {
    const { auth } = await setup()
    const record = buildCollectionRecord({ name: '  Reading  ', description: ' ', accessType: 'OPEN' }, now)
    expect(record).toEqual({
      $type: 'network.cosmik.collection',
      name: 'Reading',
      accessType: 'OPEN',
      createdAt: '2026-10-20T12:00:00.000Z',
      updatedAt: '2026-10-20T12:00:00.000Z',
    })
    const saved = await createCollection(auth.client, record)
    const { records } = await fetchCollections(auth.client, auth.did)
    expect(records.map((r) => r.uri)).toContain(saved.uri)
  })

  it('enforces the lexicon limits', () => {
    expect(() => buildCollectionRecord({ name: 'x'.repeat(101), accessType: 'CLOSED' })).toThrow()
  })
})
