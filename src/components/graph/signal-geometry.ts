import type { LoadedCase } from '../../data/load.ts'
import type { Assignment, Edge, Hedge, Value } from '../../engine/index.ts'
import { getVariable } from '../../engine/index.ts'
import { formatValue, valuesEqual } from '../../engine/values.ts'
import type { Messages } from '../i18n/messages.ts'
import type { Stochastic } from '../model/assignments.ts'
import type { PathMarks } from '../model/dsep-view.ts'
import { assignmentText, idWithName, probText, shortLabel } from '../model/wording.ts'
import { barLayout, textWidth } from '../text/text-measure.ts'
import type { ArcPlan, Pt } from './graph-layout.ts'
import {
  arcCurve,
  edgeLive,
  edgePolarity,
  graphSpacing,
  gridLayout,
  latentArcs,
  planArcs,
  shownEdges,
} from './graph-layout.ts'
import type { Anchor, Box, Placed } from './graph-labels.ts'
import { around, firstClear, intersects, rectBox, segmentHitsBox, shifted, textBox } from './graph-labels.ts'
import type { Block, Point, Readout } from './signal-shapes.ts'
import { BAR_LABEL, blockOptions, nodeReadout, readoutWidth, unit } from './signal-shapes.ts'

/**
 * Where everything in a signal graph goes, computed apart from drawing it: node positions, each
 * node's label block (below it, or above when that touches less), the do() tags, the latent arcs
 * and their labels, every edge with its cut or inhibit label, the witness hull and the view box.
 * Labels claim space in one shared obstacle list, in this order: node blocks, arc labels, then
 * cut and inhibit labels edge by edge.
 */

/** What the layout reads: `SignalGraphProps` without the handlers, the defaults filled in, and a drag in progress. */
export interface SignalGraphInput {
  readonly c: LoadedCase
  readonly shown: readonly string[]
  readonly structural?: boolean
  readonly values?: Assignment
  readonly original?: Assignment
  readonly probs?: Readonly<Record<string, number>>
  /** Value mode: a P(V = 1) number under these nodes only. */
  readonly probe?: Readonly<Record<string, number>>
  readonly dists?: Readonly<Record<string, readonly number[]>>
  readonly probNotes?: Readonly<Record<string, string>>
  readonly observedValues: Assignment
  readonly evidence: boolean
  readonly interventions: Assignment
  /** The text of a do() tag in place of `X←1`, per variable (a mediator held at its natural value, `Z←Z(X=0)`). */
  readonly tagText?: Readonly<Record<string, string>>
  readonly stochastic: Stochastic
  readonly removedEdges: readonly Edge[]
  readonly witness?: Assignment
  readonly hedge?: Hedge
  readonly holdNotes: boolean
  readonly defaults?: Assignment
  readonly paths?: PathMarks
  readonly clamped: readonly string[]
  /** Intervention switch nodes (`F_Z`), drawn as small squares beside the variable they point into. */
  readonly switches?: readonly string[]
  readonly compact: boolean
  /** The node being dragged and how far it has moved, in px. */
  readonly drag?: { readonly id: string; readonly dx: number; readonly dy: number }
  /** Decimals of every probability written (default 2). */
  readonly digits?: number
}

/** The tag beside a set node: `X←1` for do(), `P(X=1)=0.30` for a stochastic do(), `X=1` observed (`seen`). */
export interface DoTag {
  readonly text: string
  readonly box: Box
  readonly left: boolean
  readonly seen: boolean
  readonly reset: boolean
}

/** An edge as drawn, from the rim of its source (`x1`, `y1`) to the end of its line (`x2`, `y2`). */
export type EdgeMark =
  | {
      readonly kind: 'cut'
      readonly key: string
      readonly x1: number
      readonly y1: number
      readonly x2: number
      readonly y2: number
      /** The middle of the gap, and the edge's direction. */
      readonly mx: number
      readonly my: number
      readonly ux: number
      readonly uy: number
      /** The two slashes across the gap, as a path. */
      readonly slash: string
      readonly label: Placed
    }
  | {
      readonly kind: 'inhibit'
      readonly key: string
      readonly x1: number
      readonly y1: number
      readonly x2: number
      readonly y2: number
      readonly ux: number
      readonly uy: number
      readonly live: boolean
      readonly onPath?: 'open' | 'blocked'
      readonly cls: string
      /** ¬X, and where it sits. */
      readonly text: string
      readonly label: Placed
    }
  | {
      readonly kind: 'plain'
      readonly key: string
      readonly x1: number
      readonly y1: number
      readonly x2: number
      readonly y2: number
      readonly live: boolean
      readonly onPath?: 'open' | 'blocked'
      readonly cls: string
    }

/** A latent arc: its plan, the curve sampled at 41 points, and its short label. */
export interface ArcMark {
  readonly plan: ArcPlan
  readonly curve: Pt[]
  readonly label: Placed
}

/** The amber hull round the variables a witness holds, with its 見證 tag text. */
export interface Hull {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
  readonly text: string
}

export interface SignalLayout {
  readonly prob: boolean
  /** Node radius, column width and row height, in px. */
  readonly r: number
  readonly col: number
  readonly row: number
  readonly pos: ReadonlyMap<string, Point>
  readonly blocks: ReadonlyMap<string, Block>
  readonly tags: ReadonlyMap<string, DoTag>
  /** 固定為 w（實際 v） or 固定（實際值） per held variable, when `holdNotes`. */
  readonly holdNotes: ReadonlyMap<string, string>
  /** 偏離（預設 v） per node off its default. */
  readonly deviantNotes: ReadonlyMap<string, string>
  readonly edges: readonly EdgeMark[]
  readonly arcs: readonly ArcMark[]
  readonly hull?: Hull
  /** The view box. */
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

/** Half the side of a switch node's square, in px. */
export const SWITCH_HALF = 9

/** Where a switch may sit, in grid cells from the variable it points into: up-left first, then round it. */
const SWITCH_SPOTS: readonly (readonly [number, number])[] = [
  [-0.55, -0.55],
  [-0.55, 0.55],
  [0, -0.7],
  [-0.7, 0],
  [0.55, -0.55],
  [0.55, 0.55],
  [0, 0.7],
  [0.7, 0],
]

/**
 * The grid with each switch (`F_Z`, its one arrow into `Z`) placed beside its variable, at the
 * first spot clear of the other nodes and of the edges, whose own arrow passes no other node. The
 * other nodes keep their cells.
 */
function placeSwitches(
  c: LoadedCase,
  shown: readonly string[],
  switches: readonly string[],
  grid: Map<string, { col: number; row: number }>,
  col: number,
  row: number,
  r: number,
): Map<string, { col: number; row: number }> {
  const drawn = switches.filter((id) => shown.includes(id))
  if (drawn.length === 0) return grid
  const px = (g: { col: number; row: number }): Point => ({ x: g.col * col, y: g.row * row })
  const edges = shownEdges(c.model.edges, shown).filter((e) => !switches.includes(e.from))
  const near = (p: Point, q: Point, d: number): boolean => Math.hypot(p.x - q.x, p.y - q.y) < d
  const box = (p: Point, d: number): Box => ({ x0: p.x - d, y0: p.y - d, x1: p.x + d, y1: p.y + d })
  for (const id of drawn) {
    const target = c.model.edges.find((e) => e.from === id)?.to
    const at = target === undefined ? undefined : grid.get(target)
    if (target === undefined || at === undefined) throw new Error(`causal-atlas: ${c.data.id}: switch ${id} points into no drawn variable`)
    const tp = px(at)
    const clear = (spot: { col: number; row: number }): boolean => {
      const p = px(spot)
      for (const [other, g] of grid) {
        if (other === target) continue
        const q = px(g)
        if (near(p, q, 2 * r + 8)) return false
        if (segmentHitsBox(p, tp, box(q, r + 4))) return false
      }
      return edges.every((e) => {
        const a = grid.get(e.from)
        const b = grid.get(e.to)
        return a === undefined || b === undefined || !segmentHitsBox(px(a), px(b), box(p, SWITCH_HALF + 10))
      })
    }
    const spots = SWITCH_SPOTS.map(([dc, dr]) => ({ col: at.col + dc, row: at.row + dr }))
    grid.set(id, spots.find(clear) ?? spots[0])
  }
  return grid
}

export function layoutSignalGraph(input: SignalGraphInput, t: Messages): SignalLayout {
  const {
    c,
    shown,
    values,
    original,
    probs,
    probe = {},
    dists,
    probNotes,
    interventions,
    tagText,
    stochastic,
    removedEdges,
    witness,
    observedValues,
    evidence,
    holdNotes,
    defaults,
    paths,
    clamped,
    switches = [],
    compact,
    drag,
    digits = 2,
  } = input
  const prob = probs !== undefined
  const { r, col: COL, row: ROW } = graphSpacing(prob, compact)
  const R = input.structural === true ? 19 : r
  const PAD_X = compact ? 60 : 96
  const PAD_Y = 72
  const grid = placeSwitches(c, shown, switches, gridLayout(c, shown.filter((id) => !switches.includes(id))), COL, ROW, R)
  const cells = [...grid.values()]
  const minCol = Math.min(...cells.map((p) => p.col))
  const maxCol = Math.max(...cells.map((p) => p.col))
  const minRow = Math.min(...cells.map((p) => p.row))
  const maxRow = Math.max(...cells.map((p) => p.row))
  const width = PAD_X * 2 + (maxCol - minCol) * COL
  const hasWitness = witness !== undefined && Object.keys(witness).length > 0
  const barred = (id: string): boolean => prob && getVariable(c.model, id).domain.kind === 'finite'
  const layoutHeight = PAD_Y * 2 + (maxRow - minRow) * ROW + (hasWitness ? 40 : 0)
  const pos = new Map<string, Point>()
  for (const [id, p] of grid) {
    const off = drag?.id === id ? drag : undefined
    pos.set(id, { x: PAD_X + (p.col - minCol) * COL + (off?.dx ?? 0), y: PAD_Y + (p.row - minRow) * ROW + (off?.dy ?? 0) })
  }
  const cut = new Set(removedEdges.map((e) => `${e.from}>${e.to}`))
  const edges = shownEdges(c.model.edges, shown)
  const nameOf = (id: string): string => shortLabel(c.model, id, t.locale)

  // The tag beside a set node: `X←1` for do(), `P(X=1)=0.30` for a stochastic do(), `X=1` observed.
  const doTag = (id: string): DoTag | undefined => {
    const forced = interventions[id]
    const soft = stochastic[id]
    const seen = observedValues[id]
    if (forced === undefined && soft === undefined && (seen === undefined || evidence)) return undefined
    if (witness !== undefined && id in witness) return undefined
    const before = original?.[id]
    const reset = holdNotes && forced !== undefined && before !== undefined && valuesEqual(forced, before)
    const text =
      forced !== undefined ? (tagText?.[id] ?? (reset ? t.witness.resetTag(id, formatValue(forced)) : `${id}←${formatValue(forced)}`)) : soft !== undefined ? `P(${id}=1)=${probText(soft, digits)}` : `${id}=${formatValue(seen as Value)}`
    const w = textWidth(text, 12) + 18
    const left = (grid.get(id)?.col ?? 0) === maxCol
    return { text, left, reset, seen: forced === undefined && soft === undefined, box: rectBox(left ? -R - 12 - w : R + 12, -R - 10, w, 22) }
  }

  /** 固定為 w（實際 v） or 固定（實際值） for a held variable, when `holdNotes`. */
  const holdNote = (id: string): string | undefined => {
    if (!holdNotes || witness === undefined || !(id in witness)) return undefined
    // A probability graph has no actual world to compare with.
    if (prob) return t.witness.heldPlain
    const before = original?.[id]
    const now = values?.[id] ?? witness[id]
    return before === undefined || valuesEqual(before, now) ? t.witness.heldActual : t.witness.held(formatValue(now), formatValue(before))
  }

  /** 偏離（預設 v） for a node of a graph with values off its default. */
  const deviantNote = (id: string): string | undefined => {
    const normal = defaults?.[id]
    const now = values?.[id]
    if (prob || normal === undefined || now === undefined || valuesEqual(now, normal)) return undefined
    return t.normality.deviant(formatValue(normal))
  }

  // Each node's label and readout form one block right under it; only when that block touches an
  // edge, another node, a do tag or an earlier block, or leaves the graph's sides, does the whole
  // block go above the node (when that touches less).
  const placedBoxes: Box[] = []
  const blocks = new Map<string, Block>()
  const fixed: Box[] = []
  const tagBoxes: Box[] = []
  for (const id of shown) {
    const p = pos.get(id)
    if (p === undefined) continue
    fixed.push(around(p.x, p.y, (switches.includes(id) ? SWITCH_HALF : R) + 3))
    const tag = doTag(id)
    if (tag !== undefined) {
      fixed.push(shifted(tag.box, p.x, p.y))
      tagBoxes.push(shifted(tag.box, p.x, p.y))
    }
  }
  // An arc ends where its child is cut: do() on a child (or a cut edge from the latent cause) removes
  // that end, so the arc is gone (Pearl's G with the arrows into X removed).
  const endCut = (via: string, id: string): boolean => cut.has(`${via}>${id}`) || id in interventions || id in stochastic || clamped.includes(id)
  const arcPlans = planArcs(
    latentArcs(c, shown).filter((a) => !endCut(a.via, a.a) && !endCut(a.via, a.b)),
    pos,
    edges,
    R,
    tagBoxes,
  )
  const arcSegments = arcPlans.map((a) => arcCurve(a.start, a.control, a.end, 12))
  for (const id of shown) {
    const p = pos.get(id)
    if (p === undefined) continue
    const variable = getVariable(c.model, id)
    const settledRead = prob ? nodeReadout(t, digits, probs?.[id], interventions[id], evidence ? undefined : observedValues[id]) : undefined
    const before = original?.[id]
    const now = values?.[id]
    const was = holdNotes && !prob && before !== undefined && now !== undefined && !valuesEqual(before, now) ? t.was(formatValue(before)) : undefined
    const note = holdNote(id) ?? was ?? (settledRead?.settled === true && !evidence ? undefined : probNotes?.[id])
    const noteW = note === undefined ? undefined : textWidth(note, 12)
    const deviant = deviantNote(id)
    let readout: Readout = { kind: 'none', noteW, note2W: deviant === undefined ? undefined : textWidth(deviant, 11) }
    if (barred(id) && variable.domain.kind === 'finite') {
      const known = (dists?.[id] ?? []).filter((x) => !Number.isNaN(x))
      const maxW = known.length === 0 ? 0 : textWidth(t.barMax(probText(Math.max(...known), digits)), 11)
      readout = { kind: 'bars', width: barLayout(variable.domain.values.map(formatValue), BAR_LABEL).width, maxW, noteW }
    } else if (prob) readout = { kind: 'number', noteW, numberW: readoutWidth(settledRead ?? nodeReadout(t, digits, undefined, undefined, undefined), digits) }
    else if (id in probe) readout = { kind: 'number', noteW, numberW: readoutWidth(nodeReadout(t, digits, probe[id], undefined, undefined), digits) }
    // A switch is labelled by its id alone (F_Z), right by its square.
    const isSwitch = switches.includes(id)
    const labelW = textWidth(isSwitch ? id : idWithName(id, nameOf(id)), 14)
    const touches = (b: Block): number => {
      let n = 0
      for (const local of b.boxes) {
        const box = shifted(local, p.x, p.y)
        if (box.x0 < 0 || box.x1 > width) n += 1
        for (const e of edges) {
          const a = pos.get(e.from)
          const q = pos.get(e.to)
          if (a !== undefined && q !== undefined && segmentHitsBox(a, q, box)) n += 1
        }
        for (const curve of arcSegments) {
          for (let i = 0; i + 1 < curve.length; i++) if (segmentHitsBox(curve[i], curve[i + 1], box)) n += 1
        }
        // The node's own circle and do tag never meet its block, above or below.
        for (const o of [...fixed, ...placedBoxes]) if (intersects(box, o, 0)) n += 1
      }
      return n
    }
    const [below, above] = blockOptions(isSwitch ? SWITCH_HALF : R + (input.hedge?.fPrime.includes(id) === true ? 16 : input.hedge?.f.includes(id) === true ? 9 : 0), labelW, readout)
    const hitsBelow = touches(below)
    const block = hitsBelow > 0 && touches(above) < hitsBelow ? above : below
    blocks.set(id, block)
    for (const b of block.boxes) placedBoxes.push(shifted(b, p.x, p.y))
  }

  // What a floating edge label must stay clear of: every node, its label block, its do tag; and
  // the edge labels already placed.
  const obstacles: Box[] = [...placedBoxes]
  for (const id of shown) {
    const p = pos.get(id)
    if (p === undefined) continue
    const local: Box[] = [around(0, 0, (switches.includes(id) ? SWITCH_HALF : R) + 6)]
    const tag = doTag(id)
    if (tag !== undefined) local.push(tag.box)
    const before = original?.[id]
    const now = values?.[id]
    if (!holdNotes && !prob && before !== undefined && now !== undefined && !valuesEqual(before, now)) {
      local.push(textBox(R + 14, R + 14, 'start', textWidth(t.was(formatValue(before)), 12), 12))
    }
    for (const b of local) obstacles.push(shifted(b, p.x, p.y))
  }
  // Each arc says what it is in one short label by its middle, off the nodes, their labels and the edges;
  // the longer explanation is its tooltip.
  const arcLabelW = textWidth(t.arc.label, 12)
  const arcs = arcPlans.map((plan) => {
    const curve = arcCurve(plan.start, plan.control, plan.end, 40)
    const candidates: Placed[] = []
    for (const side of [1, -1]) {
      for (const i of [20, 16, 24, 12, 28]) {
        const q = curve[i]
        const nx = plan.bulge.x * side
        const ny = plan.bulge.y * side
        const away = 8 + Math.abs(nx) * (arcLabelW / 2) + Math.abs(ny) * 7
        const x = q.x + nx * away
        const y = q.y + ny * away + 4
        candidates.push({ x, y, anchor: 'middle', box: textBox(x, y, 'middle', arcLabelW, 12) })
      }
    }
    const offEdges = candidates.filter((cand) =>
      edges.every((e) => {
        const p = pos.get(e.from)
        const q = pos.get(e.to)
        return p === undefined || q === undefined || !segmentHitsBox(p, q, cand.box)
      }),
    )
    const label = firstClear(offEdges.length > 0 ? offEdges : candidates, obstacles)
    obstacles.push(label.box)
    return { plan, curve, label }
  })
  // Edge labels placed later keep off the arcs too.
  for (const { curve } of arcs) {
    for (let i = 0; i + 1 < curve.length; i += 2) {
      const [p, q] = [curve[i], curve[Math.min(i + 2, curve.length - 1)]]
      obstacles.push({ x0: Math.min(p.x, q.x) - 2, y0: Math.min(p.y, q.y) - 2, x1: Math.max(p.x, q.x) + 2, y1: Math.max(p.y, q.y) + 2 })
    }
  }
  // The drawing grows to hold every block: above the top row, below the bottom one, and past the
  // sides when a wide one (bars with their largest probability) reaches beyond the margin.
  let top = 0
  let bottom = layoutHeight
  let left = 0
  let right = width
  for (const id of shown) {
    const p = pos.get(id)
    const block = blocks.get(id)
    if (p === undefined || block === undefined) continue
    for (const b of block.boxes) {
      top = Math.min(top, p.y + b.y0 - 8)
      bottom = Math.max(bottom, p.y + b.y1 + 12)
      left = Math.min(left, p.x + b.x0 - 8)
      right = Math.max(right, p.x + b.x1 + 8)
    }
  }
  for (const { curve, label } of arcs) {
    for (const q of curve) {
      top = Math.min(top, q.y - 8)
      bottom = Math.max(bottom, q.y + 12)
      left = Math.min(left, q.x - 8)
      right = Math.max(right, q.x + 8)
    }
    top = Math.min(top, label.box.y0 - 6)
    bottom = Math.max(bottom, label.box.y1 + 8)
    left = Math.min(left, label.box.x0 - 8)
    right = Math.max(right, label.box.x1 + 8)
  }
  top = Math.floor(top)
  left = Math.floor(left)
  const height = Math.ceil(bottom - top)
  const viewW = Math.ceil(right - left)
  const claim = (placed: Placed): Placed => {
    obstacles.push(placed.box)
    return placed
  }

  const edgeMarks: EdgeMark[] = []
  for (const e of edges) {
    const a = pos.get(e.from)
    const b = pos.get(e.to)
    if (a === undefined || b === undefined) continue
    const { ux, uy } = unit(a, b)
    // A switch's square: the arrow leaves its side, not a circle's rim.
    const from = switches.includes(e.from) ? SWITCH_HALF / Math.max(Math.abs(ux), Math.abs(uy)) : R
    const x1 = a.x + from * ux
    const y1 = a.y + from * uy
    const polarity = edgePolarity(c.model, e.from, e.to)
    const key = `${e.from}>${e.to}`
    if (cut.has(key)) {
      const x2 = b.x - (R + 2) * ux
      const y2 = b.y - (R + 2) * uy
      const mx = (x1 + x2) / 2
      const my = (y1 + y2) / 2
      const nx = -uy
      const ny = ux
      const slash = (cx: number, cy: number): string =>
        `M${cx - 10 * nx - 3 * ux} ${cy - 10 * ny - 3 * uy}L${cx + 10 * nx + 3 * ux} ${cy + 10 * ny + 3 * uy}`
      // 切斷 goes beside the gap, on the side (and distance) where nothing else is.
      const cutCandidates: Placed[] = []
      for (const dist of [18, 28]) {
        for (const side of [1, -1]) {
          const x = mx + side * dist * uy
          const y = my - side * dist * ux + 4
          const anchor: Anchor = side * uy > 0.3 ? 'start' : side * uy < -0.3 ? 'end' : 'middle'
          cutCandidates.push({ x, y, anchor, box: textBox(x, y, anchor, textWidth(t.cut, 12), 12) })
        }
      }
      // Nor on an edge still drawn, so the mark is read on the edge it cuts.
      const offEdges = cutCandidates.filter((cand) =>
        edges.every((o) => {
          const p = pos.get(o.from)
          const q = pos.get(o.to)
          return cut.has(`${o.from}>${o.to}`) || p === undefined || q === undefined || !segmentHitsBox(p, q, cand.box)
        }),
      )
      const cutLabel = claim(firstClear(offEdges.length > 0 ? offEdges : cutCandidates, obstacles))
      edgeMarks.push({ kind: 'cut', key, x1, y1, x2, y2, mx, my, ux, uy, slash: slash(mx - 4 * ux, my - 4 * uy) + slash(mx + 4 * ux, my + 4 * uy), label: cutLabel })
      continue
    }
    const live = edgeLive(values, e.from)
    const onPath = paths?.open.has(key) === true ? 'open' : paths?.blocked.has(key) === true ? 'blocked' : undefined
    const cls = `${live ? 'ca-stroke-live' : 'ca-stroke-idle'}${onPath === undefined ? '' : ` ca-path-${onPath}`}`
    if (polarity === 'inhibit') {
      const x2 = b.x - (R + 7) * ux
      const y2 = b.y - (R + 7) * uy
      // ¬X sits by the line; when that spot is taken it slides along the edge or switches sides.
      const text = `¬${e.from}`
      const width = textWidth(text, 12)
      const inhibitCandidates: Placed[] = []
      {
        const x = a.x + (b.x - a.x) * 0.55 + 14 * Math.abs(uy) + 4
        const y = a.y + (b.y - a.y) * 0.55 - 12 * Math.abs(ux)
        inhibitCandidates.push({ x, y, anchor: 'start', box: textBox(x, y, 'start', width, 12) })
      }
      for (const t of [0.55, 0.45, 0.65, 0.35, 0.72, 0.28]) {
        for (const side of [1, -1]) {
          const nx = -uy * side
          const ny = ux * side
          const away = 8 + Math.abs(nx) * (width / 2) + Math.abs(ny) * 7
          const cx = a.x + (b.x - a.x) * t + nx * away
          const cy = a.y + (b.y - a.y) * t + ny * away
          const x = cx - width / 2
          const y = cy + 4
          inhibitCandidates.push({ x, y, anchor: 'start', box: textBox(x, y, 'start', width, 12) })
        }
      }
      const inhibitLabel = claim(firstClear(inhibitCandidates, obstacles))
      edgeMarks.push({ kind: 'inhibit', key, x1, y1, x2, y2, ux, uy, live, onPath, cls, text, label: inhibitLabel })
      continue
    }
    const x2 = b.x - (R + 2) * ux
    const y2 = b.y - (R + 2) * uy
    edgeMarks.push({ kind: 'plain', key, x1, y1, x2, y2, live, onPath, cls })
  }

  let hull: Hull | undefined
  if (witness !== undefined && Object.keys(witness).length > 0) {
    const pts = Object.keys(witness)
      .map((id) => pos.get(id))
      .filter((p): p is Point => p !== undefined)
    if (pts.length > 0) {
      const pad = R + 14
      const boxes = holdNotes ? Object.keys(witness).flatMap((id) => {
        const p = pos.get(id)
        return p === undefined ? [] : (blocks.get(id)?.boxes ?? []).map((b) => shifted(b, p.x, p.y))
      }) : []
      const x = Math.min(...pts.map((p) => p.x - pad - 20), ...boxes.map((b) => b.x0 - 5))
      const y = Math.min(...pts.map((p) => p.y - pad), ...boxes.map((b) => b.y0 - 5))
      hull = {
        x,
        y,
        w: Math.max(...pts.map((p) => p.x + pad + 20), ...boxes.map((b) => b.x1 + 5)) - x,
        // Include the label under the node, and its 固定 note.
        h: Math.max(...pts.map((p) => p.y + R + (holdNotes ? 10 : 34)), ...boxes.map((b) => b.y1 + 5)) - y,
        text: t.witnessHold(assignmentText(witness)),
      }
    }
  }

  const tags = new Map<string, DoTag>()
  const held = new Map<string, string>()
  const deviant = new Map<string, string>()
  for (const id of shown) {
    const tag = doTag(id)
    if (tag !== undefined) tags.set(id, tag)
    const hold = holdNote(id)
    if (hold !== undefined) held.set(id, hold)
    const off = deviantNote(id)
    if (off !== undefined) deviant.set(id, off)
  }
  return {
    prob,
    r: R,
    col: COL,
    row: ROW,
    pos,
    blocks,
    tags,
    holdNotes: held,
    deviantNotes: deviant,
    edges: edgeMarks,
    arcs,
    hull,
    left,
    top,
    width: viewW,
    height,
  }
}
