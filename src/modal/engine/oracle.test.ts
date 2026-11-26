import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { modalProblemOf } from './errors.ts'
import { ModalEvaluator } from './evaluate.ts'
import { parseFormula } from './formula.ts'
import type { FrameCondition } from './frames.ts'
import { AXIOMS, CONDITION_AXIOM, FRAME_CONDITIONS, checkCondition, validOnFrame } from './frames.ts'
import { frameOf, kripkeModel, sphereModel } from './model.ts'

/**
 * The fixtures of oracle/modal.py, an independent Python evaluator written from the truth clauses
 * (run there, never shipped): the engine must parse its fully bracketed formulas and give the same
 * truth sets on random Kripke models and systems of spheres, the same frame conditions and axiom
 * validity on random four-world frames, and the same Stalnaker verdicts, including where the
 * selection is not unique.
 */

interface World {
  readonly id: string
  readonly true: readonly string[]
}
interface Row {
  readonly text: string
  readonly truthSet: readonly string[]
}
interface Fixture {
  readonly generator: { readonly seed: number; readonly python: string }
  readonly kripke: readonly { readonly id: string; readonly worlds: readonly World[]; readonly access: readonly [string, string][]; readonly formulas: readonly Row[] }[]
  readonly frames: readonly {
    readonly id: string
    readonly worlds: readonly string[]
    readonly access: readonly [string, string][]
    readonly conditions: Readonly<Record<FrameCondition, boolean>>
    readonly axiomValid: Readonly<Record<FrameCondition, boolean>>
  }[]
  readonly spheres: readonly {
    readonly id: string
    readonly worlds: readonly World[]
    readonly systems: Readonly<Record<string, readonly (readonly string[])[]>>
    readonly lewis: readonly Row[]
    readonly stalnaker: readonly { readonly text: string; readonly values: Readonly<Record<string, boolean | null>> }[]
  }[]
}

const FIXTURE = new URL('../../../oracle/fixtures/modal.json', import.meta.url)
const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Fixture
const ATOMS = ['p', 'q', 'r']

describe('the modal engine against oracle/modal.py', () => {
  it('has every kind of case', () => {
    expect([fixture.kripke.length, fixture.frames.length, fixture.spheres.length]).toEqual([40, 60, 30])
    for (const c of FRAME_CONDITIONS) {
      expect(new Set(fixture.frames.map((f) => f.conditions[c])), c).toEqual(new Set([true, false]))
    }
  })

  it.each(fixture.kripke.map((c) => [c.id, c] as const))('%s: truth sets', (_id, c) => {
    const ev = new ModalEvaluator(kripkeModel({ atoms: ATOMS, worlds: c.worlds, access: c.access }))
    for (const row of c.formulas) expect([row.text, ev.truthSet(parseFormula(row.text))]).toEqual([row.text, row.truthSet])
  })

  it.each(fixture.frames.map((c) => [c.id, c] as const))('%s: conditions and axioms', (_id, c) => {
    const frame = frameOf(c.worlds, c.access)
    for (const condition of FRAME_CONDITIONS) {
      expect([condition, checkCondition(frame, condition).holds]).toEqual([condition, c.conditions[condition]])
      expect([condition, validOnFrame(frame, AXIOMS[CONDITION_AXIOM[condition]].formula).valid]).toEqual([condition, c.axiomValid[condition]])
    }
  })

  it.each(fixture.spheres.map((c) => [c.id, c] as const))('%s: Lewis and Stalnaker', (_id, c) => {
    const model = sphereModel({ atoms: ATOMS, worlds: c.worlds, systems: c.systems })
    const lewis = new ModalEvaluator(model)
    for (const row of c.lewis) expect([row.text, lewis.truthSet(parseFormula(row.text))]).toEqual([row.text, row.truthSet])
    const stalnaker = new ModalEvaluator(model, { semantics: 'stalnaker' })
    for (const row of c.stalnaker) {
      const f = parseFormula(row.text)
      for (const [w, expected] of Object.entries(row.values)) {
        let got: boolean | null
        try {
          got = stalnaker.holds(f, w)
        } catch (error) {
          expect(modalProblemOf(error)?.code).toBe('not-unique')
          got = null
        }
        expect([row.text, w, got]).toEqual([row.text, w, expected])
      }
    }
  })
})
