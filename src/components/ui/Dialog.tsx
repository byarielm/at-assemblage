import { useEffect, useRef, type ReactNode } from 'react'
import { IconButton } from './Button'

type Props = {
  open: boolean
  title: string
  description?: ReactNode
  onClose: () => void
  children: ReactNode
  /** Disable closing via Escape/close button while a write is in flight. */
  locked?: boolean
  width?: string
}

/**
 * Native modal <dialog>: focus is trapped and restored by the browser, and
 * Escape closes it. Content only mounts while open so forms reset.
 */
export function Dialog({ open, title, description, onClose, children, locked, width = 'w-[460px]' }: Props) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (open && !el.open) el.showModal()
    if (!open && el.open) el.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-labelledby="dialog-title"
      className={`${width} max-w-[calc(100vw-32px)] rounded-lg border border-line bg-surface p-0 text-ink shadow-xl m-auto`}
      onCancel={(e) => {
        e.preventDefault()
        if (!locked) onClose()
      }}
    >
      {open ? (
        <div className="flex flex-col">
          <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-3.5">
            <div>
              <h2 id="dialog-title" className="text-[15px] font-semibold">
                {title}
              </h2>
              {description ? <div className="mt-0.5 text-[13px] text-ink-3">{description}</div> : null}
            </div>
            <IconButton icon="close" label="Close dialog" onClick={onClose} disabled={locked} />
          </header>
          <div className="px-5 py-4">{children}</div>
        </div>
      ) : null}
    </dialog>
  )
}
