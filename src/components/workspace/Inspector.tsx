import { useState } from 'react'
import type { GraphItem, GraphLink } from '../../graph/model'
import { useCreateMarginNote } from '../../queries/margin'
import { describeError } from '../../services/atproto/errors'
import { CONNECTION_TYPES, styleForType } from '../../services/sources/semble/connectionTypes'
import { isHttpUrl } from '../../services/sources/url'
import { useUiStore } from '../../state/uiStore'
import { Alert } from '../ui/Alert'
import { Button } from '../ui/Button'
import { ConnectionEditPanel } from './ConnectionEditPanel'
import { SelectionPanel } from './SelectionPanel'
import { SuggestionsSection } from './SuggestionsSection'
import { TypeSwatch } from './TypeSwatch'
import { useWorkspace } from './WorkspaceContext'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-line px-4 py-3">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-3">{title}</h3>
      {children}
    </section>
  )
}

function formatDate(iso?: string) {
  if (!iso) return undefined
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? undefined : d.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
}

function LinkRow({ link, other, direction }: { link: GraphLink; other?: GraphItem; direction: 'out' | 'in' }) {
  const requestSelection = useUiStore((s) => s.requestSelection)
  const style = styleForType(link.type)
  return (
    <li>
      <button
        type="button"
        onClick={() => requestSelection({ nodes: [], edges: [link.id] })}
        className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-[13px] hover:bg-surface-2"
      >
        <TypeSwatch type={link.type} />
        <span className="shrink-0 text-ink-3">{direction === 'out' ? `${style.label} →` : `← ${style.label}`}</span>
        <span className="min-w-0 truncate">{other?.title ?? 'Unknown card'}</span>
        {other?.external ? <span className="shrink-0 text-[11px] text-ink-3">outside</span> : null}
        {link.pending ? <span className="ml-auto text-[11px] text-accent">saving</span> : null}
      </button>
    </li>
  )
}

function MarginNoteForm({ item }: { item: GraphItem & { url: string } }) {
  const [text, setText] = useState('')
  const create = useCreateMarginNote()
  const error = create.error ? describeError(create.error).message : null

  return (
    <form
      className="mt-2 space-y-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (!text.trim()) return
        const draft = text
        setText('') // The optimistic note appears in the list above; restore the text if the write fails.
        create.mutate({ url: item.url, title: item.title, text: draft }, { onError: () => setText(draft) })
      }}
    >
      <label htmlFor="margin-note" className="sr-only">
        New Margin note for this page
      </label>
      <textarea
        id="margin-note"
        rows={3}
        maxLength={3000}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Add a note about this page…"
        className="w-full resize-y rounded-md border border-line bg-surface px-2.5 py-1.5 text-[13px] focus:border-accent focus:outline-none"
      />
      {error ? <Alert tone="error">{error}</Alert> : null}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11.5px] text-ink-3">
          Saves an <code className="font-mono">at.margin.note</code> to your PDS.
        </span>
        <Button size="sm" type="submit" variant="primary" busy={create.isPending} disabled={!text.trim()}>
          Save note
        </Button>
      </div>
    </form>
  )
}

function ItemDetails({ item }: { item: GraphItem }) {
  const { data, itemsById, groupNames, annotationsByItem, margin } = useWorkspace()
  const outgoing = data.links.filter((l) => l.sourceId === item.id)
  const incoming = data.links.filter((l) => l.targetId === item.id)
  const annotations = annotationsByItem.get(item.id) ?? []

  return (
    <>
      {item.external ? (
        <div className="px-4 pt-3">
          <Alert tone="info">
            {item.external.label}. It appears because a connection from your selected collections points to it.
          </Alert>
        </div>
      ) : null}
      <div className="px-4 py-3">
        <div className="text-[12px] text-ink-3">{item.siteName ?? item.domain ?? (item.kind === 'NOTE' ? 'Note card' : 'Card')}</div>
        <h2 className="mt-0.5 text-[15px] font-semibold leading-snug">{item.title}</h2>
        {item.url ? (
          <p className="mt-1 break-all font-mono text-[11.5px] text-ink-3">{item.url}</p>
        ) : null}
        {isHttpUrl(item.url) ? (
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex h-7 items-center gap-1.5 rounded-md border border-line px-2 text-[13px] font-medium hover:bg-surface-2"
          >
            Open page<span className="sr-only"> (opens in a new tab)</span> ↗
          </a>
        ) : null}
      </div>
      {item.imageUrl && isHttpUrl(item.imageUrl) ? (
        <img src={item.imageUrl} alt="" referrerPolicy="no-referrer" className="max-h-40 w-full border-t border-line object-cover" />
      ) : null}
      {item.description ? (
        <Section title="Description">
          <p className="text-[13px] leading-relaxed text-ink-2">{item.description}</p>
        </Section>
      ) : null}
      {item.notes.length > 0 ? (
        <Section title={`Semble notes (${item.notes.length})`}>
          <ul className="space-y-2">
            {item.notes.map((n, i) => (
              <li key={i} className="whitespace-pre-wrap rounded-md bg-surface-2 px-2.5 py-1.5 text-[13px] leading-relaxed">
                {n}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
      {item.groupIds.length > 0 ? (
        <Section title="Collections">
          <div className="flex flex-wrap gap-1">
            {item.groupIds.map((g) => (
              <span key={g} className="rounded border border-line px-1.5 py-0.5 text-[12px] text-ink-2">
                {groupNames.get(g) ?? 'Collection'}
              </span>
            ))}
          </div>
        </Section>
      ) : null}
      <Section title={`Connections (${outgoing.length + incoming.length})`}>
        {outgoing.length + incoming.length === 0 ? (
          <p className="text-[13px] text-ink-3">None yet. Hover over this card and drag from one of the dots on its edges to another card.</p>
        ) : (
          <ul className="-mx-1.5">
            {outgoing.map((l) => (
              <LinkRow key={l.id} link={l} other={itemsById.get(l.targetId)} direction="out" />
            ))}
            {incoming.map((l) => (
              <LinkRow key={l.id} link={l} other={itemsById.get(l.sourceId)} direction="in" />
            ))}
          </ul>
        )}
      </Section>
      <Section title={`Margin notes (${annotations.length})`}>
        {margin.isError ? <Alert tone="warning">Could not load Margin notes. {describeError(margin.error).message}</Alert> : null}
        {annotations.length > 0 ? (
          <ul className="space-y-2">
            {annotations.map((a) => (
              <li key={a.id} className="rounded-md bg-surface-2 px-2.5 py-1.5 text-[13px] leading-relaxed">
                {a.text ? <p className="whitespace-pre-wrap">{a.text}</p> : <p className="italic text-ink-3">({a.motivation})</p>}
                <p className="mt-0.5 text-[11px] text-ink-3">{a.pending ? 'Saving…' : formatDate(a.createdAt)}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-ink-3">No Margin notes from you on this page.</p>
        )}
        {item.url ? <MarginNoteForm item={item as GraphItem & { url: string }} /> : null}
      </Section>
      {item.url && isHttpUrl(item.url) ? <SuggestionsSection key={item.url} card={item as GraphItem & { url: string }} /> : null}
    </>
  )
}

function Legend() {
  return (
    <Section title="Connection types">
      <ul className="space-y-1">
        {CONNECTION_TYPES.map((t) => (
          <li key={t.value} className="flex items-center gap-2 text-[12.5px]">
            <TypeSwatch type={t.value} withIcon width={14} />
            <span className="font-medium">{t.label}</span>
            <span className="truncate text-ink-3">{t.description}</span>
          </li>
        ))}
        <li className="flex items-center gap-2 text-[12.5px]">
          <TypeSwatch type="__unknown__" withIcon width={14} />
          <span className="font-medium">Other</span>
          <span className="text-ink-3">Type this app does not know</span>
        </li>
      </ul>
    </Section>
  )
}

export function Inspector() {
  const selected = useUiStore((s) => s.selected)
  const { itemsById, linksById, connectionRecords } = useWorkspace()
  const count = selected.nodes.length + selected.edges.length
  const item = selected.nodes.length === 1 && count === 1 ? itemsById.get(selected.nodes[0]!) : undefined
  const link = selected.edges.length === 1 && count === 1 ? linksById.get(selected.edges[0]!) : undefined

  return (
    <aside aria-label="Inspector" className="flex min-h-0 flex-col border-l border-line bg-surface">
      <div className="flex h-12 shrink-0 items-center border-b border-line px-4 text-[13px] font-semibold">Inspector</div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {item ? (
          <ItemDetails key={item.id} item={item} />
        ) : link ? (
          <ConnectionEditPanel key={`${link.id}:${connectionRecords.get(link.id)?.cid}`} link={link} />
        ) : count > 1 ? (
          <SelectionPanel />
        ) : (
          <>
            <div className="px-4 py-3 text-[13px] leading-relaxed text-ink-2">
              Select a card or connection to see its details. To connect two cards, hover over one and drag from a dot
              on its edge to the other. Shift-click or Shift-drag to select several. Use + to add a card.
            </div>
            <Legend />
          </>
        )}
      </div>
    </aside>
  )
}
