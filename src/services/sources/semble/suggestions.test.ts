import type { SembleConnectionView, SembleUrlView } from './appview'
import { buildSuggestions, connectionKey, type SuggestionContext } from './suggestions'

const ME = 'did:plc:me'
const view = (url: string, title?: string, count = 1): SembleUrlView => ({ url, metadata: { url, title }, urlLibraryCount: count })
const user = (id: string, handle = `${id.split(':').pop()}.test`) => ({ id, handle, name: handle })
const conn = (id: string, source: string, target: string, curator: string, type?: string, note?: string): SembleConnectionView => ({
  connection: { id, type, note, curator: user(curator) },
  source: view(source, `T ${source}`),
  target: view(target, `T ${target}`, 5),
})

const CARD = 'https://acme.com/'
const ctx = (over: Partial<SuggestionContext> = {}): SuggestionContext => ({
  url: CARD,
  did: ME,
  myCards: new Map(),
  myConnectionKeys: new Set(),
  ...over,
})

describe('buildSuggestions', () => {
  it('turns other people’s connections into directional suggestions and skips my own', () => {
    const { connected } = buildSuggestions(
      ctx(),
      [
        conn('1', 'https://acme.com', 'https://wb.com/roadrunner', 'did:plc:alice', 'supports', 'Same cartoon'),
        conn('2', 'https://youtube.com/tnt', 'https://www.acme.com/', 'did:plc:bob', 'EXPLAINER'),
        conn('3', 'https://acme.com', 'https://mine.example', ME, 'RELATED'),
      ],
      [],
    )
    expect(connected.map((s) => [s.url, s.reason.kind === 'connected' && [s.reason.direction, s.reason.type, s.reason.note]])).toEqual([
      ['https://wb.com/roadrunner', ['outgoing', 'SUPPORTS', 'Same cartoon']],
      ['https://youtube.com/tnt', ['incoming', 'EXPLAINER', undefined]],
    ])
  })

  it('merges curators of the same connection and ranks by how many people made it', () => {
    const { connected } = buildSuggestions(
      ctx(),
      [
        conn('1', CARD, 'https://a.example', 'did:plc:alice', 'RELATED'),
        conn('2', CARD, 'https://b.example', 'did:plc:alice', 'RELATED'),
        conn('3', CARD, 'https://b.example/', 'did:plc:bob', 'related'),
        conn('4', CARD, 'https://b.example', 'did:plc:bob', 'RELATED'),
      ],
      [],
    )
    expect(connected[0]!.url).toBe('https://b.example')
    expect(connected[0]!.reason.kind === 'connected' && connected[0]!.reason.curators.map((u) => u.id)).toEqual([
      'did:plc:alice',
      'did:plc:bob',
    ])
    expect(connected).toHaveLength(2)
  })

  it('flags pages already in my library and connections I already made', () => {
    const { connected, similar } = buildSuggestions(
      ctx({
        myCards: new Map([
          ['https://wb.com/roadrunner', 'at://me/card/1'],
          ['https://similar.example/x', 'at://me/card/2'],
        ]),
        myConnectionKeys: new Set([connectionKey(CARD, 'https://wb.com/roadrunner', 'SUPPORTS'), connectionKey('https://similar.example/x', CARD)]),
      }),
      [conn('1', CARD, 'https://wb.com/roadrunner', 'did:plc:alice', 'SUPPORTS'), conn('2', CARD, 'https://wb.com/roadrunner', 'did:plc:bob', 'OPPOSES')],
      [view('https://similar.example/x', 'Similar')],
    )
    const supports = connected.find((s) => s.reason.kind === 'connected' && s.reason.type === 'SUPPORTS')!
    const opposes = connected.find((s) => s.reason.kind === 'connected' && s.reason.type === 'OPPOSES')!
    expect(supports).toMatchObject({ myCardId: 'at://me/card/1', alreadyConnected: true })
    expect(opposes).toMatchObject({ myCardId: 'at://me/card/1', alreadyConnected: false })
    expect(similar[0]).toMatchObject({ myCardId: 'at://me/card/2', alreadyConnected: true })
  })

  it('drops the card itself and anything already suggested from similar pages', () => {
    const { similar } = buildSuggestions(
      ctx(),
      [conn('1', CARD, 'https://wb.com/roadrunner', 'did:plc:alice')],
      [view('https://acme.com'), view('https://wb.com/roadrunner/'), view('https://new.example', 'New', 9), view('https://new.example/')],
    )
    expect(similar.map((s) => [s.url, s.title, s.libraryCount])).toEqual([['https://new.example', 'New', 9]])
  })
})
