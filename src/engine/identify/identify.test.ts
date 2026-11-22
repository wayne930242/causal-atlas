import { describe, expect, it } from 'vitest'
import { buildModel } from '../model.ts'
import { probability } from '../probability.ts'
import { randomScm, variable } from '../test-models.ts'
import type { Admg, ProbExpr } from './index.ts'
import { MAX_EXPR_EVALUATIONS, admgForPrior, admgOf, checkIdentification, evaluateProbExpr, identify, observedJoint } from './index.ts'

const backdoor: Admg = { nodes: ['Z', 'X', 'Y'], directed: [['Z', 'X'], ['Z', 'Y'], ['X', 'Y']], bidirected: [] }
const frontdoor: Admg = { nodes: ['X', 'Z', 'Y'], directed: [['X', 'Z'], ['Z', 'Y']], bidirected: [['X', 'Y']] }
const napkin: Admg = {
  nodes: ['W', 'Z', 'X', 'Y'],
  directed: [['W', 'Z'], ['Z', 'X'], ['X', 'Y']],
  bidirected: [['W', 'X'], ['W', 'Y']],
}
const bow: Admg = { nodes: ['X', 'Y'], directed: [['X', 'Y']], bidirected: [['X', 'Y']] }

const p = (vars: string[], given: string[] = []): ProbExpr => ({ kind: 'p', vars, given })

function identified(g: Admg, y: string[], x: string[], w?: string[]) {
  const r = identify(g, y, x, w)
  if (!r.identifiable) throw new Error(`not identifiable: ${r.reason}`)
  return r
}

describe('identify: named graphs', () => {
  it('backdoor: Σ_z P(y|x,z) P(z)', () => {
    const r = identified(backdoor, ['Y'], ['X'])
    expect(r.formula).toEqual({ kind: 'sum', over: ['Z'], body: { kind: 'product', factors: [p(['Y'], ['X', 'Z']), p(['Z'])] } })
    expect(r.text).toBe('Σ_z P(y|x,z) P(z)')
    expect(r.latex).toBe('\\sum_{z} P(y \\mid x, z)\\, P(z)')
    expect(r.arbitrary).toEqual([])
  })

  it("frontdoor: Σ_z P(z|x) Σ_x' P(y|x',z) P(x')", () => {
    const r = identified(frontdoor, ['Y'], ['X'])
    expect(r.formula).toEqual({
      kind: 'sum',
      over: ['Z'],
      body: {
        kind: 'product',
        factors: [p(['Z'], ['X']), { kind: 'sum', over: ['X'], body: { kind: 'product', factors: [p(['Y'], ['X', 'Z']), p(['X'])] } }],
      },
    })
    expect(r.text).toBe("Σ_z P(z|x) Σ_x' P(y|x',z) P(x')")
    expect(r.latex).toBe("\\sum_{z} P(z \\mid x)\\, \\sum_{x'} P(y \\mid x', z)\\, P(x')")
  })

  it('napkin: a ratio of two sums over w, for any z', () => {
    const r = identified(napkin, ['Y'], ['X'])
    expect(r.formula).toEqual({
      kind: 'ratio',
      num: { kind: 'sum', over: ['W'], body: { kind: 'product', factors: [p(['X', 'Y'], ['W', 'Z']), p(['W'])] } },
      den: { kind: 'sum', over: ['W'], body: { kind: 'product', factors: [p(['X'], ['W', 'Z']), p(['W'])] } },
    })
    expect(r.text).toBe('[Σ_w P(x,y|w,z) P(w)] / [Σ_w P(x|w,z) P(w)]')
    expect(r.arbitrary).toEqual(['Z'])
  })

  it('bow: not identifiable, hedge F = {X,Y}, F′ = {Y}', () => {
    const r = identify(bow, ['Y'], ['X'])
    expect(r.identifiable).toBe(false)
    if (r.identifiable) return
    expect(r.hedge).toEqual({ f: ['X', 'Y'], fPrime: ['Y'] })
    expect(r.reason).toContain('hedge')
  })

  it('no intervention: the marginal', () => {
    expect(identified(backdoor, ['Y'], []).text).toBe('P(y)')
  })

  it('an unconfounded chain: P(y|x)', () => {
    const chain: Admg = { nodes: ['X', 'Y'], directed: [['X', 'Y']], bidirected: [] }
    expect(identified(chain, ['Y'], ['X']).text).toBe('P(y|x)')
  })

  it('a joint effect on two outcomes', () => {
    const r = identified(backdoor, ['X', 'Y'], ['Z'])
    expect(r.text).toBe('P(x,y|z)')
  })

  it('rejects overlapping, empty and unknown sets', () => {
    expect(() => identify(bow, ['Y'], ['Y'])).toThrow(
      expect.objectContaining({ problem: { code: 'identify-overlap', params: { id: 'Y', first: 'y', second: 'x' } } }),
    )
    expect(() => identify(bow, ['Y'], ['X'], ['X'])).toThrow(
      expect.objectContaining({ problem: { code: 'identify-overlap', params: { id: 'X', first: 'x', second: 'w' } } }),
    )
    expect(() => identify(bow, [], ['X'])).toThrow(expect.objectContaining({ problem: { code: 'identify-empty', params: { set: 'y' } } }))
    expect(() => identify(bow, ['Q'], ['X'])).toThrow(expect.objectContaining({ problem: { code: 'unknown-variable', params: { id: 'Q' } } }))
  })

  it('rejects a cyclic graph', () => {
    const cyc: Admg = { nodes: ['A', 'B'], directed: [['A', 'B'], ['B', 'A']], bidirected: [] }
    expect(() => identify(cyc, ['B'], ['A'])).toThrow(expect.objectContaining({ problem: expect.objectContaining({ code: 'cyclic' }) }))
  })
})

describe('identify: numbers against do()', () => {
  for (const [name, g] of [
    ['backdoor', backdoor],
    ['frontdoor', frontdoor],
    ['napkin', napkin],
  ] as const) {
    it(`${name}: the formula equals P(y|do(x)) on a seeded SCM`, () => {
      const { model, prior } = randomScm(g, 7)
      expect(admgOf(model)).toEqual(g)
      const check = checkIdentification(model, prior, { y: ['Y'], x: ['X'] })
      expect(check.result.identifiable).toBe(true)
      expect(check.skipped).toEqual([])
      expect(check.rows.length).toBeGreaterThanOrEqual(4)
      expect(check.maxError).toBeLessThan(1e-9)
    })
  }

  it('frontdoor: the formula is not plain conditioning', () => {
    const { model, prior } = randomScm(frontdoor, 7)
    const check = checkIdentification(model, prior, { y: ['Y'], x: ['X'] })
    const joint = observedJoint(model, prior)
    const domains = { X: [false, true], Y: [false, true], Z: [false, true] }
    const gaps = check.rows.map((row) => Math.abs(evaluateProbExpr(p(['Y'], ['X']), joint, row.at, domains) - row.doValue))
    expect(Math.max(...gaps)).toBeGreaterThan(1e-3)
  })

  it('the do() side is the engine probability() under do(x)', () => {
    const { model, prior } = randomScm(frontdoor, 7)
    const check = checkIdentification(model, prior, { y: ['Y'], x: ['X'] })
    for (const row of check.rows) {
      const event = `Y=${row.at.Y === true ? 1 : 0}`
      expect(probability(model, prior, { event, do: { X: row.at.X } }).value).toBeCloseTo(row.doValue, 12)
    }
  })

  it('bow: checkIdentification reports the hedge and no rows', () => {
    const { model, prior } = randomScm(bow, 3)
    const check = checkIdentification(model, prior, { y: ['Y'], x: ['X'] })
    expect(check.result.identifiable).toBe(false)
    expect(check.rows).toEqual([])
  })
})

describe('admgOf', () => {
  it('draws an exogenous variable with two or more endogenous children as arcs between them', () => {
    const model = buildModel({
      variables: [
        variable('U', 'exogenous'),
        variable('V', 'exogenous'),
        variable('N', 'exogenous'),
        variable('A', 'endogenous'),
        variable('B', 'endogenous'),
        variable('C', 'endogenous'),
      ],
      equations: { A: 'U and N', B: 'U or A', C: 'U and V and (B or not B)' },
    })
    expect(admgOf(model)).toEqual({
      nodes: ['A', 'B', 'C'],
      directed: [['A', 'B']],
      bidirected: [
        ['A', 'B'],
        ['A', 'C'],
        ['B', 'C'],
      ],
    })
  })
})

describe('admgForPrior', () => {
  const model = buildModel({
    variables: [variable('U', 'exogenous'), variable('V', 'exogenous'), variable('A', 'endogenous'), variable('B', 'endogenous')],
    equations: { A: 'U', B: 'V' },
  })

  it('joins the children of dependent exogenous variables under a joint prior', () => {
    const rows = (pairs: [boolean, boolean, number][]) => ({ kind: 'joint' as const, rows: pairs.map(([U, V, p]) => ({ context: { U, V }, p })) })
    expect(admgForPrior(model, rows([[true, true, 0.5], [false, false, 0.5]])).bidirected).toEqual([['A', 'B']])
    expect(
      admgForPrior(
        model,
        rows([
          [true, true, 0.25],
          [true, false, 0.25],
          [false, true, 0.25],
          [false, false, 0.25],
        ]),
      ).bidirected,
    ).toEqual([])
  })

  it('keeps independent exogenous variables apart', () => {
    const prior = { kind: 'independent' as const, marginals: { U: [{ value: true, p: 0.5 }, { value: false, p: 0.5 }], V: [{ value: true, p: 0.3 }, { value: false, p: 0.7 }] } }
    expect(admgForPrior(model, prior)).toEqual(admgOf(model))
  })
})

describe('evaluateProbExpr', () => {
  const joint = [
    { assignment: { A: 0, B: 0 }, p: 0.1 },
    { assignment: { A: 0, B: 1 }, p: 0.3 },
    { assignment: { A: 1, B: 0 }, p: 0.6 },
  ]
  const domains = { A: [0, 1], B: [0, 1] }

  it('evaluates atoms, sums and ratios', () => {
    expect(evaluateProbExpr(p(['B'], ['A']), joint, { A: 0, B: 1 }, domains)).toBeCloseTo(0.75, 12)
    expect(evaluateProbExpr({ kind: 'sum', over: ['A'], body: p(['A', 'B']) }, joint, { B: 0 }, domains)).toBeCloseTo(0.7, 12)
    expect(evaluateProbExpr({ kind: 'ratio', num: p(['A', 'B']), den: p(['A']) }, joint, { A: 1, B: 0 }, domains)).toBeCloseTo(1, 12)
  })

  it('throws on a zero-probability condition and on a missing value', () => {
    const noB1 = joint.filter((r) => !(r.assignment.A === 1 && r.assignment.B === 1))
    expect(() => evaluateProbExpr(p(['A'], ['B']), [{ assignment: { A: 0, B: 0 }, p: 1 }], { A: 0, B: 1 }, domains)).toThrow(
      expect.objectContaining({ problem: { code: 'zero-probability-evidence', params: {} } }),
    )
    expect(() => evaluateProbExpr(p(['A']), noB1, {}, domains)).toThrow(expect.objectContaining({ problem: { code: 'no-value', params: { id: 'A' } } }))
  })

  it('stops past MAX_EXPR_EVALUATIONS', () => {
    const ids = ['A', 'B', 'C', 'D', 'E', 'F', 'G']
    const wide = Object.fromEntries(ids.map((id) => [id, [0, 1, 2, 3, 4, 5, 6, 7]]))
    const e: ProbExpr = { kind: 'sum', over: ids, body: p(ids) }
    expect(() => evaluateProbExpr(e, joint, {}, wide)).toThrow(
      expect.objectContaining({ problem: { code: 'identify-budget', params: { limit: MAX_EXPR_EVALUATIONS } } }),
    )
  })

  it('a product with a zero factor is zero even when another factor is undefined', () => {
    const e: ProbExpr = { kind: 'product', factors: [p(['B'], ['A']), p(['A'])] }
    expect(evaluateProbExpr(e, [{ assignment: { A: 0, B: 0 }, p: 1 }], { A: 1, B: 0 }, domains)).toBe(0)
  })
})
