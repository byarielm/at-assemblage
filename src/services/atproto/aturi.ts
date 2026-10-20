import { AtUri } from '@atproto/syntax'

export function rkeyOf(uri: string): string {
  return new AtUri(uri).rkey
}
