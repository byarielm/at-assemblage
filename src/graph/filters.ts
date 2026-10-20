import type { Annotation, GraphData, GraphItem } from './model'

export type AnnotationFilter = 'any' | 'with' | 'without'

export type GraphFilters = {
  search: string
  /** Empty means "all loaded groups". */
  groupIds: string[]
  domains: string[]
  /** Upper-cased connection types; "" stands for untyped. Empty means all. */
  linkTypes: string[]
  annotations: AnnotationFilter
}

export const EMPTY_FILTERS: GraphFilters = {
  search: '',
  groupIds: [],
  domains: [],
  linkTypes: [],
  annotations: 'any',
}

export function isFiltering(f: GraphFilters): boolean {
  return !!f.search.trim() || f.groupIds.length > 0 || f.domains.length > 0 || f.linkTypes.length > 0 || f.annotations !== 'any'
}

function matchesSearch(item: GraphItem, needle: string, groupNames: Map<string, string>): boolean {
  if (!needle) return true
  const hay = [
    item.title,
    item.url,
    item.domain,
    item.description,
    item.siteName,
    ...item.notes,
    ...item.groupIds.map((g) => groupNames.get(g)),
  ]
  return hay.some((v) => v?.toLowerCase().includes(needle))
}

export type FilterResult = { itemIds: Set<string>; linkIds: Set<string> }

/**
 * Items are hidden by item filters; links are hidden by type filter or when
 * either endpoint is hidden.
 */
export function applyFilters(
  data: GraphData,
  filters: GraphFilters,
  annotationsByItem: Map<string, Annotation[]>,
  groupNames: Map<string, string> = new Map(),
): FilterResult {
  const needle = filters.search.trim().toLowerCase()
  const groups = new Set(filters.groupIds)
  const domains = new Set(filters.domains)
  const types = new Set(filters.linkTypes)

  const itemIds = new Set<string>()
  for (const item of data.items) {
    if (groups.size && !item.groupIds.some((g) => groups.has(g))) continue
    if (domains.size && !(item.domain && domains.has(item.domain))) continue
    const annotated = (annotationsByItem.get(item.id)?.length ?? 0) > 0
    if (filters.annotations === 'with' && !annotated) continue
    if (filters.annotations === 'without' && annotated) continue
    if (!matchesSearch(item, needle, groupNames)) continue
    itemIds.add(item.id)
  }

  const linkIds = new Set<string>()
  for (const link of data.links) {
    if (!itemIds.has(link.sourceId) || !itemIds.has(link.targetId)) continue
    if (types.size && !types.has((link.type ?? '').toUpperCase())) continue
    linkIds.add(link.id)
  }
  return { itemIds, linkIds }
}
