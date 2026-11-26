import type { Anchor, Box, Placed } from './graph-labels.ts'
import { rectBox, textBox } from './graph-labels.ts'
import { textWidth } from '../text/text-measure.ts'
import type { Value } from '../../engine/index.ts'
import { formatValue } from '../../engine/values.ts'
import type { Messages } from '../i18n/messages.ts'
import { probText } from '../model/wording.ts'

/** The shapes a signal graph draws with: a node's label block and its readout, and the path strings of arrowheads, clamps and dashed rings. Pure. */

const SNAP = 0.25
/** Per-value bars: tallest bar, the gap to the label above them, and the value label size. */
export const BAR_H = 24
export const BAR_GAP = 10
export const BAR_LABEL = 11

/** What sits under a node's label: nothing, one number, or one bar per value (with the largest probability). */
export type Readout =
  | { readonly kind: 'none'; readonly noteW?: number; readonly note2W?: number }
  | { readonly kind: 'number'; readonly noteW?: number; readonly numberW?: number }
  | { readonly kind: 'bars'; readonly width: number; readonly maxW: number; readonly noteW?: number }

/** Where a label block sits round its node: under or over the disc, beside it, or off one of its corners. */
export type BlockSide = 'below' | 'above' | 'right' | 'left' | 'below-right' | 'below-left' | 'above-right' | 'above-left'

/** A node's label and its readout as one block, in offsets from the node's centre. */
export interface Block {
  readonly side: BlockSide
  /** The block's middle line: every text in it is centred on `cx`. */
  readonly cx: number
  /** Whether the label is wrapped onto two lines; the second has its baseline at `label2Y`. */
  readonly wrapped: boolean
  /** Baselines of the label (and of its second line), the number and the note (and a second note line). */
  readonly labelY: number
  readonly label2Y: number
  readonly numberY: number
  readonly noteY: number
  readonly note2Y: number
  /** Bars: left edge and the baseline the bars stand on. */
  readonly x0: number
  readonly baseline: number
  readonly boxes: readonly Box[]
}

/** The width a node's number reserves under its label: a probability of `digits` decimals at 16 px. */
export function numberWidth(digits = 2): number {
  return textWidth(`0.${'0'.repeat(digits)}`, 16) + 4
}

/** What a probability node shows as its number: a small prefix and the text. `settled` nodes (observed or do()) carry no 原本 note. */
export interface NodeReadout {
  readonly prefix: string
  readonly text: string
  readonly settled: boolean
}

export function nodeReadout(
  t: Messages,
  digits: number,
  p: number | undefined,
  forced: Value | undefined,
  seen: Value | undefined,
): NodeReadout {
  if (forced !== undefined) return { prefix: '', text: t.nodeReadout.intervened(formatValue(forced)), settled: true }
  if (seen !== undefined) return { prefix: '', text: t.nodeReadout.observed(formatValue(seen)), settled: true }
  return { prefix: `${t.nodeReadout.unknown} `, text: probText(p ?? Number.NaN, digits), settled: false }
}

/** The width a readout reserves: the number at 16 px, or the settled text at 14 px, after its prefix at 11 px. */
export function readoutWidth(r: NodeReadout, digits: number): number {
  const prefixW = r.prefix === '' ? 0 : textWidth(r.prefix, 11)
  return prefixW + (r.settled ? textWidth(r.text, 14) + 4 : numberWidth(digits))
}

/** A label's width on one line, and on two when it can be wrapped. */
export interface LabelSize {
  readonly width: number
  readonly lines?: readonly [number, number]
}

/** Between the baselines of a wrapped label's two lines, in px. */
export const LABEL_LEADING = 17

/** The block with its top edge at `top`, centred on `cx`; its label on two lines when `wrapped`. */
function blockAt(top: number, side: BlockSide, label: LabelSize, readout: Readout, cx = 0, wrapped = false): Block {
  const labelY = top + 12
  const lines = wrapped ? label.lines : undefined
  // A wrapped label claims one box over both its lines, as wide as the longer one.
  const label2Y = lines === undefined ? labelY : labelY + LABEL_LEADING
  const labelBox = textBox(cx, labelY, 'middle', lines === undefined ? label.width : Math.max(...lines), 14)
  const boxes: Box[] = [{ ...labelBox, y1: labelBox.y1 + label2Y - labelY }]
  let numberY = label2Y
  let noteY = label2Y
  let x0 = cx
  let baseline = label2Y
  let note2Y = label2Y
  const last = label2Y
  if (readout.kind === 'none' && (readout.noteW !== undefined || readout.note2W !== undefined)) {
    noteY = last + 17
    note2Y = readout.noteW === undefined ? noteY : noteY + 18
    if (readout.noteW !== undefined) boxes.push(textBox(cx, noteY, 'middle', readout.noteW, 12))
    if (readout.note2W !== undefined) boxes.push(textBox(cx, note2Y, 'middle', readout.note2W + 8, 14))
  } else if (readout.kind === 'number') {
    numberY = last + 22
    noteY = numberY + 19
    boxes.push(textBox(cx, numberY, 'middle', readout.numberW ?? numberWidth(), 16))
    if (readout.noteW !== undefined) boxes.push(textBox(cx, noteY, 'middle', readout.noteW, 12))
  } else if (readout.kind === 'bars') {
    const chartTop = last + BAR_GAP
    x0 = cx - readout.width / 2
    baseline = chartTop + BAR_H
    noteY = baseline + BAR_LABEL + 16
    boxes.push(rectBox(x0, chartTop, readout.width, BAR_H + BAR_LABEL + 6))
    boxes.push(textBox(x0 - 5, chartTop + 8, 'end', readout.maxW, 11))
    if (readout.noteW !== undefined) boxes.push(textBox(cx, noteY, 'middle', readout.noteW, 12))
  }
  return { side, cx, wrapped: lines !== undefined, labelY, label2Y, numberY, noteY, note2Y, x0, baseline, boxes }
}

/**
 * Where a node of radius `r` may put its label block, best first: under the disc, over it, beside
 * it on the right and on the left (level with its centre), then off each of the disc's four
 * corners, last because a block there may read as its neighbour's. Each spot is followed by the
 * same spot with the label on two lines, when it can be wrapped, so a long label wraps where it is
 * before it moves to another side.
 */
export function blockOptions(r: number, label: number | LabelSize, readout: Readout): readonly Block[] {
  const size: LabelSize = typeof label === 'number' ? { width: label } : label
  const at = (wrapped: boolean): { readonly sides: Block[]; readonly corners: Block[] } => {
    const probe = blockAt(0, 'below', size, readout, 0, wrapped)
    const height = Math.max(...probe.boxes.map((b) => b.y1))
    const minX = Math.min(...probe.boxes.map((b) => b.x0))
    const maxX = Math.max(...probe.boxes.map((b) => b.x1))
    const below = r + 12
    const above = -r - 10 - height
    // Beside the disc: the label's line level with the node's centre, the block's near edge 10 px off the rim.
    const beside = -Math.max(8, height / 2)
    const right = r + 10 - minX
    const left = -r - 10 - maxX
    // Off a corner: the block's near corner just past the square round the disc.
    const d = r + 4
    return {
      sides: [
        blockAt(below, 'below', size, readout, 0, wrapped),
        blockAt(above, 'above', size, readout, 0, wrapped),
        blockAt(beside, 'right', size, readout, right, wrapped),
        blockAt(beside, 'left', size, readout, left, wrapped),
      ],
      corners: [
        blockAt(d, 'below-right', size, readout, d - minX, wrapped),
        blockAt(d, 'below-left', size, readout, -d - maxX, wrapped),
        blockAt(-d - height, 'above-right', size, readout, d - minX, wrapped),
        blockAt(-d - height, 'above-left', size, readout, -d - maxX, wrapped),
      ],
    }
  }
  const one = at(false)
  const spots = [...one.sides, ...one.corners]
  if (size.lines === undefined) return spots
  const two = at(true)
  const wrapped = [...two.sides, ...two.corners]
  return spots.flatMap((b, i) => [b, wrapped[i]])
}

/**
 * Where a small 12 px note of width `w` (原本 v) may go beside a node of radius `r` with label block
 * `block`, best first, in offsets from the node's centre: right past the block's far edge from the
 * disc (under a block beside the disc), on the label's own line after or before it, beside the
 * disc, then on the disc's other side.
 */
export function noteSpots(block: Block, r: number, w: number): readonly (Placed & { readonly box: Box })[] {
  const top = Math.min(...block.boxes.map((b) => b.y0))
  const bottom = Math.max(...block.boxes.map((b) => b.y1))
  const label = block.boxes[0]
  const spot = (x: number, y: number, anchor: Anchor) => ({ x, y, anchor, box: textBox(x, y, anchor, w, 12) })
  const under = block.side === 'below' || block.side.startsWith('below-') || block.side === 'right' || block.side === 'left'
  const outer = under ? spot(block.cx, bottom + 13, 'middle') : spot(block.cx, top - 5, 'middle')
  const across = under ? spot(0, -r - 8, 'middle') : spot(0, r + 17, 'middle')
  return [
    outer,
    spot(label.x1 + 6, block.labelY, 'start'),
    spot(label.x0 - 6, block.labelY, 'end'),
    spot(r + 8, 4, 'start'),
    spot(-r - 8, 4, 'end'),
    across,
  ]
}

export function snap(v: number): number {
  return Math.round(v / SNAP) * SNAP
}


export interface Point {
  readonly x: number
  readonly y: number
}

export function unit(a: Point, b: Point): { ux: number; uy: number; d: number } {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const d = Math.hypot(dx, dy) || 1
  return { ux: dx / d, uy: dy / d, d }
}

/**
 * The dashes of an exogenous node's outline: whole dashes round the circle, so the ring has no
 * seam. (Dashes in px, not `pathLength`, so a viewer that ignores that attribute still draws them.)
 */
export function exoDash(r: number): string {
  const c = 2 * Math.PI * r
  const unitLength = c / Math.max(6, Math.round(c / 11))
  return `${(unitLength * 0.6).toFixed(2)} ${(unitLength * 0.4).toFixed(2)}`
}

/** How far an exogenous node's fill sits inside its dashed outline, in px. */
export const EXO_INSET = 4.5

/** An arrowhead with its tip at `tip`, pointing along (`dx`, `dy`). */
export function arrowHead(tip: Point, dx: number, dy: number): string {
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len
  const uy = dy / len
  const bx = tip.x - 9 * ux
  const by = tip.y - 9 * uy
  return `M${tip.x} ${tip.y}L${bx - 3.6 * uy} ${by + 3.6 * ux}L${bx + 3.6 * uy} ${by - 3.6 * ux}z`
}

export function clampPath(r: number): string {
  const o = r + 8
  const s = 14
  return `M${-o} ${-o + s}v${-s}h${s}M${o - s} ${-o}h${s}v${s}M${o} ${o - s}v${s}h${-s}M${-o + s} ${o}h${-s}v${-s}`
}
