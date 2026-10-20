import type { network } from '../../../lexicons'
import type { StoredRecord } from '../records'

export type CollectionRecord = network.cosmik.collection.Main
export type CardRecord = network.cosmik.card.Main
export type CollectionLinkRecord = network.cosmik.collectionLink.Main
export type ConnectionRecord = network.cosmik.connection.Main

export type SembleLibrary = {
  cards: StoredRecord<CardRecord>[]
  links: StoredRecord<CollectionLinkRecord>[]
  invalid: number
}

export type SembleConnections = {
  connections: StoredRecord<ConnectionRecord>[]
  invalid: number
}
