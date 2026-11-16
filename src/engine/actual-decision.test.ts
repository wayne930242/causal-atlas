import { describe, expect, it } from 'vitest'
import { actualCause, atLeastAsNormal } from './actual.ts'
import { evaluateDecision } from './decision.ts'
import { buildModel } from './model.ts'
import { pointMass } from './probability.ts'
import { flower, forestFire, rockThrowing, variable } from './test-models.ts'

const rockContext = { U_ST: 1, U_BT: 1 }

describe('actual causation: rock throwing (preemption)', () => {
  const rock = rockThrowing()

  it('ST=1 is an HP cause of BS=1, witnessed by holding BH at 0', () => {
    const result = actualCause(rock, rockContext, { cause: 'ST=1', effect: 'BS=1' }, 'hp-modified')
    expect(result.verdict).toBe('cause')
    expect(result.check.witness).toMatchObject({ W: ['BH'], w: { BH: false }, xPrime: { ST: false } })
    expect(result.check.witness?.world).toMatchObject({ ST: false, BH: false, BS: false })
  })

  it('BT=1 is not an HP cause, nor part of one', () => {
    expect(actualCause(rock, rockContext, { cause: 'BT=1', effect: 'BS=1' }, 'hp-modified').verdict).toBe('not-cause')
  })

  it('ST=1 is not a but-for cause', () => {
    const result = actualCause(rock, rockContext, { cause: 'ST=1', effect: 'BS=1' }, 'butfor')
    expect(result.verdict).toBe('not-cause')
    expect(result.check.witness).toBeUndefined()
  })

  it('AC3: ST=1 ∧ BT=1 is a but-for cause but not a minimal HP cause', () => {
    expect(actualCause(rock, rockContext, { cause: 'ST=1 and BT=1', effect: 'BS=1' }, 'butfor').verdict).toBe('cause')
    const hp = actualCause(rock, rockContext, { cause: { ST: 1, BT: 1 }, effect: 'BS=1' }, 'hp-modified')
    expect(hp.verdict).toBe('not-cause')
    expect(hp.check.witness).toBeDefined()
    expect(hp.check.smallerCause?.cause).toEqual({ ST: true })
  })

  it('rejects malformed causes', () => {
    const run = (cause: string) => actualCause(rock, rockContext, { cause, effect: 'BS=1' }, 'hp-modified')
    expect(() => run('ST=1 and ST=0')).toThrow(/mentions ST twice/)
    expect(() => run('U_ST=1')).toThrow(/must be endogenous/)
    expect(() => run('ST=1 or BT=1')).toThrow(/conjunction/)
  })

  it('AC1: an event that did not happen is no cause', () => {
    const result = actualCause(rock, rockContext, { cause: 'BH=1', effect: 'BS=1' }, 'hp-modified')
    expect(result.verdict).toBe('not-cause')
    expect(result.check.ac1).toBe(false)
  })
})

describe('actual causation: forest fire', () => {
  const both = { U_L: 1, U_MD: 1 }

  it('disjunctive: each source is only part of the conjunctive cause', () => {
    const model = forestFire('or')
    expect(actualCause(model, both, { cause: 'L=1', effect: 'FF=1' }, 'butfor').verdict).toBe('not-cause')
    const single = actualCause(model, both, { cause: 'L=1', effect: 'FF=1' }, 'hp-modified')
    expect(single.verdict).toBe('part-of-cause')
    expect(single.containedIn?.cause).toEqual({ L: true, MD: true })
    const pair = actualCause(model, both, { cause: 'L=1 and MD=1', effect: 'FF=1' }, 'hp-modified')
    expect(pair.verdict).toBe('cause')
    expect(pair.check.witness).toMatchObject({ W: [], xPrime: { L: false, MD: false } })
  })

  it('conjunctive: each source is a but-for and an HP cause', () => {
    const model = forestFire('and')
    expect(actualCause(model, both, { cause: 'L=1', effect: 'FF=1' }, 'butfor').verdict).toBe('cause')
    expect(actualCause(model, both, { cause: 'MD=1', effect: 'FF=1' }, 'hp-modified').verdict).toBe('cause')
  })
})

describe('actual causation with normality', () => {
  const model = flower()
  const context = { U_G: 0, U_Q: 0 }
  const normality = { GW: 1, QW: 0, D: 0 }

  it('orders worlds by inclusion of deviant sets', () => {
    expect(atLeastAsNormal({ GW: true, QW: false, D: false }, { GW: false, QW: false, D: true }, normality)).toBe(true)
    expect(atLeastAsNormal({ GW: false, QW: true, D: false }, { GW: false, QW: false, D: true }, normality)).toBe(false)
  })

  it("the gardener's omission is a cause; the Queen's only without normality", () => {
    const q = { cause: 'QW=0', effect: 'D=1' }
    expect(actualCause(model, context, q, 'hp-modified').verdict).toBe('cause')
    expect(actualCause(model, context, q, 'hp-normality', { normality }).verdict).toBe('not-cause')
    const gardener = actualCause(model, context, { cause: 'GW=0', effect: 'D=1' }, 'hp-normality', { normality })
    expect(gardener.verdict).toBe('cause')
    expect(gardener.check.witness?.world).toMatchObject({ GW: true, D: false })
  })

  it('needs defaults', () => {
    expect(() => actualCause(model, context, { cause: 'QW=0', effect: 'D=1' }, 'hp-normality')).toThrow(/normal/)
  })
})

describe('decision problems', () => {
  // A common cause T drives both the act and the outcome; the act itself is harmless.
  const model = buildModel({
    variables: [variable('T', 'exogenous'), variable('A', 'endogenous'), variable('O', 'endogenous')],
    equations: { A: 'T', O: 'T' },
  })
  const prior = {
    kind: 'independent' as const,
    marginals: {
      T: [
        { value: 1, p: 0.5 },
        { value: 0, p: 0.5 },
      ],
    },
  }
  const utility = {
    variables: ['A', 'O'],
    rows: [
      { when: [1, 1], utility: -90 },
      { when: [1, 0], utility: 10 },
      { when: [0, 1], utility: -100 },
      { when: [0, 0], utility: 0 },
    ],
  }

  it('EDT conditions on the act, CDT intervenes on it', () => {
    const result = evaluateDecision(model, prior, { act: 'A', utility })
    const byAct = new Map(result.acts.map((a) => [a.act, a]))
    expect(byAct.get(true)?.edt?.eu).toBeCloseTo(-90, 12)
    expect(byAct.get(false)?.edt?.eu).toBeCloseTo(0, 12)
    expect(byAct.get(true)?.cdt.eu).toBeCloseTo(-40, 12)
    expect(byAct.get(false)?.cdt.eu).toBeCloseTo(-50, 12)
    expect(result.edtChoice).toEqual([false])
    expect(result.cdtChoice).toEqual([true])
  })

  it('leaves EDT undefined for acts of probability zero and reports missing utilities', () => {
    const result = evaluateDecision(model, pointMass({ T: 1 }), { act: 'A', utility })
    expect(result.acts.find((a) => a.act === false)?.edt).toBeUndefined()
    expect(result.edtChoice).toEqual([true])
    expect(() => evaluateDecision(model, prior, { act: 'A', utility: { variables: ['O'], rows: [] } })).toThrow(/no row/)
  })
})
