/** Placing small SVG labels so they do not sit on nodes, node labels or other labels. */

export interface Box {
  readonly x0: number
  readonly y0: number
  readonly x1: number
  readonly y1: number
}

export type Anchor = 'start' | 'middle' | 'end'

/** The box a single line of text covers: `y` is the baseline, `size` the font size in px. */
export function textBox(x: number, y: number, anchor: Anchor, width: number, size: number): Box {
  const x0 = anchor === 'start' ? x : anchor === 'end' ? x - width : x - width / 2
  return { x0, y0: y - size * 0.85, x1: x0 + width, y1: y + size * 0.25 }
}

/** A box from its top-left corner and size. */
export function rectBox(x: number, y: number, w: number, h: number): Box {
  return { x0: x, y0: y, x1: x + w, y1: y + h }
}

/** A square around a centre. */
export function around(cx: number, cy: number, half: number): Box {
  return { x0: cx - half, y0: cy - half, x1: cx + half, y1: cy + half }
}

export function shifted(b: Box, dx: number, dy: number): Box {
  return { x0: b.x0 + dx, y0: b.y0 + dy, x1: b.x1 + dx, y1: b.y1 + dy }
}

export function intersects(a: Box, b: Box, pad = 2): boolean {
  return a.x0 < b.x1 + pad && b.x0 < a.x1 + pad && a.y0 < b.y1 + pad && b.y0 < a.y1 + pad
}

export interface Placed {
  readonly x: number
  readonly y: number
  readonly anchor: Anchor
  readonly box: Box
}

/** The first candidate that clears every obstacle; the first one when all of them collide. */
export function firstClear(candidates: readonly Placed[], obstacles: readonly Box[]): Placed {
  const clear = candidates.find((c) => !obstacles.some((o) => intersects(c.box, o)))
  return clear ?? candidates[0]
}
