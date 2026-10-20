import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthContext'
import type { GraphLink } from '../graph/model'
import { AppError, describeError } from '../services/atproto/errors'
import type { StoredRecord } from '../services/sources/records'
import {
  applyConnectionWrites,
  createConnection,
  deleteConnection,
  updateConnection,
  type ConnectionWrite,
  fetchCollections,
  fetchConnections,
  fetchLibrary,
} from '../services/sources/semble/api'
import { buildConnectionRecord, isDuplicateLink, type ConnectionDraft, type EditPlan } from '../services/sources/semble/mapping'
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

let editCounter = 0

function followSelection(fromUri: string, toUri: string) {
  const { selected, requestSelection } = useUiStore.getState()
  if (selected.edges.includes(fromUri)) {
    requestSelection({ nodes: selected.nodes, edges: selected.edges.map((e) => (e === fromUri ? toUri : e)) }, { focus: false })
  }
}

export type EditConnectionInput = {
  stored: StoredRecord<ConnectionRecord>
  plan: Exclude<EditPlan, { kind: 'noop' }>
}

/**
 * Edits one connection. Note-only changes update in place; type/endpoint
 * changes replace the record in a single atomic commit (see planConnectionEdit).
 * The edited edge stays selected across the URI change.
 */
export function useEditConnection() {
  const { client, did } = useAuth()
  const queryClient = useQueryClient()
  const key = queryKeys.connections(did)

  return useMutation<StoredRecord<ConnectionRecord>, Error, EditConnectionInput, MutationContext>({
    mutationFn: async ({ stored, plan }) => {
      if (plan.kind === 'update') return updateConnection(client, stored, plan.record)
      const created = await applyConnectionWrites(client, [{ kind: 'replace', oldUri: stored.uri, record: plan.record }])
      const saved = created.get(stored.uri)
      if (!saved) throw new AppError('unknown', 'Your PDS did not confirm the new connection. Reload to check its state.')
      return saved
    },
    onMutate: async ({ stored, plan }) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<SembleConnections>(key)
      const tempUri = plan.kind === 'replace' ? `pending:edit:${++editCounter}` : stored.uri
      queryClient.setQueryData<SembleConnections>(key, (old) =>
        old && {
          ...old,
          connections: old.connections.map((c) =>
            c.uri === stored.uri ? { uri: tempUri, cid: c.cid, value: plan.record, pending: true } : c,
          ),
        },
      )
      if (tempUri !== stored.uri) followSelection(stored.uri, tempUri)
      return { previous, tempUri }
    },
    onSuccess: (saved, { plan }, ctx) => {
      queryClient.setQueryData<SembleConnections>(key, (old) =>
        old && { ...old, connections: old.connections.map((c) => (c.uri === ctx?.tempUri ? saved : c)) },
      )
      if (ctx?.tempUri && ctx.tempUri !== saved.uri) followSelection(ctx.tempUri, saved.uri)
      useUiStore.getState().notify({
        tone: 'success',
        message: plan.kind === 'update' ? 'Connection note updated.' : 'Connection updated.',
      })
    },
    onError: (err, { stored }, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous)
      if (ctx?.tempUri && ctx.tempUri !== stored.uri) followSelection(ctx.tempUri, stored.uri)
      useUiStore.getState().notify({ tone: 'error', message: `Connection not updated. ${describeError(err).message}` })
    },
  })
}

export type BulkWriteInput = { writes: ConnectionWrite[]; description: string }

/** Batch delete / retype, written with applyWrites. Optimistic, with full rollback on failure. */
export function useBulkConnectionWrites() {
  const { client, did } = useAuth()
  const queryClient = useQueryClient()
  const key = queryKeys.connections(did)

  return useMutation<Map<string, StoredRecord<ConnectionRecord>>, Error, BulkWriteInput, { previous?: SembleConnections; temps: Map<string, string> }>({
    mutationFn: ({ writes }) => applyConnectionWrites(client, writes),
    onMutate: async ({ writes }) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<SembleConnections>(key)
      const deletes = new Set(writes.flatMap((w) => (w.kind === 'delete' ? [w.uri] : [])))
      const replaces = new Map(writes.flatMap((w) => (w.kind === 'replace' ? [[w.oldUri, w.record] as const] : [])))
      const temps = new Map<string, string>()
      queryClient.setQueryData<SembleConnections>(key, (old) =>
        old && {
          ...old,
          connections: old.connections
            .filter((c) => !deletes.has(c.uri))
            .map((c) => {
              const record = replaces.get(c.uri)
              if (!record) return c
              const tempUri = `pending:bulk:${++editCounter}`
              temps.set(c.uri, tempUri)
              return { uri: tempUri, cid: c.cid, value: record, pending: true }
            }),
        },
      )
      useUiStore.getState().setSelected({ nodes: [], edges: [] })
      return { previous, temps }
    },
    onSuccess: (created, { description }, ctx) => {
      const byTemp = new Map([...(ctx?.temps ?? [])].map(([oldUri, temp]) => [temp, created.get(oldUri)]))
      queryClient.setQueryData<SembleConnections>(key, (old) =>
        old && {
          ...old,
          connections: old.connections.flatMap((c) => {
            if (!byTemp.has(c.uri)) return [c]
            const saved = byTemp.get(c.uri)
            return saved ? [saved] : []
          }),
        },
      )
      useUiStore.getState().notify({ tone: 'success', message: description })
    },
    onError: (err, _input, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous)
      // Earlier commits of a multi-commit batch may have landed: re-read the truth.
      void queryClient.invalidateQueries({ queryKey: key })
      useUiStore.getState().notify({
        tone: 'error',
        message: `Batch not completed. ${describeError(err).message} The graph has been reloaded from your PDS.`,
      })
    },
  })
}
