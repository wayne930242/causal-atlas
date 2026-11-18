import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { listCases } from '../../data/index.ts'
import type { LoadedCase } from '../../data/load.ts'
import { docToCase } from '../../data/model-doc.ts'
import { modelDocSchema } from '../../data/schema.ts'
import { gridLayout, shownEdges } from './graph-layout.ts'
import { shownVariables } from '../model/shown-variables.ts'

/**
 * Automatic layout: no drawn edge may pass over a node that is not one of its ends, in any of the
 * graph's spacings (value or probability nodes, full width or compact). An edge that runs under a
 * node reads as a chain through it (UAT 0.3.14: the sprinkler's R→W behind S).
 */

/** Column width, row height and node radius of SignalGraph's spacings, in px. */
const SPACINGS = [
  { col: 220, row: 120, r: 30 },
  { col: 220, row: 170, r: 34 },
  { col: 132, row: 112, r: 30 },
  { col: 132, row: 170, r: 34 },
] as const
/** Clearance past a node's radius that an edge keeps, in px. */
const MARGIN = 10

function segmentDistance(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

/** `edge passes node` for each edge drawn within a node's radius plus MARGIN of a node it does not join. */
function hiddenEdges(c: LoadedCase): string[] {
  const shown = shownVariables(c)
  const grid = gridLayout(c, shown)
  const out = new Set<string>()
  for (const s of SPACINGS) {
    const at = (id: string): { x: number; y: number } => {
      const g = grid.get(id)
      if (g === undefined) throw new Error(`no position for ${id}`)
      return { x: g.col * s.col, y: g.row * s.row }
    }
    for (const e of shownEdges(c.model.edges, shown)) {
      for (const id of shown) {
        if (id === e.from || id === e.to) continue
        if (segmentDistance(at(id), at(e.from), at(e.to)) < s.r + MARGIN) out.add(`${e.from}→${e.to} passes ${id}`)
      }
    }
    // Two nodes never share a spot.
    for (const a of shown) {
      for (const b of shown) {
        if (a < b && Math.hypot(at(a).x - at(b).x, at(a).y - at(b).y) < 2 * s.r + MARGIN) out.add(`${a} overlaps ${b}`)
      }
    }
  }
  return [...out]
}

describe('every bundled case keeps its edges in view', () => {
  it.each(listCases().map((c) => [c.data.id, c] as const))('%s', (_, c) => {
    expect(hiddenEdges(c)).toEqual([])
  })

  it('draws the sprinkler as a triangle, not the chain R, S, W', () => {
    const c = docToCase(
      modelDocSchema.parse({
        format: 'causal-atlas/model',
        version: 1,
        title: 'sprinkler',
        model: {
          variables: [
            { id: 'U', label: { 'zh-TW': 'U' }, kind: 'exogenous', domain: 'boolean' },
            { id: 'R', label: { 'zh-TW': 'R' }, kind: 'endogenous', domain: 'boolean' },
            { id: 'S', label: { 'zh-TW': 'S' }, kind: 'endogenous', domain: 'boolean' },
            { id: 'W', label: { 'zh-TW': 'W' }, kind: 'endogenous', domain: 'boolean' },
          ],
          equations: { R: 'U', S: 'not R', W: 'R or S' },
        },
        priors: { independent: { U: 0.4 } },
      }),
    )
    expect(hiddenEdges(c)).toEqual([])
  })

  it('keeps a layout the case gives', () => {
    const c = listCases().find((x) => x.data.layout !== undefined)
    expect(c).toBeDefined()
    if (c === undefined || c.data.layout === undefined) return
    const grid = gridLayout(c, shownVariables(c))
    for (const [id, [col, row]] of Object.entries(c.data.layout)) expect(grid.get(id)).toEqual({ col, row })
  })
})

/**
 * Model documents kept outside this repository (the blog's), checked the same way when
 * CAUSAL_MODELS_DIR names their folder:
 * `CAUSAL_MODELS_DIR=~/knowledge-base/blog/src/data/causal/models pnpm vitest run layout`.
 */
const docsDir = process.env.CAUSAL_MODELS_DIR
describe.skipIf(docsDir === undefined)('automatic layout of the model documents in CAUSAL_MODELS_DIR', () => {
  const files = docsDir === undefined ? [] : readdirSync(docsDir).filter((f) => f.endsWith('.json')).sort()
  it.each(files)('%s', (file) => {
    const doc = modelDocSchema.parse(JSON.parse(readFileSync(`${docsDir ?? ''}/${file}`, 'utf8')))
    expect(hiddenEdges(docToCase(doc))).toEqual([])
  })
  // The documents that name exogenous variables to draw (0.3.15), with every exogenous one shown.
  const named = ['m00-firing-squad-nervous.json', 'm02-pearl-model1.json', 'm02-pearl-model2.json'].filter((f) => files.includes(f))
  it.each(named)('%s with show_exogenous', (file) => {
    const raw = JSON.parse(readFileSync(`${docsDir ?? ''}/${file}`, 'utf8')) as { model: { variables: { id: string; kind: string }[] } }
    const exogenous = raw.model.variables.filter((v) => v.kind === 'exogenous').map((v) => v.id)
    expect(hiddenEdges(docToCase(modelDocSchema.parse({ ...raw, show_exogenous: exogenous })))).toEqual([])
  })
})
