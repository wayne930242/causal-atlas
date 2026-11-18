import { describe, expect, it } from 'vitest'
import { listCases } from '../data/index.ts'
import type { CausalModel, ResponsibilityTheory } from './index.ts'
import { actualCause, buildModel, parseCause, responsibility } from './index.ts'
import { forestFire, rockThrowing, variable } from './test-models.ts'

const HP: readonly ResponsibilityTheory[] = ['hp-original', 'hp-updated', 'hp-modified']

function choose(items: readonly string[], k: number): string[][] {
  if (k === 0) return [[]]
  if (items.length < k) return []
  const [head, ...tail] = items
  return [...choose(tail, k - 1).map((s) => [head, ...s]), ...choose(tail, k)]
}

/** Majority vote over V0..V(n-1) as a DNF (no tally variables); `votes` gives each voter's vote. */
function majority(votes: readonly boolean[]): { model: CausalModel; context: Record<string, boolean> } {
  const ids = votes.map((_, i) => `V${i}`)
  const model = buildModel({
    variables: [...ids.map((_, i) => variable(`U${i}`, 'exogenous')), ...ids.map((id) => variable(id, 'endogenous')), variable('W', 'endogenous')],
    equations: {
      ...Object.fromEntries(ids.map((id, i) => [id, `U${i}`])),
      W: choose(ids, Math.floor(ids.length / 2) + 1)
        .map((s) => `(${s.join(' and ')})`)
        .join(' or '),
    },
  })
  return { model, context: Object.fromEntries(votes.map((v, i) => [`U${i}`, v])) }
}

describe('degree of responsibility (Halpern 2016, ch. 6)', () => {
  // Ex. 6.1.2 and p. 177: a voter for the winner of an a–b vote has responsibility 1/⌈(a−b)/2⌉.
  it.each([
    [3, 2],
    [4, 1],
    [5, 0],
    [7, 0],
  ])('voting %i–%i: 1/⌈(a−b)/2⌉ under every version', (a, b) => {
    const { model, context } = majority([...Array(a).fill(true), ...Array(b).fill(false)])
    for (const theory of HP) {
      const r = responsibility(model, context, { cause: 'V0=1', effect: 'W=1' }, theory)
      expect(r.degree, theory).toBeCloseTo(1 / Math.ceil((a - b) / 2), 12)
      expect(r.verdict, theory).toBe(actualCause(model, context, { cause: 'V0=1', effect: 'W=1' }, theory).verdict)
    }
  })

  it('5–0 under the modified definition: a three-voter cause with an empty witness (k = |W| + |X|)', () => {
    const { model, context } = majority([true, true, true, true, true])
    const modified = responsibility(model, context, { cause: 'V0=1', effect: 'W=1' }, 'hp-modified')
    expect(modified).toMatchObject({ verdict: 'part-of-cause', k: 3, cause: { V0: true, V1: true, V2: true }, witness: { W: [] } })
    const original = responsibility(model, context, { cause: 'V0=1', effect: 'W=1' }, 'hp-original')
    expect(original).toMatchObject({ verdict: 'cause', k: 3, cause: { V0: true } })
    expect(original.witness?.W).toHaveLength(2)
  })

  it('a voter for the loser is not responsible', () => {
    const { model, context } = majority([false, true, true, true, false])
    for (const theory of HP) expect(responsibility(model, context, { cause: 'V0=0', effect: 'W=1' }, theory).degree).toBe(0)
  })

  it('Ex. 6.1.3 forest fire: conjunctive 1, disjunctive 1/2', () => {
    for (const theory of HP) {
      expect(responsibility(forestFire('and'), { U_L: true, U_MD: true }, { cause: 'L=1', effect: 'FF=1' }, theory).degree).toBe(1)
      expect(responsibility(forestFire('or'), { U_L: true, U_MD: true }, { cause: 'L=1', effect: 'FF=1' }, theory).degree).toBe(0.5)
    }
  })

  it('Ex. 6.1.4: A=0 has responsibility 1/2 for C=0 (B held at its actual value)', () => {
    const model = buildModel({
      variables: [variable('U', 'exogenous'), variable('A', 'endogenous'), variable('B', 'endogenous'), variable('C', 'endogenous')],
      equations: { A: 'U', B: 'A', C: 'not (A = B)' },
    })
    for (const theory of HP) {
      const r = responsibility(model, { U: false }, { cause: 'A=0', effect: 'C=0' }, theory)
      expect(r.degree, theory).toBe(0.5)
      expect(r.witness?.W, theory).toEqual(['B'])
    }
  })

  it('Ex. 6.1.5 rock throwing: naive model 1/2 each; sophisticated model Suzy 1/2, Billy 0', () => {
    const naive = buildModel({
      variables: [variable('U_ST', 'exogenous'), variable('U_BT', 'exogenous'), variable('ST', 'endogenous'), variable('BT', 'endogenous'), variable('BS', 'endogenous')],
      equations: { ST: 'U_ST', BT: 'U_BT', BS: 'ST or BT' },
    })
    const u = { U_ST: true, U_BT: true }
    for (const theory of HP) {
      expect(responsibility(naive, u, { cause: 'ST=1', effect: 'BS=1' }, theory).degree).toBe(0.5)
      expect(responsibility(naive, u, { cause: 'BT=1', effect: 'BS=1' }, theory).degree).toBe(0.5)
      expect(responsibility(rockThrowing(), u, { cause: 'ST=1', effect: 'BS=1' }, theory).degree).toBe(0.5)
      const billy = responsibility(rockThrowing(), u, { cause: 'BT=1', effect: 'BS=1' }, theory)
      expect(billy).toMatchObject({ degree: 0, verdict: 'not-cause' })
      expect(billy.k).toBeUndefined()
    }
  })

  it('hp-normality only counts witness worlds at least as normal as the actual one', () => {
    const { model, context } = majority([true, true, true, true, false])
    const query = { cause: 'V0=1', effect: 'W=1' }
    const ids = ['V0', 'V1', 'V2', 'V3', 'V4']
    // Voting 0 is normal: every witness (voters switched to 0) is more normal; 1/2 as under hp-modified.
    expect(responsibility(model, context, query, 'hp-normality', { normality: Object.fromEntries(ids.map((id) => [id, false])) }).degree).toBe(0.5)
    // Voting 1 is normal: switching any voter to 0 is a deviation the actual world lacks.
    expect(responsibility(model, context, query, 'hp-normality', { normality: Object.fromEntries(ids.map((id) => [id, true])) })).toMatchObject({
      degree: 0,
      verdict: 'not-cause',
    })
  })

  it('is 0 when AC1 fails', () => {
    const r = responsibility(forestFire('or'), { U_L: false, U_MD: true }, { cause: 'L=1', effect: 'FF=1' }, 'hp-modified')
    expect(r).toMatchObject({ degree: 0, verdict: 'not-cause' })
  })

  it('refuses but-for and conjunctive causes', () => {
    const u = { U_L: true, U_MD: true }
    expect(() => responsibility(forestFire('or'), u, { cause: 'L=1', effect: 'FF=1' }, 'butfor' as never)).toThrow(
      expect.objectContaining({ problem: expect.objectContaining({ code: 'responsibility-butfor' }) }),
    )
    expect(() => responsibility(forestFire('or'), u, { cause: 'L=1 and MD=1', effect: 'FF=1' }, 'hp-modified')).toThrow(
      expect.objectContaining({ problem: expect.objectContaining({ code: 'responsibility-single-event' }) }),
    )
  })

  it("stops Halpern's 11–0 vote at the work budget", () => {
    const { model, context } = majority(Array(11).fill(true))
    expect(() => responsibility(model, context, { cause: 'V0=1', effect: 'W=1' }, 'hp-original')).toThrow(
      expect.objectContaining({ problem: expect.objectContaining({ code: 'search-budget' }) }),
    )
  })
})

const isHp = (theory: string): theory is ResponsibilityTheory => (HP as readonly string[]).includes(theory) || theory === 'hp-normality'

describe('responsibility on the bundled cases', () => {
  // Every HP verdict query with a context and a single-event cause: the verdict is actualCause's,
  // and the degree is positive exactly when X=x is (part of) a cause.
  const subjects: { name: string; index: number; theory: ResponsibilityTheory }[] = []
  for (const c of listCases()) {
    if (c.context === undefined) continue
    c.data.verdicts.forEach((v, index) => {
      if (!isHp(v.theory) || !('cause' in v.query) || !('effect' in v.query)) return
      if (Object.keys(parseCause(c.model, v.query.cause)).length !== 1) return
      subjects.push({ name: c.data.id, index, theory: v.theory })
    })
  }
  const cases = new Map(listCases().map((c) => [c.data.id, c]))

  it('has subjects', () => {
    expect(subjects.length).toBeGreaterThan(20)
  })

  it.each(subjects)('$name #$index ($theory)', ({ name, index }) => {
    const c = cases.get(name)
    if (c === undefined || c.context === undefined) throw new Error(name)
    const v = c.data.verdicts[index]
    if (!isHp(v.theory) || !('cause' in v.query) || !('effect' in v.query)) throw new Error(name)
    const query = { cause: v.query.cause, effect: v.query.effect }
    const options = { normality: c.normality }
    const verdict = actualCause(c.model, c.context, query, v.theory, options).verdict
    const r = responsibility(c.model, c.context, query, v.theory, options)
    expect(r.verdict).toBe(verdict)
    expect(r.degree > 0).toBe(verdict !== 'not-cause')
    if (r.k !== undefined) expect(r.degree).toBe(1 / r.k)
  })
})
