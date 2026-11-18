import type { KeyboardEvent, MouseEvent, PointerEvent, ReactNode } from 'react'
import { useEffect, useId, useRef, useState } from 'react'
import type { LoadedCase } from '../data/load.ts'
import type { Assignment, Edge, Value } from '../engine/index.ts'
import { getVariable } from '../engine/index.ts'
import { formatValue, valuesEqual } from '../engine/values.ts'
import type { Anchor, Box, Placed } from './graph-labels.ts'
import { around, firstClear, intersects, placePop, rectBox, segmentHitsBox, shifted, textBox } from './graph-labels.ts'
import type { NodeToggle } from './i18n.ts'
import { useMessages } from './i18n.ts'
import { sub } from './svg-text.tsx'
import type { Stochastic } from './view-model.ts'
import {
  assignmentText,
  barLayout,
  edgeLive,
  edgePolarity,
  graphSpacing,
  gridLayout,
  idWithName,
  probText,
  shortLabel,
  shownEdges,
  textWidth,
} from './view-model.ts'

export interface SignalGraphProps {
  readonly c: LoadedCase
  readonly shown: readonly string[]
  /** Deterministic world to draw (after any do). Omit in probability mode. */
  readonly values?: Assignment
  /** The world before do(), to note changed values. */
  readonly original?: Assignment
  /** Probability mode: P(V = 1) per variable. */
  readonly probs?: Readonly<Record<string, number>>
  /** Probability mode: P(V = value) in domain order for each non-boolean variable; drawn as one bar per value. */
  readonly dists?: Readonly<Record<string, readonly number[]>>
  /** Probability mode: a short note under each number. */
  readonly probNotes?: Readonly<Record<string, string>>
  /** Observed variables (drawn with a second ring). */
  readonly observed?: readonly string[]
  /** The observed values, written in a tag beside each observed node. */
  readonly observedValues?: Assignment
  readonly interventions: Assignment
  /** Stochastic interventions: P*(X=1) of a boolean node, 0 < p < 1 (drawn like a do(), with that probability). */
  readonly stochastic?: Stochastic
  readonly removedEdges: readonly Edge[]
  /** Variables a witness holds fixed: an amber hull. */
  readonly witness?: Assignment
  /** Click on a node: toggles a boolean one; a multi-valued one opens the value control when `onSetValue` is given. */
  readonly onToggle?: (id: string) => void
  /** The value control of a multi-valued node: the chosen value, or undefined to release the intervention. */
  readonly onSetValue?: (id: string, value: Value | undefined) => void
  /**
   * Probability mode: intervening on a boolean node sets P*(X=1) = 1 at once (the observed value,
   * when it was observed) and opens a slider for P*(X=1), reported here; 0 and 1 mean do(X=0) and
   * do(X=1), undefined releases the intervention.
   */
  readonly onSetProbability?: (id: string, p: number | undefined) => void
  /**
   * Given, a click (or Enter) observes the node, and a long press, Shift+click or Shift+Enter
   * intervenes on it; without it every click intervenes.
   */
  readonly onObserve?: (id: string) => void
  readonly title: string
  /** Narrower columns, for two graphs side by side. */
  readonly compact?: boolean
  /** Lets nodes be dragged (or moved with arrow keys); reports the move in grid columns and rows. */
  readonly onMove?: (id: string, dCol: number, dRow: number) => void
}

interface Drag {
  readonly id: string
  readonly pointer: number
  readonly x0: number
  readonly y0: number
  readonly dx: number
  readonly dy: number
  readonly moved: boolean
}

const SNAP = 0.25
/** Per-value bars: tallest bar, the gap to the label above them, and the value label size. */
const BAR_H = 24
const BAR_GAP = 10
const BAR_LABEL = 11
/** P*(X=1) slider step for a boolean node in probability mode. */
const P_STEP = 0.05
/** How long a press must last to intervene instead of observe, in ms. */
const LONG_PRESS = 500

/** What sits under a node's label: nothing, one number, or one bar per value (with the largest probability). */
type Readout =
  | { readonly kind: 'none' }
  | { readonly kind: 'number'; readonly noteW?: number }
  | { readonly kind: 'bars'; readonly width: number; readonly maxW: number; readonly noteW?: number }

/** A node's label and its readout as one block, in offsets from the node's centre. */
interface Block {
  readonly side: 'below' | 'above'
  /** Baselines of the label, the number and the note. */
  readonly labelY: number
  readonly numberY: number
  readonly noteY: number
  /** Bars: left edge and the baseline the bars stand on. */
  readonly x0: number
  readonly baseline: number
  readonly boxes: readonly Box[]
}

const NUMBER_W = textWidth('0.00', 16) + 4

/** The block with its top edge at `top`. */
function blockAt(top: number, side: Block['side'], labelW: number, readout: Readout): Block {
  const labelY = top + 12
  const boxes: Box[] = [textBox(0, labelY, 'middle', labelW, 14)]
  let numberY = labelY
  let noteY = labelY
  let x0 = 0
  let baseline = labelY
  if (readout.kind === 'number') {
    numberY = labelY + 22
    noteY = numberY + 19
    boxes.push(textBox(0, numberY, 'middle', NUMBER_W, 16))
    if (readout.noteW !== undefined) boxes.push(textBox(0, noteY, 'middle', readout.noteW, 12))
  } else if (readout.kind === 'bars') {
    const chartTop = labelY + BAR_GAP
    x0 = -readout.width / 2
    baseline = chartTop + BAR_H
    noteY = baseline + BAR_LABEL + 16
    boxes.push(rectBox(x0, chartTop, readout.width, BAR_H + BAR_LABEL + 6))
    boxes.push(textBox(x0 - 5, chartTop + 8, 'end', readout.maxW, 11))
    if (readout.noteW !== undefined) boxes.push(textBox(0, noteY, 'middle', readout.noteW, 12))
  }
  return { side, labelY, numberY, noteY, x0, baseline, boxes }
}

/** The block under a node of radius `r`, and the same block moved above it. */
function blockOptions(r: number, labelW: number, readout: Readout): readonly [Block, Block] {
  const below = blockAt(r + 12, 'below', labelW, readout)
  const probe = blockAt(0, 'above', labelW, readout)
  const height = Math.max(...probe.boxes.map((b) => b.y1))
  return [below, blockAt(-r - 10 - height, 'above', labelW, readout)]
}

function snap(v: number): number {
  return Math.round(v / SNAP) * SNAP
}


interface Point {
  readonly x: number
  readonly y: number
}

function unit(a: Point, b: Point): { ux: number; uy: number; d: number } {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const d = Math.hypot(dx, dy) || 1
  return { ux: dx / d, uy: dy / d, d }
}

function clampPath(r: number): string {
  const o = r + 8
  const s = 14
  return `M${-o} ${-o + s}v${-s}h${s}M${o - s} ${-o}h${s}v${s}M${o} ${o - s}v${s}h${-s}M${-o + s} ${o}h${-s}v${-s}`
}

/** Direction 1 「訊號圖」: value nodes, signal edges, do() clamps and cut edges. */
export function SignalGraph(props: SignalGraphProps) {
  const {
    c,
    shown,
    values,
    original,
    probs,
    dists,
    probNotes,
    observed = [],
    interventions,
    stochastic = {},
    removedEdges,
    witness,
    onToggle,
    onSetValue,
    onSetProbability,
    onObserve,
    onMove,
    observedValues = {},
  } = props
  const t = useMessages()
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const svgRef = useRef<SVGSVGElement>(null)
  const [drag, setDrag] = useState<Drag | undefined>(undefined)
  // After a drag, the browser may still send a click to the node: ignore clicks until this time.
  const suppressUntil = useRef(0)
  const [picking, setPicking] = useState<string | undefined>(undefined)
  // A long press in progress, and whether the last one fired (so the click after it is ignored).
  const [pressing, setPressing] = useState<string | undefined>(undefined)
  const pressTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const pressFired = useRef(false)
  // The kind of pointer that last pressed a node: a contextmenu from a mouse intervenes, one from
  // a touch (Android sends it on a long press) does not, since the long-press timer already did.
  const lastPointer = useRef('')
  const cancelPress = (): void => {
    if (pressTimer.current !== undefined) clearTimeout(pressTimer.current)
    pressTimer.current = undefined
    setPressing(undefined)
  }
  useEffect(() => () => {
    if (pressTimer.current !== undefined) clearTimeout(pressTimer.current)
  }, [])
  // The control belongs to a node under do(): once that do() is gone (reset by a button, a preset,
  // the keyboard), the control closes.
  if (picking !== undefined && !(picking in interventions) && !(picking in stochastic)) setPicking(undefined)
  const popRef = useRef<HTMLDivElement>(null)
  const sliderRef = useRef<HTMLInputElement>(null)
  const focusNode = (id: string): void => svgRef.current?.querySelector<SVGGElement>(`[data-node="${id}"]`)?.focus()
  useEffect(() => {
    if (picking === undefined) return
    sliderRef.current?.focus()
    const outside = (e: Event): void => {
      const target = e.target
      if (!(target instanceof Element)) return
      // A press on a node is that node's own click (it closes this control, or opens another).
      if (popRef.current?.contains(target) === true || target.closest('[data-node]') !== null) return
      setPicking(undefined)
    }
    const escape = (e: globalThis.KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      setPicking(undefined)
      focusNode(picking)
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [picking])
  const prob = probs !== undefined
  const { r: R, col: COL, row: ROW } = graphSpacing(prob, props.compact === true)
  const PAD_X = props.compact === true ? 60 : 96
  const PAD_Y = 72
  const grid = gridLayout(c, shown)
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
  const toSvg = (e: PointerEvent): Point => {
    const ctm = svgRef.current?.getScreenCTM?.()
    if (ctm === null || ctm === undefined) return { x: e.clientX, y: e.clientY }
    const inv = ctm.inverse()
    return { x: inv.a * e.clientX + inv.c * e.clientY + inv.e, y: inv.b * e.clientX + inv.d * e.clientY + inv.f }
  }
  const startDrag = (id: string, e: PointerEvent<SVGGElement>): void => {
    if (onMove === undefined || e.button !== 0) return
    const at = toSvg(e)
    setDrag({ id, pointer: e.pointerId, x0: at.x, y0: at.y, dx: 0, dy: 0, moved: false })
  }
  const moveDrag = (e: PointerEvent<SVGSVGElement>): void => {
    if (drag === undefined || e.pointerId !== drag.pointer) return
    const at = toSvg(e)
    const dx = at.x - drag.x0
    const dy = at.y - drag.y0
    const moved = drag.moved || Math.hypot(dx, dy) > 4
    // Capture only once it is a drag, so a plain press-release stays a click on the node.
    if (moved && !drag.moved) {
      svgRef.current?.setPointerCapture?.(e.pointerId)
      cancelPress()
    }
    setDrag({ ...drag, dx, dy, moved })
  }
  const endDrag = (e: PointerEvent<SVGSVGElement>): void => {
    if (drag === undefined || e.pointerId !== drag.pointer) return
    setDrag(undefined)
    if (!drag.moved) return
    suppressUntil.current = Date.now() + 400
    const dCol = snap(drag.dx / COL)
    const dRow = snap(drag.dy / ROW)
    if (dCol !== 0 || dRow !== 0) onMove?.(drag.id, dCol, dRow)
  }
  const cut = new Set(removedEdges.map((e) => `${e.from}>${e.to}`))
  const edges = shownEdges(c.model.edges, shown)
  const nameOf = (id: string): string => shortLabel(c.model, id, t.locale)

  // The tag beside a set node: `X←1` for do(), `P(X=1)=0.30` for a stochastic do(), `X=1` observed.
  const doTag = (id: string): { text: string; box: Box; left: boolean; seen: boolean } | undefined => {
    const forced = interventions[id]
    const soft = stochastic[id]
    const seen = observedValues[id]
    if (forced === undefined && soft === undefined && seen === undefined) return undefined
    if (witness !== undefined && id in witness) return undefined
    const text =
      forced !== undefined ? `${id}←${formatValue(forced)}` : soft !== undefined ? `P(${id}=1)=${probText(soft)}` : `${id}=${formatValue(seen as Value)}`
    const w = textWidth(text, 12) + 18
    const left = (grid.get(id)?.col ?? 0) === maxCol
    return { text, left, seen: forced === undefined && soft === undefined, box: rectBox(left ? -R - 12 - w : R + 12, -R - 10, w, 22) }
  }

  // Each node's label and readout form one block right under it; only when that block touches an
  // edge, another node, a do tag or an earlier block, or leaves the graph's sides, does the whole
  // block go above the node (when that touches less).
  const placedBoxes: Box[] = []
  const blocks = new Map<string, Block>()
  const fixed: Box[] = []
  for (const id of shown) {
    const p = pos.get(id)
    if (p === undefined) continue
    fixed.push(around(p.x, p.y, R + 3))
    const tag = doTag(id)
    if (tag !== undefined) fixed.push(shifted(tag.box, p.x, p.y))
  }
  for (const id of shown) {
    const p = pos.get(id)
    if (p === undefined) continue
    const variable = getVariable(c.model, id)
    const note = probNotes?.[id]
    const noteW = note === undefined ? undefined : textWidth(note, 12)
    let readout: Readout = { kind: 'none' }
    if (barred(id) && variable.domain.kind === 'finite') {
      const known = (dists?.[id] ?? []).filter((x) => !Number.isNaN(x))
      const maxW = known.length === 0 ? 0 : textWidth(t.barMax(probText(Math.max(...known))), 11)
      readout = { kind: 'bars', width: barLayout(variable.domain.values.map(formatValue), BAR_LABEL).width, maxW, noteW }
    } else if (prob) readout = { kind: 'number', noteW }
    const labelW = textWidth(idWithName(id, nameOf(id)), 14)
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
        // The node's own circle and do tag never meet its block, above or below.
        for (const o of [...fixed, ...placedBoxes]) if (intersects(box, o, 0)) n += 1
      }
      return n
    }
    const [below, above] = blockOptions(R, labelW, readout)
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
    const local: Box[] = [around(0, 0, R + 6)]
    const tag = doTag(id)
    if (tag !== undefined) local.push(tag.box)
    const before = original?.[id]
    const now = values?.[id]
    if (!prob && before !== undefined && now !== undefined && !valuesEqual(before, now)) {
      local.push(textBox(R + 14, R + 14, 'start', textWidth(t.was(formatValue(before)), 12), 12))
    }
    for (const b of local) obstacles.push(shifted(b, p.x, p.y))
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
  top = Math.floor(top)
  left = Math.floor(left)
  const height = Math.ceil(bottom - top)
  const viewW = Math.ceil(right - left)
  const claim = (placed: Placed): Placed => {
    obstacles.push(placed.box)
    return placed
  }

  const edgeEls = edges.map((e) => {
    const a = pos.get(e.from)
    const b = pos.get(e.to)
    if (a === undefined || b === undefined) return null
    const { ux, uy } = unit(a, b)
    const x1 = a.x + R * ux
    const y1 = a.y + R * uy
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
      return (
        <g key={key} className="ca-edge ca-edge-cut" data-edge={key} data-state="cut">
          <line x1={x1} y1={y1} x2={mx - 10 * ux} y2={my - 10 * uy} className="ca-stroke-cut" />
          <line x1={mx + 10 * ux} y1={my + 10 * uy} x2={x2} y2={y2} className="ca-stroke-cut" />
          <path d={slash(mx - 4 * ux, my - 4 * uy) + slash(mx + 4 * ux, my + 4 * uy)} className="ca-stroke-slash" />
          <text x={cutLabel.x} y={cutLabel.y} className="ca-svg-small ca-svg-bold" textAnchor={cutLabel.anchor}>
            {t.cut}
          </text>
        </g>
      )
    }
    const live = edgeLive(values, e.from)
    const cls = live ? 'ca-stroke-live' : 'ca-stroke-idle'
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
      return (
        <g key={key} className="ca-edge" data-edge={key} data-state={live ? 'live' : 'idle'}>
          <line x1={x1} y1={y1} x2={x2} y2={y2} className={cls} />
          <circle cx={x2 + 5 * ux} cy={y2 + 5 * uy} r={5} className={`ca-inhibit ${live ? 'is-live' : ''}`} />
          <text x={inhibitLabel.x} y={inhibitLabel.y} className={`ca-svg-small ca-svg-bold ca-mono ${live ? '' : 'ca-fill-muted'}`}>
            {sub(text)}
          </text>
        </g>
      )
    }
    const x2 = b.x - (R + 2) * ux
    const y2 = b.y - (R + 2) * uy
    return (
      <g key={key} className="ca-edge" data-edge={key} data-state={live ? 'live' : 'idle'}>
        <line
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          className={cls}
          markerEnd={`url(#${uid}-${live ? 'live' : 'idle'})`}
        />
      </g>
    )
  })

  let hull: { x: number; y: number; w: number; h: number; text: string } | undefined
  if (witness !== undefined && Object.keys(witness).length > 0) {
    const pts = Object.keys(witness)
      .map((id) => pos.get(id))
      .filter((p): p is Point => p !== undefined)
    if (pts.length > 0) {
      const pad = R + 14
      const x = Math.min(...pts.map((p) => p.x)) - pad - 20
      const y = Math.min(...pts.map((p) => p.y)) - pad
      hull = {
        x,
        y,
        w: Math.max(...pts.map((p) => p.x)) + pad + 20 - x,
        // Include the label under the node.
        h: Math.max(...pts.map((p) => p.y)) + R + 34 - y,
        text: t.witnessHold(assignmentText(witness)),
      }
    }
  }

  const nodeEls = shown.map((id) => {
    const p = pos.get(id)
    const block = blocks.get(id)
    if (p === undefined || block === undefined) return null
    const variable = getVariable(c.model, id)
    const v = values?.[id]
    const forced = interventions[id]
    const soft = stochastic[id]
    const intervened = forced !== undefined || soft !== undefined
    const held = witness !== undefined && id in witness
    const boolean = variable.domain.kind === 'boolean'
    const filled = !prob && v === true
    const text = v === undefined ? '' : formatValue(v)
    const before = original?.[id]
    const changed = !prob && before !== undefined && v !== undefined && !valuesEqual(before, v)
    const name = nameOf(id)
    const who = idWithName(id, name)
    const pv = probs?.[id]
    // A non-boolean node shows one bar per value, so each value gets its own number.
    const bars = barred(id) && variable.domain.kind === 'finite' ? variable.domain.values : undefined
    const dist = dists?.[id]
    const barText = (i: number): string => `P(${id}=${formatValue((bars ?? [])[i])})=${probText(dist?.[i] ?? Number.NaN)}`
    const state = prob
      ? bars !== undefined
        ? bars.map((_, i) => barText(i)).join(', ')
        : `P(${id}=1) ${probText(pv ?? Number.NaN)}`
      : t.nodeValue(text)
    const forcedText = forced !== undefined ? formatValue(forced) : soft !== undefined ? `P(${id}=1)=${probText(soft)}` : undefined
    const seen = observedValues[id]
    const aria = t.nodeAria(who, state, forcedText, changed ? formatValue(before) : undefined, seen === undefined ? undefined : formatValue(seen))
    // A multi-valued node does not flip: intervening on it sets a value and opens a control to pick
    // another. In probability mode a boolean one is set to 1 and opens a control for P*(X=1).
    // An exogenous node is the context: it can be observed, never set by do().
    const settable = variable.kind === 'endogenous'
    const picksValue = settable && onToggle !== undefined && onSetValue !== undefined && !boolean
    const picksProb = settable && prob && boolean && onSetProbability !== undefined
    const picks = picksValue || picksProb
    const toggles = settable && onToggle !== undefined
    const observes = onObserve !== undefined
    const interactive = toggles || onMove !== undefined || picks || observes
    /** Intervene: set the node at once (to its observed or current value) and open its control. */
    const intervene = (): void => {
      if (picksProb) {
        if (!intervened) onSetProbability?.(id, seen === undefined || seen === true || seen === 1 ? 1 : 0)
        setPicking(intervened && picking === id ? undefined : id)
      } else if (picksValue && variable.domain.kind === 'finite') {
        if (!intervened) onSetValue?.(id, seen ?? v ?? variable.domain.values[0])
        setPicking(intervened && picking === id ? undefined : id)
      } else if (toggles) onToggle?.(id)
    }
    const activate = (shift: boolean): void => {
      if (observes && !shift) {
        setPicking(undefined)
        onObserve(id)
      } else intervene()
    }
    const arrows: Record<string, [number, number]> = { ArrowLeft: [-0.5, 0], ArrowRight: [0.5, 0], ArrowUp: [0, -0.5], ArrowDown: [0, 0.5] }
    const onKey = (event: KeyboardEvent<SVGGElement>): void => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        activate(event.shiftKey)
        return
      }
      const step = arrows[event.key]
      if (onMove !== undefined && step !== undefined) {
        event.preventDefault()
        onMove(id, step[0], step[1])
      }
    }
    const onClick = (event: MouseEvent<SVGGElement>): void => {
      if (pressFired.current) {
        pressFired.current = false
        return
      }
      if (Date.now() < suppressUntil.current) return
      activate(event.shiftKey)
    }
    const onPointerDown = (e: PointerEvent<SVGGElement>): void => {
      lastPointer.current = e.pointerType
      startDrag(id, e)
      if (!observes || !settable || e.button !== 0 || e.shiftKey) return
      pressFired.current = false
      cancelPress()
      setPressing(id)
      pressTimer.current = setTimeout(() => {
        pressTimer.current = undefined
        pressFired.current = true
        setPressing(undefined)
        intervene()
      }, LONG_PRESS)
    }
    /** A right-click intervenes, as a long press does; only from a mouse (see `lastPointer`). */
    const onContextMenu = (e: MouseEvent<SVGGElement>): void => {
      e.preventDefault()
      const own = (e.nativeEvent as { pointerType?: string }).pointerType
      const kind = own === undefined ? lastPointer.current : own
      if (kind !== 'mouse' || !settable) return
      cancelPress()
      intervene()
    }
    const toggle: NodeToggle | undefined = observes
      ? settable
        ? 'observe'
        : 'observeOnly'
      : picksProb
      ? intervened
        ? 'adjustProb'
        : 'chooseProb'
      : !toggles
        ? undefined
        : picksValue
          ? intervened
            ? 'adjust'
            : 'choose'
          : intervened
            ? 'release'
            : 'set'
    const hint = t.nodeHint(toggle, onMove !== undefined)
    const level = prob && pv !== undefined && !Number.isNaN(pv) ? 2 * R * pv : 0
    const tag = doTag(id)
    return (
      <g
        key={id}
        className={`ca-node${interactive ? ' is-interactive' : ''}${onMove !== undefined ? ' is-movable' : ''}`}
        data-node={id}
        data-value={text}
        data-intervened={intervened ? 'true' : 'false'}
        data-observed={seen === undefined ? undefined : formatValue(seen)}
        data-pressing={pressing === id ? 'true' : undefined}
        data-do-p={soft === undefined ? undefined : soft.toFixed(2)}
        data-block={block.side}
        transform={`translate(${p.x} ${p.y})`}
        {...(interactive
          ? {
              role: 'button',
              tabIndex: 0,
              'aria-pressed': toggles && !picks ? intervened : undefined,
              'aria-haspopup': picks ? 'dialog' : undefined,
              'aria-expanded': picks ? picking === id : undefined,
              'aria-label': t.withHint(aria, hint),
              onClick,
              onKeyDown: onKey,
              onPointerDown,
              onPointerUp: cancelPress,
              onPointerLeave: cancelPress,
              onPointerCancel: cancelPress,
              onContextMenu: observes ? onContextMenu : undefined,
            }
          : { role: 'img', 'aria-label': aria })}
      >
        <circle r={R + 12} className="ca-focus-ring" />
        {pressing === id && <circle r={R + 8} className="ca-press-ring" pathLength={100} />}
        {observed.includes(id) && <circle r={R + 5} className="ca-ring" />}
        {prob ? (
          <>
            <clipPath id={`${uid}-cp-${id}`}>
              <circle r={R} />
            </clipPath>
            <circle r={R} className="ca-fill-bg" />
            {bars === undefined && (
              <rect
                x={-R}
                y={R - level}
                width={2 * R}
                height={level}
                className="ca-fill-fg"
                clipPath={`url(#${uid}-cp-${id})`}
                data-level={pv === undefined ? '' : pv.toFixed(4)}
              />
            )}
            <circle r={R} className="ca-node-outline" />
          </>
        ) : (
          <>
            <circle r={R} className={filled ? 'ca-node-on' : 'ca-node-off'} />
            <text
              y={boolean ? 7.5 : 5}
              textAnchor="middle"
              className={`ca-mono ca-svg-bold ${filled ? 'ca-fill-bg-text' : ''}`}
              fontSize={boolean || text.length <= 2 ? 21 : 13}
            >
              {text}
            </text>
          </>
        )}
        {intervened && !held && (
          <>
            <path d={clampPath(R)} className="ca-stroke-clamp" />
            {tag !== undefined && (
              <g transform={`translate(${tag.box.x0} ${tag.box.y0})`}>
                <rect width={tag.box.x1 - tag.box.x0} height={22} className="ca-fill-accent" />
                <text
                  x={(tag.box.x1 - tag.box.x0) / 2}
                  y={15.5}
                  textAnchor="middle"
                  className="ca-mono ca-svg-small ca-svg-bold ca-fill-on-accent"
                >
                  {sub(tag.text)}
                </text>
              </g>
            )}
          </>
        )}
        {!intervened && tag !== undefined && tag.seen && (
          <g transform={`translate(${tag.box.x0} ${tag.box.y0})`} className="ca-seen-tag">
            <rect width={tag.box.x1 - tag.box.x0} height={22} className="ca-seen-tag-box" />
            <text x={(tag.box.x1 - tag.box.x0) / 2} y={15.5} textAnchor="middle" className="ca-mono ca-svg-small ca-svg-bold">
              {sub(tag.text)}
            </text>
          </g>
        )}
        {changed && (
          <text x={R + 14} y={R + 14} className="ca-svg-small ca-fill-muted">
            {t.was(formatValue(before))}
          </text>
        )}
        <text y={block.labelY} textAnchor="middle" className="ca-svg-label">
          <tspan className="ca-mono ca-svg-bold">{sub(id)}</tspan>
          {name === '' ? null : ` ${name}`}
        </text>
        {bars !== undefined
          ? barChart(id, bars.map(formatValue), dist, block, barText)
          : prob && (
              <text y={block.numberY} textAnchor="middle" className="ca-mono ca-svg-num" data-readout={id}>
                {probText(pv ?? Number.NaN)}
              </text>
            )}
        {prob && probNotes?.[id] !== undefined && (
          <text y={block.noteY} textAnchor="middle" className="ca-svg-small ca-fill-muted">
            {probNotes[id]}
          </text>
        )}
      </g>
    )
  })

  /** One bar per value, scaled so the most likely value fills the chart's height; that probability is written beside it. */
  function barChart(
    id: string,
    labels: readonly string[],
    dist: readonly number[] | undefined,
    block: Block,
    barText: (i: number) => string,
  ): ReactNode {
    const layout = barLayout(labels, BAR_LABEL)
    const known = (dist ?? []).filter((x) => !Number.isNaN(x))
    const max = known.length === 0 ? Number.NaN : Math.max(...known)
    return (
      <g className="ca-bars" data-bars={id} transform={`translate(${block.x0} ${block.baseline})`}>
        <line x1={0} x2={layout.width} y1={0} y2={0} className="ca-hair" />
        {!Number.isNaN(max) && (
          <text x={-5} y={-BAR_H + 8} textAnchor="end" className="ca-mono ca-svg-tiny ca-fill-muted" data-max={max.toFixed(4)}>
            {t.barMax(probText(max))}
          </text>
        )}
        {labels.map((text, i) => {
          const p = dist?.[i]
          const ok = p !== undefined && !Number.isNaN(p)
          const h = ok && max > 0 && p > 0 ? Math.max(1, (p / max) * BAR_H) : 0
          const cx = i * layout.pitch + layout.pitch / 2
          const edge = i === 0 || i === labels.length - 1
          return (
            <g key={text} data-bar={text} data-p={ok ? p.toFixed(4) : ''}>
              <title>{barText(i)}</title>
              <rect x={cx - layout.barW / 2} y={-h} width={layout.barW} height={h} className="ca-fill-fg" />
              {(layout.labelsFit || edge) && (
                <text x={cx} y={BAR_LABEL + 2} textAnchor="middle" className="ca-mono ca-svg-tiny ca-fill-muted">
                  {text}
                </text>
              )}
            </g>
          )
        })}
      </g>
    )
  }

  const pickPop = (): ReactNode => {
    if (picking === undefined) return null
    const p = pos.get(picking)
    const variable = getVariable(c.model, picking)
    if (p === undefined) return null
    const id = picking
    const who = idWithName(id, nameOf(id))
    const forced = interventions[id]
    const soft = stochastic[id]
    let control: {
      readonly max: number
      readonly step: number
      readonly index: number
      readonly text: string
      readonly label: string
      readonly idle: boolean
      readonly commit: (n: number) => void
      readonly release: () => void
    }
    if (prob && variable.domain.kind === 'boolean' && onSetProbability !== undefined) {
      // P*(X=1) in steps of P_STEP: the ends are do(X=0) and do(X=1), the rest a stochastic do().
      const set = forced !== undefined ? (forced === true || forced === 1 ? 1 : 0) : soft
      const shownP = set ?? Math.round((probs?.[id] ?? 0) / P_STEP) * P_STEP
      control = {
        max: 1,
        step: P_STEP,
        index: shownP,
        text: forced !== undefined ? `${id}=${formatValue(forced)}` : `P(${id}=1)=${probText(shownP)}`,
        label: t.doProbLabel(who),
        idle: set === undefined,
        commit: (n) => onSetProbability(id, n),
        release: () => onSetProbability(id, undefined),
      }
    } else if (variable.domain.kind === 'finite' && onSetValue !== undefined) {
      const options = variable.domain.values
      const shownValue = forced ?? values?.[id]
      const found = shownValue === undefined ? -1 : options.findIndex((o) => valuesEqual(o, shownValue))
      const index = found < 0 ? 0 : found
      control = {
        max: options.length - 1,
        step: 1,
        index,
        text: `${id}=${formatValue(options[index])}`,
        label: t.doPickLabel(who),
        idle: forced === undefined,
        commit: (n) => onSetValue(id, options[n]),
        release: () => onSetValue(id, undefined),
      }
    } else return null
    const W = 184
    const H = 72
    // Beside the node, centred on it, so the nodes under it stay visible; the do tag sits above that line.
    const others = shown.filter((o) => o !== id)
    const nodes = others.flatMap((o) => {
      const q = pos.get(o)
      return q === undefined ? [] : [around(q.x - left, q.y - top, R + 4)]
    })
    const labels = others.flatMap((o) => {
      const q = pos.get(o)
      return q === undefined ? [] : (blocks.get(o)?.boxes ?? []).map((b) => shifted(b, q.x - left, q.y - top))
    })
    const at = placePop({ x: p.x - left, y: p.y - top }, R, { w: W, h: H }, { w: viewW, h: height }, 16, nodes, labels)
    const release = (): void => {
      control.release()
      setPicking(undefined)
      focusNode(id)
    }
    return (
      <foreignObject className="ca-do-pop-box" x={at.x + left} y={at.y + top} width={W} height={H}>
        <div ref={popRef} className="ca-do-pop" role="dialog" aria-label={control.label} data-pick={id}>
          <div className="ca-do-pop-head">
            <output className={`ca-do-pop-value ca-mono${control.idle ? ' is-idle' : ''}`}>{control.text}</output>
            <button type="button" className="ca-do-pop-release" disabled={control.idle} onClick={release}>
              {t.doRelease}
            </button>
          </div>
          <input
            ref={sliderRef}
            className="ca-slider ca-do-pop-slider"
            type="range"
            min={0}
            max={control.max}
            step={control.step}
            value={control.index}
            aria-label={control.label}
            aria-valuetext={control.text}
            onChange={(e) => control.commit(Number(e.currentTarget.value))}
            // A press that does not move the thumb is still a choice: set the value it shows.
            onClick={() => control.idle && control.commit(control.index)}
          />
        </div>
      </foreignObject>
    )
  }

  return (
    <svg
      ref={svgRef}
      onPointerMove={onMove === undefined ? undefined : moveDrag}
      onPointerUp={onMove === undefined ? undefined : endDrag}
      onPointerCancel={onMove === undefined ? undefined : () => setDrag(undefined)}
      className="ca-graph"
      viewBox={`${left} ${top} ${viewW} ${height}`}
      width={viewW}
      height={height}
      role="group"
      aria-label={props.title}
      data-mode={prob ? 'probability' : 'value'}
    >
      <defs>
        <marker id={`${uid}-live`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto">
          <path d="M0 0.5L10 5L0 9.5z" className="ca-fill-fg" />
        </marker>
        <marker id={`${uid}-idle`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">
          <path d="M0 0.5L10 5L0 9.5z" className="ca-fill-idle" />
        </marker>
      </defs>
      {hull !== undefined && (
        <g className="ca-witness" data-witness={Object.keys(witness ?? {}).join(',')}>
          <rect x={hull.x} y={hull.y} width={hull.w} height={hull.h} className="ca-hull" />
          <g transform={`translate(${hull.x} ${hull.y + hull.h + 6})`}>
            <rect width={textWidth(hull.text, 12) + 18} height={22} className="ca-amber-tag" />
            <text x={8} y={15.5} className="ca-svg-small ca-svg-bold ca-fill-amber">
              {sub(hull.text)}
            </text>
          </g>
        </g>
      )}
      {edgeEls}
      {nodeEls}
      {pickPop()}
    </svg>
  )
}
