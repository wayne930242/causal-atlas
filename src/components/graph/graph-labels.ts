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

/** Whether the segment a–b passes through the box. */
export function segmentHitsBox(a: { readonly x: number; readonly y: number }, b: { readonly x: number; readonly y: number }, box: Box): boolean {
  let t0 = 0
  let t1 = 1
  const dx = b.x - a.x
  const dy = b.y - a.y
  for (const [p, q] of [
    [-dx, a.x - box.x0],
    [dx, box.x1 - a.x],
    [-dy, a.y - box.y0],
    [dy, box.y1 - a.y],
  ] as const) {
    if (p === 0) {
      if (q < 0) return false
      continue
    }
    const r = q / p
    if (p < 0) t0 = Math.max(t0, r)
    else t1 = Math.min(t1, r)
    if (t0 > t1) return false
  }
  return true
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

export type PopSide = 'right' | 'left' | 'below' | 'above'

export interface PopPlacement {
  readonly x: number
  readonly y: number
  readonly side: PopSide
}

/**
 * Where a popover of `size` goes around a node at `at` (radius `r`) inside a graph box of `bounds`:
 * to its right, vertically centred; failing that to its left, then below, then above. Of the sides
 * that fit, it takes the one that covers least: a box in `avoid` (another node) counts three, one in
 * `soft` (another node's label) one. It never leaves the box (the offset along the side is clamped);
 * `gap` is the clear space to the node.
 */
export function placePop(
  at: { readonly x: number; readonly y: number },
  r: number,
  size: { readonly w: number; readonly h: number },
  bounds: { readonly w: number; readonly h: number },
  gap: number,
  avoid: readonly Box[] = [],
  soft: readonly Box[] = [],
): PopPlacement {
  const clampX = (x: number): number => Math.max(0, Math.min(x, bounds.w - size.w))
  const clampY = (y: number): number => Math.max(0, Math.min(y, bounds.h - size.h))
  const right = at.x + r + gap
  const left = at.x - r - gap - size.w
  const below = at.y + r + gap
  const above = at.y - r - gap - size.h
  const sides: { readonly fits: boolean; readonly place: PopPlacement }[] = [
    { fits: right + size.w <= bounds.w, place: { x: right, y: clampY(at.y - size.h / 2), side: 'right' } },
    { fits: left >= 0, place: { x: left, y: clampY(at.y - size.h / 2), side: 'left' } },
    { fits: below + size.h <= bounds.h, place: { x: clampX(at.x - size.w / 2), y: below, side: 'below' } },
    { fits: above >= 0, place: { x: clampX(at.x - size.w / 2), y: above, side: 'above' } },
  ]
  const cost = (p: PopPlacement): number => {
    const box = { x0: p.x, y0: p.y, x1: p.x + size.w, y1: p.y + size.h }
    return 3 * avoid.filter((b) => intersects(box, b, 0)).length + soft.filter((b) => intersects(box, b, 0)).length
  }
  let best: PopPlacement | undefined
  for (const s of sides) if (s.fits && (best === undefined || cost(s.place) < cost(best))) best = s.place
  return best ?? { x: clampX(right), y: clampY(at.y - size.h / 2), side: 'right' }
}
