import type { Locale } from '../../engine/types.ts'
import type { ModalProblem } from '../engine/errors.ts'
import { modalProblemOf } from '../engine/errors.ts'
import type { ConditionalSemantics, CounterfactualStep } from '../engine/evaluate.ts'
import { ModalEvaluator } from '../engine/evaluate.ts'
import type { Formula } from '../engine/formula.ts'
import type { ModalModel } from '../engine/model.ts'
import type { SpheresDoc } from '../data/schema.ts'
import { worldNames } from './doc-graph.ts'
import type { SphereWorld } from './sphere-graph.ts'
import type { SphereMark } from './SphereDiagram.tsx'

/** What a sphere picture shows for one counterfactual at one world. Pure. */

export interface CounterfactualView {
  /** The step under Lewis's reading, which is always defined; under Stalnaker the same worlds, but the value may be undefined. */
  readonly step: CounterfactualStep
  /** Undefined when Stalnaker's selection is not unique. */
  readonly value: boolean | undefined
  readonly problem?: ModalProblem
  readonly marks: ReadonlyMap<string, SphereMark>
}

/** A counterfactual a > b at `world`, read by `semantics`. */
export function counterfactualView(model: ModalModel, a: Formula, b: Formula, world: string, semantics: ConditionalSemantics): CounterfactualView {
  const step = new ModalEvaluator(model).counterfactual(a, b, world)
  const marks = new Map<string, SphereMark>()
  for (const v of step.antecedentWorlds) marks.set(v, 'antecedent')
  for (const v of step.selected) marks.set(v, 'selected')
  for (const v of step.failures) marks.set(v, 'counter')
  if (semantics === 'lewis') return { step, value: step.value, marks }
  try {
    return { step, value: new ModalEvaluator(model, { semantics }).counterfactual(a, b, world).value, marks }
  } catch (error) {
    const problem = modalProblemOf(error)
    if (problem === undefined) throw error
    return { step, value: undefined, problem, marks }
  }
}

/** The worlds a sphere picture draws: names and their true atoms. */
export function sphereWorlds(doc: SpheresDoc, locale: Locale): SphereWorld[] {
  const names = worldNames(doc, locale)
  return doc.worlds.map((w) => ({ id: w.id, name: names.get(w.id) ?? w.id, detail: w.true.join(', ') }))
}

/** LaTeX for a set of world names. */
export function worldSetLatex(names: readonly string[]): string {
  return `\\{${names.map((n) => `\\text{${n.replace(/[\\{}]/g, '')}}`).join(', ')}\\}`
}
