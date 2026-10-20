import { TEST_CID } from '../../../test/fakePds'
import { C, seedCollection, seedLink, seedUrlCard } from '../../../test/fixtures'
import { signedInFakePds } from '../../../test/withAuth'
import {
  applyConnectionWrites,
  createConnection,
  deleteConnection,
  fetchCollections,
  fetchConnections,
  fetchLibrary,
  updateConnection,
} from './api'
import { buildConnectionRecord, planConnectionEdit } from './mapping'

describe('Semble API against a PDS', () => {
  it('follows cursors to load every page', async () => {
    const { pds, auth } = await signedInFakePds()
    const coll = seedCollection(pds, 'Big')
    for (let i = 0; i < 250; i++) seedLink(pds, coll, seedUrlCard(pds, `https://example.com/${i}`), TEST_CID)

    const library = await fetchLibrary(auth.client, auth.did)
    expect(library.cards).toHaveLength(250)
    expect(library.links).toHaveLength(250)
    // 3 pages each for cards and links at limit=100
    expect(pds.count('com.atproto.repo.listRecords')).toBe(6)
  })

  it('counts records that fail schema validation instead of returning them', async () => {
    const { pds, auth } = await signedInFakePds()
    seedCollection(pds, 'Good')
    pds.putRecord(C.collection, { description: 'missing required name and accessType' })
    const result = await fetchCollections(auth.client, auth.did)
    expect(result.records.map((r) => r.value.name)).toEqual(['Good'])
    expect(result.invalid).toBe(1)
  })

  it('creates and deletes connection records in the user repo', async () => {
    const { pds, auth } = await signedInFakePds()
    const record = buildConnectionRecord({
      source: { id: 'at://x/y/z', url: 'https://a.example' },
      target: { id: 'at://x/y/w', url: 'https://b.example' },
      type: 'LEADS_TO',
    })
    const saved = await createConnection(auth.client, record)
    expect(saved.uri).toMatch(new RegExp(`^at://${pds.account.did}/network.cosmik.connection/`))

    const listed = await fetchConnections(auth.client, auth.did)
    expect(listed.connections[0]?.value).toMatchObject({ source: 'https://a.example', connectionType: 'LEADS_TO' })

    await deleteConnection(auth.client, saved.uri)
    expect((await fetchConnections(auth.client, auth.did)).connections).toHaveLength(0)
  })
})

describe('editing connections', () => {
  async function seeded(count = 1) {
    const { pds, auth } = await signedInFakePds()
    for (let i = 0; i < count; i++) {
      await createConnection(
        auth.client,
        buildConnectionRecord({ source: { id: 's', url: `https://a.example/${i}` }, target: { id: 't', url: 'https://b.example' }, type: 'SUPPORTS' }),
      )
    }
    const { connections } = await fetchConnections(auth.client, auth.did)
    return { pds, auth, connections }
  }

  it('updates a note in place, keeping the AT URI', async () => {
    const { auth, connections } = await seeded()
    const stored = connections[0]!
    const plan = planConnectionEdit(stored.value, { note: 'Added later' })
    const saved = await updateConnection(auth.client, stored, plan.kind === 'update' ? plan.record : stored.value)
    expect(saved.uri).toBe(stored.uri)
    const after = await fetchConnections(auth.client, auth.did)
    expect(after.connections[0]?.value.note).toBe('Added later')
  })

  it('refuses an in-place update if the record changed elsewhere', async () => {
    const { pds, auth, connections } = await seeded()
    const stored = connections[0]!
    pds.touch(stored.uri)
    await expect(updateConnection(auth.client, stored, { ...stored.value, note: 'x' })).rejects.toMatchObject({ error: 'InvalidSwap' })
  })

  it('replaces atomically: one commit, new URI, old record gone', async () => {
    const { pds, auth, connections } = await seeded()
    const stored = connections[0]!
    const plan = planConnectionEdit(stored.value, { type: 'OPPOSES' })
    const created = await applyConnectionWrites(auth.client, [{ kind: 'replace', oldUri: stored.uri, record: plan.kind === 'replace' ? plan.record : stored.value }])
    const saved = created.get(stored.uri)!
    expect(saved.uri).not.toBe(stored.uri)
    expect(pds.count('com.atproto.repo.applyWrites')).toBe(1)
    const after = await fetchConnections(auth.client, auth.did)
    expect(after.connections.map((c) => [c.uri, c.value.connectionType])).toEqual([[saved.uri, 'OPPOSES']])
  })

  it('splits large batches into commits that keep each replacement together', async () => {
    const { pds, auth, connections } = await seeded(120)
    const writes = connections.map((c) => ({ kind: 'replace' as const, oldUri: c.uri, record: { ...c.value, connectionType: 'RELATED' } }))
    const created = await applyConnectionWrites(auth.client, writes)
    expect(created.size).toBe(120)
    // 240 operations → 3 commits of at most 100 (an even number, so no pair is split)
    expect(pds.count('com.atproto.repo.applyWrites')).toBe(3)
    const after = await fetchConnections(auth.client, auth.did)
    expect(after.connections).toHaveLength(120)
    expect(after.connections.every((c) => c.value.connectionType === 'RELATED')).toBe(true)
  })

  it('bulk deletes', async () => {
    const { auth, connections } = await seeded(3)
    await applyConnectionWrites(auth.client, connections.slice(0, 2).map((c) => ({ kind: 'delete' as const, uri: c.uri })))
    expect((await fetchConnections(auth.client, auth.did)).connections).toHaveLength(1)
  })
})
