import type { LoadedCase } from '../../data/load.ts'
import { evalExpr } from '../../engine/expr.ts'
import type { Assignment, CausalModel, Edge } from '../../engine/index.ts'
import { getVariable } from '../../engine/index.ts'
import { coerceToDomain, enumerateAssignments } from '../../engine/values.ts'
import type { Box } from './graph-labels.ts'
import { segmentHitsBox } from './graph-labels.ts'

/** Where a graph draws its nodes, arcs and edges, in grid units and px, and how each edge reads. Pure; no DOM access. */

export interface GridPos {
  readonly col: number
  readonly row: number
}

/** A latent common cause drawn as an arc: `via` is its variable, `a` and `b` two of its drawn children. */
export interface LatentArc {
  readonly via: string
  readonly a: string
  readonly b: string
}

/** The arcs of `latent_as_arcs` among the drawn variables: one per pair of drawn children, in the drawn order. */
export function latentArcs(c: LoadedCase, shown: readonly string[]): LatentArc[] {
  const out: LatentArc[] = []
  for (const via of c.data.latent_as_arcs ?? []) {
    const kids = new Set(c.model.edges.filter((e) => e.from === via).map((e) => e.to))
    const drawn = shown.filter((id) => kids.has(id))
    for (let i = 0; i < drawn.length; i++) for (let j = i + 1; j < drawn.length; j++) out.push({ via, a: drawn[i], b: drawn[j] })
  }
  return out
}

/** A point in px. */
export interface Pt {
  readonly x: number
  readonly y: number
}

/** `n + 1` points along the quadratic curve from `p0` to `p2` bent towards `control`. */
export function arcCurve(p0: Pt, control: Pt, p2: Pt, n = 24): Pt[] {
  const out: Pt[] = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const u = 1 - t
    out.push({ x: u * u * p0.x + 2 * u * t * control.x + t * t * p2.x, y: u * u * p0.y + 2 * u * t * control.y + t * t * p2.y })
  }
  return out
}

/** An arc as drawn: its ends on the two nodes' rims, the control point between them, the curve's middle. */
export interface ArcPlan extends LatentArc {
  readonly start: Pt
  readonly control: Pt
  readonly end: Pt
  readonly apex: Pt
  /** The unit normal the curve bulges along (up when it can). */
  readonly bulge: Pt
  /** A node the best curve still comes too close to, if any. */
  readonly hit: string | undefined
}

/** How high an arc's middle may stand above the chord between its ends, in px, tried in turn. */
const ARC_HEIGHTS = [44, 60, 80, 104, 132, 168] as const

function segmentsCross(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const side = (p: Pt, q: Pt, r: Pt): number => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x)
  return side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0
}

/**
 * Where each arc runs: the lowest bulge, on the upper side first, whose curve keeps `r` plus
 * EDGE_CLEARANCE from every node it does not join, then (in that order) off the boxes in `avoid`,
 * crossing the fewest edges and arcs already placed. `at` holds the nodes' centres, `r` their radius.
 */
export function planArcs(arcs: readonly LatentArc[], at: ReadonlyMap<string, Pt>, edges: readonly Edge[], r: number, avoid: readonly Box[] = []): ArcPlan[] {
  const out: ArcPlan[] = []
  const placed: Pt[][] = []
  for (const arc of arcs) {
    const a = at.get(arc.a)
    const b = at.get(arc.b)
    if (a === undefined || b === undefined) continue
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    const d = Math.hypot(b.x - a.x, b.y - a.y) || 1
    let n = { x: (b.y - a.y) / d, y: -(b.x - a.x) / d }
    // The upper side is the first; for a vertical pair, the left one.
    if (n.y > 1e-9 || (Math.abs(n.y) <= 1e-9 && n.x > 0)) n = { x: -n.x, y: -n.y }
    let best: { plan: ArcPlan; score: number } | undefined
    for (const [hi, height] of ARC_HEIGHTS.entries()) {
      for (const [si, side] of [1, -1].entries()) {
        const bulge = { x: n.x * side, y: n.y * side }
        const control = { x: mid.x + 2 * height * bulge.x, y: mid.y + 2 * height * bulge.y }
        const rim = (p: Pt): Pt => {
          const len = Math.hypot(control.x - p.x, control.y - p.y) || 1
          return { x: p.x + ((control.x - p.x) / len) * (r + 2), y: p.y + ((control.y - p.y) / len) * (r + 2) }
        }
        const start = rim(a)
        const end = rim(b)
        const curve = arcCurve(start, control, end, 40)
        let hit: string | undefined
        for (const [id, p] of at) {
          if (id === arc.a || id === arc.b) continue
          if (curve.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < r + EDGE_CLEARANCE)) {
            hit = id
            break
          }
        }
        let boxes = 0
        let crossings = 0
        for (let i = 0; i + 1 < curve.length; i++) {
          if (avoid.some((box) => segmentHitsBox(curve[i], curve[i + 1], box))) boxes += 1
        }
        const coarse = arcCurve(start, control, end, 16)
        for (let i = 0; i + 1 < coarse.length; i++) {
          for (const e of edges) {
            const p = at.get(e.from)
            const q = at.get(e.to)
            if (p !== undefined && q !== undefined && segmentsCross(coarse[i], coarse[i + 1], p, q)) crossings += 1
          }
          for (const other of placed) {
            for (let j = 0; j + 1 < other.length; j++) if (segmentsCross(coarse[i], coarse[i + 1], other[j], other[j + 1])) crossings += 1
          }
        }
        const score = (hit === undefined ? 0 : 1e6) + (boxes > 0 ? 1e4 : 0) + crossings * 100 + hi * 2 + si
        if (best === undefined || score < best.score) {
          best = { plan: { ...arc, start, control, end, apex: curve[20], bulge, hit }, score }
        }
      }
    }
    if (best !== undefined) {
      out.push(best.plan)
      placed.push(arcCurve(best.plan.start, best.plan.control, best.plan.end, 16))
    }
  }
  return out
}

/** A graph's spacing in px: column width, row height and node radius (SignalGraph draws with these). */
export interface Spacing {
  readonly col: number
  readonly row: number
  readonly r: number
}

export function graphSpacing(prob: boolean, compact: boolean): Spacing {
  return { col: compact ? 132 : 220, row: prob ? 170 : compact ? 112 : 120, r: prob ? 34 : 30 }
}

const SPACINGS: readonly Spacing[] = [graphSpacing(false, false), graphSpacing(true, false), graphSpacing(false, true), graphSpacing(true, true)]

/** How far past a node's radius an edge that does not end at it stays, in px. */
const EDGE_CLEARANCE = 10

/** Distance from `p` to the segment `a`–`b`. */
function segmentDistance(p: GridPos, a: GridPos, b: GridPos, s: Spacing): number {
  const [px, py, ax, ay, bx, by] = [p.col * s.col, p.row * s.row, a.col * s.col, a.row * s.row, b.col * s.col, b.row * s.row]
  const dx = bx - ax
  const dy = by - ay
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

/**
 * The first edge that, in some spacing, runs over a node it does not join; with that node. An
 * arc counts when no bulge of it clears the nodes: the pair is then treated as an edge to step off.
 */
function firstBlocked(
  grid: ReadonlyMap<string, GridPos>,
  edges: readonly Edge[],
  arcs: readonly LatentArc[] = [],
): { edge: Edge; node: string } | undefined {
  for (const edge of edges) {
    const a = grid.get(edge.from)
    const b = grid.get(edge.to)
    if (a === undefined || b === undefined) continue
    for (const [node, p] of grid) {
      if (node === edge.from || node === edge.to) continue
      if (SPACINGS.some((s) => segmentDistance(p, a, b, s) < s.r + EDGE_CLEARANCE)) return { edge, node }
    }
  }
  if (arcs.length === 0) return undefined
  for (const s of SPACINGS) {
    const at = new Map([...grid].map(([id, g]) => [id, { x: g.col * s.col, y: g.row * s.row }]))
    for (const plan of planArcs(arcs, at, edges, s.r)) {
      if (plan.hit !== undefined) return { edge: { from: plan.a, to: plan.b }, node: plan.hit }
    }
  }
  return undefined
}

/**
 * Grid positions: the case layout, else columns by longest path among the shown variables, each
 * node at the mean row of its parents (roots in declaration order, a column's nodes a row apart).
 * Then a node that an edge would run over steps half a row off that edge, pushing the nodes of
 * its column ahead of it, until every edge is clear of the nodes it does not join.
 */
export function gridLayout(c: LoadedCase, shown: readonly string[]): Map<string, GridPos> {
  const layout = c.data.layout
  const out = new Map<string, GridPos>()
  if (layout !== undefined) {
    for (const id of shown) {
      const cell = layout[id]
      if (cell !== undefined) out.set(id, { col: cell[0], row: cell[1] })
    }
    return out
  }
  const set = new Set(shown)
  const edges = shownEdges(c.model.edges, shown)
  const parentsOf = (id: string): string[] => edges.filter((e) => e.to === id).map((e) => e.from)
  const layer = new Map<string, number>()
  const depth = (id: string): number => {
    const known = layer.get(id)
    if (known !== undefined) return known
    const parents = parentsOf(id)
    const d = parents.length === 0 ? 0 : 1 + Math.max(...parents.map(depth))
    layer.set(id, d)
    return d
  }
  const columns: string[][] = []
  for (const id of shown) {
    if (!set.has(id)) continue
    const col = depth(id)
    ;(columns[col] ??= []).push(id)
  }
  const row = new Map<string, number>()
  columns.forEach((ids, col) => {
    if (col === 0) {
      ids.forEach((id, i) => row.set(id, i))
      return
    }
    const wish = new Map(ids.map((id) => [id, mean(parentsOf(id).map((p) => row.get(p) ?? 0))]))
    const order = [...ids].sort((a, b) => (wish.get(a) ?? 0) - (wish.get(b) ?? 0))
    const placed: number[] = []
    order.forEach((id, i) => placed.push(i === 0 ? (wish.get(id) ?? 0) : Math.max(wish.get(id) ?? 0, placed[i - 1] + 1)))
    // Spread a crowded column evenly about its wishes.
    const shift = mean(order.map((id) => wish.get(id) ?? 0)) - mean(placed)
    order.forEach((id, i) => row.set(id, placed[i] + shift))
  })
  const grid = new Map<string, GridPos>()
  for (const id of shown) grid.set(id, { col: layer.get(id) ?? 0, row: row.get(id) ?? 0 })
  const arcs = latentArcs(c, shown)
  let settled = false
  for (let step = 0; step < 8 * shown.length; step++) {
    const hit = firstBlocked(grid, edges, arcs)
    if (hit === undefined) {
      settled = true
      break
    }
    const p = grid.get(hit.node)
    const a = grid.get(hit.edge.from)
    const b = grid.get(hit.edge.to)
    if (p === undefined || a === undefined || b === undefined) break
    const lineRow = a.col === b.col ? p.row : a.row + ((b.row - a.row) * (p.col - a.col)) / (b.col - a.col)
    const dir = p.row < lineRow ? -1 : 1
    // Step off the edge; nodes of the same column in the way move along, a row apart.
    let at = p.row + dir / 2
    grid.set(hit.node, { col: p.col, row: at })
    const ahead = [...grid]
      .filter(([id, q]) => id !== hit.node && q.col === p.col && (q.row - p.row) * dir >= 0)
      .sort((x, y) => (x[1].row - y[1].row) * dir)
    for (const [id, q] of ahead) {
      if ((q.row - at) * dir >= 1) break
      at += dir
      grid.set(id, { col: q.col, row: at })
    }
  }
  // The step budget ran out with an edge (or an arc's way) still blocked: the graph is drawn anyway.
  if (!settled && firstBlocked(grid, edges, arcs) !== undefined) {
    console.warn(`logic-atlas: ${c.data.id}: automatic layout left an edge or arc over a node; give the model a layout`)
  }
  const top = Math.min(...[...grid.values()].map((p) => p.row))
  for (const [id, p] of grid) out.set(id, { col: p.col, row: p.row - top })
  return out
}

function mean(xs: readonly number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((s, x) => s + x, 0) / xs.length
}

export function shownEdges(edges: readonly Edge[], shown: readonly string[]): Edge[] {
  const set = new Set(shown)
  return edges.filter((e) => set.has(e.from) && set.has(e.to))
}

/** Lane column order: by grid column, then row, then declaration order. */
export function columnOrder(c: LoadedCase, shown: readonly string[]): string[] {
  const grid = gridLayout(c, shown)
  const index = new Map(shown.map((id, i) => [id, i]))
  return [...shown].sort((a, b) => {
    const pa = grid.get(a)
    const pb = grid.get(b)
    if (pa === undefined || pb === undefined) return (index.get(a) ?? 0) - (index.get(b) ?? 0)
    return pa.col - pb.col || pa.row - pb.row
  })
}

export type Polarity = 'promote' | 'inhibit' | 'mixed'

/**
 * Whether raising `from` from 0 to 1 only ever lowers `to` (inhibit), only raises it (promote),
 * or neither. Non-boolean ends count as `mixed`.
 */
export function edgePolarity(model: CausalModel, from: string, to: string): Polarity {
  const target = getVariable(model, to)
  const source = getVariable(model, from)
  const expr = model.equations.get(to)
  if (expr === undefined || target.domain.kind !== 'boolean' || source.domain.kind !== 'boolean') return 'mixed'
  const others = (model.parents.get(to) ?? []).filter((p) => p !== from).map((p) => getVariable(model, p))
  let up = false
  let down = false
  for (const setting of enumerateAssignments(others)) {
    const at = (v: boolean): boolean =>
      coerceToDomain(target, evalExpr(expr, { values: { ...setting, [from]: v } })) === true
    const lo = at(false)
    const hi = at(true)
    if (!lo && hi) up = true
    if (lo && !hi) down = true
  }
  if (down && !up) return 'inhibit'
  if (up && !down) return 'promote'
  return 'mixed'
}

/** An edge carries a signal when its source is 1 (non-boolean sources always do). */
export function edgeLive(values: Assignment | undefined, from: string): boolean {
  if (values === undefined) return true
  const v = values[from]
  return typeof v !== 'boolean' || v
}
