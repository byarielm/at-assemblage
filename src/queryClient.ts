import { QueryClient } from '@tanstack/react-query'
import { XrpcResponseError } from '@atproto/lex-client'

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // The PDS is the source of truth; we refresh on demand rather than polling.
        staleTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: (count, err) => {
          if (err instanceof XrpcResponseError && err.status < 500 && err.status !== 429) return false
          return count < 2
        },
      },
      mutations: { retry: false },
    },
  })
}
