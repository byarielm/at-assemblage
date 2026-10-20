import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthContext'
import type { StoredRecord } from '../services/sources/records'
import {
  buildMarginNoteRecord,
  createMarginNote,
  fetchMarginNotes,
  type MarginNoteDraft,
  type MarginNoteRecord,
} from '../services/sources/margin/notes'
import { queryKeys } from './keys'

type MarginCache = { records: StoredRecord<MarginNoteRecord>[]; invalid: number }

export function useMarginNotes(enabled = true) {
  const { client, did } = useAuth()
  return useQuery({
    queryKey: queryKeys.marginNotes(did),
    queryFn: () => fetchMarginNotes(client, did),
    enabled,
    // Annotations are secondary: never block or retry-storm the graph.
    retry: 1,
  })
}

let tempCounter = 0

export function useCreateMarginNote() {
  const { client, did } = useAuth()
  const queryClient = useQueryClient()
  const key = queryKeys.marginNotes(did)

  return useMutation<StoredRecord<MarginNoteRecord>, Error, MarginNoteDraft, { tempUri?: string }>({
    mutationFn: (draft) => createMarginNote(client, buildMarginNoteRecord(draft)),
    onMutate: async (draft) => {
      await queryClient.cancelQueries({ queryKey: key })
      let record: MarginNoteRecord
      try {
        record = buildMarginNoteRecord(draft)
      } catch {
        return {}
      }
      const tempUri = `pending:margin:${++tempCounter}`
      queryClient.setQueryData<MarginCache>(key, (old) => ({
        invalid: old?.invalid ?? 0,
        records: [...(old?.records ?? []), { uri: tempUri, cid: '', value: record, pending: true }],
      }))
      return { tempUri }
    },
    onSuccess: (saved, _draft, ctx) => {
      queryClient.setQueryData<MarginCache>(key, (old) => ({
        invalid: old?.invalid ?? 0,
        records: (old?.records ?? []).map((r) => (r.uri === ctx?.tempUri ? saved : r)),
      }))
    },
    onError: (_err, _draft, ctx) => {
      if (!ctx?.tempUri) return
      queryClient.setQueryData<MarginCache>(key, (old) => ({
        invalid: old?.invalid ?? 0,
        records: (old?.records ?? []).filter((r) => r.uri !== ctx.tempUri),
      }))
    },
  })
}
