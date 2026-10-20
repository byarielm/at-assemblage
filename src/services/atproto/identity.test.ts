import { FakePds } from '../../test/fakePds'
import { checkIdentifier, didDocumentUrl, IdentityError, pdsFromDidDocument, resolveIdentity } from './identity'

describe('checkIdentifier', () => {
  it.each([
    ['alice.bsky.social', 'handle', 'alice.bsky.social'],
    ['  @Alice.Bsky.Social ', 'handle', 'alice.bsky.social'],
    ['did:plc:ewvi7nxzyoun6zhxrhs64oiz', 'did', 'did:plc:ewvi7nxzyoun6zhxrhs64oiz'],
    ['did:web:example.com', 'did', 'did:web:example.com'],
  ])('accepts %j as a %s', (input, kind, value) => {
    expect(checkIdentifier(input)).toEqual({ ok: true, kind, value })
  })

  it.each(['', '   ', 'alice', 'did:nope', 'alice..bsky.social', 'al ice.bsky.social'])('rejects %j', (input) => {
    expect(checkIdentifier(input).ok).toBe(false)
  })
})

describe('DID documents', () => {
  it('finds the #atproto_pds service endpoint', () => {
    const doc = {
      service: [
        { id: '#other', serviceEndpoint: 'https://nope.example' },
        { id: '#atproto_pds', type: 'AtprotoPersonalDataServer', serviceEndpoint: 'https://pds.example.com/' },
      ],
    }
    expect(pdsFromDidDocument(doc)).toBe('https://pds.example.com')
  })

  it('returns null without a usable PDS', () => {
    expect(pdsFromDidDocument({})).toBeNull()
    expect(pdsFromDidDocument({ service: [{ id: '#atproto_pds', serviceEndpoint: 'not a url' }] })).toBeNull()
  })

  it('builds directory URLs for plc and web DIDs', () => {
    expect(didDocumentUrl('did:plc:abc')).toBe('https://plc.directory/did:plc:abc')
    expect(didDocumentUrl('did:web:example.com')).toBe('https://example.com/.well-known/did.json')
  })
})

describe('resolveIdentity', () => {
  it('resolves handle → DID → PDS', async () => {
    const pds = new FakePds({ pds: 'https://custom-pds.example' })
    await expect(resolveIdentity('alice.test', { fetch: pds.fetch })).resolves.toEqual({
      did: pds.account.did,
      pds: 'https://custom-pds.example',
      handle: 'alice.test',
    })
  })

  it('accepts a DID directly without resolving a handle', async () => {
    const pds = new FakePds()
    const result = await resolveIdentity(pds.account.did, { fetch: pds.fetch })
    expect(result.pds).toBe(pds.pds)
    expect(pds.count('com.atproto.identity.resolveHandle')).toBe(0)
  })

  it('reports unknown handles', async () => {
    const pds = new FakePds()
    await expect(resolveIdentity('bob.test', { fetch: pds.fetch })).rejects.toMatchObject({ code: 'HandleNotFound' })
  })

  it('rejects invalid identifiers before any request', async () => {
    const fetch = vi.fn()
    await expect(resolveIdentity('nope', { fetch })).rejects.toBeInstanceOf(IdentityError)
    expect(fetch).not.toHaveBeenCalled()
  })
})
