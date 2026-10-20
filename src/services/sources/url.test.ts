import { cleanUrl, domainOf, isHttpUrl, normaliseUrl } from './url'

describe('url helpers', () => {
  it('normalises only meaning-preserving differences', () => {
    expect(normaliseUrl('https://Example.COM:443/path/#frag')).toBe('https://example.com/path')
    expect(normaliseUrl('https://example.com/')).toBe('https://example.com')
    expect(normaliseUrl('https://example.com/a?b=1')).toBe('https://example.com/a?b=1')
    expect(normaliseUrl('https://example.com/A')).not.toBe(normaliseUrl('https://example.com/a'))
    expect(normaliseUrl('not a url')).toBe('not a url')
  })

  it('extracts readable parts', () => {
    expect(domainOf('https://www.example.com/x')).toBe('example.com')
    expect(cleanUrl('https://www.example.com/a%20b/')).toBe('example.com/a b')
    expect(isHttpUrl('javascript:alert(1)')).toBe(false)
    expect(isHttpUrl('https://x.y')).toBe(true)
  })
})
