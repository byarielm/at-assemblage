import type { FakePds } from './fakePds'

export const C = {
  collection: 'network.cosmik.collection',
  card: 'network.cosmik.card',
  link: 'network.cosmik.collectionLink',
  connection: 'network.cosmik.connection',
  marginNote: 'at.margin.note',
} as const

export function seedUrlCard(pds: FakePds, url: string, title?: string) {
  return pds.putRecord(C.card, {
    type: 'URL',
    url,
    content: {
      $type: 'network.cosmik.card#urlContent',
      url,
      ...(title ? { metadata: { $type: 'network.cosmik.card#urlMetadata', title } } : {}),
    },
    createdAt: '2026-01-01T00:00:00.000Z',
  })
}

export function seedCollection(pds: FakePds, name: string) {
  return pds.putRecord(C.collection, { name, accessType: 'CLOSED', createdAt: '2026-01-01T00:00:00.000Z' })
}

export function seedLink(pds: FakePds, collectionUri: string, cardUri: string, cid: string) {
  return pds.putRecord(C.link, {
    collection: { uri: collectionUri, cid },
    card: { uri: cardUri, cid },
    addedBy: pds.account.did,
    addedAt: '2026-01-01T00:00:00.000Z',
  })
}
