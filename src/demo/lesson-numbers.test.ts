import { describe, expect, it } from 'vitest'
import { docToCase, getCase } from '../data/index.ts'
import type { ModelDoc } from '../data/index.ts'
import type { Prior, ResponsibilityTheory } from '../engine/index.ts'
import { actualCause, blame, counterfactual, mediation, probability, responsibility } from '../engine/index.ts'
import { LESSON_MODELS } from './lesson-models.ts'

/**
 * The numbers the lessons on mediation (08) and responsibility and blame (10) quote, as the engine
 * computes them from the lesson model documents (src/demo/lesson-models). Probabilities and
 * contexts that Pearl and Halpern do not give are this site's own (本站自訂). The report that lists
 * these values for the lesson writers is /tmp/causal-gap/models-table.md; change one, change the
 * other.
 */

const HP: readonly ResponsibilityTheory[] = ['hp-original', 'hp-updated', 'hp-modified']

function doc(id: string): ModelDoc {
  const found = LESSON_MODELS[id]
  if (found === undefined) throw new Error(`no lesson model ${id}`)
  return found
}

/** A document with `context` is one actual world; the others carry the epistemic state in `priors`. */
function actual(id: string) {
  const c = docToCase(doc(id))
  if (c.context === undefined) throw new Error(`${id} has no context`)
  return { model: c.model, context: c.context }
}

/** The model of a document with `priors`, with its priors (or `priors`, an epistemic state in the same format). */
function stated(id: string, priors?: ModelDoc['priors'], edit?: (d: ModelDoc) => ModelDoc) {
  const base = edit === undefined ? doc(id) : edit(structuredClone(doc(id)))
  const c = docToCase({ ...base, context: undefined, priors: priors ?? base.priors })
  if (c.prior === undefined) throw new Error(`${id} has no priors`)
  return { model: c.model, prior: c.prior as Prior }
}

const close = (value: number | undefined, expected: number) => expect(value).toBeCloseTo(expected, 9)

describe('every new lesson model document', () => {
  it.each(['m08-pill', 'm08-pill-jones', 'm08-mediator-conditioning', 'm08-sex-department', 'm08-sex-department-clean', 'm10-vote-3-2', 'm10-vote-5-0', 'm10-suzy-blame', 'm10-doctor', 'm10-faulkner'])(
    '%s loads',
    (id) => {
      expect(() => docToCase(doc(id))).not.toThrow()
    },
  )
})

describe('08 m08-pill (Hesslow, Pearl 2009 pp. 126–127)', () => {
  const { model, prior } = stated('m08-pill')
  const r = mediation(model, prior, { treatment: 'X', mediators: ['Z'], outcome: 'Y=1', from: 0, to: 1, formula: true })

  it('the total effect is zero while the direct effect is positive and the indirect effect negative', () => {
    close(r.total, 0)
    close(r.naturalDirect, 0.15)
    close(r.naturalIndirect, -0.1875)
    close(r.reverseIndirect, 0.15)
    close(r.total, r.naturalDirect - r.reverseIndirect)
  })

  it('the controlled direct effect depends on the mediator (effect modification)', () => {
    expect(r.controlled.map((c) => [c.z.Z, c.value])).toEqual([
      [false, expect.closeTo(0.2, 9)],
      [true, expect.closeTo(0.1, 9)],
    ])
  })

  it('P(Y | do(X)) and P(Y | X) are both 0.25 under either value of X', () => {
    for (const x of [0, 1]) {
      close(probability(model, prior, { event: 'Y=1', do: { X: x } }).value, 0.25)
      close(probability(model, prior, { event: 'Y=1', given: `X=${x}` }).value, 0.25)
    }
  })

  it('the mediation formula recovers both natural effects and every cell has data', () => {
    close(r.formula?.direct, 0.15)
    close(r.formula?.indirect, -0.1875)
    expect(r.formula?.missing).toEqual([])
  })

  it('PN: P(no thrombosis had she not taken the pill | she took it and has thrombosis) = 0.6', () => {
    const cf = counterfactual(model, prior, { evidence: 'X=1 and Y=1', do: { X: 0 }, event: 'Y=0' })
    close(cf.evidenceProbability, 0.125)
    close(cf.probability, 0.6)
  })
})

describe('08 m08-pill-jones (Mrs Jones: took the pill, not pregnant, thrombosis)', () => {
  const { model, context } = actual('m08-pill-jones')
  const query = { cause: 'X=1', effect: 'Y=1' }

  it('but-for says the pill is not a cause; every HP version says it is, with the pregnancy held', () => {
    expect(actualCause(model, context, query, 'butfor').verdict).toBe('not-cause')
    for (const theory of HP) expect(actualCause(model, context, query, theory).verdict, theory).toBe('cause')
  })

  it('the pill has degree of responsibility 1/2 (witness: hold Z at its actual value)', () => {
    for (const theory of HP) {
      const r = responsibility(model, context, query, theory)
      expect(r, theory).toMatchObject({ degree: 0.5, k: 2, witness: { W: ['Z'] } })
    }
  })

  it('PN given she is not pregnant: 11/14', () => {
    const p = stated('m08-pill')
    const cf = counterfactual(p.model, p.prior, { evidence: 'X=1 and Z=0 and Y=1', do: { X: 0 }, event: 'Y=0' })
    close(cf.evidenceProbability, 0.0875)
    close(cf.probability, 11 / 14)
  })
})

describe('08 m08-mediator-conditioning (the pill with no direct effect, Pearl p. 127)', () => {
  const { model, prior } = stated('m08-mediator-conditioning')
  const P = (event: string, o: { given?: string; do?: Record<string, number> } = {}) => probability(model, prior, { event, ...o }).value

  it('conditioning on pregnancy makes the pill look harmful; holding it by intervention does not', () => {
    close(P('Y=1', { given: 'X=1 and Z=1' }), 0.7)
    close(P('Y=1', { given: 'X=0 and Z=1' }), 0.46)
    close(P('Y=1', { do: { X: 1, Z: 1 } }), 0.46)
    close(P('Y=1', { do: { X: 0, Z: 1 } }), 0.46)
  })

  it('among the women who are not pregnant, the spurious difference has the other sign', () => {
    close(P('Y=1', { given: 'X=1 and Z=0' }), 1 / 18)
    close(P('Y=1', { given: 'X=0 and Z=0' }), 0.1)
    close(P('Y=1', { do: { X: 1, Z: 0 } }), 0.1)
    close(P('Y=1', { do: { X: 0, Z: 0 } }), 0.1)
  })

  it('no direct effect: controlled and natural direct effects are 0, the total effect is all indirect', () => {
    const r = mediation(model, prior, { treatment: 'X', mediators: ['Z'], outcome: 'Y=1', from: 0, to: 1 })
    for (const c of r.controlled) close(c.value, 0)
    close(r.naturalDirect, 0)
    close(r.naturalIndirect, -0.16)
    close(r.total, -0.16)
    close(r.reverseIndirect, 0.16)
  })
})

describe('08 m08-sex-department (Pearl §4.5.3: sex, department, admission; aptitude unrecorded)', () => {
  const { model, prior } = stated('m08-sex-department')
  const query = { treatment: 'X', mediators: ['Z'], outcome: 'Y=1', from: 0, to: 1, formula: true } as const
  const r = mediation(model, prior, query)
  const P = (event: string, o: { given?: string; do?: Record<string, number> } = {}) => probability(model, prior, { event, ...o }).value

  it('admission rates: men 0.475, women 0.408 (the crude gap is the total effect)', () => {
    close(P('Y=1', { given: 'X=0' }), 0.475)
    close(P('Y=1', { given: 'X=1' }), 0.408)
    close(P('Z=1', { given: 'X=0' }), 0.75)
    close(P('Z=1', { given: 'X=1' }), 0.4)
    close(r.total, -0.067)
  })

  it('the natural direct effect (Carson: the same woman, a man on the form) is −0.095; the indirect effect +0.035', () => {
    close(r.naturalDirect, -0.095)
    close(r.naturalIndirect, 0.035)
    close(r.reverseIndirect, -0.028)
    close(r.total, r.naturalDirect - r.reverseIndirect)
    expect(r.controlled.map((c) => [c.z.Z, c.value])).toEqual([
      [false, expect.closeTo(-0.11, 9)],
      [true, expect.closeTo(-0.09, 9)],
    ])
  })

  it('the mediation formula and the department-adjusted rates point the wrong way (+0.115, +0.1115)', () => {
    close(r.formula?.direct, 0.115)
    close(r.formula?.indirect, -0.175)
    expect(r.formula?.missing).toEqual([])
    const adjusted = (x: number) => [0, 1].reduce((sum, z) => sum + P('Y=1', { given: `X=${x} and Z=${z}` }) * P(`Z=${z}`), 0)
    close(adjusted(0), 0.3875)
    close(adjusted(1), 0.499)
    close(P('Y=1', { given: 'X=0 and Z=0' }), 0.1)
    close(P('Y=1', { given: 'X=0 and Z=1' }), 0.6)
    close(P('Y=1', { given: 'X=1 and Z=0' }), 0.2)
    close(P('Y=1', { given: 'X=1 and Z=1' }), 0.72)
  })

  it('with the aptitude arc to admission removed (m08-sex-department-clean), the mediation formula equals the natural effects', () => {
    const clean = stated('m08-sex-department-clean')
    const c = mediation(clean.model, clean.prior, query)
    close(c.total, -0.364)
    close(c.naturalDirect, -0.14)
    close(c.naturalIndirect, -0.28)
    close(c.reverseIndirect, 0.224)
    close(c.total, c.naturalDirect - c.reverseIndirect)
    close(c.formula?.direct, c.naturalDirect)
    close(c.formula?.indirect, c.naturalIndirect)
    expect(c.formula?.missing).toEqual([])
  })

  it('the clean document is the same model with only Y\'s equation and the arc changed', () => {
    const a = doc('m08-sex-department')
    const b = doc('m08-sex-department-clean')
    expect(b.model.variables.map((v) => v.id)).toEqual(a.model.variables.map((v) => v.id))
    expect(b.priors).toEqual(a.priors)
    expect(b.model.equations).toEqual({ ...a.model.equations, Y: '(if Z then N_Y1 else N_Y0) and not (X and N_D)' })
    expect(b.latent_as_arcs).toBeUndefined()
  })
})

describe('10 m10-vote-3-2 and m10-vote-5-0 (five members, no tally variables)', () => {
  const effect = 'W=1'

  it('3–2: a member of the majority has responsibility 1 under every version', () => {
    const { model, context } = actual('m10-vote-3-2')
    expect(actualCause(model, context, { cause: 'V1=1', effect }, 'butfor').verdict).toBe('cause')
    for (const theory of HP) expect(responsibility(model, context, { cause: 'V1=1', effect }, theory), theory).toMatchObject({ degree: 1, k: 1 })
  })

  it('3–2: a member of the minority has responsibility 0', () => {
    const { model, context } = actual('m10-vote-3-2')
    for (const theory of HP) expect(responsibility(model, context, { cause: 'V4=0', effect }, theory).degree, theory).toBe(0)
  })

  it('5–0: no but-for cause, responsibility 1/3 under every version', () => {
    const { model, context } = actual('m10-vote-5-0')
    expect(actualCause(model, context, { cause: 'V1=1', effect }, 'butfor').verdict).toBe('not-cause')
    for (const theory of HP) {
      const r = responsibility(model, context, { cause: 'V1=1', effect }, theory)
      close(r.degree, 1 / 3)
      expect(r.k, theory).toBe(3)
    }
  })

  it('5–0: original and updated hold two other members at their votes; modified takes a three-member cause', () => {
    const { model, context } = actual('m10-vote-5-0')
    for (const theory of ['hp-original', 'hp-updated'] as const) {
      const r = responsibility(model, context, { cause: 'V1=1', effect }, theory)
      expect(r).toMatchObject({ verdict: 'cause', cause: { V1: true } })
      expect(r.witness?.W).toHaveLength(2)
    }
    expect(responsibility(model, context, { cause: 'V1=1', effect }, 'hp-modified')).toMatchObject({
      verdict: 'part-of-cause',
      cause: { V1: true, V2: true, V3: true },
      witness: { W: [] },
    })
  })
})

describe('10 bundled cases the lesson quotes beside the votes (Halpern Ex. 6.1.3, 6.1.5)', () => {
  const dr = (id: string, cause: string, theory: ResponsibilityTheory) => {
    const c = getCase(id)
    if (c.context === undefined) throw new Error(id)
    return responsibility(c.model, c.context, { cause, effect: id.startsWith('forest') ? 'FF=1' : 'BS=1' }, theory).degree
  }

  it('forest fire: conjunctive 1, disjunctive 1/2', () => {
    for (const theory of HP) {
      expect(dr('forest-fire-conjunctive', 'L=1', theory), theory).toBe(1)
      expect(dr('forest-fire-disjunctive', 'L=1', theory), theory).toBe(0.5)
    }
  })

  it('rock throwing: Suzy 1/2, Billy 0 in the refined model; 1/2 each in the coarse one', () => {
    for (const theory of HP) {
      expect(dr('rock-throwing', 'ST=1', theory), theory).toBe(0.5)
      expect(dr('rock-throwing', 'BT=1', theory), theory).toBe(0)
    }
    const { model, context } = actual('m09-rock-coarse')
    for (const theory of HP) {
      for (const cause of ['ST=1', 'BT=1']) expect(responsibility(model, context, { cause, effect: 'BS=1' }, theory).degree, `${theory} ${cause}`).toBe(0.5)
    }
  })
})

describe('10 m10-suzy-blame (Halpern Ex. 6.2.2)', () => {
  const { model, prior } = stated('m10-suzy-blame')

  it("Suzy's blame for the broken bottle is 1/2 under every version", () => {
    for (const theory of HP) {
      const r = blame(model, prior, { cause: 'ST=1', effect: 'BS=1' }, theory)
      close(r.degree, 0.5)
      expect(r.rows.map((row) => row.p)).toEqual([0.25, 0.25, 0.25, 0.25])
      expect(r.rows.map((row) => row.responsibility), theory).toEqual([0, 0.5, 0.5, 1])
    }
  })
})

describe('10 m10-doctor (Halpern Ex. 6.2.4; probabilities ours)', () => {
  const states: Record<string, { s: number; given?: string; blame: number; rows: number }> = {
    // The doctor does not consider the side effect possible.
    actual: { s: 0, blame: 0, rows: 4 },
    // What he should have known: the drug has the side effect, one patient in three has high blood pressure.
    should: { s: 1, blame: 0.285, rows: 4 },
    // After testing the blood pressure and finding it high.
    tested: { s: 1, given: 'H=1', blame: 0.95, rows: 2 },
    // After the patient died, on the state he should have had.
    died: { s: 1, given: 'D=1', blame: 0.85074626865, rows: 3 },
    // On his actual state the death changes nothing: he still rules the side effect out.
    'actual, then died': { s: 0, given: 'D=1', blame: 0, rows: 2 },
    // A doctor with a hunch (one chance in ten that the drug has the side effect), before and after the death.
    hunch: { s: 0.1, blame: 0.0285, rows: 8 },
    'hunch, then died': { s: 0.1, given: 'D=1', blame: 0.36305732484, rows: 5 },
  }

  it.each(Object.entries(states))('blame, %s', (_, { s, given, blame: expected, rows }) => {
    const { model, prior } = stated('m10-doctor', { independent: { S: s, H: 0.3, N: 0.05, U_T: 1 } })
    for (const theory of HP) {
      const r = blame(model, prior, { cause: 'T=1', effect: 'D=1', given }, theory)
      expect(r.degree, theory).toBeCloseTo(expected, 9)
      expect(r.rows, theory).toHaveLength(rows)
    }
  })

  it("the document's own priors are the state he should have had", () => {
    const { model, prior } = stated('m10-doctor')
    close(blame(model, prior, { cause: 'T=1', effect: 'D=1' }, 'hp-modified').degree, 0.285)
  })

  it('responsibility is 1 where the drug kills (S, H, no other cause) and 0 elsewhere', () => {
    const c = docToCase({ ...doc('m10-doctor'), priors: undefined, context: { S: 1, H: 1, N: 0, U_T: 1 } })
    if (c.context === undefined) throw new Error('context')
    for (const theory of HP) expect(responsibility(c.model, c.context, { cause: 'T=1', effect: 'D=1' }, theory).degree, theory).toBe(1)
  })
})

describe('10 m10-faulkner (Halpern §3.4.4, Ex. 6.2.7; probabilities ours)', () => {
  const { model, prior } = stated('m10-faulkner')
  const normality = { M: false, R: false, F: false, LI: false, EU: false }
  const theories = [...HP, 'hp-normality'] as const
  // P(R) = 0.3, P(F) = 0.5, P(LI) = 0.6, P(EU) = 0.1.

  it('every link of the chain is a cause with responsibility 1 in the actual context', () => {
    const context = { U_M: true, U_R: true, U_F: true, U_LI: true, U_EU: true }
    for (const cause of ['M=1', 'RI=1', 'SD=1', 'LL=1']) {
      for (const theory of HP) expect(responsibility(model, context, { cause, effect: 'ES=1' }, theory).degree, `${theory} ${cause}`).toBe(1)
    }
  })

  it("the match's blame is P(R)P(F)P(LI)P(EU) = 0.009; Lloyd's loss P(EU) = 0.1; after the suicide the match's is 1", () => {
    for (const theory of theories) {
      const match = blame(model, prior, { cause: 'M=1', effect: 'ES=1' }, theory, { normality })
      const loss = blame(model, prior, { cause: 'LL=1', effect: 'ES=1' }, theory, { normality })
      const after = blame(model, prior, { cause: 'M=1', effect: 'ES=1', given: 'ES=1' }, theory, { normality })
      close(match.degree, 0.009)
      close(loss.degree, 0.1)
      close(after.degree, 1)
      expect(match.rows, theory).toHaveLength(16)
      expect(loss.rows, theory).toHaveLength(2)
    }
  })
})
