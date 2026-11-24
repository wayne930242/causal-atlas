import { describe, expect, it } from 'vitest'
import { getCase } from '../../data/index.ts'
import type { LoadedCase } from '../../data/load.ts'
import { docToCase } from '../../data/model-doc.ts'
import { modelDocSchema } from '../../data/schema.ts'
import type { Assignment } from '../../engine/index.ts'
import { messagesFor } from '../i18n/messages.ts'
import { solve } from '../model/model-state.ts'
import { shownVariables } from '../model/shown-variables.ts'
import type { Box } from './graph-labels.ts'
import { intersects, segmentHitsBox, shifted } from './graph-labels.ts'
import type { SignalGraphInput, SignalLayout } from './signal-geometry.ts'
import { layoutSignalGraph } from './signal-geometry.ts'

import bogus from '../../fixtures/extension/m09-bogus-seq-2.json'

const t = messagesFor('zh-TW')

function layout(c: LoadedCase, interventions: Assignment = {}, extra: Partial<SignalGraphInput> = {}): SignalLayout {
  const world = solve(c, interventions)
  return layoutSignalGraph(
    {
      c,
      shown: shownVariables(c),
      values: world.values,
      original: world.original,
      probs: world.probs,
      dists: world.dists,
      observedValues: {},
      evidence: false,
      interventions,
      stochastic: {},
      removedEdges: world.removedEdges,
      holdNotes: false,
      clamped: [],
      compact: false,
      ...extra,
    },
    t,
  )
}

/** Every drawn edge's segment between the two node centres. */
function segments(l: SignalLayout, c: LoadedCase): [{ x: number; y: number }, { x: number; y: number }][] {
  return c.model.edges.flatMap((e) => {
    const a = l.pos.get(e.from)
    const b = l.pos.get(e.to)
    return a === undefined || b === undefined || l.edges.every((m) => m.key !== `${e.from}>${e.to}` || m.kind === 'cut') ? [] : [[a, b]]
  }) as [{ x: number; y: number }, { x: number; y: number }][]
}

const variable = (id: string, kind: 'exogenous' | 'endogenous') => ({ id, label: { 'zh-TW': id, en: id }, kind, domain: 'boolean' })

const frontDoorDoc = {
  format: 'causal-atlas/model',
  version: 1,
  title: 'Front door',
  model: {
    variables: [variable('U', 'exogenous'), variable('N', 'exogenous'), variable('X', 'endogenous'), variable('Z', 'endogenous'), variable('Y', 'endogenous')],
    equations: { X: 'U', Z: 'X and N', Y: 'Z or U' },
  },
  priors: { independent: { U: 0.3, N: 0.9 } },
  latent_as_arcs: ['U'],
}
const frontDoor = docToCase(modelDocSchema.parse(frontDoorDoc))
/** The front door with a node W where the arc's label would first go. */
const crowded = docToCase(
  modelDocSchema.parse({
    ...frontDoorDoc,
    model: { variables: [...frontDoorDoc.model.variables, variable('W', 'endogenous')], equations: { ...frontDoorDoc.model.equations, W: 'N' } },
    layout: { X: [0, 0], Z: [1, 0], Y: [2, 0], W: [1, -0.5] },
  }),
)

/** Whether `box` meets a node's circle or any box of its label block. */
function meetsNode(l: SignalLayout, id: string, box: Box): boolean {
  const p = l.pos.get(id)
  if (p === undefined) return false
  const circle = { x0: p.x - l.r, y0: p.y - l.r, x1: p.x + l.r, y1: p.y + l.r }
  return intersects(box, circle, 0) || (l.blocks.get(id)?.boxes ?? []).some((b) => intersects(box, shifted(b, p.x, p.y), 0))
}

describe('layoutSignalGraph', () => {
  it('moves a label block above its node only where the block below would touch something', () => {
    const c = getCase('rock-throwing')
    const l = layout(c)
    const sides = Object.fromEntries([...l.blocks].map(([id, b]) => [id, b.side]))
    expect(sides).toEqual({ ST: 'below', BT: 'below', SH: 'above', BH: 'below', BS: 'below' })
    const above = l.blocks.get('SH')
    expect(above?.boxes.every((b) => b.y1 < -l.r)).toBe(true)
  })

  it('keeps ¬A1 off the rising A1→PN1 edge in the lesson layout', () => {
    const c = docToCase(modelDocSchema.parse({ ...bogus, layout: { A1: [0, 1], PN1: [1.7, 0], B: [0, 2.5], VS: [3, 2.5] } }))
    const l = layout(c)
    const edge = l.edges.find((e) => e.key === 'A1>PN1')
    if (edge?.kind !== 'inhibit') throw new Error('missing A1 inhibit edge')
    expect(segmentHitsBox({ x: edge.x1, y: edge.y1 }, { x: edge.x2, y: edge.y2 }, edge.label.box)).toBe(false)
    for (const id of l.pos.keys()) expect(meetsNode(l, id, edge.label.box)).toBe(false)
  })

  it('puts an arc label off every edge and every node', () => {
    const l = layout(frontDoor)
    expect(l.arcs.map((a) => `${a.plan.via}:${a.plan.a}-${a.plan.b}`)).toEqual(['U:X-Y'])
    const box = l.arcs[0].label.box
    for (const [a, b] of segments(l, frontDoor)) expect(segmentHitsBox(a, b, box)).toBe(false)
    for (const id of l.pos.keys()) expect(meetsNode(l, id, box)).toBe(false)
  })

  it('moves an arc label along the curve when a node sits where it would go first', () => {
    const l = layout(crowded)
    const box = l.arcs[0].label.box
    for (const [a, b] of segments(l, crowded)) expect(segmentHitsBox(a, b, box)).toBe(false)
    for (const id of l.pos.keys()) expect(meetsNode(l, id, box)).toBe(false)
  })

  it('writes 切斷 beside the gap of a cut edge, off the edges still drawn', () => {
    const c = getCase('firing-squad')
    const l = layout(c, c.data.showcase[0].interventions)
    const cuts = l.edges.filter((e) => e.kind === 'cut')
    expect(cuts.length).toBeGreaterThan(0)
    for (const e of cuts) {
      if (e.kind !== 'cut') continue
      const away = Math.hypot(e.label.x - e.mx, e.label.y - 4 - e.my)
      expect([18, 28].some((d) => Math.abs(away - d) < 1e-9)).toBe(true)
      for (const [a, b] of segments(l, c)) expect(segmentHitsBox(a, b, e.label.box)).toBe(false)
    }
  })

  it('grows the view box to hold every block, above the top row too', () => {
    const c = getCase('psychopath-button')
    const l = layout(c, c.data.showcase[0]?.interventions ?? {})
    expect(l.blocks.get('PSY')?.side).toBe('above')
    expect(l.top).toBeLessThan(0)
    const inside = (b: Box): boolean => b.x0 >= l.left && b.y0 >= l.top && b.x1 <= l.left + l.width && b.y1 <= l.top + l.height
    for (const [id, block] of l.blocks) {
      const p = l.pos.get(id)
      if (p === undefined) continue
      for (const b of block.boxes) expect(inside(shifted(b, p.x, p.y))).toBe(true)
    }
  })

  it('offsets a dragged node by the drag and leaves the others in place', () => {
    const c = getCase('rock-throwing')
    const still = layout(c)
    const moved = layout(c, {}, { drag: { id: 'ST', dx: 30, dy: -12 } })
    expect(moved.pos.get('ST')).toEqual({ x: (still.pos.get('ST')?.x ?? 0) + 30, y: (still.pos.get('ST')?.y ?? 0) - 12 })
    expect(moved.pos.get('BT')).toEqual(still.pos.get('BT'))
  })
})
