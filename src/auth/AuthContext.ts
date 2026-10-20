import { createContext, useContext } from 'react'
import type { AuthSession, SignInInput } from '../services/atproto/session'

export type AuthState =
  | { status: 'restoring' }
  | { status: 'signed-out'; notice?: string }
  | { status: 'signed-in'; auth: AuthSession }

export type AuthContextValue = {
  state: AuthState
  signIn: (input: SignInInput) => Promise<void>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuthContext must be used inside <AuthProvider>')
  return ctx
}

/** For components that only render when signed in. */
export function useAuth(): AuthSession {
  const { state } = useAuthContext()
  if (state.status !== 'signed-in') throw new Error('useAuth requires a signed-in session')
  return state.auth
}
