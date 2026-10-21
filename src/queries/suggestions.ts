import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useAuth } from '../auth/AuthContext'
import { config } from '../config'
import { network } from '../lexicons'
import { isAtUri } from '../services/atproto/aturi'
import { fetchConnectionsForUrl, fetchSimilarUrls, SembleApiError } from '../services/sources/semble/appview'
import { buildSuggestions, connectionKey } from '../services/sources/semble/suggestions'
import { normaliseUrl } from '../services/sources/url'
import { useConnections, useLibrary } from './semble'

/**
 * Asks Semble's public API about one URL: who connected it to what, and
 * which pages are similar. Either source may fail on its own; the other's
 * results still show. Cached per URL for the session.
 */
function useSembleForUrl(url: string | undefined) {
  return useQuery({
    queryKey: ['semble-api', 'url', url ? normaliseUrl(url) : null],
    enabled: !!url && !!config.sembleApi,
    staleTime: 10 * 60_000,
    retry: 1,
    queryFn: async ({ signal }) => {
      const [connections, similar] = await Promise.allSettled([
        fetchConnectionsForUrl(url!, { signal }),
        fetchSimilarUrls(url!, { signal }),
      ])
      if (connections.status === 'rejected' && similar.status === 'rejected') throw connections.reason
      return {
        connections: connections.status === 'fulfilled' ? connections.value : [],
        similar: similar.status === 'fulfilled' ? similar.value : [],
        partial: connections.status === 'rejected' || similar.status === 'rejected',
      }
    },
  })
}

/** Suggestions for one card URL, joined with the user's own library and connections. */
export function useSuggestions(url: string | undefined) {
  const { did } = useAuth()
  const library = useLibrary()
  const connections = useConnections()
  const semble = useSembleForUrl(url)

  const context = useMemo(() => {
    const myCards = new Map<string, string>()
    const urlByCard = new Map<string, string>()
    for (const c of library.data?.cards ?? []) {
      if (c.value.parentCard) continue
      const content = network.cosmik.card.urlContent.isTypeOf(c.value.content) ? c.value.content : undefined
      const cardUrl = c.value.url ?? content?.url
      if (!cardUrl) continue
      urlByCard.set(c.uri, cardUrl)
      if (!myCards.has(normaliseUrl(cardUrl))) myCards.set(normaliseUrl(cardUrl), c.uri)
    }
    const toUrl = (endpoint: string) => (isAtUri(endpoint) ? urlByCard.get(endpoint) : endpoint)
    const myConnectionKeys = new Set<string>()
    for (const c of connections.data?.connections ?? []) {
      const source = toUrl(c.value.source)
      const target = toUrl(c.value.target)
      if (source && target) myConnectionKeys.add(connectionKey(source, target, c.value.connectionType))
    }
    return { myCards, myConnectionKeys }
  }, [library.data, connections.data])

  const groups = useMemo(
    () => (url && semble.data ? buildSuggestions({ url, did, ...context }, semble.data.connections, semble.data.similar) : null),
    [url, did, context, semble.data],
  )

  return {
    groups,
    partial: semble.data?.partial ?? false,
    isLoading: semble.isPending && semble.fetchStatus !== 'idle',
    error: semble.error ? (semble.error instanceof SembleApiError ? semble.error.message : 'Could not load suggestions.') : null,
    refetch: semble.refetch,
    enabled: !!config.sembleApi,
  }
}
