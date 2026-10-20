import { useReactFlow } from '@xyflow/react'
import { useMemo, useState } from 'react'
import { isFiltering, type AnnotationFilter } from '../../graph/filters'
import { describeError } from '../../services/atproto/errors'
import { CONNECTION_TYPES, styleForType } from '../../services/sources/semble/connectionTypes'
import { useUiStore } from '../../state/uiStore'
import { Alert } from '../ui/Alert'
import { Button, IconButton, Spinner } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { Logo } from '../ui/Logo'
import { NewCollectionDialog } from './NewCollectionDialog'
import { UserMenu } from './UserMenu'
import { useWorkspace } from './WorkspaceContext'

function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="border-b border-line px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function CollectionPicker() {
  const { groups, collections, library } = useWorkspace()
  const selected = useUiStore((s) => s.selectedGroupIds)
  const toggleGroup = useUiStore((s) => s.toggleGroup)
  const setSelectedGroupIds = useUiStore((s) => s.setSelectedGroupIds)
  const [creating, setCreating] = useState(false)

  let body: React.ReactNode
  if (collections.isPending) body = <Spinner label="Loading collections…" />
  else if (collections.isError)
    body = (
      <Alert
        tone="error"
        action={
          <Button size="sm" onClick={() => collections.refetch()}>
            Retry
          </Button>
        }
      >
        {describeError(collections.error).message}
      </Alert>
    )
  else if (groups.length === 0)
    body = (
      <p className="text-[13px] leading-snug text-ink-3">
        You have no Semble collections yet. Create one at{' '}
        <a href="https://semble.so" target="_blank" rel="noreferrer" className="text-accent underline">
          semble.so
        </a>
        , then reload.
      </p>
    )
  else
    body = (
      <fieldset>
        <legend className="sr-only">Collections to show</legend>
        <ul className="-mx-1.5 max-h-[38vh] space-y-px overflow-y-auto">
          {groups.map((g) => (
            <li key={g.id}>
              <label className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-[13px] hover:bg-surface-2">
                <input
                  type="checkbox"
                  checked={selected.includes(g.id)}
                  onChange={() => toggleGroup(g.id)}
                  className="h-4 w-4 shrink-0 accent-[var(--color-accent)]"
                />
                <span className="min-w-0 flex-1 truncate" title={g.description || g.name}>
                  {g.name}
                </span>
                <span className="shrink-0 text-[11.5px] tabular-nums text-ink-3">
                  {library.isPending ? '…' : (g.itemCount ?? 0)}
                </span>
              </label>
            </li>
          ))}
        </ul>
        {selected.length > 0 ? (
          <button type="button" className="mt-1.5 text-[12px] text-accent hover:underline" onClick={() => setSelectedGroupIds([])}>
            Clear selection
          </button>
        ) : null}
      </fieldset>
    )

  return (
    <Panel
      title="Collections"
      action={
        <IconButton
          icon="refresh"
          label="Reload collections"
          className="-my-1 h-6 w-6"
          onClick={() => {
            collections.refetch()
            library.refetch()
          }}
        />
      }
    >
      <Button size="sm" icon="plus" className="mb-2 w-full !justify-start" onClick={() => setCreating(true)}>
        New collection
      </Button>
      {body}
      <NewCollectionDialog open={creating} onClose={() => setCreating(false)} />
    </Panel>
  )
}

function SearchBox() {
  const search = useUiStore((s) => s.filters.search)
  const setFilters = useUiStore((s) => s.setFilters)
  return (
    <div className="relative">
      <Icon name="search" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
      <label htmlFor="graph-search" className="sr-only">
        Search cards
      </label>
      <input
        id="graph-search"
        type="search"
        value={search}
        onChange={(e) => setFilters({ search: e.target.value })}
        placeholder="Title, domain, URL, note, collection"
        className="h-8 w-full rounded-md border border-line bg-surface pl-8 pr-2 text-[13px] placeholder:text-ink-3 focus:border-accent focus:outline-none"
      />
    </div>
  )
}

function ChipToggle({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex max-w-full items-center gap-1.5 truncate rounded-full border px-2 py-0.5 text-[12px] ${
        active ? 'border-accent bg-accent-soft text-ink' : 'border-line text-ink-2 hover:bg-surface-2'
      }`}
    >
      {children}
    </button>
  )
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
}

function Filters() {
  const { data, activeGroupIds, groupNames, visible } = useWorkspace()
  const filters = useUiStore((s) => s.filters)
  const setFilters = useUiStore((s) => s.setFilters)
  const resetFilters = useUiStore((s) => s.resetFilters)

  const domains = useMemo(() => {
    const counts = new Map<string, number>()
    for (const i of data.items) if (i.domain && !i.external) counts.set(i.domain, (counts.get(i.domain) ?? 0) + 1)
    return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 12)
  }, [data.items])

  const linkTypes = useMemo(() => {
    const present = new Set(data.links.map((l) => (l.type ?? '').toUpperCase()))
    const known = CONNECTION_TYPES.map((t) => t.value).filter((t) => present.has(t))
    const unknown = [...present].filter((t) => !CONNECTION_TYPES.some((k) => k.value === t)).sort()
    return [...known, ...unknown]
  }, [data.links])

  const active = isFiltering(filters)

  return (
    <Panel
      title="Search & filter"
      action={
        active ? (
          <button type="button" className="text-[12px] text-accent hover:underline" onClick={resetFilters}>
            Reset
          </button>
        ) : null
      }
    >
      <SearchBox />
      {active ? (
        <p className="mt-1.5 text-[12px] text-ink-3" role="status">
          Showing {visible.itemIds.size} of {data.items.length} cards, {visible.linkIds.size} of {data.links.length}{' '}
          connections.
        </p>
      ) : null}

      {activeGroupIds.length > 1 ? (
        <div className="mt-3">
          <h3 className="mb-1 text-[12px] font-medium text-ink-2">Collection</h3>
          <div className="flex flex-wrap gap-1">
            {activeGroupIds.map((id) => (
              <ChipToggle key={id} active={filters.groupIds.includes(id)} onClick={() => setFilters({ groupIds: toggle(filters.groupIds, id) })}>
                {groupNames.get(id)}
              </ChipToggle>
            ))}
          </div>
        </div>
      ) : null}

      {linkTypes.length > 0 ? (
        <div className="mt-3">
          <h3 className="mb-1 text-[12px] font-medium text-ink-2">Connection type</h3>
          <div className="flex flex-wrap gap-1">
            {linkTypes.map((t) => {
              const style = styleForType(t || undefined)
              return (
                <ChipToggle key={t} active={filters.linkTypes.includes(t)} onClick={() => setFilters({ linkTypes: toggle(filters.linkTypes, t) })}>
                  <svg width="14" height="6" aria-hidden="true">
                    <line x1="0" y1="3" x2="14" y2="3" stroke={style.colour} strokeWidth="2.5" strokeDasharray={style.dash} />
                  </svg>
                  {style.label}
                </ChipToggle>
              )
            })}
          </div>
        </div>
      ) : null}

      {domains.length > 1 ? (
        <div className="mt-3">
          <h3 className="mb-1 text-[12px] font-medium text-ink-2">Domain</h3>
          <div className="flex flex-wrap gap-1">
            {domains.map(([d, n]) => (
              <ChipToggle key={d} active={filters.domains.includes(d)} onClick={() => setFilters({ domains: toggle(filters.domains, d) })}>
                {d} <span className="text-ink-3">{n}</span>
              </ChipToggle>
            ))}
          </div>
        </div>
      ) : null}

      <fieldset className="mt-3">
        <legend className="mb-1 text-[12px] font-medium text-ink-2">Margin notes</legend>
        <div className="flex gap-3 text-[13px]">
          {(
            [
              ['any', 'Any'],
              ['with', 'With notes'],
              ['without', 'Without'],
            ] as [AnnotationFilter, string][]
          ).map(([value, label]) => (
            <label key={value} className="flex items-center gap-1.5">
              <input
                type="radio"
                name="annotation-filter"
                checked={filters.annotations === value}
                onChange={() => setFilters({ annotations: value })}
                className="accent-[var(--color-accent)]"
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
    </Panel>
  )
}

function GraphActions() {
  const { fitView } = useReactFlow()
  const selectedNodes = useUiStore((s) => s.selected.nodes)
  const requestTidy = useUiStore((s) => s.requestTidy)
  const { data, refetchAll } = useWorkspace()
  const empty = data.items.length === 0
  const [reloading, setReloading] = useState(false)

  return (
    <Panel title="Graph">
      <div className="grid grid-cols-1 gap-1.5 [&>button]:justify-start">
        <Button size="sm" icon="fit" disabled={empty} onClick={() => fitView({ padding: 0.15, duration: 300 })}>
          Fit view
        </Button>
        <Button
          size="sm"
          icon="focus"
          disabled={selectedNodes.length === 0}
          onClick={() => fitView({ nodes: selectedNodes.map((id) => ({ id })), padding: 0.4, duration: 300, maxZoom: 1.2 })}
        >
          Zoom to selection
        </Button>
        <Button size="sm" icon="tidy" disabled={empty} onClick={requestTidy}>
          Tidy layout
        </Button>
        <Button
          size="sm"
          icon="refresh"
          busy={reloading}
          onClick={async () => {
            setReloading(true)
            await refetchAll().finally(() => setReloading(false))
          }}
        >
          Reload data
        </Button>
      </div>
    </Panel>
  )
}

export function Sidebar() {
  const hasSelection = useUiStore((s) => s.selectedGroupIds.length > 0)
  return (
    <nav aria-label="Collections and filters" className="flex min-h-0 flex-col border-r border-line bg-surface">
      <div className="flex h-12 shrink-0 items-center border-b border-line px-4">
        <Logo />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <CollectionPicker />
        {hasSelection ? (
          <>
            <Filters />
            <GraphActions />
          </>
        ) : null}
      </div>
      <UserMenu />
    </nav>
  )
}
