// Node environment: equations are typeset on the server, no DOM.
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { caseIds, getCase } from '../data/index.ts'
import { evaluate, renderEquation } from '../engine/index.ts'
import type { Notation } from '../engine/index.ts'
import { Equations } from './Equations.tsx'
import { texHtml } from './tex-html.ts'

const NOTATIONS = ['structural', 'propositional', 'causal', 'arithmetic'] as const satisfies readonly Notation[]

describe('equation typesetting', () => {
  it('typesets N_S1 with a subscript in the propositional notation', () => {
    const c = getCase('smoking-lesion')
    const html = renderToString(
      createElement(Equations, { c, shown: c.model.variables.map((v) => v.id), notation: 'propositional', interventions: {} }),
    )
    expect(html).toContain('class="katex"')
    expect(html).toContain('vlist') // KaTeX builds sub/superscripts as vlists
    expect(html).toContain('data-text=')
    expect(html).not.toContain('katex-error')
  })

  it.each(caseIds)('renders every equation of %s without a KaTeX error', (id) => {
        const c = getCase(id)
    for (const v of c.model.endogenous) {
      for (const n of NOTATIONS) {
        const html = texHtml(renderEquation(c.model, v, n, 'latex'))
        expect(html, `${id} ${v} ${n}`).not.toContain('katex-error')
        expect(html).toContain('katex')
      }
    }
  })

  it.each(caseIds)('renders the %s equations component in every notation', (id) => {
    const c = getCase(id)
    const values = c.context === undefined ? undefined : evaluate(c.model, c.context, {}).values
    const shown = c.model.variables.map((v) => v.id)
    for (const notation of ['propositional', 'arithmetic', 'causal'] as const) {
      const html = renderToString(createElement(Equations, { c, shown, notation, interventions: {}, values }))
      expect(html).not.toContain('katex-error')
    }
    const forced = c.model.endogenous[0]
    const html = renderToString(
      createElement(Equations, { c, shown, notation: 'arithmetic', interventions: { [forced]: 0 }, values }),
    )
    expect(html).not.toContain('katex-error')
  })
})
