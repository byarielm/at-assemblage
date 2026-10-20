import { useMemo, useState } from 'react'
import type { GraphItem, GraphLink } from '../../graph/model'
import { useEditConnection } from '../../queries/semble'
import { describeError } from '../../services/atproto/errors'
import { CONNECTION_TYPES, styleForType, typeInfo } from '../../services/sources/semble/connectionTypes'
import { isDuplicateLink, planConnectionEdit, type EditPlan } from '../../services/sources/semble/mapping'
import { useUiStore } from '../../state/uiStore'
import { Alert } from '../ui/Alert'
import { Button } from '../ui/Button'
import { TypeSwatch } from './TypeSwatch'
import { useWorkspace } from './WorkspaceContext'

const NOTE_MAX = 1000

function Endpoint({ label, item }: { label: string; item?: GraphItem }) {
  const requestSelection = useUiStore((s) => s.requestSelection)
  return (
    <button
      type="button"
      onClick={() => item && requestSelection({ nodes: [item.id], edges: [] })}
      className="w-full rounded-md border border-line px-2.5 py-1.5 text-left hover:bg-surface-2"
    >
      <span className="block text-[11px] uppercase tracking-wide text-ink-3">{label}</span>
      <span className="block truncate text-[13px] font-medium">{item?.title ?? 'Unknown card'}</span>
      {item?.external ? <span className="block truncate text-[11px] text-ink-3">{item.external.label}</span> : null}
    </button>
  )
}

function formatDate(iso?: string) {
  if (!iso) return undefined
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? undefined : d.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
}

/**
 * Inspector view for one connection: change its type, note or direction.
 * Note-only edits update the record in place; type or direction changes
 * replace it atomically so Semble's index picks the change up.
 */
export function ConnectionEditPanel({ link }: { link: GraphLink }) {
  const { itemsById, connectionRecords, data } = useWorkspace()
  const requestDeleteLinks = useUiStore((s) => s.requestDeleteLinks)
  const edit = useEditConnection()
  const stored = connectionRecords.get(link.id)

  const originalType = typeInfo(link.type)?.value ?? link.type?.trim().toUpperCase() ?? ''
  const [type, setType] = useState(originalType)
  const [note, setNote] = useState(link.note ?? '')
  const [reversed, setReversed] = useState(false)

  const sourceId = reversed ? link.targetId : link.sourceId
  const targetId = reversed ? link.sourceId : link.targetId

  const { plan, invalid } = useMemo((): { plan: EditPlan; invalid?: string } => {
    if (!stored) return { plan: { kind: 'noop' } }
    try {
      return {
        plan: planConnectionEdit(stored.value, {
          type,
          note,
          ...(reversed ? { source: stored.value.target, target: stored.value.source } : {}),
        }),
      }
    } catch {
      return { plan: { kind: 'noop' }, invalid: `Notes are limited to ${NOTE_MAX} characters.` }
    }
  }, [stored, type, note, reversed])

  const others = data.links.filter((l) => l.id !== link.id)
  const duplicate = plan.kind === 'replace' && isDuplicateLink(others, sourceId, targetId, type)
  const dirty = plan.kind !== 'noop'
  const knownTypes = CONNECTION_TYPES.map((t) => t.value)
  const style = styleForType(type || undefined)

  const reset = () => {
    setType(originalType)
    setNote(link.note ?? '')
    setReversed(false)
  }

  const save = () => {
    if (!stored || plan.kind === 'noop' || duplicate) return
    edit.mutate({ stored, plan })
  }

  if (link.pending || !stored) {
    return (
      <div className="px-4 py-3">
        <div className="flex items-center gap-2">
          <TypeSwatch type={link.type} />
          <h2 className="text-[15px] font-semibold">{styleForType(link.type).label}</h2>
        </div>
        <p className="mt-1 text-[13px] text-accent">Saving to your PDS…</p>
      </div>
    )
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
    >
      <div className="px-4 py-3">
        <div className="flex items-center gap-2">
          <TypeSwatch type={type || undefined} />
          <h2 className="text-[15px] font-semibold">{style.label}</h2>
          {!style.known ? <span className="rounded bg-surface-2 px-1.5 text-[11px] text-ink-3">unknown type</span> : null}
          {dirty ? <span className="ml-auto text-[11.5px] font-medium text-warn">Unsaved changes</span> : null}
        </div>
      </div>

      <section className="border-t border-line px-4 py-3">
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Direction</h3>
        <div className="space-y-1.5">
          <Endpoint label="From" item={itemsById.get(sourceId)} />
          <div className="flex items-center justify-center gap-2">
            <span aria-hidden="true" className="text-ink-3">
              ↓
            </span>
            <Button size="sm" variant="ghost" aria-pressed={reversed} onClick={() => setReversed((r) => !r)}>
              Reverse direction
            </Button>
          </div>
          <Endpoint label="To" item={itemsById.get(targetId)} />
        </div>
        <p className="mt-2 text-[11.5px] leading-snug text-ink-3">
          To move an end to a different card, drag the end of the connection on the canvas.
        </p>
      </section>

      <section className="border-t border-line px-4 py-3">
        <label htmlFor="edit-connection-type" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-ink-3">
          Type
        </label>
        <div className="flex items-center gap-2">
          <TypeSwatch type={type || undefined} />
          <select
            id="edit-connection-type"
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="h-8 min-w-0 flex-1 rounded-md border border-line bg-surface px-2 text-[13px] focus:border-accent focus:outline-none"
          >
            {CONNECTION_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label} — {t.description}
              </option>
            ))}
            {originalType && !knownTypes.includes(originalType) ? <option value={originalType}>{originalType} (current, unknown)</option> : null}
            {!originalType ? <option value="">Untyped (current)</option> : null}
          </select>
        </div>
      </section>

      <section className="border-t border-line px-4 py-3">
        <label htmlFor="edit-connection-note" className="mb-1.5 flex justify-between text-[11px] font-semibold uppercase tracking-wide text-ink-3">
          <span>Note</span>
          <span className={`font-normal normal-case tracking-normal ${note.length > NOTE_MAX ? 'text-danger' : ''}`}>
            {note.length}/{NOTE_MAX}
          </span>
        </label>
        <textarea
          id="edit-connection-note"
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Why are these connected?"
          aria-invalid={!!invalid}
          className="w-full resize-y rounded-md border border-line bg-surface px-2.5 py-1.5 text-[13px] focus:border-accent focus:outline-none"
        />
        {invalid ? <p className="mt-1 text-[12px] text-danger">{invalid}</p> : null}
      </section>

      {dirty || edit.isError ? (
        <section className="space-y-2 border-t border-line px-4 py-3">
          {duplicate ? <Alert tone="warning">Another connection already has this type and direction.</Alert> : null}
          {edit.isError ? <Alert tone="error">{describeError(edit.error).message}</Alert> : null}
          {plan.kind === 'replace' ? (
            <p className="text-[11.5px] leading-snug text-ink-3">
              Semble only picks up note edits made by other apps, so a type or direction change is saved as a
              replacement: the old record is deleted and a new one created in a single commit. The new record keeps
              the original creation date but has a new ID.
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button type="submit" size="sm" variant="primary" disabled={!dirty || duplicate} busy={edit.isPending}>
              {plan.kind === 'update' ? 'Save note' : 'Save changes'}
            </Button>
            <Button size="sm" onClick={reset} disabled={!dirty}>
              Discard
            </Button>
          </div>
        </section>
      ) : null}

      <section className="border-t border-line px-4 py-3">
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Record</h3>
        <dl className="space-y-1 text-[12px]">
          {formatDate(link.createdAt) ? (
            <div className="flex gap-2">
              <dt className="text-ink-3">Created</dt>
              <dd>{formatDate(link.createdAt)}</dd>
            </div>
          ) : null}
          {formatDate(stored.value.updatedAt) && stored.value.updatedAt !== stored.value.createdAt ? (
            <div className="flex gap-2">
              <dt className="text-ink-3">Updated</dt>
              <dd>{formatDate(stored.value.updatedAt)}</dd>
            </div>
          ) : null}
          <div>
            <dt className="text-ink-3">AT URI</dt>
            <dd className="break-all font-mono text-[11px]">{link.id}</dd>
          </div>
        </dl>
      </section>

      <div className="border-t border-line px-4 py-3">
        <Button variant="danger" icon="trash" size="sm" onClick={() => requestDeleteLinks([link.id])}>
          Delete connection
        </Button>
        <p className="mt-1.5 text-[11.5px] text-ink-3">Or press Delete with the connection selected.</p>
      </div>
    </form>
  )
}
