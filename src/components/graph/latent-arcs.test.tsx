// @vitest-environment jsdom
import { readdirSync, readFileSync } from 'node:fs'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { listCases } from '../../data/index.ts'
import type { LoadedCase } from '../../data/load.ts'
import { caseToDoc, docToCase, parseModelJson } from '../../data/model-doc.ts'
import { modelDocSchema } from '../../data/schema.ts'
import { ACADEMIC_PALETTE, inlineSvg } from '../export/export-image.ts'
import { SignalGraph } from './SignalGraph.tsx'
import { arcCurve, gridLayout, latentArcs, planArcs, shownEdges, shownVariables } from './graph-layout.ts'

afterEach(cleanup)

const variable = (id: string, kind: 'exogenous' | 'endogenous') => ({ id, label: { 'zh-TW': id, en: id }, kind, domain: 'boolean' })

const frontDoor = {
  format: 'causal-atlas/model',
  version: 1,
  title: 'Front door',
  model: {
    variables: [variable('U', 'exogenous'), variable('N', 'exogenous'), variable('X', 'endogenous'), variable('Z', 'endogenous'), variable('Y', 'endogenous')],
    equations: { X: 'U', Z: 'X and N', Y: 'Z or U' },
  },
  priors: { independent: { U: 0.3, N: 0.9 } },
}

const withArcs = (extra: Record<string, unknown> = {}): LoadedCase => docToCase(modelDocSchema.parse({ ...frontDoor, latent_as_arcs: ['U'], ...extra }))

function render1(c: LoadedCase, props: Partial<Parameters<typeof SignalGraph>[0]> = {}): HTMLElement {
  return render(<SignalGraph c={c} shown={shownVariables(c)} interventions={{}} removedEdges={[]} title="t" {...props} />).container
}

describe('latent_as_arcs: the document field', () => {
  it('keeps the field when a document becomes a case and back', () => {
    expect(caseToDoc(withArcs()).latent_as_arcs).toEqual(['U'])
  })

  it('refuses an unknown name and an endogenous one', () => {
    const bad = modelDocSchema.safeParse({ ...frontDoor, latent_as_arcs: ['Q', 'X'] })
    expect(bad.success).toBe(false)
    expect(bad.error?.issues.map((i) => i.path.join('.'))).toEqual(['latent_as_arcs.Q', 'latent_as_arcs.X'])
  })

  it('refuses a variable that show_exogenous or the layout also draws as a node', () => {
    for (const extra of [{ show_exogenous: ['U'] }, { layout: { U: [0, 0], X: [1, 0], Z: [2, 0], Y: [3, 0] } }]) {
      const bad = modelDocSchema.safeParse({ ...frontDoor, latent_as_arcs: ['U'], ...extra })
      expect(bad.success).toBe(false)
      expect(bad.error?.issues.map((i) => i.path.join('.'))).toEqual(['latent_as_arcs.U'])
    }
  })

  it('refuses a variable with fewer than two children, in the import', () => {
    const one = { ...frontDoor, model: { ...frontDoor.model, equations: { X: 'U', Z: 'X and N', Y: 'Z' } }, latent_as_arcs: ['U'] }
    const result = parseModelJson(JSON.stringify(one))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.map((e) => e.code)).toEqual(['arc-needs-children'])
  })

  it('accepts a document that does not use it, unchanged', () => {
    expect(parseModelJson(JSON.stringify(frontDoor)).ok).toBe(true)
  })
})

describe('latent_as_arcs: what is drawn', () => {
  it('draws U as a node by default, and not when it is listed', () => {
    expect(shownVariables(docToCase(modelDocSchema.parse(frontDoor)))).toContain('U')
    const c = withArcs()
    expect(shownVariables(c)).toEqual(['X', 'Z', 'Y'])
    expect(latentArcs(c, shownVariables(c))).toEqual([{ via: 'U', a: 'X', b: 'Y' }])
  })

  it('makes one arc per pair of children when there are three', () => {
    const doc = {
      ...frontDoor,
      model: {
        variables: [variable('U', 'exogenous'), variable('A', 'endogenous'), variable('B', 'endogenous'), variable('C', 'endogenous')],
        equations: { A: 'U', B: 'U', C: 'U' },
      },
      priors: { independent: { U: 0.5 } },
      latent_as_arcs: ['U'],
    }
    const c = docToCase(modelDocSchema.parse(doc))
    const pairs = latentArcs(c, shownVariables(c)).map((a) => `${a.a}${a.b}`)
    expect(pairs).toEqual(['AB', 'AC', 'BC'])
    expect(render1(c).querySelectorAll('[data-arc]')).toHaveLength(3)
  })

  it('draws a dashed two-headed arc between the children, with no node for U', () => {
    const root = render1(withArcs())
    expect(root.querySelector('[data-node="U"]')).toBeNull()
    const arcs = root.querySelectorAll('[data-arc]')
    expect(arcs).toHaveLength(1)
    const arc = arcs[0]
    expect(arc.getAttribute('data-arc')).toBe('U:X-Y')
    expect(arc.querySelector('path.ca-stroke-arc')).not.toBeNull()
    // Two arrowheads, one at each end.
    expect(arc.querySelectorAll('path.ca-arc-head')).toHaveLength(2)
    expect(arc.querySelector('text')?.textContent).toBe('不明共因')
    // The arc is not a control: nothing to click, and no U to observe.
    expect(arc.getAttribute('role')).not.toBe('button')
    expect(arc.querySelector('[role="button"]')).toBeNull()
    expect(arc.querySelector('[role="tooltip"]')?.textContent).toContain('U')
  })

  it.each([
    ['a do() on a child', { interventions: { X: true } }],
    ['the other child', { interventions: { Y: true } }],
    ['a stochastic do()', { stochastic: { Y: 0.4 } }],
    ['a cut edge from U', { removedEdges: [{ from: 'U', to: 'Y' }] }],
  ] as const)('drops the arc under %s (G with the arrow into the child removed)', (_, props) => {
    const root = render1(withArcs(), props)
    expect(root.querySelector('[data-arc]')).toBeNull()
  })

  it('keeps the arc when the intervention is on a variable that is not one of its ends', () => {
    expect(render1(withArcs(), { interventions: { Z: true } }).querySelector('[data-arc]')).not.toBeNull()
  })

  it('lights the arc when both of its edges are on an open path', () => {
    const open = new Set(['U>X', 'U>Y'])
    const root = render1(withArcs(), { paths: { open, blocked: new Set(), ends: ['X', 'Y'] } })
    expect(root.querySelector('[data-arc]')?.getAttribute('data-path')).toBe('open')
  })

  it('draws in probability mode too', () => {
    const c = withArcs()
    const probs = { X: 0.3, Z: 0.3, Y: 0.5 }
    expect(render1(c, { probs }).querySelectorAll('[data-arc]')).toHaveLength(1)
  })
})

describe('exogenous nodes are dashed hollow circles', () => {
  it('draws an exogenous node with a dashed outline and an endogenous one with a solid outline', () => {
    const plain = docToCase(modelDocSchema.parse(frontDoor))
    const root = render1(plain, { values: { U: true, N: true, X: true, Z: true, Y: true } })
    const exo = root.querySelector('[data-node="U"] circle.ca-exo') as Element
    expect(exo.getAttribute('stroke-dasharray')).toMatch(/^[\d.]+ [\d.]+$/)
    const endo = root.querySelector('[data-node="X"]') as Element
    expect(endo.querySelector('[stroke-dasharray]')).toBeNull()
    expect(endo.querySelector('circle.ca-exo')).toBeNull()
    // The dash divides the circumference whole, so the ring has no seam.
    const [dash, gap] = (exo.getAttribute('stroke-dasharray') ?? '').split(' ').map(Number)
    const r = Number(exo.getAttribute('r'))
    expect((2 * Math.PI * r) / (dash + gap)).toBeCloseTo(Math.round((2 * Math.PI * r) / (dash + gap)), 1)
  })

  it('keeps 1 as a filled core inside the dashed ring, 0 hollow', () => {
    const plain = docToCase(modelDocSchema.parse(frontDoor))
    const on = render1(plain, { values: { U: true, N: true, X: true, Z: true, Y: true } })
    expect(on.querySelector('[data-node="U"] circle.ca-exo-core')).not.toBeNull()
    cleanup()
    const off = render1(plain, { values: { U: false, N: true, X: false, Z: false, Y: true } })
    expect(off.querySelector('[data-node="U"] circle.ca-exo-core')).toBeNull()
    expect(off.querySelector('[data-node="U"]')?.getAttribute('data-value')).toBe('0')
  })

  it('draws the dashed outline in probability mode, with the fill inside it', () => {
    const plain = docToCase(modelDocSchema.parse(frontDoor))
    const root = render1(plain, { probs: { U: 0.3, N: 0.9, X: 0.3, Z: 0.3, Y: 0.5 } })
    const node = root.querySelector('[data-node="U"]') as Element
    expect(node.querySelector('circle.ca-node-outline')?.getAttribute('stroke-dasharray')).not.toBeNull()
    expect(node.querySelector('rect[data-level]')).not.toBeNull()
  })

  it('differs from a cut edge, the witness hull and the focus ring', () => {
    const plain = docToCase(modelDocSchema.parse(frontDoor))
    const root = render1(plain, { values: { U: true, N: true, X: true, Z: true, Y: true }, removedEdges: [{ from: 'X', to: 'Z' }], interventions: { Z: true }, witness: { X: true } })
    const exo = root.querySelector('[data-node="U"] circle.ca-exo') as Element
    const cut = root.querySelector('.ca-edge-cut line') as Element
    expect(cut.getAttribute('class')).toContain('ca-stroke-cut')
    expect(exo.getAttribute('class')).not.toContain('ca-stroke-cut')
    expect(exo.getAttribute('class')).not.toContain('ca-hull')
    expect(exo.getAttribute('class')).not.toContain('ca-focus-ring')
  })

  it('survives the image export, in both styles', () => {
    const plain = docToCase(modelDocSchema.parse(frontDoor))
    const svg = render1(plain, { values: { U: true, N: true, X: true, Z: true, Y: true } }).querySelector('svg') as SVGSVGElement
    for (const style of ['color', 'academic'] as const) {
      const out = inlineSvg(svg, ACADEMIC_PALETTE, style)
      const exo = out.querySelector('circle[stroke-dasharray]')
      expect(exo, style).not.toBeNull()
      expect(exo?.getAttribute('fill')).toBe('#ffffff')
    }
  })

  it('exports the arc with its dashes and heads, without the tooltip control', () => {
    const svg = render1(withArcs()).querySelector('svg') as SVGSVGElement
    for (const style of ['color', 'academic'] as const) {
      const out = inlineSvg(svg, ACADEMIC_PALETTE, style)
      expect(out.querySelector('foreignObject'), style).toBeNull()
      const stroke = [...out.querySelectorAll('path')].find((p) => p.getAttribute('stroke-dasharray') !== null)
      expect(stroke, style).toBeDefined()
      expect(out.textContent).toContain('不明共因')
    }
  })
})

describe('arc geometry keeps off the nodes', () => {
  const SPACINGS = [
    { col: 220, row: 120, r: 30 },
    { col: 220, row: 170, r: 34 },
    { col: 132, row: 112, r: 30 },
    { col: 132, row: 170, r: 34 },
  ] as const
  const MARGIN = 10

  /** `arc passes node` for each drawn arc whose curve comes within a node's radius plus MARGIN of a node it does not join. */
  function arcsInTheWay(c: LoadedCase): string[] {
    const shown = shownVariables(c)
    const grid = gridLayout(c, shown)
    const out = new Set<string>()
    const arcs = latentArcs(c, shown)
    for (const s of SPACINGS) {
      const at = new Map(shown.map((id) => [id, { x: (grid.get(id)?.col ?? 0) * s.col, y: (grid.get(id)?.row ?? 0) * s.row }]))
      const planned = planArcs(arcs, at, shownEdges(c.model.edges, shown), s.r)
      for (const p of planned) {
        for (const q of arcCurve(p.start, p.control, p.end, 40)) {
          for (const id of shown) {
            const node = at.get(id)
            if (node === undefined || id === p.a || id === p.b) continue
            if (Math.hypot(q.x - node.x, q.y - node.y) < s.r + MARGIN) out.add(`${p.via}:${p.a}-${p.b} passes ${id}`)
          }
        }
      }
    }
    return [...out]
  }

  const doc = (variables: [string, 'exogenous' | 'endogenous'][], equations: Record<string, string>, p: Record<string, number>, extra = {}): LoadedCase =>
    docToCase(
      modelDocSchema.parse({
        format: 'causal-atlas/model',
        version: 1,
        title: 'm',
        model: { variables: variables.map(([id, kind]) => variable(id, kind)), equations },
        priors: { independent: p },
        ...extra,
      }),
    )

  it('front door: the arc from X over Z to Y clears Z', () => {
    expect(arcsInTheWay(withArcs())).toEqual([])
  })

  it('a bow: the arc beside the arrow X→Y', () => {
    const c = doc([['U', 'exogenous'], ['X', 'endogenous'], ['Y', 'endogenous']], { X: 'U', Y: 'X or U' }, { U: 0.5 }, { latent_as_arcs: ['U'] })
    expect(arcsInTheWay(c)).toEqual([])
    expect(latentArcs(c, shownVariables(c))).toHaveLength(1)
  })

  it('two unconnected children, one above the other', () => {
    const c = doc([['U', 'exogenous'], ['A', 'endogenous'], ['B', 'endogenous']], { A: 'U', B: 'U' }, { U: 0.5 }, { latent_as_arcs: ['U'] })
    expect(arcsInTheWay(c)).toEqual([])
  })

  it('three children in a chain, all pairs', () => {
    const c = doc(
      [['U', 'exogenous'], ['A', 'endogenous'], ['B', 'endogenous'], ['C', 'endogenous']],
      { A: 'U', B: 'A or U', C: 'B or U' },
      { U: 0.5 },
      { latent_as_arcs: ['U'] },
    )
    expect(arcsInTheWay(c)).toEqual([])
  })

  it('every bundled case with an exogenous variable of two children, listed as arcs (automatic layout)', () => {
    let n = 0
    for (const c of listCases()) {
      const children = new Map<string, number>()
      for (const e of c.model.edges) children.set(e.from, (children.get(e.from) ?? 0) + 1)
      const listed = c.model.exogenous.filter((id) => (children.get(id) ?? 0) >= 2)
      if (listed.length === 0) continue
      const as = docToCase(modelDocSchema.parse({ ...caseToDoc(c), latent_as_arcs: listed, show_exogenous: undefined, layout: undefined }))
      n += 1
      expect(arcsInTheWay(as), c.data.id).toEqual([])
    }
    expect(n).toBeGreaterThan(3)
  })
})

/**
 * The blog's model documents, with every exogenous variable of two or more children listed as an arc:
 * `CAUSAL_MODELS_DIR=~/knowledge-base/blog/src/data/causal/models pnpm vitest run latent-arcs`.
 */
const docsDir = process.env.CAUSAL_MODELS_DIR
describe.skipIf(docsDir === undefined)('the model documents in CAUSAL_MODELS_DIR drawn with arcs', () => {
  const files = docsDir === undefined ? [] : readdirSync(docsDir).filter((f) => f.endsWith('.json')).sort()
  it.each(files)('%s', (file) => {
    const raw = JSON.parse(readFileSync(`${docsDir ?? ''}/${file}`, 'utf8')) as { layout?: unknown }
    if (raw.layout !== undefined) return
    const parsed = modelDocSchema.parse(raw)
    const base = docToCase(parsed)
    const children = new Map<string, number>()
    for (const e of base.model.edges) children.set(e.from, (children.get(e.from) ?? 0) + 1)
    const listed = base.model.exogenous.filter((id) => (children.get(id) ?? 0) >= 2 && !(parsed.show_exogenous ?? []).includes(id))
    if (listed.length === 0) return
    const c = docToCase(modelDocSchema.parse({ ...parsed, latent_as_arcs: listed }))
    const shown = shownVariables(c)
    const grid = gridLayout(c, shown)
    for (const s of [
      { col: 220, row: 120, r: 30 },
      { col: 220, row: 170, r: 34 },
      { col: 132, row: 112, r: 30 },
      { col: 132, row: 170, r: 34 },
    ]) {
      const at = new Map(shown.map((id) => [id, { x: (grid.get(id)?.col ?? 0) * s.col, y: (grid.get(id)?.row ?? 0) * s.row }]))
      for (const p of planArcs(latentArcs(c, shown), at, shownEdges(c.model.edges, shown), s.r)) {
        for (const q of arcCurve(p.start, p.control, p.end, 40)) {
          for (const id of shown) {
            const node = at.get(id)
            if (node === undefined || id === p.a || id === p.b) continue
            expect(Math.hypot(q.x - node.x, q.y - node.y), `${p.via}:${p.a}-${p.b} passes ${id}`).toBeGreaterThanOrEqual(s.r + 10)
          }
        }
      }
    }
  })
})
