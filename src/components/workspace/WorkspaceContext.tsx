import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { applyFilters, type FilterResult } from '../../graph/filters'
import type { GraphItem, GraphLink } from '../../graph/model'
import { loadSelectedGroups, saveSelectedGroups } from '../../graph/positions'
import { useWorkspaceGraph, type WorkspaceGraph } from '../../queries/useWorkspaceGraph'
import { useUiStore } from '../../state/uiStore'

type WorkspaceValue = WorkspaceGraph & {
  visible: FilterResult
  itemsById: Map<string, GraphItem>
  linksById: Map<string, GraphLink>
}

const WorkspaceContext = createContext<WorkspaceValue | null>(null)

export function useWorkspace(): WorkspaceValue {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error('useWorkspace must be used inside <WorkspaceProvider>')
  return ctx
}

/** Restores the collection selection for this DID and saves changes. */
function useSelectionPersistence(did: string) {
  useEffect(() => {
    useUiStore.getState().setSelectedGroupIds(loadSelectedGroups(did))
    return useUiStore.subscribe((s, prev) => {
      if (s.selectedGroupIds !== prev.selectedGroupIds) saveSelectedGroups(did, s.selectedGroupIds)
    })
  }, [did])
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { did } = useAuth()
  useSelectionPersistence(did)
  const graph = useWorkspaceGraph()
  const filters = useUiStore((s) => s.filters)

  const visible = useMemo(
    () => applyFilters(graph.data, filters, graph.annotationsByItem, graph.groupNames),
    [graph.data, filters, graph.annotationsByItem, graph.groupNames],
  )
  const itemsById = useMemo(() => new Map(graph.data.items.map((i) => [i.id, i])), [graph.data.items])
  const linksById = useMemo(() => new Map(graph.data.links.map((l) => [l.id, l])), [graph.data.links])

  const value = useMemo(() => ({ ...graph, visible, itemsById, linksById }), [graph, visible, itemsById, linksById])
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}
