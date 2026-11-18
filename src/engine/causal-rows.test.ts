import { describe, expect, it } from 'vitest'
import { docToCase, listCases } from '../data/index.ts'
import { LESSON_MODELS, lessonModel } from '../demo/lesson-models.ts'
import type { CausalModel } from './index.ts'
import { causalFormulas, causalRows, coerceToDomain, evalExpr, getVariable, renderExpr, valuesEqual } from './index.ts'
import { enumerateAssignments } from './values.ts'

const rowText = (model: CausalModel, id: string): string[] => causalRows(model, id).map((r) => renderExpr(r.formula, 'text'))

describe('causalRows: the causal-language table with the variables that do not matter left out', () => {
  it('bow A: Y reads U and A11 or A10 when X=1, only A0 when X=0', () => {
    const { model } = docToCase(lessonModel('m06-bow-a'))
    expect(rowText(model, 'Y')).toEqual([
      'A0=0 → [X←0](Y=0)',
      'A0=1 → [X←0](Y=1)',
      'U=0 ∧ A10=0 → [X←1](Y=0)',
      'U=0 ∧ A10=1 → [X←1](Y=1)',
      'U=1 ∧ A11=0 → [X←1](Y=0)',
      'U=1 ∧ A11=1 → [X←1](Y=1)',
    ])
    expect(causalRows(model, 'X')).toHaveLength(4)
    expect(causalFormulas(model, 'Y')).toHaveLength(32)
  })

  it('expanded back, the rows are the full table, for every lesson model and bundled case', () => {
    const models: CausalModel[] = [...Object.values(LESSON_MODELS).map((d) => docToCase(d).model), ...listCases().map((c) => c.model)]
    for (const model of models) {
      for (const id of model.endogenous) {
        const rows = causalRows(model, id)
        const parents = (model.parents.get(id) ?? []).map((p) => getVariable(model, p))
        const expr = model.equations.get(id)
        if (expr === undefined) throw new Error(id)
        let full = 0
        for (const setting of enumerateAssignments(parents)) {
          full += 1
          const matching = rows.filter((r) => Object.entries(r.setting).every(([k, v]) => valuesEqual(setting[k], v)))
          expect(matching, `${id} at ${JSON.stringify(setting)}`).toHaveLength(1)
          expect(valuesEqual(matching[0].value, coerceToDomain(getVariable(model, id), evalExpr(expr, { values: setting })))).toBe(true)
        }
        expect(rows.length).toBeLessThanOrEqual(full)
        expect(full).toBe(causalFormulas(model, id).length)
      }
    }
  })
})
