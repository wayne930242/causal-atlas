import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { CaseFile } from '../../data/schema.ts'
import type { LoadedCase } from '../../data/load.ts'
import { docToCase } from '../../data/model-doc.ts'
import { FRONT_DOOR_STEPS } from '../../demo/front-door-steps.ts'
import { LESSON_MODELS } from '../../demo/lesson-models.ts'
import type { Admg, CausalModel, DeriveResult, DoExpr, Prior } from '../../engine/index.ts'
import { admgForPrior, compareDoExprs, derive, identify, probExprText } from '../../engine/index.ts'
import { randomScm, seeded } from '../../engine/test-models.ts'
import type { DerivationViewStep, RuleStep } from './rules-view.ts'
import { SIDE_TOLERANCE, calculusView, derivationSteps, initialRuleState, isCalculus, ruleView, sideText } from './rules-view.ts'

/**
 * The anchor of the generated derivations: every step derive() writes, put through the rules
 * view's own check on the full model, is licensed (a rule step's pair is separated on its cut graph
 * and its two sides agree wherever they can be compared; a calculus step's sides agree wherever both
 * are defined), the steps chain from
 * P(y | do(x), w) to the last expression, and that expression equals identify()'s formula.
 */

function caseOf(id: string, model: CausalModel, prior: Prior): LoadedCase {
  return { data: { id } as CaseFile, model, prior }
}

interface Checked {
  readonly steps: readonly DerivationViewStep[]
  readonly verdicts: readonly string[]
}

function checkDerivation(c: LoadedCase, prior: Prior, d: DeriveResult & { identifiable: true }, formula: DoExpr): Checked {
  const steps = derivationSteps(d.steps)
  const where = `${c.data.id}: ${probExprText(d.query, { names: c.model.endogenous })}`
  const verdicts = steps.map((step, i) => {
    const label = `${where} step ${i + 1} (${stepText(step)})`
    if (isCalculus(step)) {
      const { check, verdict } = calculusView(c, prior, step)
      expect(check, label).toBeDefined()
      // Some lesson models have structural zeros at every assignment of an intermediate identity.
      expect(verdict, label).toBe(check?.comparison.rows === 0 ? 'unavailable' : 'holds')
      return verdict
    }
    const view = ruleView(c, prior, step, initialRuleState(c, step))
    expect(['applies', 'swap'], label).toContain(view.verdict)
    return view.verdict
  })
  // The chain: from the query, each step continuing the last, to the formula.
  expect(d.steps[0]?.from ?? d.query).toEqual(d.query)
  for (let i = 1; i < d.steps.length; i++) expect(d.steps[i].from, `${where} step ${i + 1}`).toBe(d.steps[i - 1].to)
  const last = d.steps.length === 0 ? d.query : d.steps[d.steps.length - 1].to
  expect(last).toEqual(d.formula)
  expect(d.matches, `${where}: ${d.text}`).toBe(true)
  expect(d.formula).toEqual(formula)
  const end = compareDoExprs(c.model, prior, d.query, d.formula, SIDE_TOLERANCE)
  expect(end.differsAt, `${where}: ${d.text} against do()`).toBeUndefined()
  expect(end.rows).toBeGreaterThan(0)
  return { steps, verdicts }
}

function stepText(s: DerivationViewStep): string {
  const [a, b] = s.symbolic ?? []
  if (a === undefined || b === undefined) return s.label
  const t = (e: DoExpr): string => probExprText(e, { names: ['W', 'X', 'Y', 'Z'] })
  return `${isCalculus(s) ? s.calculus : `R${s.rule}`} ${t(a)} = ${t(b)}`
}

const NAMED: Record<string, readonly [Admg, readonly string[], readonly string[]]> = {
  backdoor: [{ nodes: ['Z', 'X', 'Y'], directed: [['Z', 'X'], ['Z', 'Y'], ['X', 'Y']], bidirected: [] }, ['Y'], ['X']],
  frontdoor: [{ nodes: ['X', 'Z', 'Y'], directed: [['X', 'Z'], ['Z', 'Y']], bidirected: [['X', 'Y']] }, ['Y'], ['X']],
  napkin: [{ nodes: ['W', 'Z', 'X', 'Y'], directed: [['W', 'Z'], ['Z', 'X'], ['X', 'Y']], bidirected: [['W', 'X'], ['W', 'Y']] }, ['Y'], ['X']],
}

function named(id: keyof typeof NAMED): { c: LoadedCase; prior: Prior; d: DeriveResult & { identifiable: true }; checked: Checked } {
  const [g, y, x] = NAMED[id]
  const { model, prior } = randomScm(g, 7)
  const c = caseOf(id, model, prior)
  const d = derive(g, y, x)
  const r = identify(g, y, x)
  if (!d.identifiable || !r.identifiable) throw new Error(`${id} is identifiable`)
  return { c, prior, d, checked: checkDerivation(c, prior, d, r.formula) }
}

/** A rule step as `R2 P(z|do(x)) = P(z|x)` and a calculus step by its kind, in Pearl's lower case. */
function outline(steps: readonly DerivationViewStep[], names: readonly string[]): string[] {
  const t = (e: DoExpr): string => probExprText(e, { names })
  return steps.map((s) => {
    const [a, b] = s.symbolic ?? []
    if (a === undefined || b === undefined) return s.label
    return `${isCalculus(s) ? s.calculus : `R${s.rule}`}: ${t(a)} = ${t(b)}`
  })
}

describe('derived steps pass the rules check on the full model', () => {
  it('backdoor', () => {
    const { checked, d } = named('backdoor')
    expect(d.matches).toBe(true)
    expect(outline(checked.steps, NAMED.backdoor[0].nodes)).toMatchInlineSnapshot(`
      [
        "expand: P(y|do(x)) = Σ_z P(y,z|do(x))",
        "chain: P(y,z|do(x)) = P(z|do(x)) P(y|do(x),z)",
        "R3: P(z|do(x)) = P(z)",
        "R2: P(y|do(x),z) = P(y|x,z)",
        "simplify: Σ_z P(z) P(y|x,z) = Σ_z P(y|x,z) P(z)",
      ]
    `)
  })

  it('frontdoor', () => {
    const { checked, d } = named('frontdoor')
    expect(d.matches).toBe(true)
    expect(outline(checked.steps, NAMED.frontdoor[0].nodes)).toMatchInlineSnapshot(`
      [
        "expand: P(y|do(x)) = Σ_z P(y,z|do(x))",
        "chain: P(y,z|do(x)) = P(z|do(x)) P(y|do(x),z)",
        "R2: P(z|do(x)) = P(z|x)",
        "R2: P(y|do(x),z) = P(y|do(x,z))",
        "R3: P(y|do(x,z)) = P(y|do(z))",
        "expand: P(y|do(z)) = Σ_x P(x,y|do(z))",
        "chain: P(x,y|do(z)) = P(x|do(z)) P(y|do(z),x)",
        "R3: P(x|do(z)) = P(x)",
        "R2: P(y|do(z),x) = P(y|x,z)",
        "simplify: Σ_z P(z|x) Σ_x' P(x') P(y|x',z) = Σ_z P(z|x) Σ_x' P(y|x',z) P(x')",
      ]
    `)
  })

  it('napkin', () => {
    const { checked, d } = named('napkin')
    expect(d.matches).toBe(true)
    expect(outline(checked.steps, NAMED.napkin[0].nodes)).toMatchInlineSnapshot(`
      [
        "R3: P(y|do(x)) = P(y|do(w,x,z))",
        "R2: P(y|do(w,x,z)) = P(y|do(w,z),x)",
        "conditional: P(y|do(w,z),x) = P(x,y|do(w,z)) / P(x|do(w,z))",
        "R3: P(x,y|do(w,z)) = P(x,y|do(z))",
        "expand: P(x,y|do(z)) = Σ_w P(w,x,y|do(z))",
        "chain: P(w,x,y|do(z)) = P(w|do(z)) P(x|do(z),w) P(y|do(z),w,x)",
        "R3: P(w|do(z)) = P(w)",
        "R2: P(x|do(z),w) = P(x|w,z)",
        "R2: P(y|do(z),w,x) = P(y|w,x,z)",
        "R3: P(x|do(w,z)) = P(x|do(z))",
        "expand: P(x|do(z)) = Σ_{w,y} P(w,x,y|do(z))",
        "substitute: P(w,x,y|do(z)) = P(w) P(x|w,z) P(y|w,x,z)",
        "simplify: [Σ_w P(w) P(x|w,z) P(y|w,x,z)] / [Σ_{w,y'} P(w) P(x|w,z) P(y'|w,x,z)] = [Σ_w P(x,y|w,z) P(w)] / [Σ_w P(x|w,z) P(w)]",
      ]
    `)
  })

  it('a derived rule step reads its graph and sides from the step: frontdoor P(y|do(x),z) = P(y|do(x,z))', () => {
    const { c, prior, checked } = named('frontdoor')
    const step = checked.steps.find((s): s is RuleStep => !isCalculus(s) && s.rule === 2 && s.pair[1] === 'Y') as RuleStep
    const view = ruleView(c, prior, step, initialRuleState(c, step))
    expect([step.pair, step.given, step.cutIn, step.cutOut]).toEqual([['Z', 'Y'], ['X'], ['X'], ['Z']])
    expect(view.symbolic?.comparison.rows).toBeGreaterThan(0)
    expect(view.verdict).toBe('applies')
  })

  it('a symbolic side that differs from its partner is a mismatch, though the pair is separated', () => {
    const { c, prior, checked } = named('frontdoor')
    const step = checked.steps.find((s): s is RuleStep => !isCalculus(s) && s.rule === 2 && s.pair[1] === 'Y') as RuleStep
    const [left] = step.symbolic ?? []
    if (left === undefined) throw new Error('symbolic')
    const wrong: RuleStep = { ...step, symbolic: [left, { kind: 'p', vars: ['Y'], given: ['X', 'Z'] }] }
    const view = ruleView(c, prior, wrong, initialRuleState(c, wrong))
    expect(view.result.separated).toBe(true)
    expect(view.verdict).toBe('mismatch')
  })
})

describe('frontdoor: generated against the hand-written FRONT_DOOR_STEPS', () => {
  it('lists the differences', () => {
    const { checked } = named('frontdoor')
    const generated = checked.steps.filter((s): s is RuleStep => !isCalculus(s))
    const shape = (s: RuleStep): string => `R${s.rule} pair ${s.pair.join(',')} | ${s.given.join(',')} cut in ${(s.cutIn ?? []).join(',')} out ${(s.cutOut ?? []).join(',')}`
    const hand = FRONT_DOOR_STEPS.map((s) => `${s.label}: ${shape(s)}: ${s.equal?.map(sideText).join(' = ')}`)
    const ours = generated.map((s) => `${shape(s)}: ${outline([s], ['X', 'Z', 'Y'])[0]}`)
    // The generated rule steps are the lesson's 2, 3, 4, 5a and 5b: the same rule, pair, known set and cuts.
    expect(generated.map(shape)).toEqual(FRONT_DOOR_STEPS.filter((s) => s.label !== '7').map(shape))
    expect({ hand, ours }).toMatchInlineSnapshot(`
      {
        "hand": [
          "2: R2 pair X,Z |  cut in  out X: P(Z=1 | do(X=1)) = P(Z=1 | X=1)",
          "3: R2 pair Z,Y | X cut in X out Z: P(Y=1 | Z=1, do(X=1)) = P(Y=1 | do(X=1, Z=1))",
          "4: R3 pair X,Y | Z cut in X,Z out : P(Y=1 | do(X=1, Z=1)) = P(Y=1 | do(Z=1))",
          "5a: R3 pair Z,X |  cut in Z out : P(X=1 | do(Z=1)) = P(X=1)",
          "5b: R2 pair Z,Y | X cut in  out Z: P(Y=1 | X=1, do(Z=1)) = P(Y=1 | X=1, Z=1)",
          "7: R2 pair X,Y |  cut in  out X: P(Y=1 | do(X=1)) = P(Y=1 | X=1)",
        ],
        "ours": [
          "R2 pair X,Z |  cut in  out X: R2: P(z|do(x)) = P(z|x)",
          "R2 pair Z,Y | X cut in X out Z: R2: P(y|do(x),z) = P(y|do(x,z))",
          "R3 pair X,Y | Z cut in X,Z out : R3: P(y|do(x,z)) = P(y|do(z))",
          "R3 pair Z,X |  cut in Z out : R3: P(x|do(z)) = P(x)",
          "R2 pair Z,Y | X cut in  out Z: R2: P(y|do(z),x) = P(y|x,z)",
        ],
      }
    `)
  })
})

interface DosearchStep {
  readonly from: string
  readonly to: string
  readonly rule: string
  readonly fromSets: { readonly y: readonly string[]; readonly x: readonly string[]; readonly w: readonly string[] }
  readonly toSets: { readonly y: readonly string[]; readonly x: readonly string[]; readonly w: readonly string[] }
}

const DERIVATIONS = new URL('../../../oracle/fixtures/derivations.json', import.meta.url)
const dosearch = JSON.parse(readFileSync(DERIVATIONS, 'utf8')) as Record<string, { readonly steps: readonly DosearchStep[] }>

/** A term as `P(Y|do(X),Z)` with sorted sets, in dosearch's notation and ours alike. */
function termKey(sets: DosearchStep['fromSets']): string {
  const s = (ids: readonly string[]): string => [...ids].sort().join(',')
  const cond = [sets.x.length > 0 ? `do(${s(sets.x)})` : '', sets.w.length > 0 ? s(sets.w) : ''].filter((p) => p !== '')
  return `P(${s(sets.y)}${cond.length > 0 ? `|${cond.join(',')}` : ''})`
}

function ourTerms(steps: readonly DerivationViewStep[]): { rules: string[]; terms: Set<string> } {
  const rules: string[] = []
  const terms = new Set<string>()
  const visit = (e: DoExpr): void => {
    if (e.kind === 'p') terms.add(termKey({ y: e.vars, x: e.do ?? [], w: e.given }))
    else if (e.kind === 'sum') visit(e.body)
    else if (e.kind === 'product') e.factors.forEach(visit)
    else {
      visit(e.num)
      visit(e.den)
    }
  }
  for (const s of steps) {
    rules.push(isCalculus(s) ? s.calculus : `R${s.rule}`)
    for (const side of s.symbolic ?? []) visit(side)
  }
  return { rules, terms }
}

describe('against dosearch (oracle/fixtures/derivations.json): rules used and intermediate terms', () => {
  function report(id: 'backdoor' | 'frontdoor' | 'napkin') {
    const { checked } = named(id)
    const theirs = dosearch[id].steps
    const theirTerms = new Set(theirs.flatMap((s) => [termKey(s.fromSets), termKey(s.toSets)]))
    const theirRules = theirs.map((s) => s.rule).filter((r) => r.startsWith('R'))
    const ours = ourTerms(checked.steps)
    return {
      dosearchRules: [...theirRules].sort().join(' '),
      ourRules: ours.rules.filter((r) => r.startsWith('R')).sort().join(' '),
      shared: [...theirTerms].filter((t) => ours.terms.has(t)).sort(),
      onlyDosearch: [...theirTerms].filter((t) => !ours.terms.has(t)).sort(),
      onlyOurs: [...ours.terms].filter((t) => !theirTerms.has(t)).sort(),
    }
  }

  it('backdoor and frontdoor use the same rules and every do-term dosearch writes; napkin takes a longer route', () => {
    expect({ backdoor: report('backdoor'), frontdoor: report('frontdoor'), napkin: report('napkin') }).toMatchInlineSnapshot(`
      {
        "backdoor": {
          "dosearchRules": "R2 R3",
          "onlyDosearch": [
            "P(X,Y,Z)",
          ],
          "onlyOurs": [],
          "ourRules": "R2 R3",
          "shared": [
            "P(Y,Z|do(X))",
            "P(Y|X,Z)",
            "P(Y|do(X))",
            "P(Y|do(X),Z)",
            "P(Z)",
            "P(Z|do(X))",
          ],
        },
        "frontdoor": {
          "dosearchRules": "R2 R2 R2 R3 R3",
          "onlyDosearch": [
            "P(X,Y,Z)",
            "P(X,Z)",
          ],
          "onlyOurs": [],
          "ourRules": "R2 R2 R2 R3 R3",
          "shared": [
            "P(X)",
            "P(X,Y|do(Z))",
            "P(X|do(Z))",
            "P(Y,Z|do(X))",
            "P(Y|X,Z)",
            "P(Y|do(X))",
            "P(Y|do(X),Z)",
            "P(Y|do(X,Z))",
            "P(Y|do(Z))",
            "P(Y|do(Z),X)",
            "P(Z|X)",
            "P(Z|do(X))",
          ],
        },
        "napkin": {
          "dosearchRules": "R2 R2 R3 R3",
          "onlyDosearch": [
            "P(W,X,Y,Z)",
            "P(X,Y|do(Z),W)",
            "P(Y|do(X,Z))",
            "P(Y|do(Z),X)",
          ],
          "onlyOurs": [
            "P(X,Y|do(W,Z))",
            "P(X|W,Z)",
            "P(X|do(W,Z))",
            "P(X|do(Z))",
            "P(X|do(Z),W)",
            "P(Y|W,X,Z)",
            "P(Y|do(W,X,Z))",
            "P(Y|do(W,Z),X)",
            "P(Y|do(Z),W,X)",
          ],
          "ourRules": "R2 R2 R2 R3 R3 R3 R3",
          "shared": [
            "P(W)",
            "P(W,X,Y|do(Z))",
            "P(W|do(Z))",
            "P(X,Y|W,Z)",
            "P(X,Y|do(Z))",
            "P(Y|do(X))",
          ],
        },
      }
    `)
  })
})

/** For each ordered pair (x, y) of observed variables with x an ancestor of y. */
function ancestorPairs(g: Admg): [string, string][] {
  const parents = new Map(g.nodes.map((v) => [v, g.directed.filter(([, to]) => to === v).map(([from]) => from)]))
  const pairs: [string, string][] = []
  for (const y of g.nodes) {
    const seen = new Set<string>()
    const stack = [...(parents.get(y) ?? [])]
    while (stack.length > 0) {
      const v = stack.pop() as string
      if (seen.has(v)) continue
      seen.add(v)
      stack.push(...(parents.get(v) ?? []))
    }
    for (const x of g.nodes) if (seen.has(x)) pairs.push([x, y])
  }
  return pairs
}

describe('every identifiable effect in the lesson models', () => {
  const withPriors = Object.entries(LESSON_MODELS).filter(([, doc]) => doc.priors !== undefined)
  const counts: Record<string, string> = {}
  for (const [id, doc] of withPriors) {
    it(id, () => {
      const c = docToCase(doc)
      const prior = c.prior
      if (prior === undefined) throw new Error('no prior')
      const g = admgForPrior(c.model, prior)
      let derived = 0
      let steps = 0
      let matched = 0
      for (const [x, y] of ancestorPairs(g)) {
        const d = derive(g, [y], [x])
        const r = identify(g, [y], [x])
        expect(d.identifiable).toBe(r.identifiable)
        if (!d.identifiable || !r.identifiable) continue
        checkDerivation({ ...c, data: { ...c.data, id } }, prior, d, r.formula)
        derived++
        steps += d.steps.length
        if (d.matches) matched++
      }
      counts[id] = `derived ${derived}, steps ${steps}, same formula ${matched}`
    })
  }
  it('records the counts', () => {
    expect(counts).toMatchInlineSnapshot(`
      {
        "m00-firing-squad-nervous": "derived 5, steps 41, same formula 5",
        "m01-burglary": "derived 1, steps 1, same formula 1",
        "m01-dice": "derived 0, steps 0, same formula 0",
        "m01-fork": "derived 2, steps 9, same formula 2",
        "m01-lesion-naive": "derived 1, steps 1, same formula 1",
        "m02-chain": "derived 3, steps 11, same formula 3",
        "m02-collider": "derived 2, steps 14, same formula 2",
        "m02-pearl-model1": "derived 0, steps 0, same formula 0",
        "m02-pearl-model2": "derived 1, steps 1, same formula 1",
        "m02-x-to-y": "derived 1, steps 1, same formula 1",
        "m02-y-to-x": "derived 1, steps 1, same formula 1",
        "m03-sprinkler": "derived 3, steps 13, same formula 3",
        "m04-admission": "derived 5, steps 37, same formula 5",
        "m04-gardener": "derived 10, steps 73, same formula 10",
        "m04-sprinkler-cpt": "derived 9, steps 87, same formula 9",
        "m04-tuned": "derived 1, steps 1, same formula 1",
        "m05-backdoor": "derived 6, steps 38, same formula 6",
        "m05-frontdoor": "derived 3, steps 18, same formula 3",
        "m05-pearl-table31": "derived 3, steps 13, same formula 3",
        "m06-bow-a": "derived 0, steps 0, same formula 0",
        "m06-bow-b": "derived 0, steps 0, same formula 0",
        "m06-rule1": "derived 3, steps 18, same formula 3",
        "m06-rule3-exception": "derived 1, steps 3, same formula 1",
        "m08-mediator-conditioning": "derived 2, steps 8, same formula 2",
        "m08-pill": "derived 3, steps 13, same formula 3",
        "m08-sex-department": "derived 2, steps 8, same formula 2",
        "m08-sex-department-clean": "derived 3, steps 13, same formula 3",
        "m10-doctor": "derived 1, steps 1, same formula 1",
        "m10-faulkner": "derived 20, steps 429, same formula 20",
        "m10-suzy-blame": "derived 3, steps 23, same formula 3",
        "m11-murder-lesion": "derived 0, steps 0, same formula 0",
      }
    `)
  })
})

describe('seeded random ADMGs', () => {
  const TRIALS = 120

  function randomAdmg(rand: () => number): Admg {
    const n = 3 + Math.floor(rand() * 3)
    const nodes = Array.from({ length: n }, (_, i) => `V${i}`)
    const directed: [string, string][] = []
    const bidirected: [string, string][] = []
    const maxArcs = n === 5 ? 2 : 3
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (rand() < 0.45) directed.push([nodes[i], nodes[j]])
        if (bidirected.length < maxArcs && rand() < 0.3) bidirected.push([nodes[i], nodes[j]])
      }
    }
    return { nodes, directed, bidirected }
  }

  function pick(rand: () => number, from: readonly string[], most: number): string[] {
    const pool = [...from]
    const out: string[] = []
    const count = 1 + Math.floor(rand() * most)
    while (out.length < count && pool.length > 0) out.push(...pool.splice(Math.floor(rand() * pool.length), 1))
    return out
  }

  it(`${TRIALS} cases: every step licensed, the chain ends at identify()'s formula, a hedge where identify() finds one`, () => {
    const rand = seeded(20261123)
    let ids = 0
    let withW = 0
    let nonIds = 0
    let matched = 0
    let steps = 0
    for (let t = 0; t < TRIALS; t++) {
      const g = randomAdmg(rand)
      const y = pick(rand, g.nodes.slice(1), 2)
      const x = pick(
        rand,
        g.nodes.filter((v) => !y.includes(v)),
        2,
      )
      const rest = g.nodes.filter((v) => !y.includes(v) && !x.includes(v))
      const w = rest.length > 0 && rand() < 0.35 ? pick(rand, rest, 1) : []
      const r = identify(g, y, x, w)
      const d = derive(g, y, x, w)
      if (!r.identifiable || !d.identifiable) {
        expect(d).toEqual(r)
        nonIds++
        continue
      }
      const { model, prior } = randomScm(g, 3000 + t)
      checkDerivation(caseOf(`random-${t}`, model, prior), prior, d, r.formula)
      ids++
      if (w.length > 0) withW++
      if (d.matches) matched++
      steps += d.steps.length
    }
    expect(ids).toBeGreaterThan(30)
    expect(withW).toBeGreaterThan(5)
    expect(nonIds).toBeGreaterThan(5)
    expect({ ids, withW, nonIds, matched, steps }).toMatchInlineSnapshot(`
      {
        "ids": 97,
        "matched": 97,
        "nonIds": 23,
        "steps": 391,
        "withW": 28,
      }
    `)
  })
})
