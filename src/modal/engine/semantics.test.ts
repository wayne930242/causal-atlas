import { describe, expect, it } from 'vitest'
import { modalProblemOf } from './errors.ts'
import { explain, holds, intension, ModalEvaluator, truthSet } from './evaluate.ts'
import type { Formula } from './formula.ts'
import { F, parseFormula } from './formula.ts'
import { AXIOMS, CONDITION_AXIOM, FRAME_CONDITIONS, checkCondition, systemsOf, validOnFrame } from './frames.ts'
import type { Frame, ModalModel } from './model.ts'
import { frameOf, kripkeModel } from './model.ts'
import { rng } from './test-random.ts'

function randomModel(random: () => number, n: number, atoms: readonly string[]): ModalModel {
  const worlds = Array.from({ length: n }, (_, i) => ({ id: `w${i}`, true: atoms.filter(() => random() < 0.5) }))
  const access = worlds.flatMap((w) => worlds.filter(() => random() < 0.4).map((v) => [w.id, v.id] as [string, string]))
  return kripkeModel({ atoms, worlds, access })
}

function randomFormula(random: () => number, atoms: readonly string[], depth: number): Formula {
  if (depth === 0 || random() < 0.2) return F.atom(atoms[Math.floor(random() * atoms.length)] as string)
  const r = random()
  if (r < 0.15) return F.not(randomFormula(random, atoms, depth - 1))
  if (r < 0.35) return F.box(randomFormula(random, atoms, depth - 1))
  if (r < 0.55) return F.dia(randomFormula(random, atoms, depth - 1))
  if (r < 0.7) return F.and(randomFormula(random, atoms, depth - 1), randomFormula(random, atoms, depth - 1))
  if (r < 0.85) return F.or(randomFormula(random, atoms, depth - 1), randomFormula(random, atoms, depth - 1))
  return F.imp(randomFormula(random, atoms, depth - 1), randomFormula(random, atoms, depth - 1))
}

/** Every frame on `n` worlds: each of the n² possible pairs in or out. */
function allFrames(n: number): Frame[] {
  const worlds = Array.from({ length: n }, (_, i) => `w${i}`)
  const pairs = worlds.flatMap((a) => worlds.map((b) => [a, b] as [string, string]))
  return Array.from({ length: 2 ** pairs.length }, (_, code) =>
    frameOf(
      worlds,
      pairs.filter((_, i) => (code & (1 << i)) !== 0),
    ),
  )
}

// Appendix D: a sunny world w that sees one rainy and one sunny world.
const RAIN = kripkeModel({
  atoms: ['rain'],
  worlds: [{ id: 'w' }, { id: 'v', true: ['rain'] }, { id: 'u' }],
  access: [
    ['w', 'v'],
    ['w', 'u'],
  ],
})

describe('Kripke truth', () => {
  it('gives the intension and truth set of an atom', () => {
    const rain = parseFormula('rain')
    expect(intension(RAIN, rain)).toEqual({ w: false, v: true, u: false })
    expect(truthSet(RAIN, rain)).toEqual(['v'])
  })

  it('makes ◇rain true and □rain false at w, with the witness and the counterexample', () => {
    const dia = explain(RAIN, parseFormula('<>rain'), 'w')
    expect([dia.value, dia.accessible, dia.witness]).toEqual([true, ['v', 'u'], 'v'])
    const box = explain(RAIN, parseFormula('[]rain'), 'w')
    expect([box.value, box.witness]).toEqual([false, 'u'])
    expect(box.children.map((c) => [c.world, c.value])).toEqual([
      ['v', true],
      ['u', false],
    ])
    // A world that sees nothing: □ is vacuously true, ◇ false.
    expect([holds(RAIN, parseFormula('[]rain'), 'v'), holds(RAIN, parseFormula('<>rain'), 'v')]).toEqual([true, false])
  })

  it('keeps □ and ◇ dual on random models', () => {
    const random = rng(20261126)
    for (let k = 0; k < 200; k += 1) {
      const model = randomModel(random, 1 + Math.floor(random() * 5), ['p', 'q'])
      const a = randomFormula(random, ['p', 'q'], 3)
      const ev = new ModalEvaluator(model)
      for (const w of model.worlds) {
        expect(ev.holds(F.box(a), w)).toBe(ev.holds(F.not(F.dia(F.not(a))), w))
        expect(ev.holds(F.dia(a), w)).toBe(ev.holds(F.not(F.box(F.not(a))), w))
      }
    }
  })

  it('reports unknown worlds and atoms', () => {
    expect(() => holds(RAIN, parseFormula('rain'), 'x')).toThrow(/no world x/)
    expect(() => holds(RAIN, parseFormula('snow'), 'w')).toThrow(/no atom snow/)
    expect(modalProblemOf(catchError(() => kripkeModel({ atoms: [], worlds: [{ id: 'w' }], access: [['w', 'z']] })))?.code).toBe('unknown-world')
  })
})

function catchError(f: () => unknown): unknown {
  try {
    f()
  } catch (error) {
    return error
  }
  return undefined
}

describe('frame conditions and axioms', () => {
  it.each([1, 2, 3])('agree on every frame with %i worlds: the condition holds iff its axiom is valid', (n) => {
    const frames = allFrames(n)
    expect(frames.length).toBe(2 ** (n * n))
    for (const frame of frames) {
      for (const condition of FRAME_CONDITIONS) {
        const check = checkCondition(frame, condition)
        const validity = validOnFrame(frame, AXIOMS[CONDITION_AXIOM[condition]].formula)
        expect([condition, check.holds]).toEqual([condition, validity.valid])
        if (!validity.valid) {
          // The counterexample really falsifies the axiom at its world.
          const ce = validity.counterexample
          const model = kripkeModel({
            atoms: ['p'],
            worlds: frame.worlds.map((w) => ({ id: w, true: (ce.trueAt.p ?? []).includes(w) ? ['p'] : [] })),
            access: frame.worlds.flatMap((w) => (frame.access[w] ?? []).map((v) => [w, v] as [string, string])),
          })
          expect(holds(model, AXIOMS[CONDITION_AXIOM[condition]].formula, ce.world)).toBe(false)
        }
      }
      expect(validOnFrame(frame, AXIOMS.K.formula).valid).toBe(true)
    }
  })

  it('names the worlds that break a condition', () => {
    const time = frameOf(
      ['morning', 'noon', 'afternoon'],
      [
        ['morning', 'noon'],
        ['morning', 'afternoon'],
        ['noon', 'afternoon'],
      ],
    )
    expect(checkCondition(time, 'transitive')).toEqual({ holds: true })
    expect(checkCondition(time, 'reflexive')).toEqual({ holds: false, witness: ['morning'] })
    expect(checkCondition(time, 'serial')).toEqual({ holds: false, witness: ['afternoon'] })
    expect(checkCondition(time, 'symmetric')).toEqual({ holds: false, witness: ['morning', 'noon'] })
    expect(checkCondition(time, 'euclidean')).toEqual({ holds: false, witness: ['morning', 'noon', 'noon'] })
    expect(validOnFrame(time, AXIOMS['4'].formula)).toEqual({ valid: true })
    expect(validOnFrame(time, AXIOMS.M.formula)).toEqual({ valid: false, counterexample: { world: 'afternoon', trueAt: { p: [] } } })
    expect(systemsOf(time)).toEqual(['K'])
  })

  it('sorts frames into the systems whose frame class holds them', () => {
    const one = frameOf(['w'], [['w', 'w']])
    expect(systemsOf(one)).toEqual(['K', 'D', 'M', 'S4', 'B', 'S5'])
    const chain = frameOf(
      ['a', 'b'],
      [
        ['a', 'a'],
        ['b', 'b'],
        ['a', 'b'],
      ],
    )
    expect(systemsOf(chain)).toEqual(['K', 'D', 'M', 'S4'])
    expect(systemsOf(frameOf(['a'], []))).toEqual(['K'])
  })

  it('refuses to enumerate more than 2^16 assignments', () => {
    const frame = frameOf(
      Array.from({ length: 9 }, (_, i) => `w${i}`),
      [],
    )
    expect(validOnFrame(frame, parseFormula('[]p -> p')).valid).toBe(false)
    expect(modalProblemOf(catchError(() => validOnFrame(frame, parseFormula('[]p -> []q'))))?.code).toBe('too-many-assignments')
  })
})
