import type { SembleConnectionView } from './appview'
import { canonicalUrl, recommendFromConsensus, recommendSameAs, recommendType, unarchive } from './recommendType'

const ME = 'did:plc:me'
const conn = (curator: string, source: string, target: string, type?: string): SembleConnectionView => ({
  connection: { id: `${curator}${type}`, type, curator: { id: curator, handle: `${curator}.test` } },
  source: { url: source },
  target: { url: target },
})
const A = 'https://acme.com/article'
const B = 'https://wb.com/roadrunner'

describe('recommendSameAs', () => {
  it('matches DOIs from metadata or doi.org URLs, and ISBNs', () => {
    expect(recommendSameAs({ url: A, doi: '10.1000/XYZ' }, { url: 'https://doi.org/10.1000/xyz' })?.reason).toMatch(/DOI 10.1000\/xyz/)
    expect(recommendSameAs({ isbn: '978-0-262-03384-8' }, { isbn: '9780262033848' })?.type).toBe('SAME_AS')
  })

  it('spots archived copies and cosmetic URL differences', () => {
    expect(recommendSameAs({ url: 'https://web.archive.org/web/20240101000000/https://acme.com/article' }, { url: A })?.reason).toMatch(/archived copy/)
    expect(recommendSameAs({ url: 'http://www.acme.com/article/?utm_source=x#top' }, { url: A })?.reason).toMatch(/only the URL differs/)
  })

  it('stays silent for genuinely different pages', () => {
    expect(recommendSameAs({ url: A }, { url: B })).toBeNull()
    expect(recommendSameAs({ url: 'https://acme.com/a?id=1' }, { url: 'https://acme.com/a?id=2' })).toBeNull()
    expect(recommendSameAs({ doi: '10.1/a' }, { doi: '10.1/b' })).toBeNull()
  })

  it('helpers', () => {
    expect(canonicalUrl('http://www.Acme.com/a/?gclid=1&q=2')).toBe('https://acme.com/a?q=2')
    expect(unarchive('https://web.archive.org/web/2024/acme.com/a')).toBe('https://acme.com/a')
    expect(unarchive(A)).toBeNull()
  })
})

describe('recommendFromConsensus', () => {
  it('recommends with 2+ people and a clear majority, in the same direction', () => {
    const rec = recommendFromConsensus(A, B, [conn('alice', A, B, 'supports'), conn('bob', A, B, 'SUPPORTS'), conn('carol', A, B, 'RELATED')], ME)
    expect(rec).toEqual({ type: 'SUPPORTS', reason: '2 of 3 people on Semble who connected these chose this' })
    expect(recommendFromConsensus(A, B, [conn('alice', A, B, 'EXPLAINER'), conn('bob', 'https://www.acme.com/article', B, 'EXPLAINER')], ME)?.reason).toMatch(/^All 2 people/)
  })

  it('stays silent when the signal is weak', () => {
    // one person only
    expect(recommendFromConsensus(A, B, [conn('alice', A, B, 'SUPPORTS')], ME)).toBeNull()
    // no majority
    expect(recommendFromConsensus(A, B, [conn('alice', A, B, 'SUPPORTS'), conn('bob', A, B, 'OPPOSES')], ME)).toBeNull()
    // the other direction does not count
    expect(recommendFromConsensus(A, B, [conn('alice', B, A, 'SUPPORTS'), conn('bob', B, A, 'SUPPORTS')], ME)).toBeNull()
    // my own connections do not count, and one person voting twice is one vote
    expect(recommendFromConsensus(A, B, [conn(ME, A, B, 'SUPPORTS'), conn('alice', A, B, 'SUPPORTS'), conn('alice', A, B, 'SUPPORTS')], ME)).toBeNull()
    // untyped or unknown majority types are not recommended
    expect(recommendFromConsensus(A, B, [conn('alice', A, B), conn('bob', A, B)], ME)).toBeNull()
    expect(recommendFromConsensus(A, B, [conn('alice', A, B, 'WEIRD'), conn('bob', A, B, 'WEIRD')], ME)).toBeNull()
  })

  it('prefers a same-resource signal', () => {
    expect(recommendType({ url: A }, { url: `${A}?utm_medium=x` }, [conn('a', A, `${A}?utm_medium=x`, 'RELATED'), conn('b', A, A, 'RELATED')], ME)?.type).toBe('SAME_AS')
  })
})
