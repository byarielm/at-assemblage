import type { FitViewOptions } from '@xyflow/react'

/** The floating inspector: 320px wide, 16px from the canvas's top and right edges. */
export const INSPECTOR_WIDTH = 320
export const INSPECTOR_INSET = 16
/** Canvas width covered by the inspector plus a gap; things anchored right sit left of this. */
export const INSPECTOR_RESERVED = INSPECTOR_WIDTH + INSPECTOR_INSET + 12

/** Below this canvas width the minimap would collide with the view controls or the inspector. */
export const MINIMAP_MIN_CANVAS_WIDTH = 600 + INSPECTOR_RESERVED

const px = (n: number) => `${n}px` as const

/** Fit everything, keeping clear of the inspector on the right. */
export const FIT_PADDING: FitViewOptions['padding'] = {
  top: px(48),
  left: px(48),
  bottom: px(64),
  right: px(INSPECTOR_RESERVED + 32),
}

/** Zoom to a few cards, with more breathing room. */
export const FOCUS_PADDING: FitViewOptions['padding'] = {
  top: px(96),
  left: px(96),
  bottom: px(96),
  right: px(INSPECTOR_RESERVED + 96),
}
