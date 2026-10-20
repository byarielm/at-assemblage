import { LexAuthFactorError } from '@atproto/lex-password-session'
import { network } from '../../lexicons'
import { FakePds, MemoryStore } from '../../test/fakePds'
import { seedUrlCard } from '../../test/fixtures'
import { describeError } from './errors'
import { hasPersistedSession, isAppPasswordFormat, resumeSession, signIn, signOut } from './session'

const PASSWORD = 'abcd-efgh-ijkl-mnop'

function setup(account?: ConstructorParameters<typeof FakePds>[0]) {
  const pds = new FakePds(account)
  const store = new MemoryStore()
  const onExpired = vi.fn()
  return { pds, store, onExpired, opts: { fetch: pds.fetch, store, onExpired } }
}

describe('isAppPasswordFormat', () => {
  it('accepts xxxx-xxxx-xxxx-xxxx and rejects anything else', () => {
    expect(isAppPasswordFormat('abcd-efgh-ijkl-mnop')).toBe(true)
    expect(isAppPasswordFormat(' ABCD-1234-ijkl-mnop ')).toBe(true)
    expect(isAppPasswordFormat('hunter2')).toBe(false)
    expect(isAppPasswordFormat('abcd-efgh-ijkl')).toBe(false)
  })
})

describe('App Password sign-in', () => {
  it('signs in against the resolved PDS', async () => {
    const { pds, opts } = setup()
    const auth = await signIn({ identifier: 'alice.test', appPassword: PASSWORD, keepSignedIn: false }, opts)
    expect(auth.did).toBe(pds.account.did)
    expect(auth.handle).toBe('alice.test')
    expect(auth.pds).toBe(pds.pds)
    expect(pds.count('com.atproto.server.createSession')).toBe(1)
  })

  it('does not persist anything unless "keep me signed in" is on', async () => {
    const { store, opts } = setup()
    await signIn({ identifier: 'alice.test', appPassword: PASSWORD, keepSignedIn: false }, opts)
    expect(store.data.size).toBe(0)
  })

  it('persists only the refresh token (never the access token or password) when asked', async () => {
    const { store, opts } = setup()
    await signIn({ identifier: 'alice.test', appPassword: PASSWORD, keepSignedIn: true }, opts)
    expect(hasPersistedSession(store)).toBe(true)
    const saved = [...store.data.values()].join()
    expect(saved).toContain('refresh-')
    expect(saved).not.toContain('access-')
    expect(saved).not.toContain(PASSWORD)
  })

  it('maps wrong credentials to a clear message', async () => {
    const { opts } = setup()
    const err = await signIn({ identifier: 'alice.test', appPassword: 'zzzz-zzzz-zzzz-zzzz', keepSignedIn: false }, opts).catch(
      (e: unknown) => e,
    )
    expect(describeError(err)).toMatchObject({ kind: 'credentials', message: 'Handle or App Password is incorrect.' })
  })

  it('handles the two-factor flow', async () => {
    const { pds, opts } = setup({ account: { emailCode: '12345-abcde' } })
    const first = await signIn({ identifier: 'alice.test', appPassword: PASSWORD, keepSignedIn: false }, opts).catch((e: unknown) => e)
    expect(first).toBeInstanceOf(LexAuthFactorError)
    expect(describeError(first).kind).toBe('two-factor')

    const auth = await signIn(
      { identifier: 'alice.test', appPassword: PASSWORD, authFactorToken: '12345-abcde', keepSignedIn: false },
      opts,
    )
    expect(auth.did).toBe(pds.account.did)
  })
})

describe('session refresh', () => {
  it('refreshes an expired access token once and retries the request', async () => {
    const { pds, opts } = setup()
    seedUrlCard(pds, 'https://example.com/a')
    const auth = await signIn({ identifier: 'alice.test', appPassword: PASSWORD, keepSignedIn: false }, opts)

    pds.expireAccessToken()
    // Concurrent requests must share a single refresh.
    const results = await Promise.all([
      auth.client.list(network.cosmik.card, { repo: auth.did }),
      auth.client.list(network.cosmik.card, { repo: auth.did }),
      auth.client.list(network.cosmik.card, { repo: auth.did }),
    ])
    expect(results.every((r) => r.records.length === 1)).toBe(true)
    expect(pds.count('com.atproto.server.refreshSession')).toBe(1)
  })

  it('updates the persisted refresh token after rotation', async () => {
    const { pds, store, opts } = setup()
    const auth = await signIn({ identifier: 'alice.test', appPassword: PASSWORD, keepSignedIn: true }, opts)
    const before = [...store.data.values()][0]
    pds.expireAccessToken()
    await auth.client.list(network.cosmik.card, { repo: auth.did })
    expect([...store.data.values()][0]).not.toBe(before)
  })

  it('ends the session and clears storage when the refresh token is revoked', async () => {
    const { pds, store, onExpired, opts } = setup()
    const auth = await signIn({ identifier: 'alice.test', appPassword: PASSWORD, keepSignedIn: true }, opts)
    pds.revokeRefreshToken()
    await expect(auth.client.list(network.cosmik.card, { repo: auth.did })).rejects.toBeTruthy()
    expect(onExpired).toHaveBeenCalledTimes(1)
    expect(hasPersistedSession(store)).toBe(false)
  })
})

describe('resume and sign out', () => {
  it('resumes a kept session from its refresh token', async () => {
    const { pds, store, opts } = setup()
    await signIn({ identifier: 'alice.test', appPassword: PASSWORD, keepSignedIn: true }, opts)
    const resumed = await resumeSession({ fetch: pds.fetch, store })
    expect(resumed?.did).toBe(pds.account.did)
    expect(pds.count('com.atproto.server.refreshSession')).toBe(1)
  })

  it('returns null and clears storage when resume fails', async () => {
    const { pds, store, opts } = setup()
    await signIn({ identifier: 'alice.test', appPassword: PASSWORD, keepSignedIn: true }, opts)
    pds.revokeRefreshToken()
    await expect(resumeSession({ fetch: pds.fetch, store })).resolves.toBeNull()
    expect(hasPersistedSession(store)).toBe(false)
  })

  it('calls deleteSession and clears local credentials', async () => {
    const { pds, store, opts } = setup()
    const auth = await signIn({ identifier: 'alice.test', appPassword: PASSWORD, keepSignedIn: true }, opts)
    await signOut(auth, { store })
    expect(pds.count('com.atproto.server.deleteSession')).toBe(1)
    expect(hasPersistedSession(store)).toBe(false)
  })
})
