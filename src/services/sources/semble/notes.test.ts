import { C, seedUrlCard } from '../../../test/fixtures'
import { signedInFakePds } from '../../../test/withAuth'
import { fetchLibrary } from './api'
import { buildSembleGraph } from './mapping'
import { saveNote } from './notes'

describe('Semble notes', () => {
  it('creates a NOTE card linked to the card, then edits it in place', async () => {
    const { pds, auth } = await signedInFakePds()
    const collection = pds.putRecord(C.collection, { name: 'A', accessType: 'CLOSED' })
    const cardUri = seedUrlCard(pds, 'https://example.com/a', 'A')
    let library = await fetchLibrary(auth.client, auth.did)
    const parent = library.cards.find((c) => c.uri === cardUri)!
    pds.putRecord(C.link, { collection: { uri: collection, cid: parent.cid }, card: { uri: cardUri, cid: parent.cid }, addedBy: auth.did, addedAt: '2026-01-01T00:00:00.000Z' })

    const created = await saveNote(auth.client, parent, '  First thought  ')
    expect(created.value).toMatchObject({ type: 'NOTE', url: 'https://example.com/a', parentCard: { uri: cardUri }, content: { text: 'First thought' } })

    library = await fetchLibrary(auth.client, auth.did)
    const stored = library.cards.find((c) => c.uri === created.uri)!
    const edited = await saveNote(auth.client, parent, 'Second thought', stored)
    expect(edited.uri).toBe(created.uri)
    expect(pds.count('com.atproto.repo.putRecord')).toBe(1)

    library = await fetchLibrary(auth.client, auth.did)
    const graph = buildSembleGraph([collection], library, { connections: [], invalid: 0 })
    expect(graph.items.find((i) => i.id === cardUri)?.notes).toEqual(['Second thought'])
  })

  it('refuses to overwrite a note changed elsewhere', async () => {
    const { pds, auth } = await signedInFakePds()
    const cardUri = seedUrlCard(pds, 'https://example.com/b')
    const parent = (await fetchLibrary(auth.client, auth.did)).cards.find((c) => c.uri === cardUri)!
    const created = await saveNote(auth.client, parent, 'x')
    const stored = (await fetchLibrary(auth.client, auth.did)).cards.find((c) => c.uri === created.uri)!
    pds.touch(created.uri)
    await expect(saveNote(auth.client, parent, 'y', stored)).rejects.toMatchObject({ error: 'InvalidSwap' })
  })
})
