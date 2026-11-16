import { describe, expect, it } from 'vitest'
import { counterfactual } from './counterfactual.ts'
import { buildModel } from './model.ts'
import type { Prior } from './probability.ts'
import { enumerateContexts, pointMass, probability } from './probability.ts'
import { variable } from './test-models.ts'

/** Pearl's firing squad (Causality §7.1.2) with a nervous rifleman A (W), as in §7.2.2. */
function firingSquad(withNerves: boolean) {
  return buildModel({
    variables: [
      variable('U', 'exogenous'),
      variable('W', 'exogenous'),
      variable('C', 'endogenous'),
      variable('A', 'endogenous'),
      variable('B', 'endogenous'),
      variable('D', 'endogenous'),
    ],
    equations: { C: 'U', A: withNerves ? 'C or W' : 'C', B: 'C', D: 'A or B' },
  })
}

const independent = (pU: number, pW: number): Prior => ({
  kind: 'independent',
  marginals: {
    U: [
      { value: 1, p: pU },
      { value: 0, p: 1 - pU },
    ],
    W: [
      { value: 1, p: pW },
      { value: 0, p: 1 - pW },
    ],
  },
})

describe('counterfactuals (abduction, action, prediction)', () => {
  it('deterministic: had A not shot, the prisoner would still be dead', () => {
    const model = firingSquad(false)
    const result = counterfactual(model, pointMass({ U: 1, W: 0 }), { evidence: 'D=1', do: { A: 0 }, event: 'D=1' })
    expect(result.probability).toBe(1)
    expect(result.worlds).toHaveLength(1)
    expect(result.worlds[0].actual).toMatchObject({ A: true, B: true, D: true })
    expect(result.worlds[0].counterfactual).toMatchObject({ A: false, B: true, D: true })
    expect(result.worlds[0].changed).toEqual(['A'])
    expect(result.removedEdges).toEqual([{ from: 'C', to: 'A' }])
  })

  it('abduction updates the prior on the evidence before acting', () => {
    // P(U=1 | D=1) = p / (p + (1-p) q) = 0.5 / 0.75 with p = q = 0.5.
    const model = firingSquad(true)
    const result = counterfactual(model, independent(0.5, 0.5), { evidence: 'D=1', do: { A: 0 }, event: 'D=1' })
    expect(result.evidenceProbability).toBeCloseTo(0.75, 12)
    expect(result.probability).toBeCloseTo(2 / 3, 12)
    expect(result.worlds.map((w) => w.posterior).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12)
  })

  it('refuses evidence of probability zero', () => {
    expect(() => counterfactual(firingSquad(false), pointMass({ U: 0, W: 0 }), { evidence: 'D=1', do: { A: 0 } })).toThrow(
      /probability 0/,
    )
  })
})

describe('probabilistic queries', () => {
  // Confounder L drives both S and C; S has no effect on C.
  const model = buildModel({
    variables: [
      variable('L', 'exogenous'),
      variable('N_S', 'exogenous'),
      variable('N_C', 'exogenous'),
      variable('S', 'endogenous'),
      variable('C', 'endogenous'),
    ],
    equations: { S: 'L and N_S', C: 'L and N_C' },
  })
  const prior: Prior = {
    kind: 'independent',
    marginals: {
      L: [
        { value: 1, p: 0.5 },
        { value: 0, p: 0.5 },
      ],
      N_S: [
        { value: 1, p: 0.5 },
        { value: 0, p: 0.5 },
      ],
      N_C: [
        { value: 1, p: 0.5 },
        { value: 0, p: 0.5 },
      ],
    },
  }

  it('separates seeing from doing', () => {
    expect(probability(model, prior, { event: 'C=1' }).value).toBeCloseTo(0.25, 12)
    expect(probability(model, prior, { event: 'C=1', given: 'S=1' }).value).toBeCloseTo(0.5, 12)
    expect(probability(model, prior, { event: 'C=1', do: { S: 1 } }).value).toBeCloseTo(0.25, 12)
    expect(probability(model, prior, { event: 'C=1', given: 'L=1', do: { S: 0 } }).value).toBeCloseTo(0.5, 12)
    expect(probability(model, prior, { event: 'S=1', do: { S: 1 } }).value).toBe(1)
    expect(probability(model, prior, { event: 'L=1', given: 'S=1', do: { S: 1 } }).value).toBeCloseTo(0.5, 12)
  })

  it('accepts a joint table equal to the product of the marginals', () => {
    const joint: Prior = {
      kind: 'joint',
      rows: enumerateContexts(model, prior).map(({ context, p }) => ({ context, p })),
    }
    expect(probability(model, joint, { event: 'C=1', given: 'S=1' }).value).toBeCloseTo(0.5, 12)
  })

  it('validates priors', () => {
    const bad: Prior = { kind: 'independent', marginals: { ...prior.marginals, L: [{ value: 1, p: 0.6 }] } }
    expect(() => probability(model, bad, { event: 'C=1' })).toThrow(/sum to 0.6/)
    expect(() => probability(model, { kind: 'joint', rows: [{ context: { L: 1 }, p: 1 }] }, { event: 'C' })).toThrow(/no value for N_S/)
    expect(() => probability(model, prior, { event: 'C=1', given: 'S=1 and L=0' })).toThrow(/probability 0/)
  })
})
