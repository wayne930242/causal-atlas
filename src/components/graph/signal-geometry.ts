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
import { BAR_LABEL, blockOptions, nodeReadout, noteSpots, readoutWidth, unit } from './signal-shapes.ts'

/**
 * Where everything in a signal graph goes, computed apart from drawing it: node positions, each
 * node's label block (below it, or round it where that crosses less), the do() tags, the latent arcs
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
  /** Every spot each node's block was weighed at, best first; `blocks` holds the one taken. */
  readonly labelOptions: ReadonlyMap<string, readonly Block[]>
  /** A wrapped label's name in its two parts (the id goes before the first), per node whose block wraps it. */
  readonly labelLines: ReadonlyMap<string, readonly [string, string]>
  readonly tags: ReadonlyMap<string, DoTag>
  /** 固定為 w（實際 v） or 固定（實際值） per held variable, when `holdNotes`. */
  readonly holdNotes: ReadonlyMap<string, string>
  /** 偏離（預設 v） per node off its default. */
  readonly deviantNotes: ReadonlyMap<string, string>
  /** 原本 v per node whose value differs from the world before do(), placed from the node's centre. */
  readonly wasNotes: ReadonlyMap<string, Placed & { readonly text: string }>
  readonly edges: readonly EdgeMark[]
  readonly arcs: readonly ArcMark[]
  readonly hull?: Hull
  /** The view box. */
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

/**
 * A name in two parts for a label on two lines: split at the space that makes the id with the
 * first part and the rest nearest in width, never right after an abbreviation (`Mr.`, `St.`), which
 * stays with the word it belongs to. A Chinese name stays whole: its spaces only set off a digit or
 * a letter inside a phrase (第 1 位投給 B 先生), and splitting there would break the phrase.
 */
export function wrapName(id: string, name: string): readonly [string, string] | undefined {
  if ([...name].some((ch) => (ch.codePointAt(0) ?? 0) > 0x2e7f)) return undefined
  const words = name.split(' ').filter((w) => w !== '')
  let best: readonly [string, string] | undefined
  let bestW = Infinity
  for (let i = 1; i < words.length; i++) {
    if (/^[A-Za-z]{1,3}\.$/.test(words[i - 1])) continue
    const first = words.slice(0, i).join(' ')
    const second = words.slice(i).join(' ')
    const w = Math.max(textWidth(idWithName(id, first), 14), textWidth(second, 14))
    if (w < bestW) {
      best = [first, second]
      bestW = w
    }
  }
  return best
}

/** How much nearer (edge to edge) a label block must be to its own disc than to any other, in px. */
export const LABEL_MARGIN = 12
/** The least gap between two nodes' label blocks, in px, so they never read as one stack. */
export const BLOCK_GAP = 10

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
  /** An edge's line as drawn: from its source's rim (a switch's side) to the start of its head. */
  const edgeLine = (e: Edge) => {
    const a = pos.get(e.from)
    const b = pos.get(e.to)
    if (a === undefined || b === undefined) return undefined
    const { ux, uy } = unit(a, b)
    // A switch's square: the arrow leaves its side, not a circle's rim.
    const from = switches.includes(e.from) ? SWITCH_HALF / Math.max(Math.abs(ux), Math.abs(uy)) : R
    const key = `${e.from}>${e.to}`
    const kind: EdgeMark['kind'] = cut.has(key) ? 'cut' : edgePolarity(c.model, e.from, e.to) === 'inhibit' ? 'inhibit' : 'plain'
    const end = kind === 'inhibit' ? R + 7 : R + 2
    return { kind, key, a, b, ux, uy, x1: a.x + from * ux, y1: a.y + from * uy, x2: b.x - end * ux, y2: b.y - end * uy }
  }

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

  // Each node's label and readout form one block right under it; only when that block meets a disc,
  // a do tag or an earlier block, or crosses a drawn line (edge, arc or head), does the whole block
  // move: above the node, beside it, or off a corner, to the spot that crosses least.
  const placedBoxes: Box[] = []
  const blocks = new Map<string, Block>()
  const labelOptions = new Map<string, readonly Block[]>()
  const labelLines = new Map<string, readonly [string, string]>()
  const wasNotes = new Map<string, Placed & { readonly text: string }>()
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
  // The lines as drawn, which a node's label must not cross: each edge from rim to tip (a cut one
  // in its two halves), each arc's curve, and every head (arrow or ¬ circle) widened to its width.
  const strokes: [Point, Point][] = []
  const heads: Box[] = []
  const head = (tip: Point, ux: number, uy: number, past: number): void => {
    const end = { x: tip.x + past * ux, y: tip.y + past * uy }
    const base = { x: tip.x - 10 * ux, y: tip.y - 10 * uy }
    heads.push({ x0: Math.min(end.x, base.x) - 5, y0: Math.min(end.y, base.y) - 5, x1: Math.max(end.x, base.x) + 5, y1: Math.max(end.y, base.y) + 5 })
  }
  for (const e of edges) {
    const line = edgeLine(e)
    if (line === undefined) continue
    const { x1, y1, x2, y2, ux, uy } = line
    if (line.kind === 'cut') {
      const mx = (x1 + x2) / 2
      const my = (y1 + y2) / 2
      strokes.push([{ x: x1, y: y1 }, { x: mx - 10 * ux, y: my - 10 * uy }], [{ x: mx + 10 * ux, y: my + 10 * uy }, { x: x2, y: y2 }])
      continue
    }
    strokes.push([{ x: x1, y: y1 }, { x: x2, y: y2 }])
    head({ x: x2, y: y2 }, ux, uy, line.kind === 'inhibit' ? 10 : 0)
  }
  for (const plan of arcPlans) {
    const curve = arcCurve(plan.start, plan.control, plan.end, 40)
    for (let i = 0; i + 1 < curve.length; i++) strokes.push([curve[i], curve[i + 1]])
    for (const [tip, from] of [[plan.start, plan.control], [plan.end, plan.control]] as const) {
      const { ux, uy } = unit(from, tip)
      head(tip, ux, uy, 0)
    }
  }
  /** How many drawn lines and heads `box` crosses. */
  const crossings = (box: Box): number => {
    const padded = { x0: box.x0 - 1, y0: box.y0 - 1, x1: box.x1 + 1, y1: box.y1 + 1 }
    return strokes.filter(([a, b]) => segmentHitsBox(a, b, padded)).length + heads.filter((h) => intersects(padded, h, 0)).length
  }
  /** A disc's radius: a switch's half side, else the node radius. */
  const radius = (id: string): number => (switches.includes(id) ? SWITCH_HALF : R)
  /**
   * Whether boxes placed for `id`'s block would read as another node's: some other disc is not at
   * least LABEL_MARGIN farther from them (edge to edge) than `id`'s own.
   */
  const ambiguous = (id: string, boxes: readonly Box[]): boolean => {
    const hull = { x0: Math.min(...boxes.map((b) => b.x0)), y0: Math.min(...boxes.map((b) => b.y0)), x1: Math.max(...boxes.map((b) => b.x1)), y1: Math.max(...boxes.map((b) => b.y1)) }
    const away = (q: Point, r: number): number => Math.hypot(Math.max(hull.x0 - q.x, 0, q.x - hull.x1), Math.max(hull.y0 - q.y, 0, q.y - hull.y1)) - r
    const own = away(pos.get(id) ?? { x: 0, y: 0 }, radius(id))
    return shown.some((other) => {
      const q = pos.get(other)
      return other !== id && q !== undefined && away(q, radius(other)) < own + LABEL_MARGIN
    })
  }
  // What a spot costs `id`, compared in turn: the discs and do tags it meets, the other blocks
  // (`placed`) it comes within BLOCK_GAP of, and whether it reads as another node's (see
  // `ambiguous`); the lines its label crosses, the lines the rest of the block crosses, and how far
  // it reaches past the graph's margins (in steps of 48 px, so a little overhang does not outweigh
  // the order), a corner counting one step more, since a block there sits farther from its node.
  const cost = (id: string, b: Block, placed: readonly Box[]): readonly number[] => {
    const p = pos.get(id) ?? { x: 0, y: 0 }
    let hard = 0
    let label = 0
    let rest = 0
    b.boxes.forEach((local, i) => {
      const box = shifted(local, p.x, p.y)
      const crossed = crossings(box)
      if (i === 0) label += crossed
      else rest += crossed
      for (const o of fixed) if (intersects(box, o, 0)) hard += 1
      for (const o of placed) if (intersects(box, o, BLOCK_GAP)) hard += 1
    })
    const all = b.boxes.map((local) => shifted(local, p.x, p.y))
    if (ambiguous(id, all)) hard += 1
    const past =
      Math.max(0, -Math.min(...all.map((x) => x.x0))) +
      Math.max(0, Math.max(...all.map((x) => x.x1)) - width) +
      Math.max(0, -Math.min(...all.map((x) => x.y0))) +
      Math.max(0, Math.max(...all.map((x) => x.y1)) - layoutHeight)
    return [hard, label, rest, Math.floor(past / 48) + (b.side.includes('-') ? 1 : 0)]
  }
  const clear = (k: readonly number[]): boolean => k[0] === 0 && k[1] === 0 && k[2] === 0
  const splits = new Map<string, readonly [string, string]>()
  const heldWas = new Map<string, { readonly text: string; readonly w: number }>()
  for (const id of shown) {
    const p = pos.get(id)
    if (p === undefined) continue
    const variable = getVariable(c.model, id)
    const settledRead = prob ? nodeReadout(t, digits, probs?.[id], interventions[id], evidence ? undefined : observedValues[id]) : undefined
    const before = original?.[id]
    const now = values?.[id]
    // With hold notes, 原本 v is a line of the label block (where 固定 notes go); otherwise it is placed after every block.
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
    // A long name may go on two lines, split at the space that makes them nearest in width.
    const split = isSwitch ? undefined : wrapName(id, nameOf(id))
    const lines = split === undefined ? undefined : ([textWidth(idWithName(id, split[0]), 14), textWidth(split[1], 14)] as const)
    const options = blockOptions(isSwitch ? SWITCH_HALF : R + (input.hedge?.fPrime.includes(id) === true ? 16 : input.hedge?.f.includes(id) === true ? 9 : 0), { width: labelW, lines }, readout)
    labelOptions.set(id, options)
    // Under the node unless something is there; then the spot that costs least, earlier ones on a tie.
    const costs = options.map((o) => cost(id, o, placedBoxes))
    let best = 0
    if (!clear(costs[0])) {
      for (let i = 1; i < options.length; i++) {
        const diff = costs[i].map((v, j) => v - costs[best][j]).find((v) => v !== 0) ?? 0
        if (diff < 0) best = i
      }
    }
    const block = options[best]
    blocks.set(id, block)
    if (split !== undefined) splits.set(id, split)
    if (was !== undefined && noteW !== undefined && holdNote(id) === undefined) heldWas.set(id, { text: was, w: noteW })
    for (const b of block.boxes) placedBoxes.push(shifted(b, p.x, p.y))
  }
  // A column of three or more nodes reads best with every label on the same side of its disc. When
  // a column's labels went to different sides, they all move to one side (below, above, right or
  // left), all on one line or all on two (a name that cannot wrap stays on one), where each of them
  // is clear: off every disc, tag, line and other block, and its own. Of such ways, the one reaching
  // least past the margins wins, the earlier on a tie; with none, the labels stay where they went.
  const columns = new Map<number, string[]>()
  for (const id of shown) {
    const p = pos.get(id)
    if (p === undefined || switches.includes(id)) continue
    columns.set(Math.round(p.x), [...(columns.get(Math.round(p.x)) ?? []), id])
  }
  for (const group of columns.values()) {
    if (group.length < 3 || new Set(group.map((id) => blocks.get(id)?.side)).size === 1) continue
    const others = shown
      .filter((id) => !group.includes(id))
      .flatMap((id) => {
        const q = pos.get(id)
        return q === undefined ? [] : (blocks.get(id)?.boxes ?? []).map((b) => shifted(b, q.x, q.y))
      })
    let best: { readonly chosen: Map<string, Block>; readonly past: number } | undefined
    for (const [side, wrap] of (['below', 'above', 'right', 'left'] as const).flatMap((side) => [[side, false], [side, true]] as const)) {
      const taken = [...others]
      const chosen = new Map<string, Block>()
      let past = 0
      for (const id of group) {
        const q = pos.get(id) ?? { x: 0, y: 0 }
        const own = (labelOptions.get(id) ?? []).filter((o) => o.side === side)
        const fit = own.find((o) => o.wrapped === wrap) ?? own[0]
        if (fit === undefined || !clear(cost(id, fit, taken))) break
        chosen.set(id, fit)
        past += cost(id, fit, taken)[3]
        taken.push(...fit.boxes.map((b) => shifted(b, q.x, q.y)))
      }
      if (chosen.size === group.length && (best === undefined || past < best.past)) best = { chosen, past }
    }
    for (const [id, b] of best?.chosen ?? []) blocks.set(id, b)
  }
  placedBoxes.length = 0
  for (const id of shown) {
    const p = pos.get(id)
    const block = blocks.get(id)
    if (p === undefined || block === undefined) continue
    for (const b of block.boxes) placedBoxes.push(shifted(b, p.x, p.y))
    const split = splits.get(id)
    if (block.wrapped && split !== undefined) labelLines.set(id, split)
    const was = heldWas.get(id)
    if (was !== undefined) wasNotes.set(id, { text: was.text, x: block.cx, y: block.noteY, anchor: 'middle', box: textBox(block.cx, block.noteY, 'middle', was.w, 12) })
  }

  // 原本 v (without hold notes) goes where it clears every disc, do tag, label block and earlier
  // note: under or over its own block first, then on its label's line, then beside its disc;
  // a spot off every edge and arc wins over one on them.
  if (!holdNotes && !prob) {
    const tagged = shown.flatMap((id) => {
      const p = pos.get(id)
      const tag = doTag(id)
      return p === undefined || tag === undefined ? [] : [shifted(tag.box, p.x, p.y)]
    })
    const hard: Box[] = [...placedBoxes, ...tagged]
    const discs = shown.flatMap((id) => {
      const p = pos.get(id)
      return p === undefined ? [] : [around(p.x, p.y, (switches.includes(id) ? SWITCH_HALF : R) + 3)]
    })
    const onLine = (box: Box): boolean =>
      edges.some((e) => {
        const a = pos.get(e.from)
        const q = pos.get(e.to)
        return a !== undefined && q !== undefined && segmentHitsBox(a, q, box)
      }) || arcSegments.some((curve) => curve.some((pt, i) => i + 1 < curve.length && segmentHitsBox(pt, curve[i + 1], box)))
    for (const id of shown) {
      const p = pos.get(id)
      const block = blocks.get(id)
      const before = original?.[id]
      const now = values?.[id]
      if (p === undefined || block === undefined || before === undefined || now === undefined || valuesEqual(before, now)) continue
      const text = t.was(formatValue(before))
      const spots = noteSpots(block, R, textWidth(text, 12)).map((spot) => ({ ...spot, abs: shifted(spot.box, p.x, p.y) }))
      const clear = spots.filter(({ abs }) => !hard.some((o) => intersects(abs, o)) && !discs.some((o) => intersects(abs, o, 0)))
      const spot = clear.find(({ abs }) => !onLine(abs)) ?? clear[0] ?? spots[0]
      wasNotes.set(id, { text, x: spot.x, y: spot.y, anchor: spot.anchor, box: spot.box })
      hard.push(spot.abs)
      placedBoxes.push(spot.abs)
    }
  }

  // What a floating edge label must stay clear of: every node, its label block, its do tag; and
  // the edge labels already placed.
  const hitsNode = (box: Box): boolean => shown.some((id) => {
    const p = pos.get(id)
    if (!p) return false
    if (switches.includes(id)) return intersects(box, around(p.x, p.y, SWITCH_HALF), 0)
    const dx = Math.max(box.x0 - p.x, 0, p.x - box.x1)
    const dy = Math.max(box.y0 - p.y, 0, p.y - box.y1)
    return dx * dx + dy * dy <= R * R
  })
  const obstacles: Box[] = [...placedBoxes]
  for (const id of shown) {
    const p = pos.get(id)
    if (p === undefined) continue
    const local: Box[] = [around(0, 0, (switches.includes(id) ? SWITCH_HALF : R) + 6)]
    const tag = doTag(id)
    if (tag !== undefined) local.push(tag.box)
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
  for (const [id, note] of wasNotes) {
    const p = pos.get(id)
    if (p === undefined) continue
    top = Math.min(top, p.y + note.box.y0 - 8)
    bottom = Math.max(bottom, p.y + note.box.y1 + 12)
    left = Math.min(left, p.x + note.box.x0 - 8)
    right = Math.max(right, p.x + note.box.x1 + 8)
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
  const claim = (placed: Placed): Placed => {
    obstacles.push(placed.box)
    return placed
  }

  const edgeMarks: EdgeMark[] = []
  for (const e of edges) {
    const line = edgeLine(e)
    if (line === undefined) continue
    const { a, b, ux, uy, x1, y1, x2, y2, key } = line
    if (line.kind === 'cut') {
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
    if (line.kind === 'inhibit') {
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
      // Never trade a collision with the stroke or a node for a clearer label block.
      // Preserve candidate order on ties. If the entire neighbourhood is occupied,
      // search successively wider bands until at least one position is admissible.
      const admissible = (cand: Placed): boolean => !segmentHitsBox({ x: x1, y: y1 }, { x: x2, y: y2 }, cand.box) && !hitsNode(cand.box)
      const previous = firstClear(inhibitCandidates, obstacles)
      let best: Placed | undefined = admissible(previous) ? previous : undefined
      let bestScore = Infinity
      for (let band = 0; best === undefined; band++) {
        for (const dy of band === 0 ? [0] : [-24 * band, 24 * band]) {
          for (const base of inhibitCandidates) {
            const cand = dy === 0 ? base : { ...base, y: base.y + dy, box: shifted(base.box, 0, dy) }
            if (!admissible(cand)) continue
            const score = obstacles.filter((o) => intersects(cand.box, o)).length
            if (score < bestScore) { best = cand; bestScore = score }
            if (score === 0) break
          }
          if (bestScore === 0) break
        }
      }
      const inhibitLabel = claim(best)
      if (best !== previous) {
        left = Math.min(left, Math.floor(best.box.x0))
        right = Math.max(right, best.box.x1)
        top = Math.min(top, Math.floor(best.box.y0))
        bottom = Math.max(bottom, best.box.y1)
      }
      edgeMarks.push({ kind: 'inhibit', key, x1, y1, x2, y2, ux, uy, live, onPath, cls, text, label: inhibitLabel })
      continue
    }
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
    labelOptions,
    labelLines,
    tags,
    holdNotes: held,
    deviantNotes: deviant,
    wasNotes,
    edges: edgeMarks,
    arcs,
    hull,
    left,
    top,
    width: Math.ceil(right - left),
    height: Math.ceil(bottom - top),
  }
}
