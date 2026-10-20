import type { ELK as ElkInstance } from 'elkjs/lib/elk-api'
import type { GraphItem, GraphLink } from './model'

export type Position = { x: number; y: number }
export type Positions = Record<string, Position>

export const NODE_WIDTH = 260
export const NODE_HEIGHT = 120

// ELK is ~1.4 MB; load it only when a layout is first needed.
let elkPromise: Promise<ElkInstance> | null = null
function getElk(): Promise<ElkInstance> {
  elkPromise ??= import('elkjs/lib/elk.bundled.js').then(({ default: ELK }) => new ELK())
  return elkPromise
}

/**
 * Deterministic layered layout (left → right, following link direction).
 * Unconnected items are packed as separate components by ELK.
 */
export async function layoutGraph(items: readonly GraphItem[], links: readonly GraphLink[]): Promise<Positions> {
  if (items.length === 0) return {}
  const ids = new Set(items.map((i) => i.id))
  const elk = await getElk()
  const graph = await elk.layout({
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.spacing.nodeNode': '40',
      'elk.layered.spacing.nodeNodeBetweenLayers': '90',
      'elk.spacing.componentComponent': '60',
      'elk.separateConnectedComponents': 'true',
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
    },
    // Sort for determinism: same data → same layout.
    children: [...items]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((i) => ({ id: i.id, width: NODE_WIDTH, height: NODE_HEIGHT })),
    edges: links
      .filter((l) => ids.has(l.sourceId) && ids.has(l.targetId) && l.sourceId !== l.targetId)
      .map((l) => ({ id: l.id, sources: [l.sourceId], targets: [l.targetId] })),
  })
  const out: Positions = {}
  for (const child of graph.children ?? []) out[child.id] = { x: child.x ?? 0, y: child.y ?? 0 }
  return out
}
