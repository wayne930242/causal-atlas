import type { Box } from './graph-labels.ts'
import { rectBox, textBox } from './graph-labels.ts'
import { textWidth } from '../text/text-measure.ts'

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

/** A node's label and its readout as one block, in offsets from the node's centre. */
export interface Block {
  readonly side: 'below' | 'above'
  /** Baselines of the label, the number and the note (and a second note line). */
  readonly labelY: number
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

/** The block with its top edge at `top`. */
function blockAt(top: number, side: Block['side'], labelW: number, readout: Readout): Block {
  const labelY = top + 12
  const boxes: Box[] = [textBox(0, labelY, 'middle', labelW, 14)]
  let numberY = labelY
  let noteY = labelY
  let x0 = 0
  let baseline = labelY
  let note2Y = labelY
  if (readout.kind === 'none' && (readout.noteW !== undefined || readout.note2W !== undefined)) {
    noteY = labelY + 17
    note2Y = readout.noteW === undefined ? noteY : noteY + 18
    if (readout.noteW !== undefined) boxes.push(textBox(0, noteY, 'middle', readout.noteW, 12))
    if (readout.note2W !== undefined) boxes.push(textBox(0, note2Y, 'middle', readout.note2W + 8, 14))
  } else if (readout.kind === 'number') {
    numberY = labelY + 22
    noteY = numberY + 19
    boxes.push(textBox(0, numberY, 'middle', readout.numberW ?? numberWidth(), 16))
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
  return { side, labelY, numberY, noteY, note2Y, x0, baseline, boxes }
}

/** The block under a node of radius `r`, and the same block moved above it. */
export function blockOptions(r: number, labelW: number, readout: Readout): readonly [Block, Block] {
  const below = blockAt(r + 12, 'below', labelW, readout)
  const probe = blockAt(0, 'above', labelW, readout)
  const height = Math.max(...probe.boxes.map((b) => b.y1))
  return [below, blockAt(-r - 10 - height, 'above', labelW, readout)]
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
