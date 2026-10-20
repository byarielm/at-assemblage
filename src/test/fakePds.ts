/**
 * In-memory stand-in for a PDS, PLC directory and handle resolver, driven
 * through `fetch`. Lets tests exercise the real @atproto/lex client and
 * PasswordSession (login, refresh, retry, pagination) without a network.
 */
export const TEST_CID = 'bafyreidmfvmmnzqxgkwexzt73uopc4kiycmdogbedw4ijduxobwvla6sua'

export const RESOLVER = 'https://public.api.bsky.app'
export const PLC = 'https://plc.directory'

type Account = { did: string; handle: string; password: string; emailCode?: string }

export type FakePdsOptions = {
  pds?: string
  account?: Partial<Account>
}

export class FakePds {
  readonly pds: string
  readonly account: Account
  readonly records = new Map<string, Map<string, unknown>>()
  readonly calls: { method: string; nsid: string; status: number }[] = []
  private accessToken: string | null = null
  private refreshToken: string | null = null
  private tokenSeq = 0
  private rkeySeq = 0
  /** Next N calls to these NSIDs fail with this status. */
  private failures = new Map<string, { status: number; error: string; count: number }>()

  constructor(opts: FakePdsOptions = {}) {
    this.pds = opts.pds ?? 'https://pds.example.com'
    this.account = {
      did: 'did:plc:testuser1234567890abcdef',
      handle: 'alice.test',
      password: 'abcd-efgh-ijkl-mnop',
      ...opts.account,
    }
  }

  expireAccessToken() {
    this.accessToken = `expired-${this.accessToken}`
  }

  revokeRefreshToken() {
    this.refreshToken = null
    this.expireAccessToken()
  }

  private gates = new Map<string, Promise<void>>()

  /** Holds the next call to `nsid` until the returned function is called. */
  holdNext(nsid: string): () => void {
    let release!: () => void
    this.gates.set(nsid, new Promise<void>((r) => (release = r)))
    return release
  }

  failNext(nsid: string, status: number, error: string, count = 1) {
    this.failures.set(nsid, { status, error, count })
  }

  count(nsid: string) {
    return this.calls.filter((c) => c.nsid === nsid).length
  }

  putRecord(collection: string, value: Record<string, unknown>, rkey = this.nextRkey()): string {
    const coll = this.records.get(collection) ?? new Map()
    coll.set(rkey, { $type: collection, ...value })
    this.records.set(collection, coll)
    return `at://${this.account.did}/${collection}/${rkey}`
  }

  private nextRkey() {
    // TID-shaped: 13 chars of base32-sortable, increasing with each record.
    const alphabet = '234567abcdefghijklmnopqrstuvwxyz'
    let n = ++this.rkeySeq
    let out = ''
    for (let i = 0; i < 11; i++) {
      out = alphabet[n % 32] + out
      n = Math.floor(n / 32)
    }
    return `3l${out}`
  }

  private issueTokens() {
    this.tokenSeq++
    this.accessToken = `access-${this.tokenSeq}`
    this.refreshToken = `refresh-${this.tokenSeq}`
  }

  didDoc() {
    return {
      '@context': ['https://www.w3.org/ns/did/v1'],
      id: this.account.did,
      alsoKnownAs: [`at://${this.account.handle}`],
      verificationMethod: [],
      service: [{ id: '#atproto_pds', type: 'AtprotoPersonalDataServer', serviceEndpoint: this.pds }],
    }
  }

  private sessionBody() {
    return {
      accessJwt: this.accessToken,
      refreshJwt: this.refreshToken,
      did: this.account.did,
      handle: this.account.handle,
      didDoc: this.didDoc(),
      email: 'alice@example.com',
      emailConfirmed: true,
      active: true,
    }
  }

  readonly fetch: typeof globalThis.fetch = async (input, init) => {
    const req = input instanceof Request ? input : new Request(input, init)
    const url = new URL(req.url)
    const method = req.method.toUpperCase()

    if (url.origin === PLC) {
      const did = decodeURIComponent(url.pathname.slice(1))
      return did === this.account.did ? json(200, this.didDoc()) : json(404, { message: 'not found' })
    }

    const nsid = url.pathname.replace(/^\/xrpc\//, '')
    const res = await this.handle(url, nsid, req)
    this.calls.push({ method, nsid, status: res.status })
    return res
  }

  private async handle(url: URL, nsid: string, req: Request): Promise<Response> {
    const gate = this.gates.get(nsid)
    if (gate) {
      this.gates.delete(nsid)
      await gate
    }
    const failure = this.failures.get(nsid)
    if (failure && failure.count > 0) {
      failure.count--
      return json(failure.status, { error: failure.error, message: 'Injected failure' })
    }

    if (url.origin === RESOLVER && nsid === 'com.atproto.identity.resolveHandle') {
      return url.searchParams.get('handle') === this.account.handle
        ? json(200, { did: this.account.did })
        : json(400, { error: 'InvalidRequest', message: 'Unable to resolve handle' })
    }
    if (url.origin !== this.pds) return json(404, { error: 'NotFound' })

    const bearer = req.headers.get('authorization')?.replace(/^Bearer /, '')

    switch (nsid) {
      case 'com.atproto.server.createSession': {
        const body = (await req.json()) as { identifier: string; password: string; authFactorToken?: string }
        const known = body.identifier === this.account.did || body.identifier === this.account.handle
        if (!known || body.password !== this.account.password) {
          return json(401, { error: 'AuthenticationRequired', message: 'Invalid identifier or password' })
        }
        if (this.account.emailCode && body.authFactorToken !== this.account.emailCode) {
          return json(401, { error: 'AuthFactorTokenRequired', message: 'A sign in code has been sent to your email address' })
        }
        this.issueTokens()
        return json(200, this.sessionBody())
      }
      case 'com.atproto.server.refreshSession': {
        if (!bearer || bearer !== this.refreshToken) return json(400, { error: 'ExpiredToken', message: 'Token has been revoked' })
        this.issueTokens()
        return json(200, this.sessionBody())
      }
      case 'com.atproto.server.getSession':
        if (bearer !== this.accessToken) return json(400, { error: 'ExpiredToken', message: 'Token has expired' })
        return json(200, this.sessionBody())
      case 'com.atproto.server.deleteSession':
        if (bearer !== this.refreshToken) return json(400, { error: 'ExpiredToken', message: 'Token has been revoked' })
        this.accessToken = null
        this.refreshToken = null
        return new Response(null, { status: 200 })
    }

    if (bearer !== this.accessToken || !this.accessToken) {
      return json(400, { error: 'ExpiredToken', message: 'Token has expired' })
    }

    switch (nsid) {
      case 'com.atproto.repo.listRecords': {
        const collection = url.searchParams.get('collection')!
        const limit = Number(url.searchParams.get('limit') ?? 50)
        const cursor = url.searchParams.get('cursor')
        const entries = [...(this.records.get(collection) ?? new Map()).entries()].sort(([a], [b]) => a.localeCompare(b))
        const start = cursor ? entries.findIndex(([k]) => k > cursor) : 0
        const page = start === -1 ? [] : entries.slice(start, start + limit)
        const next = start !== -1 && start + limit < entries.length ? page[page.length - 1]?.[0] : undefined
        return json(200, {
          records: page.map(([rkey, value]) => ({ uri: `at://${this.account.did}/${collection}/${rkey}`, cid: TEST_CID, value })),
          ...(next ? { cursor: next } : {}),
        })
      }
      case 'com.atproto.repo.createRecord': {
        const body = (await req.json()) as { collection: string; record: Record<string, unknown>; rkey?: string }
        const uri = this.putRecord(body.collection, body.record, body.rkey)
        return json(200, { uri, cid: TEST_CID, commit: { cid: TEST_CID, rev: '3l2222222222a' }, validationStatus: 'unknown' })
      }
      case 'com.atproto.repo.deleteRecord': {
        const body = (await req.json()) as { collection: string; rkey: string }
        this.records.get(body.collection)?.delete(body.rkey)
        return json(200, { commit: { cid: TEST_CID, rev: '3l2222222222b' } })
      }
    }
    return json(501, { error: 'MethodNotImplemented' })
  }
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

export class MemoryStore {
  readonly data = new Map<string, string>()
  getItem = (k: string) => this.data.get(k) ?? null
  setItem = (k: string, v: string) => void this.data.set(k, v)
  removeItem = (k: string) => void this.data.delete(k)
}
