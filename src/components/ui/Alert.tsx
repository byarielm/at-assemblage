import type { ReactNode } from 'react'
import { Icon } from './Icon'

type Tone = 'error' | 'warning' | 'info' | 'success'

const TONES: Record<Tone, string> = {
  error: 'bg-danger-soft text-danger border-danger/30',
  warning: 'bg-warn-soft text-warn border-warn/30',
  info: 'bg-accent-soft text-ink border-accent/30',
  success: 'bg-success-soft text-success border-success/30',
}

export function Alert({ tone = 'info', children, action }: { tone?: Tone; children: ReactNode; action?: ReactNode }) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`flex items-start gap-2 rounded-md border px-3 py-2 text-[13px] leading-snug ${TONES[tone]}`}
    >
      <Icon name={tone === 'error' || tone === 'warning' ? 'warning' : tone === 'success' ? 'check' : 'info'} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
      {action}
    </div>
  )
}
