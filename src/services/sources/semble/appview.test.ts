import { fetchConnectionsForUrl, fetchSimilarUrls, SembleApiError } from './appview'

const respond = (body: unknown, status = 200) =>
  vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }))

describe('Semble AppView client', () => {
  it('calls the public xrpc endpoint as a plain GET and keeps valid entries only', async () => {
    const fetch = respond({
      urls: [{ url: 'https://a.example', metadata: { url: 'https://a.example', title: 'A' }, urlLibraryCount: 3 }, { nope: true }],
      pagination: {},
    })
    const urls = await fetchSimilarUrls('https://acme.com/?q=1', { fetch, base: 'https://api.semble.test/', limit: 5 })
    expect(urls).toEqual([{ url: 'https://a.example', metadata: { url: 'https://a.example', title: 'A' }, urlLibraryCount: 3 }])
    const [url, init] = fetch.mock.calls[0]!
    expect(url).toBe('https://api.semble.test/xrpc/network.cosmik.search.getSimilarUrls?url=https%3A%2F%2Facme.com%2F%3Fq%3D1&limit=5')
    expect(init).toMatchObject({ credentials: 'omit' })
    expect(init.headers).toBeUndefined()
  })

  it('asks for connections in both directions', async () => {
    const fetch = respond({ connections: [] })
    await fetchConnectionsForUrl('https://acme.com', { fetch, base: 'https://api.semble.test' })
    expect(fetch.mock.calls[0]![0]).toContain('network.cosmik.connection.getForUrl?url=https%3A%2F%2Facme.com&direction=both&limit=30')
  })

  it('reports HTTP, network, shape and disabled errors as SembleApiError', async () => {
    await expect(fetchSimilarUrls('https://x.example', { fetch: respond({}, 500), base: 'https://s' })).rejects.toBeInstanceOf(SembleApiError)
    await expect(fetchSimilarUrls('https://x.example', { fetch: vi.fn().mockRejectedValue(new TypeError('x')), base: 'https://s' })).rejects.toThrow(
      'Could not reach Semble.',
    )
    await expect(fetchSimilarUrls('https://x.example', { fetch: respond({ wrong: [] }), base: 'https://s' })).rejects.toThrow(/unexpected/)
    await expect(fetchSimilarUrls('https://x.example', { fetch: vi.fn(), base: '' })).rejects.toThrow(/turned off/)
  })
})
