import { describe, expect, it } from 'vitest'
import { getCase, listCases } from '../../data/index.ts'
import type { LoadedCase } from '../../data/load.ts'
import { docToCase } from '../../data/model-doc.ts'
import { modelDocSchema } from '../../data/schema.ts'
import type { Assignment } from '../../engine/index.ts'
import type { Locale, Messages } from '../i18n/messages.ts'
import { messagesFor } from '../i18n/messages.ts'
import { solve } from '../model/model-state.ts'
import { shownVariables } from '../model/shown-variables.ts'
import type { Box } from './graph-labels.ts'
import { intersects, segmentHitsBox, shifted } from './graph-labels.ts'
import type { SignalGraphInput, SignalLayout } from './signal-geometry.ts'
import { layoutSignalGraph } from './signal-geometry.ts'

import bogus from '../../fixtures/extension/m09-bogus-seq-2.json'

const t = messagesFor('zh-TW')

function layout(c: LoadedCase, interventions: Assignment = {}, extra: Partial<SignalGraphInput> = {}, m: Messages = t): SignalLayout {
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
    m,
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

  describe('原本 v notes', () => {
    /** What a note must stay off: every node's disc and do tag, every label block, and the arrowhead at the end of each drawn edge. */
    function noteClashes(l: SignalLayout, id: string, box: Box): string[] {
      const out: string[] = []
      for (const [other, p] of l.pos) {
        if (intersects(box, { x0: p.x - l.r, y0: p.y - l.r, x1: p.x + l.r, y1: p.y + l.r }, 0)) out.push(`disc ${other}`)
        const tag = l.tags.get(other)
        if (tag !== undefined && intersects(box, shifted(tag.box, p.x, p.y), 0)) out.push(`tag ${other}`)
        const blockBoxes = l.blocks.get(other)?.boxes ?? []
        blockBoxes.forEach((b, i) => {
          const abs = shifted(b, p.x, p.y)
          // The note's own box sits in its block; every other box there (the label first) counts.
          if (other === id && abs.x0 === box.x0 && abs.y0 === box.y0 && abs.x1 === box.x1 && abs.y1 === box.y1) return
          if (intersects(box, abs, 0)) out.push(`${i === 0 ? 'label' : 'block'} ${other}`)
        })
        if (other !== id) for (const [nid, n] of l.wasNotes) {
          const q = l.pos.get(nid)
          if (nid === other && q !== undefined && intersects(box, shifted(n.box, q.x, q.y), 0)) out.push(`note ${nid}`)
        }
      }
      for (const e of l.edges) {
        if (e.kind === 'cut') continue
        const len = Math.hypot(e.x2 - e.x1, e.y2 - e.y1) || 1
        const head = { x: e.x2 - (12 * (e.x2 - e.x1)) / len, y: e.y2 - (12 * (e.y2 - e.y1)) / len }
        if (segmentHitsBox(head, { x: e.x2, y: e.y2 }, box)) out.push(`arrowhead ${e.key}`)
      }
      return out
    }

    const subjects: readonly [string, Assignment][] = [
      ...getCase('taroko-derailment-2021').data.showcase.map((s) => ['taroko-derailment-2021', s.interventions] as [string, Assignment]),
      ...getCase('rock-throwing').data.showcase.map((s) => ['rock-throwing', s.interventions] as [string, Assignment]),
    ]
    const locales: readonly Locale[] = ['zh-TW', 'en']

    for (const locale of locales) {
      for (const [id, interventions] of subjects) {
        it(`keeps every note off labels, discs, tags and arrowheads: ${id} do(${JSON.stringify(interventions)}) ${locale}`, () => {
          const l = layout(getCase(id), interventions, {}, messagesFor(locale))
          expect(l.wasNotes.size).toBeGreaterThan(0)
          const clashes = [...l.wasNotes].flatMap(([node, note]) => {
            const p = l.pos.get(node)
            return p === undefined ? [] : noteClashes(l, node, shifted(note.box, p.x, p.y)).map((what) => `${node}: ${what}`)
          })
          expect(clashes).toEqual([])
        })
      }
    }

    it('keeps every note off every label, disc, tag and other note in each bundled case\'s showcase worlds', () => {
      const clashes: string[] = []
      for (const locale of locales) {
        for (const c of listCases()) {
          for (const s of c.data.showcase) {
            if (Object.keys(s.interventions).length === 0) continue
            const l = layout(c, s.interventions, {}, messagesFor(locale))
            for (const [node, note] of l.wasNotes) {
              const p = l.pos.get(node)
              if (p === undefined) continue
              const hits = noteClashes(l, node, shifted(note.box, p.x, p.y)).filter((what) => !what.startsWith('arrowhead'))
              clashes.push(...hits.map((what) => `${c.data.id} ${JSON.stringify(s.interventions)} ${locale} ${node}: ${what}`))
            }
          }
        }
      }
      expect(clashes).toEqual([])
    })
  })
})
