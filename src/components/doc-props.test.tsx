// Runs in the node environment: a custom model document drawn on the server, no editor chrome.
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { getCase } from '../data/index.ts'
import { caseToDoc } from '../data/model-doc.ts'
import type { ModelDoc } from '../data/schema.ts'
import { modelDocSchema } from '../data/schema.ts'
import { CasePage, CausalPlayground, IdentifyPanel, ModelEditor, ProbabilityPanel, WorldLanes } from './index.ts'
import { docOrigin } from './model/doc-case.ts'

const valueDoc: ModelDoc = modelDocSchema.parse({
  format: 'causal-atlas/model',
  version: 1,
  title: 'Sprinkler lesson',
  model: {
    variables: [
      { id: 'U', label: { 'zh-TW': '外因' }, kind: 'exogenous', domain: 'boolean' },
      { id: 'R', label: { 'zh-TW': '下雨', en: 'Rain' }, kind: 'endogenous', domain: 'boolean' },
      { id: 'W', label: { 'zh-TW': '地濕', en: 'Wet' }, kind: 'endogenous', domain: 'boolean' },
    ],
    equations: { R: 'U', W: 'R' },
  },
  context: { U: true },
})

const probDoc: ModelDoc = modelDocSchema.parse({
  ...valueDoc,
  context: undefined,
  priors: { independent: { U: 0.25 } },
})

const bad = { ...valueDoc, model: { ...valueDoc.model, equations: { R: 'U and', W: 'R' } } } as ModelDoc

describe('CausalPlayground with a doc', () => {
  it('server-renders the graph with values and no editor chrome', () => {
    expect(typeof globalThis.window).toBe('undefined')
    const html = renderToString(createElement(CausalPlayground, { doc: valueDoc }))
    expect(html).toContain('ca-graph')
    expect(html).toMatch(/data-node="W"[^>]*data-value="[^"]+"/)
    expect(html).toContain('Sprinkler lesson')
    expect(html).toContain('ca-seg')
    expect(html).not.toContain('ca-editor')
    expect(html).not.toContain('<select')
    expect(html).not.toContain('<input')
    expect(html).toContain('下載圖片')
  })

  it('shows probabilities for a doc with priors', () => {
    const html = renderToString(createElement(CausalPlayground, { doc: probDoc }))
    expect(html).toContain('data-level')
  })

  it('applies initial interventions', () => {
    const html = renderToString(createElement(CausalPlayground, { doc: valueDoc, initialInterventions: { R: false } }))
    expect(html).toMatch(/data-node="R"[^>]*data-intervened="true"/)
  })

  it('draws optional preset buttons', () => {
    const presets = [{ label: { 'zh-TW': '關掉下雨', en: 'Stop the rain' }, interventions: { R: false } }]
    const html = renderToString(createElement(CausalPlayground, { doc: valueDoc, presets }))
    expect(html).toContain('關掉下雨')
    expect(renderToString(createElement(CausalPlayground, { doc: valueDoc }))).not.toContain('ca-presets')
  })

  it('an invalid doc shows its error code and does not throw', () => {
    const html = renderToString(createElement(CausalPlayground, { doc: bad }))
    expect(html).toContain('role="alert"')
    expect(html).toMatch(/data-code="parse-/)
    expect(html).not.toContain('ca-graph')
    const notADoc = renderToString(createElement(CausalPlayground, { doc: { nope: 1 } as unknown as ModelDoc }))
    expect(notADoc).toContain('data-code="schema"')
  })
})

describe('doc origin credit', () => {
  const rock = caseToDoc(getCase('rock-throwing'))
  it('keeps the case source only for the bundled case structure', () => {
    expect(docOrigin(rock)?.some((s) => s.role === 'origin')).toBe(true)
    expect(docOrigin({ ...rock, model: { ...rock.model, equations: { ...rock.model.equations, BH: 'BT' } } })).toBeUndefined()
    expect(docOrigin(valueDoc)).toBeUndefined()
    expect(docOrigin({ ...valueDoc, from: 'no-such-case' })).toBeUndefined()
  })
})

describe('ModelEditor initialDoc', () => {
  it('server-renders that model, not a blank one', () => {
    const html = renderToString(createElement(ModelEditor, { initialDoc: valueDoc }))
    expect(html).toContain('ca-editor')
    expect(html).toContain('Sprinkler lesson')
    expect(html).toContain('data-node="W"')
    expect(html).toContain('下雨')
  })

  it('a share hash still overrides on the client (server render ignores it)', () => {
    const html = renderToString(createElement(ModelEditor, { initialDoc: valueDoc, hash: '#model=1.abc' }))
    expect(html).toContain('Sprinkler lesson')
  })

  it('an invalid initialDoc starts blank and shows the problem code', () => {
    const html = renderToString(createElement(ModelEditor, { initialDoc: { nope: 1 } as unknown as ModelDoc }))
    expect(html).toContain('role="alert"')
    expect(html).toContain('ca-editor')
  })
})

describe('ProbabilityPanel and WorldLanes with a doc', () => {
  it('ProbabilityPanel renders a probabilistic doc', () => {
    expect(renderToString(createElement(ProbabilityPanel, { doc: probDoc }))).toContain('data-level')
    expect(renderToString(createElement(ProbabilityPanel, { doc: probDoc, view: 'compare', pair: { event: 'W=1', observe: 'R=1', intervene: { R: false } } }))).toContain('data-level')
  })

  it('ProbabilityPanel also renders a context doc (a point-mass prior)', () => {
    expect(renderToString(createElement(ProbabilityPanel, { doc: valueDoc }))).toContain('ca-prob')
  })

  it('WorldLanes renders a context doc given interventions', () => {
    expect(renderToString(createElement(WorldLanes, { doc: valueDoc, interventions: { R: false } }))).toContain('data-lane="actual"')
  })

  it('an invalid doc shows its code in both', () => {
    expect(renderToString(createElement(ProbabilityPanel, { doc: bad }))).toMatch(/data-code="parse-/)
    expect(renderToString(createElement(WorldLanes, { doc: bad, interventions: {} }))).toMatch(/data-code="parse-/)
  })
})

describe('IdentifyPanel with a doc', () => {
  it('server-renders the query, identification and formula without a DOM', () => {
    const html = renderToString(createElement(IdentifyPanel, { doc: probDoc, query: { x: 'R', y: 'W' }, locale: 'en' }))
    expect(html).toContain('data-identification="identified"')
    expect(html).toContain('Formula using only the observational distribution')
    expect(html).toContain('class="katex"')
  })

  it('displays doc validation problems', () => {
    expect(renderToString(createElement(IdentifyPanel, { doc: bad }))).toMatch(/data-code="parse-/)
  })
})

describe('defaultNotation', () => {
  const ff = (n?: 'propositional' | 'arithmetic' | 'causal') => ({ caseId: 'forest-fire-disjunctive', defaultNotation: n })
  const pressed = (html: string, label: string): boolean => new RegExp(`aria-pressed="true"[^>]*>${label}<`).test(html)
  it('renders the chosen notation on the server and keeps propositional by default', () => {
    expect(renderToString(createElement(CausalPlayground, ff()))).toContain('FF ↔ (L ∨ MD)')
    expect(renderToString(createElement(CausalPlayground, ff('arithmetic')))).toContain('FF = max(L, MD)')
    expect(renderToString(createElement(CausalPlayground, ff('causal')))).toContain('[L←1, MD←1](FF=1)')
  })
  it('applies to ProbabilityPanel, WorldLanes, CasePage and ModelEditor', () => {
    const arith = renderToString(createElement(ProbabilityPanel, { ...ff('arithmetic'), caseId: 'firing-squad' }))
    expect(pressed(arith, '數學式')).toBe(true)
    expect(pressed(renderToString(createElement(ProbabilityPanel, { caseId: 'firing-squad' })), '邏輯式')).toBe(true)
    const lanes = renderToString(createElement(WorldLanes, { caseId: 'forest-fire-disjunctive', initialStep: 2, defaultNotation: 'causal' }))
    expect(lanes.length).toBeGreaterThan(0)
    expect(pressed(renderToString(createElement(CasePage, { caseId: 'forest-fire-disjunctive', initialStep: 2, defaultNotation: 'arithmetic' })), '數學式')).toBe(true)
    expect(pressed(renderToString(createElement(ModelEditor, { defaultNotation: 'causal' })), '干預式')).toBe(true)
  })
})
