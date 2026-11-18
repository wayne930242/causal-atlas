import { describe, expect, it } from 'vitest'
import { getCase } from '../../data/index.ts'
import { caseToDoc } from '../../data/model-doc.ts'
import type { ModelDoc } from '../../data/schema.ts'
import { draftFromImport } from './draft.ts'

/** REV-F006 follow-up: an imported document keeps 案例出處 only when its model is the bundled case's. */
describe('credit on imported documents', () => {
  const doc: ModelDoc = caseToDoc(getCase('rock-throwing'))

  it('keeps `from` for a model identical to the bundled case', () => {
    expect(draftFromImport(doc).from).toBe('rock-throwing')
  })

  it('keeps it when only labels, title, layout or spacing differ', () => {
    const relabelled: ModelDoc = {
      ...doc,
      title: 'Suzy and Billy',
      layout: { ST: [3, 3] },
      model: {
        variables: doc.model.variables.map((v) => ({ ...v, label: { 'zh-TW': `${v.id}!`, en: `${v.id}?` } })),
        equations: { ...doc.model.equations, BH: '  BT  and not SH ' },
      },
      context: { U_ST: true, U_BT: true },
    }
    expect(draftFromImport(relabelled).from).toBe('rock-throwing')
  })

  it('drops it when an equation, a domain, the context or the defaults differ', () => {
    const changed: ModelDoc[] = [
      { ...doc, model: { ...doc.model, equations: { ...doc.model.equations, BH: 'BT' } } },
      { ...doc, context: { U_ST: 1, U_BT: 0 } },
      { ...doc, normality: { ...doc.normality, BS: 1 } },
      { ...doc, context: undefined, priors: { independent: { U_ST: 0.5, U_BT: 0.5 } } },
      {
        ...doc,
        model: {
          ...doc.model,
          variables: doc.model.variables.map((v) => (v.id === 'U_ST' ? { ...v, kind: 'exogenous' as const, domain: [0, 1] } : v)),
        },
      },
    ]
    for (const d of changed) expect(draftFromImport(d).from).toBeUndefined()
  })

  it('drops a `from` that names no bundled case', () => {
    expect(draftFromImport({ ...doc, from: 'no-such-case' }).from).toBeUndefined()
  })
})
