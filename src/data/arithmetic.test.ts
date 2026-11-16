import { describe, expect, it } from 'vitest'
import { evalArith, evaluate, renderEquation, toArith } from '../engine/index.ts'
import { enumerateAssignments } from '../engine/values.ts'
import { caseFiles } from './cases.ts'
import { loadCase } from './load.ts'

describe('arithmetic notation', () => {
  it('renders the rock-throwing equations as in the literature', () => {
    const rock = loadCase(caseFiles['./cases/rock-throwing.json'])
    expect(renderEquation(rock.model, 'BH', 'arithmetic', 'text')).toBe('BH = BT·(1−SH)')
    expect(renderEquation(rock.model, 'BS', 'arithmetic', 'text')).toBe('BS = max(SH, BH)')
    expect(renderEquation(rock.model, 'BH', 'arithmetic', 'latex')).toBe('\\mathit{BH} = \\mathit{BT} \\cdot (1 - \\mathit{SH})')
  })

  describe.each(Object.entries(caseFiles))('%s', (path, raw) => {
    it('evaluates to the engine value in every context', () => {
      const { model } = loadCase(raw)
      const exo = model.variables.filter((v) => v.kind === 'exogenous')
      let checked = 0
      for (const context of enumerateAssignments(exo)) {
        const { values } = evaluate(model, context)
        for (const id of model.endogenous) {
          const arith = toArith(model, model.equations.get(id)!)
          const expected = values[id]
          const want = typeof expected === 'boolean' ? (expected ? 1 : 0) : expected
          expect(evalArith(arith, values), `${path} ${id} in ${JSON.stringify(context)}`).toBe(want)
          expect(renderEquation(model, id, 'arithmetic', 'text')).toMatch(/^\S+ = /)
          expect(renderEquation(model, id, 'arithmetic', 'latex')).toMatch(/ = /)
          checked++
        }
      }
      expect(checked).toBeGreaterThan(0)
    })
  })
})
