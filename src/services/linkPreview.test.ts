import { fetchLinkPreview } from './linkPreview'

const json = (body: unknown, status = 200) =>
  vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }))

describe('fetchLinkPreview', () => {
  it('maps the service response', async () => {
    const fetch = json({ error: '', title: ' Title ', description: 'Desc', image: 'https://img.example/x.jpg' })
    await expect(fetchLinkPreview('https://example.com/a?b=1', { fetch, service: 'https://svc.example/extract' })).resolves.toEqual({
      title: 'Title',
      description: 'Desc',
      imageUrl: 'https://img.example/x.jpg',
    })
    expect(fetch.mock.calls[0]![0]).toBe('https://svc.example/extract?url=https%3A%2F%2Fexample.com%2Fa%3Fb%3D1')
  })

  it('returns null on errors, empty results or when disabled', async () => {
    await expect(fetchLinkPreview('https://x.example', { fetch: json({ error: 'bad' }), service: 'https://s' })).resolves.toBeNull()
    await expect(fetchLinkPreview('https://x.example', { fetch: json({}, 500), service: 'https://s' })).resolves.toBeNull()
    await expect(fetchLinkPreview('https://x.example', { fetch: vi.fn().mockRejectedValue(new TypeError('x')), service: 'https://s' })).resolves.toBeNull()
    const fetch = vi.fn()
    await expect(fetchLinkPreview('https://x.example', { fetch, service: '' })).resolves.toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })
})
