import { describe, expect, it } from 'vitest'
import { docToCase, listCases } from '../data/index.ts'
import type { ModelDoc } from '../data/schema.ts'
import { LESSON_MODELS, lessonModel } from '../demo/lesson-models.ts'
import type { Assignment, CausalModel } from './index.ts'
import { casePieces, coerceToDomain, evalExpr, getVariable, renderEquation, valuesEqual } from './index.ts'
import { asBool, enumerateAssignments } from './values.ts'

describe('cases notation: the equation as if-then rows', () => {
  it('bow A: the nested if of Y flattens to three rows', () => {
    const { model } = docToCase(lessonModel('m06-bow-a'))
    expect(renderEquation(model, 'Y', 'cases', 'text')).toBe('Y = { A11 if X=1, U=1; A10 if X=1, U=0; A0 if X=0 }')
    expect(renderEquation(model, 'Y', 'cases', 'latex')).toBe(
      'Y = \\begin{cases} A_{11} & X=1,\\ U=1 \\\\ A_{10} & X=1,\\ U=0 \\\\ A_0 & X=0 \\end{cases}',
    )
  })

  it('an equation without if: two-valued gets a 1 row and a 0 row, a bare variable stays as it is', () => {
    const v = (id: string, kind: 'exogenous' | 'endogenous') => ({ id, label: { 'zh-TW': id, en: id }, kind, domain: 'boolean' as const })
    const { model } = docToCase({
      format: 'causal-atlas/model',
      version: 1,
      title: 'probe',
      model: {
        variables: [v('U', 'exogenous'), v('ST', 'endogenous'), v('BT', 'endogenous'), v('BS', 'endogenous'), v('N', 'endogenous')],
        equations: { ST: 'U', BT: 'not U', BS: 'ST or BT', N: 'not (ST and BT)' },
      },
    } as ModelDoc)
    expect(renderEquation(model, 'ST', 'cases', 'text')).toBe('ST = U')
    expect(renderEquation(model, 'BS', 'cases', 'text')).toBe('BS = { 1 if ST=1 ∨ BT=1; 0 if ST=0, BT=0 }')
    expect(renderEquation(model, 'N', 'cases', 'text')).toBe('N = { 1 if ST=0 ∨ BT=0; 0 if ST=1, BT=1 }')
  })

  it('in every lesson model and bundled case, exactly the row the equation picks holds', () => {
    const models: CausalModel[] = [
      ...Object.keys(LESSON_MODELS).map((id) => docToCase(lessonModel(id)).model),
      ...listCases().map((c) => c.model),
    ]
    for (const model of models) {
      for (const id of model.endogenous) {
        const pieces = casePieces(model, id)
        if (pieces.length === 0) continue
        const parents = (model.parents.get(id) ?? []).map((p) => getVariable(model, p))
        const target = getVariable(model, id)
        for (const setting of enumerateAssignments(parents)) {
          const values: Assignment = setting
          const holding = pieces.filter((p) => p.when.every((w) => asBool(evalExpr(w, { values }), { kind: 'operator', op: 'if' })))
          const expected = coerceToDomain(target, evalExpr(model.equations.get(id)!, { values }))
          const expr = model.equations.get(id)!
          if (holding.length === 0) {
            expect(expr.op === 'lookup' && expr.fallback !== undefined, `${id}: no row holds`).toBe(true)
            continue
          }
          expect(holding, `${id}: one row holds`).toHaveLength(1)
          const got = coerceToDomain(target, evalExpr(holding[0].value, { values }))
          expect(valuesEqual(got, expected), `${id} at ${JSON.stringify(setting)}`).toBe(true)
        }
      }
    }
  })
})
