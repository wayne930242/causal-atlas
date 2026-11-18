import { describe, expect, it } from 'vitest'
import { getCase } from '../../data/index.ts'
import { caseToDoc, docToCase } from '../../data/model-doc.ts'
import { modelDocSchema } from '../../data/schema.ts'
import { messagesFor } from '../i18n/messages.ts'
import { shownVariables } from '../graph/graph-layout.ts'
import { equationIds, equationRows } from './equation-rows.ts'

describe('equationRows worked values (arithmetic)', () => {
  const c = getCase('firing-squad')
  const values = { U: 1, C: 1, A: 1, B: 1, D: 1 }
  const rows = equationRows(messagesFor('zh-TW'), c, ['C', 'D'], 'arithmetic', values, {}, ['U', 'C', 'A', 'B', 'D'])

  it('does not repeat the value when the equation is a bare parent', () => {
    expect(rows[0].worked).toBe('= 1')
  })

  it('keeps the substituted step when it differs from the result', () => {
    expect(rows[1].worked).toBe('= max(1, 1) = 1')
  })
})

const boolVar = (id: string, kind: 'exogenous' | 'endogenous') => ({ id, label: { 'zh-TW': id }, kind, domain: 'boolean' })

describe('equations panel lists every endogenous equation', () => {
  it('Pearl model 1: X = U1 and Y = U2, though no parent is drawn', () => {
    const c = docToCase(
      modelDocSchema.parse({
        format: 'causal-atlas/model',
        version: 1,
        title: 'Pearl model 1',
        model: { variables: [boolVar('U1', 'exogenous'), boolVar('U2', 'exogenous'), boolVar('X', 'endogenous'), boolVar('Y', 'endogenous')], equations: { X: 'U1', Y: 'U2' } },
        priors: { independent: { U1: 0.5, U2: 0.5 } },
      }),
    )
    const shown = shownVariables(c)
    const ids = equationIds(c)
    expect(ids).toEqual(['X', 'Y'])
    expect(equationRows(messagesFor('zh-TW'), c, ids, 'arithmetic', undefined, {}, shown).map((r) => r.text)).toEqual(['X = U1', 'Y = U2'])
  })
})

describe('show_exogenous: a model document names exogenous variables to draw', () => {
  const nervous = {
    format: 'causal-atlas/model',
    version: 1,
    title: 'Nervous rifleman',
    model: {
      variables: [boolVar('U', 'exogenous'), boolVar('W', 'exogenous'), boolVar('C', 'endogenous'), boolVar('A', 'endogenous'), boolVar('B', 'endogenous'), boolVar('D', 'endogenous')],
      equations: { C: 'U', A: 'C or W', B: 'C', D: 'A or B' },
    },
    priors: { independent: { U: 0.7, W: 0.2 } },
  }

  it("draws W, and do(A=0) names both cut parents in the equation's order: 切斷 C、W", () => {
    const c = docToCase(modelDocSchema.parse({ ...nervous, show_exogenous: ['W'] }))
    const shown = shownVariables(c)
    expect(shown).toContain('W')
    expect(shown).not.toContain('U')
    const [row] = equationRows(messagesFor('zh-TW'), c, ['A'], 'propositional', undefined, { A: false }, shown)
    expect(row.note).toBe('切斷 C、W，直接設成 0')
  })

  it('keeps the field when a document becomes a case and back', () => {
    const doc = modelDocSchema.parse({ ...nervous, show_exogenous: ['W'] })
    expect(caseToDoc(docToCase(doc)).show_exogenous).toEqual(['W'])
  })

  it('refuses a name that is not an exogenous variable', () => {
    const bad = modelDocSchema.safeParse({ ...nervous, show_exogenous: ['A', 'Q'] })
    expect(bad.success).toBe(false)
    expect(bad.error?.issues.map((i) => i.path.join('.'))).toEqual(['show_exogenous.A', 'show_exogenous.Q'])
  })
})
