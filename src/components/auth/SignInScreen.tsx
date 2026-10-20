import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { useAuthContext } from '../../auth/AuthContext'
import { config } from '../../config'
import { describeError } from '../../services/atproto/errors'
import { checkIdentifier } from '../../services/atproto/identity'
import { isAppPasswordFormat } from '../../services/atproto/session'
import { Alert } from '../ui/Alert'
import { Button } from '../ui/Button'

const schema = z.object({
  identifier: z.string().superRefine((value, ctx) => {
    const check = checkIdentifier(value)
    if (!check.ok) ctx.addIssue({ code: z.ZodIssueCode.custom, message: check.message })
  }),
  appPassword: z
    .string()
    .min(1, 'Enter an App Password.')
    .refine(isAppPasswordFormat, 'App Passwords look like xxxx-xxxx-xxxx-xxxx. Do not use your main account password.'),
  authFactorToken: z.string().optional(),
  keepSignedIn: z.boolean(),
})

type FormValues = z.infer<typeof schema>

const inputClass =
  'h-10 w-full rounded-md border border-line bg-surface px-3 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none aria-[invalid=true]:border-danger'

export function SignInScreen({ notice }: { notice?: string }) {
  const { signIn } = useAuthContext()
  const [needsCode, setNeedsCode] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setValue,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { identifier: '', appPassword: '', authFactorToken: '', keepSignedIn: false },
  })

  const onSubmit = handleSubmit(async (values) => {
    setError(null)
    try {
      await signIn({
        identifier: values.identifier,
        appPassword: values.appPassword,
        authFactorToken: needsCode ? values.authFactorToken : undefined,
        keepSignedIn: values.keepSignedIn,
      })
    } catch (err) {
      const described = describeError(err)
      if (described.kind === 'two-factor') {
        if (needsCode) setError('That code was not accepted. Check your email and try again.')
        setNeedsCode(true)
        setValue('authFactorToken', '')
        return
      }
      setError(described.message)
    }
  })

  return (
    <main className="flex min-h-full items-center justify-center p-6">
      <div className="w-[420px] max-w-full">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Assemblage</h1>
          <p className="mt-1 text-ink-2">Map and connect the cards in your Semble collections.</p>
        </div>

        <form onSubmit={onSubmit} noValidate className="space-y-4 rounded-lg border border-line bg-surface p-6 shadow-sm">
          {notice ? <Alert tone="info">{notice}</Alert> : null}

          <div className="space-y-1.5">
            <label htmlFor="identifier" className="block text-sm font-medium">
              Handle or DID
            </label>
            <input
              id="identifier"
              className={inputClass}
              placeholder="alice.bsky.social"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              aria-invalid={!!errors.identifier}
              aria-describedby={errors.identifier ? 'identifier-error' : undefined}
              {...register('identifier')}
            />
            {errors.identifier ? (
              <p id="identifier-error" className="text-[13px] text-danger">
                {errors.identifier.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="appPassword" className="block text-sm font-medium">
              App Password
            </label>
            <input
              id="appPassword"
              type="password"
              className={`${inputClass} font-mono`}
              placeholder="xxxx-xxxx-xxxx-xxxx"
              autoComplete="current-password"
              spellCheck={false}
              aria-invalid={!!errors.appPassword}
              aria-describedby="appPassword-help"
              {...register('appPassword')}
            />
            {errors.appPassword ? <p className="text-[13px] text-danger">{errors.appPassword.message}</p> : null}
            <p id="appPassword-help" className="text-[13px] leading-snug text-ink-3">
              Use an <strong className="font-medium text-ink-2">App Password</strong>, not your account password.
              Create one in your account settings — on Bluesky-hosted accounts that is{' '}
              <a className="text-accent underline" href={config.appPasswordHelpUrl} target="_blank" rel="noreferrer">
                Settings → Privacy and security → App passwords
              </a>
              . You can revoke it there at any time.
            </p>
          </div>

          {needsCode ? (
            <div className="space-y-1.5">
              <label htmlFor="authFactorToken" className="block text-sm font-medium">
                Email sign-in code
              </label>
              <input
                id="authFactorToken"
                className={`${inputClass} font-mono`}
                autoComplete="one-time-code"
                autoFocus
                {...register('authFactorToken')}
              />
              <p className="text-[13px] text-ink-3">Your PDS sent a code to your account email.</p>
            </div>
          ) : null}

          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--color-accent)]" {...register('keepSignedIn')} />
            <span>
              Keep me signed in
              <span className="block text-[13px] text-ink-3">
                Stores a refresh token in this browser. Leave off on shared computers.
              </span>
            </span>
          </label>

          {error ? <Alert tone="error">{error}</Alert> : null}

          <Button type="submit" variant="primary" busy={isSubmitting} className="w-full">
            {needsCode ? 'Verify and sign in' : 'Sign in'}
          </Button>
        </form>

        <p className="mt-4 text-[13px] leading-snug text-ink-3">
          Your App Password goes directly to your own PDS and is never stored. All reads and writes happen between this
          browser and your PDS; there is no Assemblage server.
        </p>
      </div>
    </main>
  )
}
