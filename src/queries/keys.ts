export const queryKeys = {
  collections: (did: string) => ['semble', 'collections', did] as const,
  library: (did: string) => ['semble', 'library', did] as const,
  connections: (did: string) => ['semble', 'connections', did] as const,
  marginNotes: (did: string) => ['margin', 'notes', did] as const,
  profile: (did: string) => ['profile', did] as const,
}
