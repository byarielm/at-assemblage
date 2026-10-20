import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  hasPersistedSession,
  resumeSession,
  signIn as signInService,
  signOut as signOutService,
  type AuthSession,
  type SessionOptions,
  type SignInInput,
} from '../services/atproto/session'
import { useUiStore } from '../state/uiStore'
import { AuthContext, type AuthState } from './AuthContext'

// Resume at most once per page load. A refresh token is single-use, so a
// second concurrent resume (e.g. React StrictMode) would revoke the first.
let resumeOnce: Promise<AuthSession | null> | null = null

type Props = { children: ReactNode; options?: Omit<SessionOptions, 'onExpired'> }

export function AuthProvider({ children, options }: Props) {
  const queryClient = useQueryClient()
  const [state, setState] = useState<AuthState>(() =>
    hasPersistedSession(options?.store) ? { status: 'restoring' } : { status: 'signed-out' },
  )
  const signingOut = useRef(false)
  const optionsRef = useRef(options)

  const clearAppState = useCallback(() => {
    queryClient.clear()
    useUiStore.getState().reset()
  }, [queryClient])

  const onExpired = useCallback(() => {
    if (signingOut.current) return
    clearAppState()
    setState({ status: 'signed-out', notice: 'Your session ended. Please sign in again.' })
  }, [clearAppState])

  useEffect(() => {
    if (state.status !== 'restoring') return
    resumeOnce ??= resumeSession({ ...optionsRef.current, onExpired })
    let cancelled = false
    resumeOnce.then((auth) => {
      if (cancelled) return
      setState(auth ? { status: 'signed-in', auth } : { status: 'signed-out' })
    })
    return () => {
      cancelled = true
    }
  }, [state.status, onExpired])

  const signIn = useCallback(
    async (input: SignInInput) => {
      signingOut.current = false
      const auth = await signInService(input, { ...optionsRef.current, onExpired })
      clearAppState()
      setState({ status: 'signed-in', auth })
    },
    [onExpired, clearAppState],
  )

  const signOut = useCallback(async () => {
    if (state.status !== 'signed-in') return
    signingOut.current = true
    try {
      await signOutService(state.auth, { store: optionsRef.current?.store })
    } catch {
      // The server session may outlive this, but local credentials are gone.
    } finally {
      resumeOnce = null
      clearAppState()
      setState({ status: 'signed-out' })
    }
  }, [state, clearAppState])

  const value = useMemo(() => ({ state, signIn, signOut }), [state, signIn, signOut])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
