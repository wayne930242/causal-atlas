import { describe, expect, it } from 'vitest'
import { evaluate } from './evaluate.ts'
import { causalFormulas } from './render.ts'
import { evalFormula, satisfies } from './formula.ts'
import { CyclicModelError, buildModel } from './model.ts'
import { rockThrowing, variable } from './test-models.ts'
import { ModelError, enumerateAssignments } from './values.ts'

const rockContext = { U_ST: 1, U_BT: 1 }

describe('buildModel', () => {
  it('orders endogenous variables topologically', () => {
    const model = buildModel({
      variables: [variable('U', 'exogenous'), variable('C', 'endogenous'), variable('B', 'endogenous'), variable('A', 'endogenous')],
      equations: { C: 'A or B', B: 'A', A: 'U' },
    })
    expect(model.endogenous).toEqual(['A', 'B', 'C'])
    expect(model.parents.get('C')).toEqual(['B', 'A'])
  })

  it('rejects cyclic models and names the cycle', () => {
    const build = () =>
      buildModel({
        variables: [variable('A', 'endogenous'), variable('B', 'endogenous'), variable('C', 'endogenous')],
        equations: { A: 'C', B: 'A', C: 'B' },
      })
    expect(build).toThrow(CyclicModelError)
    expect(build).toThrow('model is cyclic: A → C → B → A')
  })

  it('rejects malformed models', () => {
    expect(() => buildModel({ variables: [variable('A', 'endogenous')], equations: {} })).toThrow(/has no equation/)
    expect(() => buildModel({ variables: [variable('A', 'endogenous')], equations: { A: 'Z' } })).toThrow(/unknown variable Z/)
    expect(() =>
      buildModel({
        variables: [variable('U', 'exogenous', { kind: 'finite', values: ['a', 'b'] }), variable('A', 'endogenous')],
        equations: { A: "U = 'c'" },
      }),
    ).toThrow(ModelError)
    expect(() => buildModel({ variables: [variable('U', 'exogenous')], equations: { U: 'true' } })).toThrow(/exogenous/)
  })

  it('evaluates lookup tables and rejects malformed ones', () => {
    const lookupModel = (rows: { when: (number | string)[]; value: string }[], fallback?: string) =>
      buildModel({
        variables: [
          variable('X', 'exogenous', { kind: 'finite', values: [0, 1, 2] }),
          variable('Y', 'endogenous', { kind: 'finite', values: ['lo', 'hi'] }),
        ],
        equations: { Y: { op: 'lookup', inputs: ['X'], rows, fallback } },
      })
    const model = lookupModel([{ when: [2], value: 'hi' }], 'lo')
    expect(evaluate(model, { X: 2 }).values.Y).toBe('hi')
    expect(evaluate(model, { X: 0 }).values.Y).toBe('lo')
    expect(() => evaluate(lookupModel([{ when: [2], value: 'hi' }]), { X: 1 })).toThrow(/no row for \(1\)/)
    expect(() => lookupModel([{ when: [2, 1], value: 'hi' }])).toThrow(/has 2 inputs, expected 1/)
    expect(() =>
      lookupModel([
        { when: [2], value: 'hi' },
        { when: [2], value: 'lo' },
      ]),
    ).toThrow(/lists inputs \(2\) twice/)
  })
})

describe('evaluate and do()', () => {
  const rock = rockThrowing()

  it('solves the actual world', () => {
    expect(evaluate(rock, rockContext).values).toEqual({ U_ST: true, U_BT: true, ST: true, BT: true, SH: true, BH: false, BS: true })
  })

  it('replaces the intervened equation and reports the cut edges', () => {
    const result = evaluate(rock, rockContext, { SH: 0 })
    expect(result.values).toMatchObject({ ST: true, SH: false, BH: true, BS: true })
    expect(result.removedEdges).toEqual([{ from: 'ST', to: 'SH' }])
    expect(result.edges).not.toContainEqual({ from: 'ST', to: 'SH' })
    expect(result.edges).toContainEqual({ from: 'SH', to: 'BH' })
    expect(result.intervened).toEqual(['SH'])
  })

  it('rejects values outside a domain', () => {
    expect(() => evaluate(rock, rockContext, { SH: 2 })).toThrow(/expected a boolean/)
    expect(() => evaluate(rock, { U_ST: 1 })).toThrow(/U_BT/)
  })
})

describe('Halpern–Pearl formulas', () => {
  const rock = rockThrowing()

  it('evaluates primitive events and interventions', () => {
    expect(satisfies(rock, rockContext, 'BS=1 and BH=0')).toBe(true)
    expect(satisfies(rock, rockContext, 'BS')).toBe(true)
    expect(satisfies(rock, rockContext, '[ST<-0] BS=1')).toBe(true)
    expect(satisfies(rock, rockContext, '[ST<-0, BH<-0] BS=0')).toBe(true)
    expect(satisfies(rock, rockContext, '[ST<-0] [BT<-0] BS=0')).toBe(true)
    expect(satisfies(rock, rockContext, '[ST<-0] (BH=1 and [ST<-1] BH=0)')).toBe(true)
    expect(satisfies(rock, rockContext, 'BS', { ST: 0, BT: 0 })).toBe(false)
  })

  it('checks formulas against the model', () => {
    expect(() => satisfies(rock, rockContext, 'XX=1')).toThrow(/unknown variable XX/)
    expect(() => satisfies(rock, rockContext, '[ST<-2] BS')).toThrow(ModelError)
  })

  it('the causal-language rendering of each equation is valid in every context', () => {
    for (const context of enumerateAssignments(rock.exogenous.map((id) => variable(id, 'exogenous')))) {
      for (const id of rock.endogenous) {
        for (const formula of causalFormulas(rock, id)) {
          expect(evalFormula(rock, context, formula)).toBe(true)
        }
      }
    }
  })
})
