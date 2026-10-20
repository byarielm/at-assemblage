import { isValidDid, isValidHandle, normalizeHandle } from '@atproto/syntax'
import { Client } from '@atproto/lex-client'
import { config } from '../../config'
import { com } from '../../lexicons'

export type Did = `did:${string}:${string}`

export type ResolvedIdentity = {
  did: Did
  /** Base URL of the account's PDS, taken from its DID document. */
  pds: string
  /** Handle claimed in the DID document, if any. */
  handle?: string
}

export class IdentityError extends Error {
  constructor(
    readonly code: 'InvalidIdentifier' | 'HandleNotFound' | 'DidNotFound' | 'NoPds',
    message: string,
  ) {
    super(message)
    this.name = 'IdentityError'
  }
}

export type IdentifierCheck =
  | { ok: true; kind: 'did'; value: Did }
  | { ok: true; kind: 'handle'; value: string }
  | { ok: false; message: string }

/** Validates and normalises what the user typed in the identifier field. */
export function checkIdentifier(raw: string): IdentifierCheck {
  const input = raw.trim().replace(/^@/, '')
  if (!input) return { ok: false, message: 'Enter your handle or DID.' }
  if (input.startsWith('did:')) {
    return isValidDid(input)
      ? { ok: true, kind: 'did', value: input as Did }
      : { ok: false, message: 'That does not look like a valid DID.' }
  }
  const handle = normalizeHandle(input)
  if (!handle.includes('.')) {
    return { ok: false, message: 'Handles include a domain, e.g. alice.bsky.social.' }
  }
  return isValidHandle(handle)
    ? { ok: true, kind: 'handle', value: handle }
    : { ok: false, message: 'That does not look like a valid handle.' }
}

type DidDocument = {
  id?: unknown
  alsoKnownAs?: unknown
  service?: unknown
}

export function pdsFromDidDocument(doc: DidDocument): string | null {
  if (!Array.isArray(doc.service)) return null
  const svc = doc.service.find(
    (s): s is { id: string; serviceEndpoint: string } =>
      typeof s?.id === 'string' &&
      s.id.endsWith('#atproto_pds') &&
      typeof s.serviceEndpoint === 'string',
  )
  if (!svc || !URL.canParse(svc.serviceEndpoint)) return null
  return svc.serviceEndpoint.replace(/\/+$/, '')
}

export function handleFromDidDocument(doc: DidDocument): string | undefined {
  if (!Array.isArray(doc.alsoKnownAs)) return undefined
  const aka = doc.alsoKnownAs.find((a): a is string => typeof a === 'string' && a.startsWith('at://'))
  return aka?.slice('at://'.length)
}

export function didDocumentUrl(did: Did): string {
  if (did.startsWith('did:plc:')) return `${config.plcDirectory}/${did}`
  if (did.startsWith('did:web:')) {
    const host = decodeURIComponent(did.slice('did:web:'.length))
    return `https://${host}/.well-known/did.json`
  }
  throw new IdentityError('InvalidIdentifier', `Unsupported DID method: ${did.split(':')[1]}`)
}

export type ResolveOptions = { fetch?: typeof globalThis.fetch }

export async function resolveHandle(handle: string, opts: ResolveOptions = {}): Promise<Did> {
  const client = new Client({ service: config.handleResolver, fetch: opts.fetch })
  try {
    const { did } = await client.call(com.atproto.identity.resolveHandle, { handle: handle as `${string}.${string}` })
    return did as Did
  } catch {
    throw new IdentityError('HandleNotFound', `Could not find an account for @${handle}.`)
  }
}

export async function resolveDidDocument(did: Did, opts: ResolveOptions = {}): Promise<DidDocument> {
  const fetchFn = opts.fetch ?? globalThis.fetch
  let res: Response
  try {
    res = await fetchFn(didDocumentUrl(did), { headers: { accept: 'application/json' } })
  } catch {
    throw new IdentityError('DidNotFound', 'Could not reach the identity directory. Check your connection.')
  }
  if (!res.ok) throw new IdentityError('DidNotFound', `Could not resolve ${did}.`)
  const doc = (await res.json()) as DidDocument
  if (doc.id !== did) throw new IdentityError('DidNotFound', `DID document does not match ${did}.`)
  return doc
}

/**
 * Handle or DID → DID → DID document → PDS endpoint.
 * We authenticate against the account's own PDS, never a hard-coded host.
 */
export async function resolveIdentity(identifier: string, opts: ResolveOptions = {}): Promise<ResolvedIdentity> {
  const check = checkIdentifier(identifier)
  if (!check.ok) throw new IdentityError('InvalidIdentifier', check.message)
  const did = check.kind === 'did' ? check.value : await resolveHandle(check.value, opts)
  const doc = await resolveDidDocument(did, opts)
  const pds = pdsFromDidDocument(doc)
  if (!pds) throw new IdentityError('NoPds', 'This account has no PDS listed in its DID document.')
  return { did, pds, handle: handleFromDidDocument(doc) }
}
