import { describe, expect, it } from 'vitest'
import { modalProblemOf } from './errors.ts'
import { ModalEvaluator } from './evaluate.ts'
import type { Formula } from './formula.ts'
import { F, parseFormula } from './formula.ts'
import { TCS_PATTERNS, checkInference, checkInferenceAt, tcsInference } from './inference.ts'
import type { ModalModel } from './model.ts'
import { collapseSpheres, sphereModel } from './model.ts'
import { rng } from './test-random.ts'
import { distances, similaritySpheres, withSimilaritySpheres } from './similarity.ts'
import { equationOrder, literalsOf, surgery, worldWith } from './surgery.ts'

const p = (text: string): Formula => parseFormula(text)

function caught(f: () => unknown): unknown {
  try {
    f()
  } catch (error) {
    return error
  }
  return undefined
}

// Appendix D's programmer: the two closest worlds where I am a programmer differ on whether I am dissatisfied.
const PROGRAMMER = sphereModel({
  atoms: ['prog', 'unhappy'],
  worlds: [
    { id: 'w', true: ['unhappy'] },
    { id: 'v1', true: ['prog', 'unhappy'] },
    { id: 'v2', true: ['prog'] },
    { id: 'v3', true: [] },
  ],
  systems: {
    w: [['w'], ['w', 'v1', 'v2'], ['w', 'v1', 'v2', 'v3']],
  },
})

/** A strongly centred random system of spheres around every world. */
function randomSpheres(random: () => number, n: number, atoms: readonly string[]): ModalModel {
  const worlds = Array.from({ length: n }, (_, i) => ({ id: `w${i}`, true: atoms.filter(() => random() < 0.5) }))
  const ids = worlds.map((w) => w.id)
  const systems: Record<string, string[][]> = {}
  for (const w of ids) {
    const rest = ids.filter((v) => v !== w && random() < 0.85)
    const rank = new Map(rest.map((v) => [v, 1 + Math.floor(random() * 3)]))
    const levels = [...new Set(rank.values())].sort()
    systems[w] = [[w], ...levels.map((l) => [w, ...rest.filter((v) => (rank.get(v) as number) <= l)])]
  }
  return sphereModel({ atoms, worlds, systems })
}

function randomBoolean(random: () => number, atoms: readonly string[], depth: number): Formula {
  if (depth === 0 || random() < 0.3) return F.atom(atoms[Math.floor(random() * atoms.length)] as string)
  const r = random()
  if (r < 0.25) return F.not(randomBoolean(random, atoms, depth - 1))
  if (r < 0.6) return F.and(randomBoolean(random, atoms, depth - 1), randomBoolean(random, atoms, depth - 1))
  return F.or(randomBoolean(random, atoms, depth - 1), randomBoolean(random, atoms, depth - 1))
}

describe('Lewis and Stalnaker on spheres', () => {
  it('finds the closest antecedent worlds of the programmer example', () => {
    const ev = new ModalEvaluator(PROGRAMMER)
    const step = ev.counterfactual(p('prog'), p('unhappy'), 'w')
    expect(step).toEqual({ antecedentWorlds: ['v1', 'v2'], sphere: 1, selected: ['v1', 'v2'], failures: ['v2'], vacuous: false, value: false })
    expect(ev.holds(p('prog > unhappy'), 'w')).toBe(false)
    expect(ev.holds(p('prog > ~unhappy'), 'w')).toBe(false)
    // Conditional excluded middle fails for Lewis here.
    expect(ev.holds(p('(prog > unhappy) | (prog > ~unhappy)'), 'w')).toBe(false)
    const stalnaker = new ModalEvaluator(PROGRAMMER, { semantics: 'stalnaker' })
    const problem = modalProblemOf(caught(() => stalnaker.holds(p('prog > unhappy'), 'w')))
    expect(problem).toEqual({ code: 'not-unique', params: { world: 'w', candidates: ['v1', 'v2'] } })
  })

  it('is vacuously true when no sphere holds an antecedent world, and needs a system at the world', () => {
    const ev = new ModalEvaluator(PROGRAMMER)
    const step = ev.counterfactual(p('prog & ~prog'), p('unhappy'), 'w')
    expect([step.vacuous, step.value, step.sphere]).toEqual([true, true, undefined])
    expect(modalProblemOf(caught(() => ev.holds(p('prog > unhappy'), 'v1')))?.code).toBe('no-sphere-system')
    // Strong centering: a true antecedent selects the actual world.
    expect(ev.counterfactual(p('unhappy'), p('~prog'), 'w').selected).toEqual(['w'])
  })

  it('rejects systems that are not nested or not centred', () => {
    const worlds = [{ id: 'w' }, { id: 'v' }]
    expect(modalProblemOf(caught(() => sphereModel({ atoms: [], worlds, systems: { w: [['w', 'v'], ['w']] } })))?.code).toBe('spheres-not-nested')
    expect(modalProblemOf(caught(() => sphereModel({ atoms: [], worlds, systems: { w: [['w', 'v']] } })))?.code).toBe('centering')
    expect(sphereModel({ atoms: [], worlds, systems: { w: [['w', 'v']] }, centering: 'weak' }).spheres?.w).toEqual([['w', 'v']])
    expect(modalProblemOf(caught(() => sphereModel({ atoms: [], worlds, systems: { w: [['v']] }, centering: 'weak' })))?.code).toBe('centering')
  })

  it('validates the VC axioms on random strongly centred systems', () => {
    const random = rng(4590)
    const atoms = ['p', 'q', 'r']
    for (let k = 0; k < 150; k += 1) {
      const model = randomSpheres(random, 2 + Math.floor(random() * 4), atoms)
      const [a, b, c] = [randomBoolean(random, atoms, 2), randomBoolean(random, atoms, 2), randomBoolean(random, atoms, 2)] as [Formula, Formula, Formula]
      const axioms: Formula[] = [
        F.cf(a, a),
        F.imp(F.and(F.cf(a, b), F.cf(a, c)), F.cf(a, F.and(b, c))),
        F.imp(F.cf(a, b), F.imp(a, b)),
        F.imp(F.and(a, b), F.cf(a, b)),
        F.imp(F.and(F.cf(a, c), F.cf(b, c)), F.cf(F.or(a, b), c)),
        F.imp(F.and(F.cf(a, b), F.not(F.cf(a, F.not(c)))), F.cf(F.and(a, c), b)),
      ]
      const ev = new ModalEvaluator(model)
      for (const w of model.worlds) for (const ax of axioms) expect(ev.holds(ax, w)).toBe(true)
    }
  })

  it('makes conditional excluded middle fail only where the selection is not unique', () => {
    const random = rng(77)
    const atoms = ['p', 'q']
    let failures = 0
    for (let k = 0; k < 300; k += 1) {
      const model = randomSpheres(random, 2 + Math.floor(random() * 4), atoms)
      const a = randomBoolean(random, atoms, 1)
      const b = randomBoolean(random, atoms, 1)
      const lewis = new ModalEvaluator(model)
      const stalnaker = new ModalEvaluator(model, { semantics: 'stalnaker' })
      const cem = F.or(F.cf(a, b), F.cf(a, F.not(b)))
      for (const w of model.worlds) {
        const unique = lewis.counterfactual(a, b, w).selected.length <= 1
        if (!lewis.holds(cem, w)) {
          failures += 1
          expect(unique).toBe(false)
        }
        if (unique) expect(stalnaker.holds(cem, w)).toBe(true)
        else expect(modalProblemOf(caught(() => stalnaker.holds(cem, w)))?.code).toBe('not-unique')
      }
    }
    expect(failures).toBeGreaterThan(0)
  })

  it('reads > as strict implication once the spheres are pressed into one', () => {
    const random = rng(9)
    const atoms = ['p', 'q', 'r']
    for (let k = 0; k < 150; k += 1) {
      const flat = collapseSpheres(randomSpheres(random, 2 + Math.floor(random() * 4), atoms))
      const a = randomBoolean(random, atoms, 2)
      const b = randomBoolean(random, atoms, 2)
      const ev = new ModalEvaluator(flat)
      for (const w of flat.worlds) expect(ev.holds(F.cf(a, b), w)).toBe(ev.holds(F.strict(a, b), w))
    }
  })
})

describe('transitivity, contraposition and strengthening', () => {
  it('hold for strict implication and each fail somewhere for counterfactuals', () => {
    const random = rng(31)
    const atoms = ['p', 'q', 'r']
    const failed = new Set<string>()
    for (let k = 0; k < 200; k += 1) {
      const model = randomSpheres(random, 3 + Math.floor(random() * 3), atoms)
      const [a, b, c] = [randomBoolean(random, atoms, 1), randomBoolean(random, atoms, 1), randomBoolean(random, atoms, 1)] as [Formula, Formula, Formula]
      for (const pattern of TCS_PATTERNS) {
        for (const at of checkInference(model, tcsInference(pattern, 'strict', a, b, c))) expect(at.counterexample).toBe(false)
        if (checkInference(model, tcsInference(pattern, 'counterfactual', a, b, c)).some((at) => at.counterexample)) failed.add(pattern)
      }
    }
    expect([...failed].sort()).toEqual(['contraposition', 'strengthening', 'transitivity'])
  })

  it('finds the umbrella counterexample to strengthening and loses it on one sphere', () => {
    // rain > umbrella is true at w, (rain ∧ stolen) > umbrella is not.
    const model = sphereModel({
      atoms: ['rain', 'umbrella', 'stolen'],
      worlds: [
        { id: 'w', true: [] },
        { id: 'v', true: ['rain', 'umbrella'] },
        { id: 'u', true: ['rain', 'stolen'] },
      ],
      systems: { w: [['w'], ['w', 'v'], ['w', 'v', 'u']] },
    })
    const inference = tcsInference('strengthening', 'counterfactual', p('rain'), p('umbrella'), p('stolen'))
    expect(checkInferenceAt(model, inference, 'w')).toEqual({ world: 'w', premises: [true], conclusion: false, counterexample: true })
    expect(checkInferenceAt(collapseSpheres(model), inference, 'w')).toEqual({ world: 'w', premises: [false], conclusion: false, counterexample: false })
  })
})

// Fine's Nixon: the button, the wire, the war, and the law war ≡ press ∧ connected.
const NIXON_WORLDS = ['press', 'connected', 'war'].reduce<{ id: string; true: string[] }[]>(
  (acc, atom) => acc.flatMap((w) => [w, { id: `${w.id}${atom[0]}`, true: [...w.true, atom] }]),
  [{ id: 'n', true: [] }],
)
const NIXON_BASE = sphereModel({ atoms: ['press', 'connected', 'war'], worlds: NIXON_WORLDS, systems: {} })

describe('similarity and surgery', () => {
  const law = { formula: p('war <-> press & connected'), cost: 3 }

  it('puts the wire-cut world closest when avoiding war weighs most', () => {
    // The actual world: no press, the wire connected, no war.
    const center = 'nc'
    const heavy = { weights: { war: 10, connected: 1, press: 1 }, laws: [law] }
    const ds = distances(NIXON_BASE, center, heavy)
    expect(ds.find((d) => d.world === 'npc')).toEqual({ world: 'npc', distance: 4, mismatches: ['press'], violations: [0] })
    const model = withSimilaritySpheres(NIXON_BASE, center, heavy)
    const ev = new ModalEvaluator(model)
    const step = ev.counterfactual(p('press'), p('war'), center)
    expect([step.selected, step.value]).toEqual([['np'], false])
    // With war weighing little, the closest press world has the war.
    const light = withSimilaritySpheres(NIXON_BASE, center, { weights: { war: 0.5, connected: 1, press: 1 }, laws: [law] })
    expect(new ModalEvaluator(light).counterfactual(p('press'), p('war'), center).selected).toEqual(['npcw'])
    expect(similaritySpheres(NIXON_BASE, center, heavy)[0]).toEqual([center])
  })

  it('solves the submodel: pressing the button brings the war', () => {
    const equations = { war: p('press & connected') }
    const result = surgery(['press', 'connected', 'war'], equations, ['connected'], { press: true })
    expect(result).toEqual({ values: { press: true, connected: true, war: true }, set: ['press'], solved: ['war'] })
    expect(worldWith(NIXON_WORLDS, ['press', 'connected', 'war'], result.values)).toBe('npcw')
    expect(literalsOf(p('press & ~connected'))).toEqual({ press: true, connected: false })
    expect(literalsOf(p('press | connected'))).toBeUndefined()
    expect(literalsOf(p('press & ~press'))).toBeUndefined()
  })

  it('rejects cyclic and modal equations', () => {
    expect(modalProblemOf(caught(() => equationOrder(['a', 'b'], { a: p('b'), b: p('~a') })))).toEqual({ code: 'cyclic-equations', params: { cycle: ['a', 'b', 'a'] } })
    expect(modalProblemOf(caught(() => equationOrder(['a', 'b'], { a: p('[]b') })))?.code).toBe('not-truth-functional')
    expect(modalProblemOf(caught(() => equationOrder(['a'], { a: p('z') })))?.code).toBe('unknown-atom')
  })
})
