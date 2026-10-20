export type Side = 'top' | 'right' | 'bottom' | 'left'

export type Rect = { x: number; y: number; width: number; height: number }

const OPPOSITE: Record<Side, Side> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' }

/**
 * Chooses the facing sides an edge should attach to: compare the clear gap
 * between the two cards horizontally and vertically, and connect across
 * whichever gap is larger. Cards side by side connect left↔right; stacked
 * cards connect top↔bottom.
 */
export function chooseSides(source: Rect, target: Rect): { source: Side; target: Side } {
  const dx = target.x + target.width / 2 - (source.x + source.width / 2)
  const dy = target.y + target.height / 2 - (source.y + source.height / 2)
  const gapX = Math.abs(dx) - (source.width + target.width) / 2
  const gapY = Math.abs(dy) - (source.height + target.height) / 2
  // Overlapping cards have no clear gap: compare offsets relative to card size instead.
  const horizontal =
    gapX < 0 && gapY < 0
      ? Math.abs(dx) / (source.width + target.width) >= Math.abs(dy) / (source.height + target.height)
      : gapX >= gapY
  const side: Side = horizontal ? (dx >= 0 ? 'right' : 'left') : dy >= 0 ? 'bottom' : 'top'
  return { source: side, target: OPPOSITE[side] }
}

export const SIDES: readonly Side[] = ['top', 'right', 'bottom', 'left']

/** Handle ids on each card: a visible source and a hidden target per side. */
export const sourceHandleId = (side: Side) => `s-${side}`
export const targetHandleId = (side: Side) => `t-${side}`
