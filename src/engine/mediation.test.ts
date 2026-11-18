import { describe, expect, it } from 'vitest'
import { docToCase } from '../data/index.ts'
import { LESSON_MODELS } from '../demo/lesson-models.ts'
import type { Expr } from './expr.ts'
import type { Assignment, CausalModel, Prior, Value } from './index.ts'
import { buildModel, descendants, domainValues, getVariable, mediation, probability } from './index.ts'
import { variable } from './test-models.ts'

const bool = (p: number) => [
  { value: true, p },
  { value: false, p: 1 - p },
]

/**
 * Hesslow's pill (Pearl, Causality, pp. 126–127): the pill X raises thrombosis Y directly (U_A) and
 * lowers it by preventing pregnancy Z. With `failure`, the pill fails to prevent pregnancy with that
 * probability, so every cell P(x, z) has data.
 */
function pill(failure?: number): { model: CausalModel; prior: Prior } {
  const exo = ['U_X', 'U_P', 'U_A', 'U_B', ...(failure === undefined ? [] : ['U_F'])]
  const model = buildModel({
    variables: [...exo.map((id) => variable(id, 'exogenous')), variable('X', 'endogenous'), variable('Z', 'endogenous'), variable('Y', 'endogenous')],
    equations: {
      X: 'U_X',
      Z: failure === undefined ? 'U_P and not X' : 'U_P and (not X or U_F)',
      Y: '(X and U_A) or (Z and U_B)',
    },
  })
  const marginals: Record<string, ReturnType<typeof bool>> = { U_X: bool(0.5), U_P: bool(0.5), U_A: bool(0.2), U_B: bool(0.4) }
  if (failure !== undefined) marginals.U_F = bool(failure)
  return { model, prior: { kind: 'independent', marginals } }
}

/** The pill with an unrecorded common cause C of the mediator and the outcome (aptitude in Pearl's admission story). */
function confounded(): { model: CausalModel; prior: Prior } {
  const exo = ['U_X', 'U_P', 'U_A', 'U_B', 'U_F', 'U_C']
  const model = buildModel({
    variables: [...exo.map((id) => variable(id, 'exogenous')), variable('X', 'endogenous'), variable('Z', 'endogenous'), variable('Y', 'endogenous')],
    equations: {
      X: 'U_X',
      Z: '(U_P or U_C) and (not X or U_F)',
      Y: '(X and U_A) or (Z and U_B) or (U_C and not Z)',
    },
  })
  const marginals = { U_X: bool(0.5), U_P: bool(0.3), U_A: bool(0.2), U_B: bool(0.4), U_F: bool(0.3), U_C: bool(0.4) }
  return { model, prior: { kind: 'independent', marginals } }
}

const v = (name: string): Expr => ({ op: 'var', name })
const eq = (name: string, value: Value): Expr => ({ op: 'eq', left: v(name), right: { op: 'const', value }, negated: false })
const doing = (set: Assignment, body: Expr): Expr => ({
  op: 'do',
  interventions: Object.entries(set).map(([variable, value]) => ({ variable, value })),
  body,
})

/** Every setting of `ids`. */
function settings(model: CausalModel, ids: readonly string[]): Assignment[] {
  let out: Record<string, Value>[] = [{}]
  for (const id of ids) out = out.flatMap((s) => domainValues(getVariable(model, id).domain).map((value) => ({ ...s, [id]: value })))
  return out
}

/** P(Y_{a, Z⃗_b} = y) as the nested formula ⋁_z ([X←b] Z⃗=z ∧ [X←a, Z⃗←z] Y=y), evaluated by `probability`. */
function nested(model: CausalModel, prior: Prior, X: string, Z: readonly string[], outcome: Expr, a: Value, b: Value): number {
  const event: Expr = {
    op: 'or',
    args: settings(model, Z).map((z) => ({
      op: 'and',
      args: [doing({ [X]: b }, { op: 'and', args: Object.entries(z).map(([id, value]) => eq(id, value)) }), doing({ ...z, [X]: a }, outcome)],
    })),
  }
  return probability(model, prior, { event }).value
}

const P = (model: CausalModel, prior: Prior, event: string, given?: string, d?: Assignment) =>
  probability(model, prior, { event, given, do: d }).value

describe('mediation: Hesslow pill (Pearl §4.5)', () => {
  const { model, prior } = pill()
  const r = mediation(model, prior, { treatment: 'X', mediators: ['Z'], outcome: 'Y=1', from: 0, to: 1, formula: true })

  it('reproduces the hand-computed effects', () => {
    // Y(1) = U_A: 0.2; Y(0) = U_P ∧ U_B: 0.2; Y(1, Z(0)) = U_A ∨ (U_P ∧ U_B): 0.36; Y(0, Z(1)) = 0.
    expect(r.total).toBeCloseTo(0, 12)
    expect(r.naturalDirect).toBeCloseTo(0.16, 12)
    expect(r.naturalIndirect).toBeCloseTo(-0.2, 12)
    expect(r.reverseIndirect).toBeCloseTo(0.16, 12)
  })

  it('satisfies TE = DE − IE(reverse) (4.15)', () => {
    expect(r.total).toBeCloseTo(r.naturalDirect - r.reverseIndirect, 12)
  })

  it('gives controlled direct effects per mediator value (effect modification)', () => {
    expect(r.controlled.map((c) => [c.z.Z, c.value])).toEqual([
      [false, expect.closeTo(0.2, 12)],
      [true, expect.closeTo(0.2 + 0.8 * 0.4 - 0.4, 12)],
    ])
    expect(r.controlled[1].value).toBeCloseTo(P(model, prior, 'Y=1', undefined, { X: 1, Z: 1 }) - P(model, prior, 'Y=1', undefined, { X: 0, Z: 1 }), 12)
  })

  it('agrees with the nested formulas evaluated by probability()', () => {
    const y = eq('Y', true)
    expect(r.naturalDirect).toBeCloseTo(nested(model, prior, 'X', ['Z'], y, true, false) - P(model, prior, 'Y=1', undefined, { X: 0 }), 12)
    expect(r.naturalIndirect).toBeCloseTo(nested(model, prior, 'X', ['Z'], y, false, true) - P(model, prior, 'Y=1', undefined, { X: 0 }), 12)
  })

  it('reports the mediation formula undefined where the deterministic mediator leaves no data', () => {
    // The pill always prevents pregnancy: P(X=1, Z=1) = 0, so E(Y | X=1, Z=1) is undefined.
    expect(r.formula?.direct).toBeUndefined()
    expect(r.formula?.missing).toEqual([{ X: true, Z: true }])
    // (4.18) only needs E(Y | X=0, z): defined, and equal to the natural indirect effect.
    expect(r.formula?.indirect).toBeCloseTo(r.naturalIndirect, 12)
  })

  it('lists the four worlds per context', () => {
    expect(r.worlds).toHaveLength(16)
    const w = r.worlds.find((x) => x.context.U_P === true && x.context.U_B === true && x.context.U_A === false)
    expect(w).toMatchObject({ zFrom: { Z: true }, zTo: { Z: false }, yFrom: true, yTo: false, yToZFrom: true, yFromZTo: false })
    expect(r.worlds.reduce((s, x) => s + x.p, 0)).toBeCloseTo(1, 12)
  })
})

describe('mediation formula (4.17)/(4.18)', () => {
  /** (4.17)/(4.18) computed directly from conditional probabilities. */
  function byHand(model: CausalModel, prior: Prior) {
    let direct = 0
    let indirect = 0
    for (const z of [0, 1]) {
      const pz0 = P(model, prior, `Z=${z}`, 'X=0')
      const pz1 = P(model, prior, `Z=${z}`, 'X=1')
      const e1 = P(model, prior, 'Y=1', `X=1 and Z=${z}`)
      const e0 = P(model, prior, 'Y=1', `X=0 and Z=${z}`)
      direct += (e1 - e0) * pz0
      indirect += e0 * (pz1 - pz0)
    }
    return { direct, indirect }
  }

  it('equals the natural effects in a Markovian model', () => {
    const { model, prior } = pill(0.1)
    const r = mediation(model, prior, { treatment: 'X', mediators: ['Z'], outcome: 'Y=1', from: 0, to: 1, formula: true })
    const hand = byHand(model, prior)
    expect(r.formula?.missing).toEqual([])
    expect(r.formula?.direct).toBeCloseTo(hand.direct, 12)
    expect(r.formula?.indirect).toBeCloseTo(hand.indirect, 12)
    expect(r.formula?.direct).toBeCloseTo(r.naturalDirect, 12)
    expect(r.formula?.indirect).toBeCloseTo(r.naturalIndirect, 12)
    expect(r.total).toBeCloseTo(r.naturalDirect - r.reverseIndirect, 12)
  })

  it('differs from them when a hidden cause confounds mediator and outcome', () => {
    const { model, prior } = confounded()
    const r = mediation(model, prior, { treatment: 'X', mediators: ['Z'], outcome: 'Y=1', from: 0, to: 1, formula: true })
    const hand = byHand(model, prior)
    expect(r.formula?.direct).toBeCloseTo(hand.direct, 12)
    expect(r.formula?.indirect).toBeCloseTo(hand.indirect, 12)
    expect(Math.abs((r.formula?.direct ?? 0) - r.naturalDirect)).toBeGreaterThan(0.01)
    expect(Math.abs((r.formula?.indirect ?? 0) - r.naturalIndirect)).toBeGreaterThan(0.01)
    // The natural effects themselves still follow the nested formulas and (4.15).
    const y = eq('Y', true)
    const y0 = P(model, prior, 'Y=1', undefined, { X: 0 })
    expect(r.naturalDirect).toBeCloseTo(nested(model, prior, 'X', ['Z'], y, true, false) - y0, 12)
    expect(r.naturalIndirect).toBeCloseTo(nested(model, prior, 'X', ['Z'], y, false, true) - y0, 12)
    expect(r.total).toBeCloseTo(r.naturalDirect - r.reverseIndirect, 12)
  })

  it('is left out unless asked for', () => {
    const { model, prior } = pill(0.1)
    expect(mediation(model, prior, { treatment: 'X', mediators: ['Z'], outcome: 'Y=1', from: 0, to: 1 }).formula).toBeUndefined()
  })
})

describe('mediation on the lesson models', () => {
  // Every lesson model with priors, every endogenous X and Y where Y has parents (other than X) that
  // descend from X: those parents mediate. The natural effects must equal the nested formulas.
  const subjects: { name: string; X: string; Y: string; Z: string[] }[] = []
  for (const [name, doc] of Object.entries(LESSON_MODELS)) {
    const c = docToCase(doc)
    if (c.prior === undefined || c.model.endogenous.length > 8) continue
    for (const X of c.model.endogenous) {
      const below = new Set(descendants(c.model, X))
      for (const Y of c.model.endogenous) {
        if (Y === X) continue
        const Z = c.model.edges.filter((e) => e.to === Y && e.from !== X && below.has(e.from) && c.model.endogenous.includes(e.from)).map((e) => e.from)
        if (Z.length > 0) subjects.push({ name, X, Y, Z })
      }
    }
  }

  it('has subjects', () => {
    expect(subjects.length).toBeGreaterThan(0)
  })

  it.each(subjects)('$name: $X → $Z → $Y', ({ name, X, Y, Z }) => {
    const c = docToCase(LESSON_MODELS[name])
    const prior = c.prior as Prior
    const xs = domainValues(getVariable(c.model, X).domain)
    const y = domainValues(getVariable(c.model, Y).domain)[0]
    const [from, to] = [xs[0], xs[1]]
    const outcome = eq(Y, y)
    const r = mediation(c.model, prior, { treatment: X, mediators: Z, outcome, from, to })
    const pFrom = probability(c.model, prior, { event: outcome, do: { [X]: from } }).value
    const pTo = probability(c.model, prior, { event: outcome, do: { [X]: to } }).value
    expect(r.total).toBeCloseTo(pTo - pFrom, 12)
    expect(r.naturalDirect).toBeCloseTo(nested(c.model, prior, X, Z, outcome, to, from) - pFrom, 12)
    expect(r.naturalIndirect).toBeCloseTo(nested(c.model, prior, X, Z, outcome, from, to) - pFrom, 12)
    expect(r.total).toBeCloseTo(r.naturalDirect - r.reverseIndirect, 12)
  })
})

describe('mediation errors', () => {
  const { model, prior } = pill(0.1)
  const base = { treatment: 'X', mediators: ['Z'], outcome: 'Y=1', from: 0, to: 1 } as const
  it.each([
    ['treatment not endogenous', { ...base, treatment: 'U_X' }, 'mediation-not-endogenous'],
    ['mediator not endogenous', { ...base, mediators: ['U_P'] }, 'mediation-not-endogenous'],
    ['no mediators', { ...base, mediators: [] }, 'mediation-no-mediators'],
    ['mediator listed twice', { ...base, mediators: ['Z', 'Z'] }, 'mediation-mediator-repeats'],
    ['treatment among the mediators', { ...base, mediators: ['Z', 'X'] }, 'mediation-treatment-is-mediator'],
    ['from = to', { ...base, to: 0 }, 'mediation-same-values'],
    ['outcome with an intervention', { ...base, outcome: '[Z<-1] Y=1' }, 'effect-has-intervention'],
  ])('%s', (_, query, code) => {
    expect(() => mediation(model, prior, query)).toThrow(expect.objectContaining({ problem: expect.objectContaining({ code }) }))
  })
})
