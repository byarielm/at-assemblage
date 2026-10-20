import { LexAuthFactorError } from '@atproto/lex-password-session'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AuthContext, type AuthContextValue } from '../../auth/AuthContext'
import { SignInScreen } from './SignInScreen'

function renderWith(signIn: AuthContextValue['signIn']) {
  const value: AuthContextValue = { state: { status: 'signed-out' }, signIn, signOut: vi.fn() }
  render(
    <AuthContext.Provider value={value}>
      <SignInScreen />
    </AuthContext.Provider>,
  )
}

describe('SignInScreen', () => {
  it('refuses anything that is not an App Password, before any request', async () => {
    const signIn = vi.fn()
    renderWith(signIn)
    await userEvent.type(screen.getByLabelText('Handle or DID'), 'alice.bsky.social')
    await userEvent.type(screen.getByLabelText('App Password'), 'my-real-password')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText(/Do not use your main account password/)).toBeInTheDocument()
    expect(signIn).not.toHaveBeenCalled()
  })

  it('asks for the emailed code when the PDS requires it, then retries with it', async () => {
    const signIn = vi
      .fn()
      .mockRejectedValueOnce(new LexAuthFactorError({} as never))
      .mockResolvedValueOnce(undefined)
    renderWith(signIn)
    await userEvent.type(screen.getByLabelText('Handle or DID'), 'alice.bsky.social')
    await userEvent.type(screen.getByLabelText('App Password'), 'abcd-efgh-ijkl-mnop')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    const code = await screen.findByLabelText('Email sign-in code')
    await userEvent.type(code, 'ABCDE-12345')
    await userEvent.click(screen.getByRole('button', { name: 'Verify and sign in' }))
    expect(signIn).toHaveBeenLastCalledWith(expect.objectContaining({ authFactorToken: 'ABCDE-12345' }))
  })

  it('shows a clear error for wrong credentials', async () => {
    const { XrpcResponseError } = await import('@atproto/lex-client')
    const { com } = await import('../../lexicons')
    const response = new Response(JSON.stringify({ error: 'AuthenticationRequired' }), { status: 401 })
    const err = new XrpcResponseError(com.atproto.server.createSession.main, response, {
      encoding: 'application/json',
      body: { error: 'AuthenticationRequired' },
    } as never)
    renderWith(vi.fn().mockRejectedValue(err))
    await userEvent.type(screen.getByLabelText('Handle or DID'), 'alice.bsky.social')
    await userEvent.type(screen.getByLabelText('App Password'), 'abcd-efgh-ijkl-mnop')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Handle or App Password is incorrect.')
  })
})
