/** A box in px, relative to the graph's wrapper. */
export interface Rect {
  readonly left: number
  readonly top: number
  readonly right: number
  readonly bottom: number
}

/** Width of the node menu, in px. */
export const MENU_W = 280

/** Under this wrapper width the menu spans it, under the node. */
export const MENU_NARROW = 520

/**
 * Where the node menu goes: beside the node (right, else left) when the wrapper has room, else
 * under it across the wrapper's width. `anchor` is the node's focus ring.
 */
export function placeMenu(anchor: Rect, wrapWidth: number): { readonly left: number; readonly top: number; readonly width: number } {
  if (wrapWidth < MENU_NARROW) return { left: 0, top: anchor.bottom + 4, width: wrapWidth }
  const top = Math.max(0, anchor.top)
  if (anchor.right + 8 + MENU_W <= wrapWidth) return { left: anchor.right + 8, top, width: MENU_W }
  if (anchor.left - 8 - MENU_W >= 0) return { left: anchor.left - 8 - MENU_W, top, width: MENU_W }
  const centre = (anchor.left + anchor.right) / 2
  return { left: Math.max(0, Math.min(centre - MENU_W / 2, wrapWidth - MENU_W)), top: anchor.bottom + 4, width: MENU_W }
}

/** Width of an edge's explanation, in px. */
export const TIP_W = 240

/** Where an edge's explanation goes: centred over the edge, kept inside the wrapper; `top` is its bottom edge. */
export function placeTip(anchor: Rect, wrapWidth: number): { readonly left: number; readonly top: number; readonly width: number } {
  const width = Math.min(TIP_W, wrapWidth)
  const centre = (anchor.left + anchor.right) / 2
  return { left: Math.max(0, Math.min(centre - width / 2, wrapWidth - width)), top: (anchor.top + anchor.bottom) / 2 - 10, width }
}
