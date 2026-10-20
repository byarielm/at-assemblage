/** Runtime configuration. Only public, non-secret endpoints belong here. */
export const config = {
  /** Unauthenticated service used for `com.atproto.identity.resolveHandle`. */
  handleResolver: import.meta.env.VITE_HANDLE_RESOLVER || 'https://public.api.bsky.app',
  /** PLC directory used to resolve `did:plc` documents. */
  plcDirectory: import.meta.env.VITE_PLC_DIRECTORY || 'https://plc.directory',
  /** Where users manage App Passwords on the default (Bluesky-hosted) PDS. */
  appPasswordHelpUrl: 'https://bsky.app/settings/app-passwords',
  /** Sent as the Margin `generator` so notes are attributable to this client. */
  appName: 'Assemblage',
} as const
