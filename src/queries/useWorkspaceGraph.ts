import { useMemo } from 'react'
import type { Annotation, GraphData, GraphGroup } from '../graph/model'
import { indexAnnotationsByUrl, noteToAnnotation } from '../services/sources/margin/notes'
import { buildSembleGraph, collectionToGroup, countCardsByCollection } from '../services/sources/semble/mapping'
import { normaliseUrl } from '../services/sources/url'
import { useUiStore } from '../state/uiStore'
import { useMarginNotes } from './margin'
import { useCollections, useConnections, useLibrary } from './semble'

const EMPTY: GraphData = { items: [], links: [], warnings: [] }

/**
 * Single place where source data (Semble + Margin) becomes the generic
 * graph. Adding another source means adding another adapter here; the
 * canvas and inspector stay unchanged.
 */
export function useWorkspaceGraph() {
  const selectedGroupIds = useUiStore((s) => s.selectedGroupIds)
  const hasSelection = selectedGroupIds.length > 0

  const collections = useCollections()
  const library = useLibrary()
  const connections = useConnections(hasSelection)
  const margin = useMarginNotes(hasSelection)

  const groups: GraphGroup[] = useMemo(() => {
    const counts = library.data ? countCardsByCollection(library.data) : undefined
    return (collections.data?.records ?? [])
      .map((rec) => collectionToGroup(rec, counts?.get(rec.uri)))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [collections.data, library.data])

  const groupNames = useMemo(() => new Map(groups.map((g) => [g.id, g.name])), [groups])

  // Ignore selections for collections that no longer exist.
  const activeGroupIds = useMemo(
    () => (collections.data ? selectedGroupIds.filter((id) => groupNames.has(id)) : selectedGroupIds),
    [collections.data, selectedGroupIds, groupNames],
  )

  const data: GraphData = useMemo(() => {
    if (!library.data || !connections.data || activeGroupIds.length === 0) return EMPTY
    return buildSembleGraph(activeGroupIds, library.data, connections.data)
  }, [library.data, connections.data, activeGroupIds])

  const annotationsByItem = useMemo(() => {
    const map = new Map<string, Annotation[]>()
    if (!margin.data) return map
    const byUrl = indexAnnotationsByUrl(margin.data.records.map(noteToAnnotation))
    for (const item of data.items) {
      if (!item.url) continue
      const notes = byUrl.get(normaliseUrl(item.url))
      if (notes?.length) map.set(item.id, notes)
    }
    return map
  }, [margin.data, data.items])

  const graphLoading = hasSelection && (library.isPending || connections.isPending)
  const graphError = library.error ?? connections.error

  return {
    groups,
    groupNames,
    activeGroupIds,
    data,
    annotationsByItem,
    collections,
    library,
    connections,
    margin,
    graphLoading,
    graphError,
    refetchAll: () => Promise.all([collections.refetch(), library.refetch(), connections.refetch(), margin.refetch()]),
  }
}

export type WorkspaceGraph = ReturnType<typeof useWorkspaceGraph>
