import { useDeleteConnection } from '../../queries/semble'
import { styleForType } from '../../services/sources/semble/connectionTypes'
import { useUiStore } from '../../state/uiStore'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { useWorkspace } from './WorkspaceContext'

export function DeleteConnectionDialog() {
  const linkId = useUiStore((s) => s.pendingDeleteLinkId)
  const requestDeleteLink = useUiStore((s) => s.requestDeleteLink)
  const { linksById, itemsById } = useWorkspace()
  const remove = useDeleteConnection()
  const link = linkId ? linksById.get(linkId) : undefined
  const open = !!link && !link.pending

  const confirm = () => {
    if (!link) return
    requestDeleteLink(null)
    remove.mutate(link.id)
  }

  return (
    <Dialog open={open} title="Delete connection?" onClose={() => requestDeleteLink(null)}>
      {link ? (
        <div className="space-y-4">
          <p className="text-sm leading-relaxed">
            This permanently deletes the <strong>{styleForType(link.type).label}</strong> connection from{' '}
            <strong>{itemsById.get(link.sourceId)?.title}</strong> to <strong>{itemsById.get(link.targetId)?.title}</strong>{' '}
            from your PDS. Both cards and their collections are not affected.
          </p>
          <div className="flex justify-end gap-2 border-t border-line pt-3">
            <Button onClick={() => requestDeleteLink(null)} autoFocus>
              Cancel
            </Button>
            <Button variant="danger" icon="trash" onClick={confirm}>
              Delete connection
            </Button>
          </div>
        </div>
      ) : null}
    </Dialog>
  )
}
