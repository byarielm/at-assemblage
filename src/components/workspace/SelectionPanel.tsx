import { useMemo, useState } from 'react'
import { useBulkConnectionWrites } from '../../queries/semble'
import type { ConnectionWrite } from '../../services/sources/semble/api'
import { CONNECTION_TYPES, styleForType } from '../../services/sources/semble/connectionTypes'
import { planConnectionEdit } from '../../services/sources/semble/mapping'
import { useUiStore } from '../../state/uiStore'
import { Button } from '../ui/Button'
import { TypeSwatch } from './TypeSwatch'
import { useWorkspace } from './WorkspaceContext'

const PREVIEW = 8

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`
}

/** Inspector view for a multi-selection: bulk retype or delete connections. */
export function SelectionPanel() {
  const selected = useUiStore((s) => s.selected)
  const requestSelection = useUiStore((s) => s.requestSelection)
  const requestDeleteLinks = useUiStore((s) => s.requestDeleteLinks)
  const { data, visible, linksById, itemsById, connectionRecords } = useWorkspace()
  const bulk = useBulkConnectionWrites()
  const [type, setType] = useState(CONNECTION_TYPES[0]!.value)
  const [confirming, setConfirming] = useState(false)

  const links = selected.edges.map((id) => linksById.get(id)).filter((l) => l && !l.pending && connectionRecords.has(l.id))
  const nodeSet = new Set(selected.nodes)
  const between = data.links.filter(
    (l) => visible.linkIds.has(l.id) && nodeSet.has(l.sourceId) && nodeSet.has(l.targetId) && !l.pending,
  )

  /** Retype plan: skips links already of this type and ones that would duplicate another connection. */
  const retype = useMemo(() => {
    const t = type.toUpperCase()
    const selectedIds = new Set(links.map((l) => l!.id))
    const taken = new Set(
      data.links.filter((l) => !selectedIds.has(l.id)).map((l) => `${l.sourceId}>${l.targetId}>${(l.type ?? '').toUpperCase()}`),
    )
    const writes: ConnectionWrite[] = []
    let unchanged = 0
    let duplicates = 0
    for (const link of links) {
      const stored = connectionRecords.get(link!.id)!
      const plan = planConnectionEdit(stored.value, { type: t })
      if (plan.kind === 'noop') {
        unchanged++
        taken.add(`${link!.sourceId}>${link!.targetId}>${t}`)
        continue
      }
      const key = `${link!.sourceId}>${link!.targetId}>${t}`
      if (taken.has(key)) {
        duplicates++
        continue
      }
      taken.add(key)
      writes.push({ kind: 'replace', oldUri: stored.uri, record: plan.record })
    }
    return { writes, unchanged, duplicates }
  }, [type, links, data.links, connectionRecords])

  const label = styleForType(type).label
  const apply = () => {
    setConfirming(false)
    bulk.mutate({
      writes: retype.writes,
      description: `${plural(retype.writes.length, 'connection')} changed to ${label}.`,
    })
  }

  return (
    <div>
      <div className="px-4 py-3">
        <h2 className="text-[15px] font-semibold">Selection</h2>
        <p className="text-[13px] text-ink-2">
          {plural(selected.nodes.length, 'card')}, {plural(selected.edges.length, 'connection')}
        </p>
      </div>

      {selected.nodes.length >= 2 && between.length > 0 ? (
        <section className="border-t border-line px-4 py-3">
          <Button
            size="sm"
            onClick={() => requestSelection({ nodes: [], edges: between.map((l) => l.id) }, { focus: false })}
          >
            Select the {plural(between.length, 'connection')} between these cards
          </Button>
        </section>
      ) : null}

      {links.length > 0 ? (
        <>
          <section className="border-t border-line px-4 py-3">
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Connections</h3>
            <ul className="space-y-1">
              {links.slice(0, PREVIEW).map((l) => (
                <li key={l!.id} className="flex items-center gap-2 text-[12.5px]">
                  <TypeSwatch type={l!.type} />
                  <span className="min-w-0 truncate">
                    {itemsById.get(l!.sourceId)?.title} <span className="text-ink-3">→</span> {itemsById.get(l!.targetId)?.title}
                  </span>
                </li>
              ))}
            </ul>
            {links.length > PREVIEW ? <p className="mt-1 text-[12px] text-ink-3">and {links.length - PREVIEW} more</p> : null}
          </section>

          <section className="border-t border-line px-4 py-3">
            <label htmlFor="bulk-type" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-ink-3">
              Change type
            </label>
            <div className="flex items-center gap-2">
              <TypeSwatch type={type} />
              <select
                id="bulk-type"
                value={type}
                onChange={(e) => {
                  setType(e.target.value)
                  setConfirming(false)
                }}
                className="h-8 min-w-0 flex-1 rounded-md border border-line bg-surface px-2 text-[13px] focus:border-accent focus:outline-none"
              >
                {CONNECTION_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            {retype.unchanged + retype.duplicates > 0 ? (
              <p className="mt-1.5 text-[12px] text-ink-3">
                {[
                  retype.unchanged ? `${plural(retype.unchanged, 'is', 'are')} already ${label}` : '',
                  retype.duplicates ? `${retype.duplicates} would duplicate an existing connection` : '',
                ]
                  .filter(Boolean)
                  .join('; ')}{' '}
                — skipped.
              </p>
            ) : null}
            {confirming ? (
              <div className="mt-2 space-y-2 rounded-md border border-line bg-surface-2 p-2.5">
                <p className="text-[12.5px] leading-snug">
                  Replace {plural(retype.writes.length, 'connection')} with {label} versions? Each is deleted and
                  recreated in the same commit, so Semble picks up the change. Notes and creation dates are kept.
                </p>
                <div className="flex gap-2">
                  <Button size="sm" variant="primary" onClick={apply}>
                    Change {plural(retype.writes.length, 'connection')}
                  </Button>
                  <Button size="sm" onClick={() => setConfirming(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                size="sm"
                className="mt-2"
                disabled={retype.writes.length === 0}
                busy={bulk.isPending}
                onClick={() => setConfirming(true)}
              >
                Apply to {plural(retype.writes.length, 'connection')}
              </Button>
            )}
          </section>

          <section className="border-t border-line px-4 py-3">
            <Button variant="danger" icon="trash" size="sm" onClick={() => requestDeleteLinks(links.map((l) => l!.id))}>
              Delete {plural(links.length, 'connection')}
            </Button>
          </section>
        </>
      ) : selected.nodes.length > 0 ? (
        <p className="border-t border-line px-4 py-3 text-[12.5px] leading-snug text-ink-3">
          Shift-click connections to select several, then change their type or delete them together.
        </p>
      ) : null}
    </div>
  )
}
