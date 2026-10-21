import { create } from 'zustand'
import { EMPTY_FILTERS, type GraphFilters } from '../graph/filters'
import type { Position, Positions } from '../graph/layout'

export type SelectionIds = { nodes: string[]; edges: string[] }

/** An edge being created: endpoints from the drag, type/note prefilled on retry. */
export type LinkDraft = { sourceId: string; targetId: string; type?: string; note?: string }

/** Opens the add-card form, optionally prefilled and followed by a connection to an existing card. */
export type AddCardRequest = {
  url?: string
  title?: string
  description?: string
  imageUrl?: string
  collectionIds?: string[]
  connectTo?: { cardId: string; direction: 'outgoing' | 'incoming'; type?: string }
}

export type Notice = {
  id: number
  tone: 'error' | 'success' | 'info'
  message: string
  retryDraft?: LinkDraft
}

type UiState = {
  selectedGroupIds: string[]
  /** Storage key the current `positions` belong to; null until loaded. */
  layoutKey: string | null
  positions: Positions
  selected: SelectionIds
  /** Programmatic selection (e.g. clicking a related card in the inspector). */
  selectionRequest: (SelectionIds & { nonce: number; focus: boolean }) | null
  filters: GraphFilters
  draft: LinkDraft | null
  /** Connections awaiting delete confirmation. */
  pendingDeleteLinkIds: string[]
  /** A dragged edge end awaiting confirmation: the connection and its proposed endpoints. */
  reconnectDraft: { linkId: string; sourceId: string; targetId: string } | null
  showEdgeLabels: boolean
  showExternal: boolean
  showMinimap: boolean
  notices: Notice[]
  addCardRequest: AddCardRequest | null

  setSelectedGroupIds: (ids: string[]) => void
  toggleGroup: (id: string) => void
  loadLayout: (key: string, positions: Positions) => void
  mergePositions: (positions: Positions) => void
  movePosition: (id: string, pos: Position) => void
  setSelected: (selected: SelectionIds) => void
  /** Selects in the canvas; `focus` (default true) also pans and zooms to it. */
  requestSelection: (selected: SelectionIds, opts?: { focus?: boolean }) => void
  setFilters: (patch: Partial<GraphFilters>) => void
  resetFilters: () => void
  setDraft: (draft: LinkDraft | null) => void
  requestDeleteLinks: (ids: string[]) => void
  setReconnectDraft: (draft: UiState['reconnectDraft']) => void
  setShowEdgeLabels: (show: boolean) => void
  setShowExternal: (show: boolean) => void
  setShowMinimap: (show: boolean) => void
  notify: (notice: Omit<Notice, 'id'>) => void
  dismissNotice: (id: number) => void
  openAddCard: (request?: AddCardRequest) => void
  closeAddCard: () => void
  reset: () => void
}

const initial = {
  selectedGroupIds: [] as string[],
  layoutKey: null as string | null,
  positions: {} as Positions,
  selected: { nodes: [], edges: [] } as SelectionIds,
  selectionRequest: null as UiState['selectionRequest'],
  filters: EMPTY_FILTERS,
  draft: null as LinkDraft | null,
  pendingDeleteLinkIds: [] as string[],
  reconnectDraft: null as UiState['reconnectDraft'],
  showEdgeLabels: false,
  showExternal: true,
  showMinimap: true,
  notices: [] as Notice[],
  addCardRequest: null as AddCardRequest | null,
}

let noticeId = 0

export const useUiStore = create<UiState>()((set) => ({
  ...initial,
  setSelectedGroupIds: (ids) => set({ selectedGroupIds: ids }),
  toggleGroup: (id) =>
    set((s) => ({
      selectedGroupIds: s.selectedGroupIds.includes(id)
        ? s.selectedGroupIds.filter((g) => g !== id)
        : [...s.selectedGroupIds, id],
    })),
  loadLayout: (layoutKey, positions) => set({ layoutKey, positions }),
  mergePositions: (positions) => set((s) => ({ positions: { ...s.positions, ...positions } })),
  movePosition: (id, pos) => set((s) => ({ positions: { ...s.positions, [id]: pos } })),
  setSelected: (selected) => set({ selected }),
  requestSelection: (selected, opts) =>
    set((s) => ({
      selected: { nodes: selected.nodes, edges: selected.edges },
      selectionRequest: { ...selected, focus: opts?.focus ?? true, nonce: (s.selectionRequest?.nonce ?? 0) + 1 },
    })),
  setFilters: (patch) => set((s) => ({ filters: { ...s.filters, ...patch } })),
  resetFilters: () => set({ filters: EMPTY_FILTERS }),
  setDraft: (draft) => set({ draft }),
  requestDeleteLinks: (ids) => set({ pendingDeleteLinkIds: ids }),
  setReconnectDraft: (reconnectDraft) => set({ reconnectDraft }),
  setShowEdgeLabels: (showEdgeLabels) => set({ showEdgeLabels }),
  setShowExternal: (showExternal) => set({ showExternal }),
  setShowMinimap: (showMinimap) => set({ showMinimap }),
  notify: (notice) => set((s) => ({ notices: [...s.notices.slice(-3), { ...notice, id: ++noticeId }] })),
  dismissNotice: (id) => set((s) => ({ notices: s.notices.filter((n) => n.id !== id) })),
  openAddCard: (request = {}) => set({ addCardRequest: request }),
  closeAddCard: () => set({ addCardRequest: null }),
  reset: () => set(initial),
}))
