import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthContext'
import type { GraphLink } from '../graph/model'
import { AppError, describeError } from '../services/atproto/errors'
import type { StoredRecord } from '../services/sources/records'
import {
  createConnection,
  deleteConnection,
  fetchCollections,
  fetchConnections,
  fetchLibrary,
} from '../services/sources/semble/api'
import { buildConnectionRecord, isDuplicateLink, type ConnectionDraft } from '../services/sources/semble/mapping'
import type { ConnectionRecord, SembleConnections } from '../services/sources/semble/types'
import { useUiStore } from '../state/uiStore'
import { queryKeys } from './keys'

export function useCollections() {
  const { client, did } = useAuth()
  return useQuery({ queryKey: queryKeys.collections(did), queryFn: () => fetchCollections(client, did) })
}

export function useLibrary(enabled = true) {
  const { client, did } = useAuth()
  return useQuery({ queryKey: queryKeys.library(did), queryFn: () => fetchLibrary(client, did), enabled })
}

export function useConnections(enabled = true) {
  const { client, did } = useAuth()
  return useQuery({ queryKey: queryKeys.connections(did), queryFn: () => fetchConnections(client, did), enabled })
}

export type CreateConnectionInput = ConnectionDraft & {
  sourceId: string
  targetId: string
  /** Links currently in the graph, for duplicate detection. */
  existing: readonly GraphLink[]
}

type MutationContext = { previous?: SembleConnections; tempUri?: string }

let tempCounter = 0

/**
 * Creates a `network.cosmik.connection` record with an optimistic cache
 * entry that is replaced by the PDS's URI/CID on success, or rolled back.
 */
export function useCreateConnection() {
  const { client, did } = useAuth()
  const queryClient = useQueryClient()
  const key = queryKeys.connections(did)

  return useMutation<StoredRecord<ConnectionRecord>, Error, CreateConnectionInput, MutationContext>({
    mutationFn: async (input) => {
      if (input.sourceId === input.targetId) throw new AppError('validation', 'A card cannot be connected to itself.')
      if (isDuplicateLink(input.existing, input.sourceId, input.targetId, input.type)) {
        throw new AppError('duplicate', 'These cards already have a connection of this type in this direction.')
      }
      return createConnection(client, buildConnectionRecord(input))
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<SembleConnections>(key)
      let record: ConnectionRecord
      try {
        record = buildConnectionRecord(input)
      } catch {
        return { previous } // mutationFn will throw the validation error
      }
      const tempUri = `pending:connection:${++tempCounter}`
      queryClient.setQueryData<SembleConnections>(key, (old) => ({
        invalid: old?.invalid ?? 0,
        connections: [...(old?.connections ?? []), { uri: tempUri, cid: '', value: record, pending: true }],
      }))
      return { previous, tempUri }
    },
    // Hook-level callbacks still run if the editor has unmounted.
    onSuccess: (saved, _input, ctx) => {
      queryClient.setQueryData<SembleConnections>(key, (old) => ({
        invalid: old?.invalid ?? 0,
        connections: (old?.connections ?? []).map((c) => (c.uri === ctx?.tempUri ? saved : c)),
      }))
      useUiStore.getState().notify({ tone: 'success', message: 'Connection saved to your PDS.' })
    },
    onError: (err, input, ctx) => {
      useUiStore.getState().notify({
        tone: 'error',
        message: `Connection not saved. ${describeError(err).message}`,
        retryDraft: { sourceId: input.sourceId, targetId: input.targetId, type: input.type, note: input.note },
      })
      if (ctx?.tempUri) {
        queryClient.setQueryData<SembleConnections>(key, (old) => ({
          invalid: old?.invalid ?? 0,
          connections: (old?.connections ?? []).filter((c) => c.uri !== ctx.tempUri),
        }))
      }
    },
  })
}

/** Deletes a connection record the user owns. Cards and collections are never touched. */
export function useDeleteConnection() {
  const { client, did } = useAuth()
  const queryClient = useQueryClient()
  const key = queryKeys.connections(did)

  return useMutation<void, Error, string, MutationContext>({
    mutationFn: (uri) => deleteConnection(client, uri),
    onMutate: async (uri) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<SembleConnections>(key)
      queryClient.setQueryData<SembleConnections>(key, (old) =>
        old ? { ...old, connections: old.connections.filter((c) => c.uri !== uri) } : old,
      )
      return { previous }
    },
    onSuccess: () => useUiStore.getState().notify({ tone: 'success', message: 'Connection deleted.' }),
    onError: (err, _uri, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous)
      useUiStore.getState().notify({ tone: 'error', message: `Connection not deleted. ${describeError(err).message}` })
    },
  })
}
