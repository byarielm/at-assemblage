import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthContext'
import { describeError } from '../services/atproto/errors'
import type { StoredRecord } from '../services/sources/records'
import { saveNote } from '../services/sources/semble/notes'
import type { CardRecord, SembleLibrary } from '../services/sources/semble/types'
import { useUiStore } from '../state/uiStore'
import { queryKeys } from './keys'

export type SaveNoteInput = { parent: StoredRecord<CardRecord>; text: string; existing?: StoredRecord<CardRecord> }

/** Adds or edits the user's Semble note on a card, then updates the cached library. */
export function useSaveSembleNote() {
  const { client, did } = useAuth()
  const queryClient = useQueryClient()
  const key = queryKeys.library(did)
  return useMutation<StoredRecord<CardRecord>, Error, SaveNoteInput>({
    mutationFn: ({ parent, text, existing }) => saveNote(client, parent, text, existing),
    onSuccess: (saved, { existing }) => {
      queryClient.setQueryData<SembleLibrary>(key, (old) =>
        old && {
          ...old,
          cards: existing ? old.cards.map((c) => (c.uri === existing.uri ? saved : c)) : [...old.cards, saved],
        },
      )
      useUiStore.getState().notify({ tone: 'success', message: existing ? 'Note updated.' : 'Note added.' })
    },
    onError: (err) => useUiStore.getState().notify({ tone: 'error', message: `Note not saved. ${describeError(err).message}` }),
  })
}
