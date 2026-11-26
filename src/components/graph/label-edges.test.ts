import { describe, expect, it } from 'vitest'
import { listCases } from '../../data/index.ts'
import type { LoadedCase } from '../../data/load.ts'
import type { Assignment } from '../../engine/index.ts'
import type { Locale } from '../i18n/messages.ts'
import { messagesFor } from '../i18n/messages.ts'
import { solve } from '../model/model-state.ts'
import { shownVariables } from '../model/shown-variables.ts'
import type { Box } from './graph-labels.ts'
import { intersects, segmentHitsBox, shifted } from './graph-labels.ts'
import type { SignalLayout } from './signal-geometry.ts'
import { layoutSignalGraph, wrapName } from './signal-geometry.ts'
import type { Block } from './signal-shapes.ts'
import { blockOptions } from './signal-shapes.ts'

interface Pt {
  readonly x: number
  readonly y: number
}

/** Every line the graph draws, read off its marks: each edge's stroke (both halves of a cut one), each latent arc's curve. */
function strokes(l: SignalLayout): [Pt, Pt][] {
  const out: [Pt, Pt][] = []
  for (const e of l.edges) {
    if (e.kind === 'cut') {
      out.push([{ x: e.x1, y: e.y1 }, { x: e.mx - 10 * e.ux, y: e.my - 10 * e.uy }])
      out.push([{ x: e.mx + 10 * e.ux, y: e.my + 10 * e.uy }, { x: e.x2, y: e.y2 }])
    } else out.push([{ x: e.x1, y: e.y1 }, { x: e.x2, y: e.y2 }])
  }
  for (const a of l.arcs) for (let i = 0; i + 1 < a.curve.length; i++) out.push([a.curve[i], a.curve[i + 1]])
  return out
}

/** The heads: the last 10 px of each edge (with its ¬ circle past the line's end) and each arc's two ends, widened to the head. */
function heads(l: SignalLayout): Box[] {
  const out: Box[] = []
  const head = (tip: Pt, from: Pt, past: number): void => {
    const d = Math.hypot(tip.x - from.x, tip.y - from.y) || 1
    const ux = (tip.x - from.x) / d
    const uy = (tip.y - from.y) / d
    const end = { x: tip.x + past * ux, y: tip.y + past * uy }
    const base = { x: tip.x - 10 * ux, y: tip.y - 10 * uy }
    out.push({ x0: Math.min(end.x, base.x) - 5, y0: Math.min(end.y, base.y) - 5, x1: Math.max(end.x, base.x) + 5, y1: Math.max(end.y, base.y) + 5 })
  }
  for (const e of l.edges) if (e.kind !== 'cut') head({ x: e.x2, y: e.y2 }, { x: e.x1, y: e.y1 }, e.kind === 'inhibit' ? 10 : 0)
  for (const a of l.arcs) {
    head(a.plan.start, a.plan.control, 0)
    head(a.plan.end, a.plan.control, 0)
  }
  return out
}

/** Whether `box` crosses a drawn line or head. */
function crossesLine(l: SignalLayout, box: Box): boolean {
  const pad = { x0: box.x0 - 1, y0: box.y0 - 1, x1: box.x1 + 1, y1: box.y1 + 1 }
  return strokes(l).some(([a, b]) => segmentHitsBox(a, b, pad)) || heads(l).some((h) => intersects(pad, h, 0))
}

interface Scene {
  readonly name: string
  readonly c: LoadedCase
  readonly interventions: Assignment
  readonly holdNotes: boolean
  readonly locale: Locale
}

/** Every bundled case, before do() and after each of its preset interventions, on the page and in the playground (hold notes), in both languages. */
function scenes(): Scene[] {
  const out: Scene[] = []
  for (const locale of ['zh-TW', 'en'] as const) {
    for (const c of listCases()) {
      for (const interventions of [{}, ...c.data.showcase.map((s) => s.interventions)]) {
        for (const holdNotes of [false, true]) {
          out.push({ name: `${c.data.id} do(${JSON.stringify(interventions)}) ${holdNotes ? 'hold notes' : 'page'} ${locale}`, c, interventions, holdNotes, locale })
        }
      }
    }
  }
  return out
}

function layoutOf(s: Scene): SignalLayout {
  const world = solve(s.c, s.interventions)
  return layoutSignalGraph(
    {
      c: s.c,
      shown: shownVariables(s.c),
      values: world.values,
      original: world.original,
      probs: world.probs,
      dists: world.dists,
      observedValues: {},
      evidence: false,
      interventions: s.interventions,
      stochastic: {},
      removedEdges: world.removedEdges,
      holdNotes: s.holdNotes,
      clamped: [],
      compact: false,
    },
    messagesFor(s.locale),
  )
}

/** How much nearer a label block must be to its own disc than to any other, and the least gap between two nodes' blocks, in px. */
const MARGIN = 12
const GAP = 10

/** The box round all of a block's boxes, placed at its node. */
function blockHull(l: SignalLayout, id: string, block: Block): Box {
  const p = l.pos.get(id) ?? { x: 0, y: 0 }
  const all = block.boxes.map((b) => shifted(b, p.x, p.y))
  return { x0: Math.min(...all.map((b) => b.x0)), y0: Math.min(...all.map((b) => b.y0)), x1: Math.max(...all.map((b) => b.x1)), y1: Math.max(...all.map((b) => b.y1)) }
}

/** Edge-to-edge distance from a box to a disc of radius `r` at `q`. */
function discDistance(box: Box, q: Pt, r: number): number {
  const dx = Math.max(box.x0 - q.x, 0, q.x - box.x1)
  const dy = Math.max(box.y0 - q.y, 0, q.y - box.y1)
  return Math.hypot(dx, dy) - r
}

/** Another node whose disc the block is not clearly farther from than from its own, if any. */
function ambiguous(l: SignalLayout, id: string, block: Block): string | undefined {
  const box = blockHull(l, id, block)
  const own = discDistance(box, l.pos.get(id) ?? { x: 0, y: 0 }, l.r)
  for (const [other, q] of l.pos) if (other !== id && discDistance(box, q, l.r) < own + MARGIN) return other
  return undefined
}

/** One of `others` whose block comes within GAP of this one, if any. */
function abuts(l: SignalLayout, id: string, block: Block, others: readonly string[]): string | undefined {
  const p = l.pos.get(id) ?? { x: 0, y: 0 }
  const mine = block.boxes.map((b) => shifted(b, p.x, p.y))
  return others.find((other) => {
    const q = l.pos.get(other)
    const theirs = l.blocks.get(other)?.boxes ?? []
    return q !== undefined && theirs.some((b) => mine.some((m) => intersects(m, shifted(b, q.x, q.y), GAP)))
  })
}

/**
 * Why a spot for `id`'s block was no clear spot, or undefined when it was: one of its boxes meets a
 * disc or a do tag, it comes within GAP of the block of a node placed before it, it is not clearly
 * nearest its own disc, or its label crosses a drawn line.
 */
function taken(l: SignalLayout, shown: readonly string[], id: string, block: Block): string | undefined {
  const p = l.pos.get(id)
  if (p === undefined) return undefined
  const boxes = block.boxes.map((b) => shifted(b, p.x, p.y))
  const hard: [string, Box][] = []
  for (const [other, q] of l.pos) {
    hard.push([`disc ${other}`, { x0: q.x - l.r - 3, y0: q.y - l.r - 3, x1: q.x + l.r + 3, y1: q.y + l.r + 3 }])
    const tag = l.tags.get(other)
    if (tag !== undefined) hard.push([`tag ${other}`, shifted(tag.box, q.x, q.y)])
  }
  for (const box of boxes) {
    const hit = hard.find(([, o]) => intersects(box, o, 0))
    if (hit !== undefined) return hit[0]
  }
  const near = abuts(l, id, block, shown.slice(0, shown.indexOf(id)))
  if (near !== undefined) return `abuts ${near}`
  const nearer = ambiguous(l, id, block)
  if (nearer !== undefined) return `nearer ${nearer}`
  return crossesLine(l, boxes[0]) ? 'line' : undefined
}

/** Each node whose block breaks `rule`, split into those that had a clear spot (failures) and those that had none. */
function audit(rule: (l: SignalLayout, shown: readonly string[], id: string, block: Block) => string | undefined): { readonly broken: string[]; readonly unavoidable: string[] } {
  const broken: string[] = []
  const unavoidable: string[] = []
  for (const s of scenes()) {
    const l = layoutOf(s)
    const shown = shownVariables(s.c)
    for (const id of shown) {
      const block = l.blocks.get(id)
      if (block === undefined) continue
      const what = rule(l, shown, id, block)
      if (what === undefined) continue
      // Allowed only where every spot the node had was taken.
      const options = l.labelOptions.get(id) ?? []
      expect(options.length).toBeGreaterThan(0)
      const why = options.map((o) => taken(l, shown, id, o))
      const side = (o: Block): string => `${o.side}${o.wrapped ? '/2' : ''}`
      if (why.every((w) => w !== undefined)) unavoidable.push(`${s.name} ${id} ${what}; took ${side(block)}; ${options.map((o, i) => `${side(o)} ${why[i]}`).join(', ')}`)
      else broken.push(`${s.name} ${id} ${what} (${side(block)}; clear: ${options.filter((_, i) => why[i] === undefined).map(side).join(', ')})`)
    }
  }
  return { broken, unavoidable }
}

describe('node labels off the drawn lines', () => {
  it('keeps every node label off every edge, arc and head wherever a clear spot exists', () => {
    const { broken, unavoidable } = audit((l, _shown, id, block) => {
      const p = l.pos.get(id)
      return p !== undefined && crossesLine(l, shifted(block.boxes[0], p.x, p.y)) ? 'crosses a line' : undefined
    })
    if (process.env.LABEL_REPORT === '1') console.log(`unavoidable crossings:\n${unavoidable.join('\n')}`)
    expect(broken).toEqual([])
  })
})

describe('node labels read as their own node\'s', () => {
  it('puts every label block clearly nearest its own disc and apart from other nodes\' blocks wherever a clear spot exists', () => {
    const { broken, unavoidable } = audit((l, shown, id, block) => {
      const nearer = ambiguous(l, id, block)
      if (nearer !== undefined) return `nearer ${nearer}`
      const near = abuts(l, id, block, shown.slice(0, shown.indexOf(id)))
      return near === undefined ? undefined : `abuts ${near}`
    })
    if (process.env.LABEL_REPORT === '1') console.log(`no unambiguous spot:\n${unavoidable.join('\n')}`)
    expect(broken).toEqual([])
  })

  it('wraps a name at a space, keeping an abbreviation with its word, and leaves a Chinese name whole', () => {
    expect(wrapName('V', 'Work vehicle slides onto the track')).toEqual(['Work vehicle', 'slides onto the track'])
    expect(wrapName('O', 'Mr. B wins')).toEqual(['Mr. B', 'wins'])
    expect(wrapName('X1', '第 1 位投給 B 先生')).toBeUndefined()
    expect(wrapName('DER', 'derails')).toBeUndefined()
  })

  it('tries the wrapped label in the same spot before moving it to another side', () => {
    const options = blockOptions(26, { width: 240, lines: [130, 110] }, { kind: 'none' })
    expect(options.map((o) => `${o.side}${o.wrapped ? '/2' : ''}`)).toEqual([
      'below', 'below/2', 'above', 'above/2', 'right', 'right/2', 'left', 'left/2',
      'below-right', 'below-right/2', 'below-left', 'below-left/2', 'above-right', 'above-right/2', 'above-left', 'above-left/2',
    ])
  })
})
