import type { Client } from '@atproto/lex-client'
import { getBlobCidString } from '@atproto/lex-data'
import { app } from '../../lexicons'

export type Profile = { displayName?: string; avatarUrl?: string }

/**
 * Reads the user's `app.bsky.actor.profile` straight from their own PDS.
 * The avatar is served by the PDS's public getBlob endpoint. Accounts
 * without a Bluesky profile simply get an empty result.
 */
export async function fetchProfile(client: Client, did: string, pds: string): Promise<Profile> {
  try {
    const { value } = await client.get(app.bsky.actor.profile)
    const cid = value.avatar ? getBlobCidString(value.avatar) : undefined
    return {
      displayName: value.displayName?.trim() || undefined,
      avatarUrl: cid
        ? `${pds}/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(did)}&cid=${encodeURIComponent(cid)}`
        : undefined,
    }
  } catch {
    return {}
  }
}
