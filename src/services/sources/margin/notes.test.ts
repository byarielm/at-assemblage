import { signedInFakePds } from '../../../test/withAuth'
import { buildMarginNoteRecord, createMarginNote, fetchMarginNotes, indexAnnotationsByUrl, noteToAnnotation } from './notes'

describe('Margin notes', () => {
  it('builds a valid commenting note', () => {
    const record = buildMarginNoteRecord({ url: 'https://example.com/a', title: 'A', text: '  Hello  ' }, new Date('2026-10-20T00:00:00Z'))
    expect(record).toMatchObject({
      $type: 'at.margin.note',
      motivation: 'commenting',
      target: { source: 'https://example.com/a', title: 'A' },
      body: { value: 'Hello', format: 'text/plain' },
      createdAt: '2026-10-20T00:00:00.000Z',
    })
  })

  it('rejects an invalid target URL', () => {
    expect(() => buildMarginNoteRecord({ url: 'not a url', text: 'x' })).toThrow()
  })

  it('round-trips through the PDS and groups by normalised URL', async () => {
    const { auth } = await signedInFakePds()
    await createMarginNote(auth.client, buildMarginNoteRecord({ url: 'https://Example.com/a#x', text: 'one' }))
    await createMarginNote(auth.client, buildMarginNoteRecord({ url: 'https://example.com/a', text: 'two' }))
    const { records } = await fetchMarginNotes(auth.client, auth.did)
    const index = indexAnnotationsByUrl(records.map(noteToAnnotation))
    expect(index.get('https://example.com/a')?.map((a) => a.text)).toEqual(['one', 'two'])
  })
})
