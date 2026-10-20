import type { GraphItem } from '../../graph/model'
import { useEditConnection } from '../../queries/semble'
import { styleForType } from '../../services/sources/semble/connectionTypes'
import { endpointFor, isDuplicateLink, planConnectionEdit } from '../../services/sources/semble/mapping'
import { useUiStore } from '../../state/uiStore'
import { Alert } from '../ui/Alert'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { TypeSwatch } from './TypeSwatch'
import { useWorkspace } from './WorkspaceContext'

function Side({ label, before, after }: { label: string; before?: GraphItem; after?: GraphItem }) {
  const changed = before?.id !== after?.id
  return (
    <div className={`rounded-md border px-3 py-2 ${changed ? 'border-accent bg-accent-soft' : 'border-line bg-surface-2'}`}>
      <div className="text-[11px] font-medium uppercase tracking-wide text-ink-3">
        {label}
        {changed ? ' · changed' : ''}
      </div>
      {changed ? <div className="truncate text-[12px] text-ink-3 line-through">{before?.title}</div> : null}
      <div className="truncate text-[13px] font-semibold">{after?.title}</div>
    </div>
  )
}

/** Confirms moving one end of a connection to another card (a replace, never silent). */
export function ReconnectDialog() {
  const draft = useUiStore((s) => s.reconnectDraft)
  const setReconnectDraft = useUiStore((s) => s.setReconnectDraft)
  const { linksById, itemsById, connectionRecords, data } = useWorkspace()
  const edit = useEditConnection()

  const link = draft ? linksById.get(draft.linkId) : undefined
  const stored = link ? connectionRecords.get(link.id) : undefined
  const open = !!(draft && link && stored)
  const close = () => setReconnectDraft(null)

  let body = null
  if (open) {
    const newSource = itemsById.get(draft.sourceId)
    const newTarget = itemsById.get(draft.targetId)
    // Keep the stored value for an unchanged end so its URL/AT URI form is preserved.
    const plan = planConnectionEdit(stored.value, {
      ...(draft.sourceId !== link.sourceId && newSource ? { source: endpointFor(newSource) } : {}),
      ...(draft.targetId !== link.targetId && newTarget ? { target: endpointFor(newTarget) } : {}),
    })
    const duplicate = isDuplicateLink(
      data.links.filter((l) => l.id !== link.id),
      draft.sourceId,
      draft.targetId,
      link.type ?? '',
    )
    const style = styleForType(link.type)

    body = (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-[13px]">
          <TypeSwatch type={link.type} width={22} />
          <span className="font-medium">{style.label}</span>
          {link.note ? <span className="truncate text-ink-3">— {link.note}</span> : null}
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <Side label="From" before={itemsById.get(link.sourceId)} after={newSource} />
          <span aria-hidden="true" className="text-ink-3">
            →
          </span>
          <Side label="To" before={itemsById.get(link.targetId)} after={newTarget} />
        </div>
        {duplicate ? <Alert tone="warning">A connection of this type already exists between these cards.</Alert> : null}
        <p className="text-[12px] leading-snug text-ink-3">
          The connection is replaced in one commit (delete + create) so Semble sees the move. Its type, note and
          creation date are kept; its record ID changes.
        </p>
        <div className="flex justify-end gap-2 border-t border-line pt-3">
          <Button onClick={close}>Cancel</Button>
          <Button
            variant="primary"
            disabled={duplicate || plan.kind !== 'replace'}
            onClick={() => {
              close()
              if (plan.kind === 'replace') edit.mutate({ stored, plan })
            }}
          >
            Move connection
          </Button>
        </div>
      </div>
    )
  }

  return (
    <Dialog open={open} title="Move connection?" onClose={close} width="w-[540px]">
      {body}
    </Dialog>
  )
}
