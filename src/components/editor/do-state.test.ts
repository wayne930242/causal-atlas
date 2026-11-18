import { describe, expect, it } from 'vitest'
import { getCase } from '../../data/index.ts'
import { docToCase } from '../../data/model-doc.ts'
import { modelDocSchema } from '../../data/schema.ts'
import { NO_OBSERVATION, validInterventions, validObserved, validStochastic } from './do-state.ts'

const label = (id: string) => ({ 'zh-TW': id, en: id })

/** A probability model with a boolean cause, a three-valued effect and a boolean outcome. */
const prob = docToCase(
  modelDocSchema.parse({
    format: 'causal-atlas/model',
    version: 1,
    title: 'do state',
    model: {
      variables: [
        { id: 'U', label: label('U'), kind: 'exogenous', domain: 'boolean' },
        { id: 'X', label: label('X'), kind: 'endogenous', domain: 'boolean' },
        { id: 'L', label: label('L'), kind: 'endogenous', domain: ['1', '2', 'three'] },
        { id: 'Y', label: label('Y'), kind: 'endogenous', domain: 'boolean' },
      ],
      equations: { X: 'U', L: "if X then '2' else '1'", Y: "L = '2'" },
    },
    priors: { independent: { U: 0.4 } },
  }),
)

describe('validInterventions', () => {
  it('keeps endogenous variables at values of their domain and drops the rest', () => {
    expect(validInterventions(prob, { X: true, U: true, Q: 1, L: 'three' })).toEqual({ X: true, L: 'three' })
    expect(validInterventions(prob, { L: 'four' })).toEqual({})
  })

  it('reads a number from the address as the text value it names', () => {
    expect(validInterventions(prob, { L: 2 })).toEqual({ L: '2' })
    expect(validInterventions(prob, { X: 1 })).toEqual({ X: true })
  })
})

describe('validStochastic', () => {
  it('keeps P*(X=1) strictly between 0 and 1 of a boolean endogenous variable not set by a hard do()', () => {
    const state = { interventions: {}, stochastic: { X: 0.3, Y: 1, U: 0.5, L: 0.2, Q: 0.5 } }
    expect(validStochastic(prob, state, {})).toEqual({ X: 0.3 })
    expect(validStochastic(prob, state, { X: true })).toEqual({})
  })

  it('keeps none in a model with an actual context', () => {
    const c = getCase('rock-throwing')
    expect(validStochastic(c, { interventions: {}, stochastic: { BT: 0.5 } }, {})).toEqual({})
  })
})

describe('validObserved', () => {
  it('drops observations of variables under do(), hard or stochastic', () => {
    const active = { interventions: { X: true }, stochastic: { Y: 0.5 } }
    expect(validObserved(prob, { X: false, Y: true, L: '1', U: true }, active)).toEqual({ L: '1' })
  })

  it('has nothing to observe in a model with an actual context', () => {
    const c = getCase('rock-throwing')
    expect(validObserved(c, { BT: true }, { interventions: {}, stochastic: {} })).toBe(NO_OBSERVATION)
  })
})
