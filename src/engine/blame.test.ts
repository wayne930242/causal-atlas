import { describe, expect, it } from 'vitest'
import type { CausalModel, Prior, ResponsibilityTheory } from './index.ts'
import { blame, buildModel, responsibility } from './index.ts'
import { variable } from './test-models.ts'

const HP: readonly ResponsibilityTheory[] = ['hp-original', 'hp-original', 'hp-modified']

const bool = (p: number) => [
  { value: true, p },
  { value: false, p: 1 - p },
]

/**
 * Ex. 6.2.2: rock throwing where Billy's throw BT is 0 (none), 1 (Suzy hits first) or 2 (extra hard:
 * both hit together), and PRE says the bottle was already shattered before Suzy threw.
 */
function suzyModel(): CausalModel {
  return buildModel({
    variables: [
      variable('PRE', 'exogenous'),
      variable('U_ST', 'exogenous'),
      variable('U_BT', 'exogenous', { kind: 'finite', values: [0, 1, 2] }),
      variable('ST', 'endogenous'),
      variable('BT', 'endogenous', { kind: 'finite', values: [0, 1, 2] }),
      variable('SH', 'endogenous'),
      variable('BH', 'endogenous'),
      variable('BS', 'endogenous'),
    ],
    equations: {
      ST: 'U_ST',
      BT: 'U_BT',
      SH: 'ST and not PRE',
      BH: 'not PRE and ((BT = 1 and not SH) or BT = 2)',
      BS: 'PRE or SH or BH',
    },
  })
}

/** Ex. 6.2.3: n marksmen all shoot (S_i); the exogenous U_B says who has the live bullet. */
function squad(p: readonly number[]): { model: CausalModel; prior: Prior; context: (b: number) => Record<string, number | boolean> } {
  const ids = p.map((_, i) => `S${i + 1}`)
  const model = buildModel({
    variables: [
      variable('U_B', 'exogenous', { kind: 'finite', values: ids.map((_, i) => i + 1) }),
      ...ids.map((id) => variable(`U_${id}`, 'exogenous')),
      ...ids.map((id) => variable(id, 'endogenous')),
      variable('D', 'endogenous'),
    ],
    equations: { ...Object.fromEntries(ids.map((id) => [id, `U_${id}`])), D: ids.map((id, i) => `(${id} and U_B = ${i + 1})`).join(' or ') },
  })
  const prior: Prior = {
    kind: 'independent',
    marginals: { U_B: p.map((q, i) => ({ value: i + 1, p: q })), ...Object.fromEntries(ids.map((id) => [`U_${id}`, [{ value: true, p: 1 }]])) },
  }
  return { model, prior, context: (b) => ({ U_B: b, ...Object.fromEntries(ids.map((id) => [`U_${id}`, true])) }) }
}

/** Regina v. Faulkner (§3.4.4, Ex. 6.2.7): M → RI → SD → LL → ES, each link also needing R, F, LI, EU. */
function faulkner(): { model: CausalModel; prior: Prior } {
  const base = ['M', 'R', 'F', 'LI', 'EU']
  const model = buildModel({
    variables: [...base.map((id) => variable(`U_${id}`, 'exogenous')), ...[...base, 'RI', 'SD', 'LL', 'ES'].map((id) => variable(id, 'endogenous'))],
    equations: {
      ...Object.fromEntries(base.map((id) => [id, `U_${id}`])),
      RI: 'M and R',
      SD: 'RI and F',
      LL: 'SD and LI',
      ES: 'LL and EU',
    },
  })
  const p = { M: 0.9, R: 0.3, F: 0.5, LI: 0.6, EU: 0.1 }
  return { model, prior: { kind: 'independent', marginals: Object.fromEntries(Object.entries(p).map(([id, q]) => [`U_${id}`, bool(q)])) } }
}

describe('degree of blame (Halpern 2016, Def. 6.2.1)', () => {
  it("Ex. 6.2.2: Suzy's blame for the shattered bottle is 1/2", () => {
    const model = suzyModel()
    const settings = [
      { PRE: true, U_ST: true, U_BT: 1 },
      { PRE: false, U_ST: true, U_BT: 2 },
      { PRE: false, U_ST: true, U_BT: 1 },
      { PRE: false, U_ST: true, U_BT: 0 },
    ]
    const prior: Prior = { kind: 'joint', rows: settings.map((context) => ({ context, p: 1 / 4 })) }
    for (const theory of HP) {
      const r = blame(model, prior, { cause: 'ST=1', effect: 'BS=1' }, theory)
      expect(r.degree, theory).toBeCloseTo(1 / 2, 12)
      expect(r.rows.map((row) => row.responsibility), theory).toEqual([0, 1 / 2, 1 / 2, 1])
    }
  })

  it('Ex. 6.2.3: each marksman is to blame by his prior p_i, whoever has the bullet', () => {
    const p = [0.4, 0.3, 0.2, 0.1, 0]
    const { model, prior, context } = squad(p)
    for (const theory of HP) {
      p.forEach((q, i) => {
        expect(blame(model, prior, { cause: `S${i + 1}=1`, effect: 'D=1' }, theory).degree, `${theory} S${i + 1}`).toBeCloseTo(q, 12)
      })
      // Marksman 5 had the live bullet though the prior gave it probability 0: responsibility 1, blame 0.
      expect(responsibility(model, context(5), { cause: 'S5=1', effect: 'D=1' }, theory).degree).toBe(1)
      expect(responsibility(model, context(5), { cause: 'S1=1', effect: 'D=1' }, theory).degree).toBe(0)
    }
  })

  it('Ex. 6.2.7 Regina v. Faulkner: blame(M) = P(R)P(F)P(LI)P(EU), blame(LL) = P(EU), under every version', () => {
    const { model, prior } = faulkner()
    const normality = { M: false, R: false, F: false, LI: false, EU: false }
    for (const theory of [...HP, 'hp-normality'] as const) {
      const match = blame(model, prior, { cause: 'M=1', effect: 'ES=1' }, theory, { normality })
      const loss = blame(model, prior, { cause: 'LL=1', effect: 'ES=1' }, theory, { normality })
      expect(match.degree, theory).toBeCloseTo(0.3 * 0.5 * 0.6 * 0.1, 12)
      expect(loss.degree, theory).toBeCloseTo(0.1, 12)
      // K holds X=x: conditioning on M=1 leaves 16 contexts; on LL=1, the two settings of EU.
      expect(match.rows).toHaveLength(16)
      expect(match.evidence).toBeCloseTo(0.9, 12)
      expect(loss.rows).toHaveLength(2)
    }
  })

  it('conditions on an observation: after seeing the suicide, the match is fully to blame', () => {
    const { model, prior } = faulkner()
    const r = blame(model, prior, { cause: 'M=1', effect: 'ES=1', given: 'ES=1' }, 'hp-modified')
    expect(r.degree).toBeCloseTo(1, 12)
    expect(r.rows).toHaveLength(1)
  })

  it('refuses but-for, conjunctions, and an epistemic state without the cause', () => {
    const { model, prior } = faulkner()
    const code = (c: string) => expect.objectContaining({ problem: expect.objectContaining({ code: c }) })
    expect(() => blame(model, prior, { cause: 'M=1', effect: 'ES=1' }, 'butfor' as never)).toThrow(code('responsibility-butfor'))
    expect(() => blame(model, prior, { cause: 'M=1 and R=1', effect: 'ES=1' }, 'hp-modified')).toThrow(code('responsibility-single-event'))
    expect(() => blame(model, prior, { cause: 'M=1', effect: 'ES=1', given: 'R=1 and RI=0' }, 'hp-modified')).toThrow(code('blame-no-mass'))
  })

  it('shares one work budget across the contexts', () => {
    // Nine marksmen: each context fits hp-original's budget on its own, all nine together do not.
    const { model, prior, context } = squad(Array(9).fill(1 / 9))
    for (let b = 1; b <= 9; b += 1) expect(responsibility(model, context(b), { cause: 'S1=1', effect: 'D=1' }, 'hp-original').degree).toBe(b === 1 ? 1 : 0)
    expect(() => blame(model, prior, { cause: 'S1=1', effect: 'D=1' }, 'hp-original')).toThrow(
      expect.objectContaining({ problem: expect.objectContaining({ code: 'search-budget' }) }),
    )
  })
})
