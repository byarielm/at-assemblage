import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type NodeChange,
  type OnSelectionChangeParams,
} from '@xyflow/react'
import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { layoutGraph, NODE_HEIGHT, type Positions } from '../../graph/layout'
import { layoutStorageKey, loadPositions, savePositions } from '../../graph/positions'
import { styleForType } from '../../services/sources/semble/connectionTypes'
import { useUiStore } from '../../state/uiStore'
import { CardNode, type CardNodeType } from './CardNode'
import { ConnectionEdge, type ConnectionEdgeType } from './ConnectionEdge'
import { useWorkspace } from './WorkspaceContext'

const nodeTypes = { card: CardNode }
const edgeTypes = { connection: ConnectionEdge }
const DRAFT_EDGE_ID = '__draft__'

/** Places new nodes below everything already positioned so manual layouts are never disturbed. */
function offsetBelow(existing: Positions, fresh: Positions): Positions {
  const ys = Object.values(existing).map((p) => p.y)
  const xs = Object.values(existing).map((p) => p.x)
  if (ys.length === 0) return fresh
  const top = Math.max(...ys) + NODE_HEIGHT + 80
  const left = Math.min(...xs)
  const out: Positions = {}
  for (const [id, p] of Object.entries(fresh)) out[id] = { x: p.x + left, y: p.y + top }
  return out
}

export function GraphCanvas() {
  const { did } = useAuth()
  const { data, visible, activeGroupIds, groupNames, annotationsByItem, itemsById } = useWorkspace()
  const { fitView, getNode } = useReactFlow<CardNodeType, ConnectionEdgeType>()

  const layoutKey = useUiStore((s) => s.layoutKey)
  const positions = useUiStore((s) => s.positions)
  const draft = useUiStore((s) => s.draft)
  const showEdgeLabels = useUiStore((s) => s.showEdgeLabels)
  const tidyRequest = useUiStore((s) => s.tidyRequest)
  const selectionRequest = useUiStore((s) => s.selectionRequest)
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null)

  const storageKey = layoutStorageKey(did, activeGroupIds)

  // 1. Load saved positions for this DID + collection set.
  useEffect(() => {
    useUiStore.getState().loadLayout(storageKey, loadPositions(storageKey))
  }, [storageKey])

  // 2. Lay out any visible items that have no position yet (first load, or new cards).
  const missing = useMemo(
    () => (layoutKey === storageKey ? data.items.filter((i) => !positions[i.id]) : []),
    [layoutKey, storageKey, data.items, positions],
  )
  useEffect(() => {
    if (missing.length === 0) return
    let cancelled = false
    const ids = new Set(missing.map((i) => i.id))
    const links = data.links.filter((l) => ids.has(l.sourceId) && ids.has(l.targetId))
    layoutGraph(missing, links).then((fresh) => {
      if (cancelled) return
      const { positions: current, mergePositions } = useUiStore.getState()
      const placed = offsetBelow(current, fresh)
      mergePositions(placed)
      savePositions(storageKey, { ...current, ...placed })
      if (Object.keys(current).length === 0) requestAnimationFrame(() => fitView({ padding: 0.15, duration: 300 }))
    })
    return () => {
      cancelled = true
    }
  }, [missing, data.links, storageKey, fitView])

  // 3. "Tidy layout": re-run ELK over the visible items only.
  useEffect(() => {
    if (tidyRequest === 0) return
    const items = data.items.filter((i) => visible.itemIds.has(i.id))
    const links = data.links.filter((l) => visible.linkIds.has(l.id))
    layoutGraph(items, links).then((fresh) => {
      const { positions: current, mergePositions } = useUiStore.getState()
      mergePositions(fresh)
      savePositions(storageKey, { ...current, ...fresh })
      requestAnimationFrame(() => fitView({ padding: 0.15, duration: 400 }))
    })
    // Only on explicit request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tidyRequest])

  const derivedNodes: CardNodeType[] = useMemo(() => {
    const multi = activeGroupIds.length > 1
    return data.items
      .filter((i) => visible.itemIds.has(i.id) && positions[i.id])
      .map((item) => ({
        id: item.id,
        type: 'card' as const,
        position: positions[item.id]!,
        ariaLabel: `Card: ${item.title}`,
        data: {
          item,
          annotationCount: annotationsByItem.get(item.id)?.length ?? 0,
          groupBadges: multi ? item.groupIds.map((g) => groupNames.get(g) ?? 'Collection') : [],
        },
      }))
  }, [data.items, visible.itemIds, positions, annotationsByItem, groupNames, activeGroupIds.length])

  const derivedEdges: ConnectionEdgeType[] = useMemo(() => {
    const edges: ConnectionEdgeType[] = data.links
      .filter((l) => visible.linkIds.has(l.id))
      .map((link) => {
        const style = styleForType(link.type)
        const colour = link.pending ? 'var(--color-accent)' : style.colour
        return {
          id: link.id,
          source: link.sourceId,
          target: link.targetId,
          type: 'connection' as const,
          ariaLabel: `${style.label} connection from ${itemsById.get(link.sourceId)?.title} to ${itemsById.get(link.targetId)?.title}`,
          markerEnd: { type: MarkerType.ArrowClosed, color: colour, width: 18, height: 18 },
          selectable: !link.pending,
          data: { link, style, pending: link.pending, showLabel: showEdgeLabels, hovered: hoveredEdge === link.id },
        }
      })
    if (draft && visible.itemIds.has(draft.sourceId) && visible.itemIds.has(draft.targetId)) {
      edges.push({
        id: DRAFT_EDGE_ID,
        source: draft.sourceId,
        target: draft.targetId,
        type: 'connection',
        selectable: false,
        markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--color-accent)', width: 18, height: 18 },
        data: { style: styleForType(draft.type), pending: true },
      })
    }
    return edges
  }, [data.links, visible, draft, showEdgeLabels, hoveredEdge, itemsById])

  // React Flow owns transient state (selection, drag); we feed it derived data and keep its selection.
  const [nodes, setNodes, onNodesChange] = useNodesState<CardNodeType>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<ConnectionEdgeType>([])
  useEffect(() => {
    setNodes((prev) => {
      const selected = new Set(prev.filter((n) => n.selected).map((n) => n.id))
      return derivedNodes.map((n) => (selected.has(n.id) ? { ...n, selected: true } : n))
    })
  }, [derivedNodes, setNodes])
  useEffect(() => {
    setEdges((prev) => {
      const selected = new Set(prev.filter((e) => e.selected).map((e) => e.id))
      return derivedEdges.map((e) => (selected.has(e.id) ? { ...e, selected: true } : e))
    })
  }, [derivedEdges, setEdges])

  // Programmatic selection from the inspector or search.
  useEffect(() => {
    if (!selectionRequest) return
    const nodeIds = new Set(selectionRequest.nodes)
    const edgeIds = new Set(selectionRequest.edges)
    setNodes((ns) => ns.map((n) => ({ ...n, selected: nodeIds.has(n.id) })))
    setEdges((es) => es.map((e) => ({ ...e, selected: edgeIds.has(e.id) })))
    useUiStore.getState().setSelected({ nodes: [...nodeIds], edges: [...edgeIds] })
    const focus = [...nodeIds]
    for (const id of edgeIds) {
      const link = data.links.find((l) => l.id === id)
      if (link) focus.push(link.sourceId, link.targetId)
    }
    if (focus.length) fitView({ nodes: focus.map((id) => ({ id })), padding: 0.4, duration: 300, maxZoom: 1.2 })
    // Only when a new request arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionRequest?.nonce])

  const onSelectionChange = useCallback(({ nodes: ns, edges: es }: OnSelectionChangeParams) => {
    useUiStore.getState().setSelected({ nodes: ns.map((n) => n.id), edges: es.map((e) => e.id) })
  }, [])

  const onConnect = useCallback((conn: Connection) => {
    if (!conn.source || !conn.target || conn.source === conn.target) return
    useUiStore.getState().setDraft({ sourceId: conn.source, targetId: conn.target })
  }, [])

  const isValidConnection = useCallback((conn: Connection | ConnectionEdgeType) => conn.source !== conn.target, [])

  // Persist positions when a move completes (mouse drag end or keyboard arrow move).
  const handleNodesChange = useCallback(
    (changes: NodeChange<CardNodeType>[]) => {
      onNodesChange(changes)
      let moved = false
      for (const c of changes) {
        if (c.type !== 'position' || c.dragging) continue
        const position = c.position ?? getNode(c.id)?.position
        if (position) {
          useUiStore.getState().movePosition(c.id, position)
          moved = true
        }
      }
      if (moved) savePositions(storageKey, useUiStore.getState().positions)
    },
    [onNodesChange, storageKey, getNode],
  )

  const onKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Delete' && e.key !== 'Backspace') return
    if ((e.target as HTMLElement).closest('input, textarea, select')) return
    const { selected, requestDeleteLink } = useUiStore.getState()
    if (selected.edges.length === 1 && selected.nodes.length === 0) {
      e.preventDefault()
      requestDeleteLink(selected.edges[0]!)
    }
  }, [])

  return (
    <div className="h-full w-full" onKeyDown={onKeyDown}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onSelectionChange={onSelectionChange}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        onEdgeMouseEnter={(_, edge) => setHoveredEdge(edge.id)}
        onEdgeMouseLeave={() => setHoveredEdge(null)}
        deleteKeyCode={null}
        multiSelectionKeyCode="Shift"
        selectionKeyCode="Shift"
        connectionLineStyle={{ stroke: 'var(--color-accent)', strokeWidth: 2, strokeDasharray: '6 4' }}
        minZoom={0.1}
        maxZoom={2}
        proOptions={{ hideAttribution: false }}
        ariaLabelConfig={{ 'node.a11yDescription.default': 'Press Enter to select. Use arrow keys to move the selected card.' }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
        <Controls showInteractive={false} position="bottom-left" />
        <MiniMap
          pannable
          zoomable
          position="bottom-right"
          ariaLabel="Minimap"
          nodeStrokeWidth={2}
          nodeColor="var(--color-line-strong)"
          maskColor="color-mix(in srgb, var(--color-canvas) 70%, transparent)"
        />
      </ReactFlow>
    </div>
  )
}
