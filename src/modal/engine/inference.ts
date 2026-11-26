import type { EvalOptions } from './evaluate.ts'
import { ModalEvaluator } from './evaluate.ts'
import type { Formula } from './formula.ts'
import { F } from './formula.ts'
import type { ModalModel } from './model.ts'

/**
 * The three inferences that hold for strict implication and fail for counterfactuals (Garson §20.5):
 * transitivity, contraposition and strengthening the antecedent, written with `>` or with the strict
 * conditional □(A ⊃ B), and checked world by world.
 */

export type TcsPattern = 'transitivity' | 'contraposition' | 'strengthening'

export const TCS_PATTERNS: readonly TcsPattern[] = ['transitivity', 'contraposition', 'strengthening']

/** Which conditional an inference is written with. */
export type ConditionalKind = 'counterfactual' | 'strict'

export interface Inference {
  readonly premises: readonly Formula[]
  readonly conclusion: Formula
}

/**
 * The inference `pattern` with the conditional `kind`, on formulas a, b and c:
 * transitivity a→b, b→c ∴ a→c; contraposition a→b ∴ ¬b→¬a; strengthening a→b ∴ (a ∧ c)→b.
 * `c` is needed for transitivity and strengthening.
 */
export function tcsInference(pattern: TcsPattern, kind: ConditionalKind, a: Formula, b: Formula, c?: Formula): Inference {
  const to = kind === 'strict' ? F.strict : F.cf
  const third = c ?? b
  switch (pattern) {
    case 'transitivity':
      return { premises: [to(a, b), to(b, third)], conclusion: to(a, third) }
    case 'contraposition':
      return { premises: [to(a, b)], conclusion: to(F.not(b), F.not(a)) }
    case 'strengthening':
      return { premises: [to(a, b)], conclusion: to(F.and(a, third), b) }
  }
}

/** An inference at one world: the premises' values, the conclusion's, and whether this world is a counterexample. */
export interface InferenceAt {
  readonly world: string
  readonly premises: readonly boolean[]
  readonly conclusion: boolean
  /** Every premise true and the conclusion false. */
  readonly counterexample: boolean
}

export function checkInferenceAt(model: ModalModel, inference: Inference, world: string, options?: EvalOptions): InferenceAt {
  const ev = new ModalEvaluator(model, options)
  const premises = inference.premises.map((p) => ev.holds(p, world))
  const conclusion = ev.holds(inference.conclusion, world)
  return { world, premises, conclusion, counterexample: premises.every(Boolean) && !conclusion }
}

/** The inference at every world of `worlds` (default: every world with a system of spheres, or every world). */
export function checkInference(model: ModalModel, inference: Inference, options?: EvalOptions & { readonly worlds?: readonly string[] }): InferenceAt[] {
  const worlds = options?.worlds ?? (model.spheres === undefined ? model.worlds : model.worlds.filter((w) => model.spheres?.[w] !== undefined))
  return worlds.map((w) => checkInferenceAt(model, inference, w, options))
}
