import { TEST_CID } from '../../../test/fakePds'
import { C, seedCollection, seedLink, seedUrlCard } from '../../../test/fixtures'
import { signedInFakePds } from '../../../test/withAuth'
import { createConnection, deleteConnection, fetchCollections, fetchConnections, fetchLibrary } from './api'
import { buildConnectionRecord } from './mapping'

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
