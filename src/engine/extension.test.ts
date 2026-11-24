import { describe, expect, it } from 'vitest'
import { docToCase, getCase } from '../data/index.ts'
import type { ModelDoc } from '../data/schema.ts'
import { BOGUS_SEQUENCE, ROCK_COARSE } from '../fixtures/extension/docs.ts'
import { MAX_EXTENSION_CHECKS, conservativeExtension } from './extension.ts'
import { buildModel } from './model.ts'
import { variable } from './test-models.ts'
import { ModelError } from './values.ts'

const modelOf = (doc: ModelDoc) => docToCase(doc).model
const fine = () => getCase('rock-throwing').model

describe('conservative extensions (Halpern 2016, Def. 4.2.1)', () => {
  it('the fine rock-throwing model conservatively extends the coarse one', () => {
    const result = conservativeExtension(modelOf(ROCK_COARSE), fine())
    expect(result).toEqual({ kind: 'extension', conservative: true, added: ['SH', 'BH'], checked: 4 * 3 ** 3 })
  })

  it('the coarse model does not extend the fine one: it lacks SH and BH', () => {
    expect(conservativeExtension(fine(), modelOf(ROCK_COARSE))).toEqual({
      kind: 'precondition',
      conservative: false,
      failure: { kind: 'variable-missing', id: 'SH' },
    })
  })

  it.each([1, 2, 3])('in Theorem 4.4.1, M%i+1 conservatively extends M%i', (k) => {
    const result = conservativeExtension(modelOf(BOGUS_SEQUENCE[k - 1]), modelOf(BOGUS_SEQUENCE[k]))
    expect(result.conservative).toBe(true)
    expect(result.kind === 'extension' && result.added).toEqual([['PN1'], ['A2'], ['PN2']][k - 1])
  })

  it('a model is a conservative extension of itself', () => {
    expect(conservativeExtension(fine(), fine())).toMatchObject({ conservative: true, added: [] })
  })

  it('finds a counterexample when an old equation changes, in the given context first', () => {
    // M2 with VS := U and PN1 drops "A1 or": with U=1 and nothing set, A1=1 so PN1=0 and VS=0, where M1 has VS=1.
    const broken = modelOf({
      ...BOGUS_SEQUENCE[1],
      model: { ...BOGUS_SEQUENCE[1].model, equations: { ...BOGUS_SEQUENCE[1].model.equations, VS: 'U and PN1' } },
    })
    expect(conservativeExtension(modelOf(BOGUS_SEQUENCE[0]), broken, { context: { U: 1 } })).toEqual({
      kind: 'counterexample',
      conservative: false,
      added: ['PN1'],
      checked: 1,
      counterexample: { context: { U: true }, interventions: {}, variable: 'VS', base: true, extension: false },
    })
  })

  it('reports the smallest intervention that tells the models apart', () => {
    const base = buildModel({
      variables: [variable('U', 'exogenous'), variable('X', 'endogenous'), variable('Y', 'endogenous')],
      equations: { X: 'U', Y: 'X' },
    })
    const extension = buildModel({
      variables: [variable('U', 'exogenous'), variable('X', 'endogenous'), variable('Z', 'endogenous'), variable('Y', 'endogenous')],
      equations: { X: 'U', Z: 'U', Y: 'Z' },
    })
    const result = conservativeExtension(base, extension, { context: { U: 1 } })
    expect(result.kind === 'counterexample' && result.counterexample).toEqual({
      context: { U: true },
      interventions: { X: false },
      variable: 'Y',
      base: false,
      extension: true,
    })
  })

  it('refuses models whose exogenous variables differ', () => {
    const other = buildModel({
      variables: [variable('U_ST', 'exogenous'), variable('U_X', 'exogenous'), variable('ST', 'endogenous'), variable('BT', 'endogenous'), variable('BS', 'endogenous')],
      equations: { ST: 'U_ST', BT: 'U_X', BS: 'ST or BT' },
    })
    expect(conservativeExtension(modelOf(ROCK_COARSE), other)).toEqual({
      kind: 'precondition',
      conservative: false,
      failure: { kind: 'exogenous-differ', onlyBase: ['U_BT'], onlyExtension: ['U_X'] },
    })
  })

  it('refuses a shared variable with another range', () => {
    const base = buildModel({ variables: [variable('U', 'exogenous'), variable('X', 'endogenous')], equations: { X: 'U' } })
    const extension = buildModel({
      variables: [variable('U', 'exogenous'), variable('X', 'endogenous', { kind: 'finite', values: [0, 1, 2] })],
      equations: { X: 'if U then 1 else 0' },
    })
    expect(conservativeExtension(base, extension)).toMatchObject({ kind: 'precondition', failure: { kind: 'domain-differ', id: 'X' } })
  })

  it('stops before solving past its budget', () => {
    const ids = Array.from({ length: 12 }, (_, i) => `X${i}`)
    const model = buildModel({
      variables: [variable('U', 'exogenous'), ...ids.map((id) => variable(id, 'endogenous'))],
      equations: Object.fromEntries(ids.map((id) => [id, 'U'])),
    })
    const run = (): unknown => conservativeExtension(model, model)
    expect(run).toThrow(ModelError)
    expect(run).toThrow(expect.objectContaining({ problem: { code: 'extension-budget', params: { count: 2 * 3 ** 12, limit: MAX_EXTENSION_CHECKS } } }))
  })
})
