import type { Box, Placed } from '../../components/graph/graph-labels.ts'
import { firstClear, intersects, rectBox, segmentHitsBox, textBox } from '../../components/graph/graph-labels.ts'
import type { Point } from '../../components/graph/signal-shapes.ts'
import { arrowHead, unit } from '../../components/graph/signal-shapes.ts'
import { textWidth } from '../../components/text/text-measure.ts'

/**
 * The geometry of a Kripke picture, computed on the server without the DOM: each world a Garson-style
 * box listing its atoms, its name beside the box where no arrow or other box covers it, and the
 * accessibility arrows from border to border (self-loops on the top edge, a symmetric pair merged into
 * one double-headed arrow when asked). Pure.
 */

export type GraphLayoutKind = 'manual' | 'circle' | 'line' | 'layers'

export interface GraphWorld {
  readonly id: string
  /** The name written beside the box. */
  readonly name: string
  /** The lines written inside the box (true atoms, and false ones as ¬p when shown). */
  readonly lines: readonly string[]
  /** Manual layout units: x across, y down. */
  readonly pos?: { readonly x: number; readonly y: number }
}

export interface GraphInput {
  readonly worlds: readonly GraphWorld[]
  readonly pairs: readonly (readonly [string, string])[]
  readonly layout: GraphLayoutKind
  /** Where `layers` starts: the actual world. */
  readonly root?: string
  /** Draw wRv and vRw as one double-headed arrow. */
  readonly mergeSymmetric: boolean
}

export interface PlacedWorld {
  readonly id: string
  readonly cx: number
  readonly cy: number
  readonly w: number
  readonly h: number
  readonly lines: readonly string[]
  readonly name: string
  readonly label: Placed
}

export interface PlacedEdge {
  readonly from: string
  readonly to: string
  /** Also vRw, drawn in the same path. */
  readonly both: boolean
  readonly path: string
  readonly heads: readonly string[]
}

export interface GraphLayout {
  readonly worlds: readonly PlacedWorld[]
  readonly edges: readonly PlacedEdge[]
  readonly viewBox: string
  readonly width: number
  readonly height: number
}

const LINE = 17
const ATOM_SIZE = 13
const NAME_SIZE = 13
const PAD = 10
const GAP = 3
const MARGIN = 14

function boxSize(w: GraphWorld): { readonly w: number; readonly h: number } {
  const widest = Math.max(0, ...w.lines.map((l) => textWidth(l, ATOM_SIZE)))
  return { w: Math.max(40, Math.ceil(widest) + 2 * PAD), h: Math.max(28, w.lines.length * LINE + 2 * PAD - 6) }
}

function centres(input: GraphInput, sizes: readonly { w: number; h: number }[]): Point[] {
  const n = input.worlds.length
  const wide = Math.max(...sizes.map((s) => s.w))
  const tall = Math.max(...sizes.map((s) => s.h))
  const stepX = Math.max(130, wide + 80)
  const stepY = Math.max(96, tall + 56)
  switch (input.layout) {
    case 'manual':
      return input.worlds.map((w) => ({ x: (w.pos?.x ?? 0) * (stepX * 0.6), y: (w.pos?.y ?? 0) * (stepY * 0.6) }))
    case 'line':
      return input.worlds.map((_, i) => ({ x: i * stepX, y: 0 }))
    case 'circle': {
      if (n <= 2) return input.worlds.map((_, i) => ({ x: i * stepX, y: 0 }))
      const r = Math.max(stepY * 0.75, (stepX * n) / (2 * Math.PI))
      return input.worlds.map((_, i) => {
        const a = -Math.PI / 2 + (2 * Math.PI * i) / n
        return { x: r * Math.cos(a), y: r * Math.sin(a) }
      })
    }
    case 'layers': {
      const ids = input.worlds.map((w) => w.id)
      const depth = new Map<string, number>()
      const start = input.root ?? ids[0]
      if (start !== undefined) depth.set(start, 0)
      const queue = start === undefined ? [] : [start]
      while (queue.length > 0) {
        const a = queue.shift() as string
        for (const [x, y] of input.pairs) {
          if (x === a && !depth.has(y)) {
            depth.set(y, (depth.get(a) as number) + 1)
            queue.push(y)
          }
        }
      }
      const last = Math.max(0, ...depth.values()) + 1
      const column = ids.map((id) => depth.get(id) ?? last)
      return ids.map((id, i) => {
        const col = column[i] as number
        const mates = ids.filter((_, k) => column[k] === col)
        const row = mates.indexOf(id)
        return { x: col * stepX, y: (row - (mates.length - 1) / 2) * stepY }
      })
    }
  }
}

/** Where the ray from the box centre along (ux, uy) leaves the box, `gap` px further out. */
function border(c: Point, w: number, h: number, ux: number, uy: number, gap: number): Point {
  const t = Math.min(ux === 0 ? Infinity : w / 2 / Math.abs(ux), uy === 0 ? Infinity : h / 2 / Math.abs(uy))
  return { x: c.x + ux * (t + gap), y: c.y + uy * (t + gap) }
}

const fmt = (v: number): string => (Math.round(v * 10) / 10).toString()

interface Shape {
  readonly id: string
  readonly cx: number
  readonly cy: number
  readonly w: number
  readonly h: number
}

function edgeGeometry(a: Shape, b: Shape, both: boolean, offset: number): { path: string; heads: string[]; seg: [Point, Point] } {
  if (a.id === b.id) {
    const top = a.cy - a.h / 2
    const x1 = a.cx - 9
    const x2 = a.cx + 9
    const path = `M${fmt(x1)} ${fmt(top - GAP)}C${fmt(x1 - 14)} ${fmt(top - 34)} ${fmt(x2 + 14)} ${fmt(top - 34)} ${fmt(x2)} ${fmt(top - GAP)}`
    return { path, heads: [arrowHead({ x: x2, y: top - GAP }, -2, 8)], seg: [{ x: x1 - 16, y: top - 34 }, { x: x2 + 16, y: top }] }
  }
  const { ux, uy } = unit({ x: a.cx, y: a.cy }, { x: b.cx, y: b.cy })
  const ox = -uy * offset
  const oy = ux * offset
  const ca = { x: a.cx + ox, y: a.cy + oy }
  const cb = { x: b.cx + ox, y: b.cy + oy }
  const p = border(ca, a.w, a.h, ux, uy, GAP)
  const q = border(cb, b.w, b.h, -ux, -uy, GAP)
  const heads = [arrowHead(q, ux, uy)]
  if (both) heads.push(arrowHead(p, -ux, -uy))
  return { path: `M${fmt(p.x)} ${fmt(p.y)}L${fmt(q.x)} ${fmt(q.y)}`, heads, seg: [p, q] }
}

function nameCandidates(cx: number, cy: number, w: number, h: number, width: number): Placed[] {
  const make = (x: number, y: number, anchor: 'start' | 'middle' | 'end'): Placed => ({ x, y, anchor, box: textBox(x, y, anchor, width, NAME_SIZE) })
  return [
    make(cx, cy - h / 2 - 7, 'middle'),
    make(cx, cy + h / 2 + NAME_SIZE + 3, 'middle'),
    make(cx - w / 2 - 6, cy + 4, 'end'),
    make(cx + w / 2 + 6, cy + 4, 'start'),
    make(cx - w / 2, cy - h / 2 - 7, 'start'),
    make(cx + w / 2, cy + h / 2 + NAME_SIZE + 3, 'end'),
  ]
}

export function layoutWorldGraph(input: GraphInput): GraphLayout {
  const sizes = input.worlds.map(boxSize)
  const at = centres(input, sizes)
  const boxes = input.worlds.map((w, i) => {
    const c = at[i] as Point
    const s = sizes[i] as { w: number; h: number }
    return { id: w.id, cx: c.x, cy: c.y, w: s.w, h: s.h, lines: w.lines, name: w.name }
  })
  const byId = new Map(boxes.map((b) => [b.id, b]))
  const has = new Set(input.pairs.map(([a, b]) => `${a}\u0000${b}`))
  const edges: PlacedEdge[] = []
  const segments: [Point, Point][] = []
  /** Self-loops, as the boxes they cover. */
  const loops: Box[] = []
  for (const [from, to] of input.pairs) {
    const reverse = from !== to && has.has(`${to}\u0000${from}`)
    if (reverse && input.mergeSymmetric && input.worlds.findIndex((w) => w.id === from) > input.worlds.findIndex((w) => w.id === to)) continue
    const a = byId.get(from)
    const b = byId.get(to)
    if (a === undefined || b === undefined) continue
    const both = reverse && input.mergeSymmetric
    const g = edgeGeometry(a, b, both, reverse && !both ? 4 : 0)
    edges.push({ from, to, both, path: g.path, heads: g.heads })
    if (from === to) loops.push({ x0: g.seg[0].x, y0: g.seg[0].y, x1: g.seg[1].x, y1: g.seg[1].y })
    else segments.push(g.seg)
  }
  const obstacles: Box[] = [...boxes.map((b) => rectBox(b.cx - b.w / 2, b.cy - b.h / 2, b.w, b.h)), ...loops]
  const worlds: PlacedWorld[] = boxes.map((b) => {
    const width = textWidth(b.name, NAME_SIZE)
    const candidates = nameCandidates(b.cx, b.cy, b.w, b.h, width)
    const free = candidates.filter((c) => !segments.some(([p, q]) => segmentHitsBox(p, q, c.box)))
    const label = firstClear(free.length > 0 ? free : candidates, obstacles)
    obstacles.push(label.box)
    return { ...b, label }
  })
  const all = [...obstacles, ...segments.map(([p, q]) => ({ x0: Math.min(p.x, q.x), y0: Math.min(p.y, q.y), x1: Math.max(p.x, q.x), y1: Math.max(p.y, q.y) }))]
  const x0 = Math.min(...all.map((b) => b.x0)) - MARGIN
  const y0 = Math.min(...all.map((b) => b.y0)) - MARGIN
  const x1 = Math.max(...all.map((b) => b.x1)) + MARGIN
  const y1 = Math.max(...all.map((b) => b.y1)) + MARGIN
  return { worlds, edges, viewBox: `${fmt(x0)} ${fmt(y0)} ${fmt(x1 - x0)} ${fmt(y1 - y0)}`, width: Math.round(x1 - x0), height: Math.round(y1 - y0) }
}

/** Whether two placed labels overlap: for tests. */
export function labelsOverlap(layout: GraphLayout): boolean {
  return layout.worlds.some((a, i) => layout.worlds.some((b, k) => k > i && intersects(a.label.box, b.label.box, 0)))
}
