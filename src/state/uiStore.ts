import { create } from 'zustand'
import { EMPTY_FILTERS, type GraphFilters } from '../graph/filters'
import type { Position, Positions } from '../graph/layout'

export type SelectionIds = { nodes: string[]; edges: string[] }

/** An edge being created: endpoints from the drag, type/note prefilled on retry. */
export type LinkDraft = { sourceId: string; targetId: string; type?: string; note?: string }

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
  selectionRequest: (SelectionIds & { nonce: number }) | null
  filters: GraphFilters
  draft: LinkDraft | null
  pendingDeleteLinkId: string | null
  showEdgeLabels: boolean
  /** Bumped to request a fresh ELK layout of every visible node. */
  tidyRequest: number
  notices: Notice[]

  setSelectedGroupIds: (ids: string[]) => void
  toggleGroup: (id: string) => void
  loadLayout: (key: string, positions: Positions) => void
  mergePositions: (positions: Positions) => void
  movePosition: (id: string, pos: Position) => void
  setSelected: (selected: SelectionIds) => void
  requestSelection: (selected: SelectionIds) => void
  setFilters: (patch: Partial<GraphFilters>) => void
  resetFilters: () => void
  setDraft: (draft: LinkDraft | null) => void
  requestDeleteLink: (id: string | null) => void
  setShowEdgeLabels: (show: boolean) => void
  requestTidy: () => void
  notify: (notice: Omit<Notice, 'id'>) => void
  dismissNotice: (id: number) => void
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
  pendingDeleteLinkId: null as string | null,
  showEdgeLabels: false,
  tidyRequest: 0,
  notices: [] as Notice[],
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
  requestSelection: (selected) =>
    set((s) => ({ selectionRequest: { ...selected, nonce: (s.selectionRequest?.nonce ?? 0) + 1 } })),
  setFilters: (patch) => set((s) => ({ filters: { ...s.filters, ...patch } })),
  resetFilters: () => set({ filters: EMPTY_FILTERS }),
  setDraft: (draft) => set({ draft }),
  requestDeleteLink: (id) => set({ pendingDeleteLinkId: id }),
  setShowEdgeLabels: (showEdgeLabels) => set({ showEdgeLabels }),
  requestTidy: () => set((s) => ({ tidyRequest: s.tidyRequest + 1 })),
  notify: (notice) => set((s) => ({ notices: [...s.notices.slice(-3), { ...notice, id: ++noticeId }] })),
  dismissNotice: (id) => set((s) => ({ notices: s.notices.filter((n) => n.id !== id) })),
  reset: () => set(initial),
}))
