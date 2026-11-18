import type { ActualCauseOptions, CausalTheory, CausalVerdict, ResponsibilityTheory } from './actual.ts'
import { newBudget, parseCause, responsibilityWithBudget } from './actual.ts'
import { problem } from './errors.ts'
import type { Expr } from './expr.ts'
import { evaluate } from './evaluate.ts'
import { evalFormula, toFormula } from './formula.ts'
import type { CausalModel } from './model.ts'
import type { Prior } from './probability.ts'
import { enumerateContexts } from './probability.ts'
import type { Assignment, Value } from './types.ts'
import { ModelError, requireValue, valuesEqual } from './values.ts'

export interface BlameQuery {
  /** A single event X=x, as `{ ST: 1 }` or `ST=1`. */
  readonly cause: Assignment | string
  /** The outcome φ, e.g. `BS=1`. */
  readonly effect: Expr | string
  /**
   * An observation that narrows the epistemic state, e.g. the outcome seen after acting (Halpern's
   * posterior state, Ex. 6.2.4). May contain `[X←x]`, as in `probability`.
   */
  readonly given?: Expr | string
}

export interface BlameRow {
  readonly context: Assignment
  /** Pr(u | X=x ∧ given). */
  readonly p: number
  /** dr((M, u), X=x, φ). */
  readonly responsibility: number
  /** The k behind the responsibility, when it is positive. */
  readonly k?: number
  readonly verdict: CausalVerdict
}

export interface BlameResult {
  readonly theory: ResponsibilityTheory
  /** db = Σ_u dr((M, u), X=x, φ) · Pr(u | X=x ∧ given). */
  readonly degree: number
  /** Pr(X=x ∧ given) under the prior. */
  readonly evidence: number
  /** The contexts of the epistemic state (positive posterior), in the prior's order. */
  readonly rows: readonly BlameRow[]
}

/**
 * Degree of blame (Halpern, Actual Causality, 2016, Def. 6.2.1): the expected degree of
 * responsibility of X=x for φ over an epistemic state (K, Pr). K is the prior's contexts where X=x
 * holds, Halpern's assumption that X=x is known (p. 173), and Pr is the prior conditioned on X=x
 * (and on `given` when there is one). Model uncertainty is expressed as exogenous switches in one
 * model. All contexts share one budget of MAX_EVALUATIONS; past it a ModelError (`search-budget`).
 */
export function blame(
  model: CausalModel,
  prior: Prior,
  query: BlameQuery,
  theory: CausalTheory,
  options: ActualCauseOptions = {},
): BlameResult {
  if (theory === 'butfor') throw new ModelError(problem('responsibility-butfor', {}))
  const cause = parseCause(model, query.cause)
  if (Object.keys(cause).length !== 1) {
    const text = typeof query.cause === 'string' ? query.cause : Object.keys(cause).map((id) => `${id}=${String(cause[id])}`).join(' and ')
    throw new ModelError(problem('responsibility-single-event', { cause: text }))
  }
  const given = query.given === undefined ? undefined : toFormula(model, query.given)
  const holds = (values: Assignment): boolean =>
    Object.entries(cause).every(([id, v]: [string, Value]) => valuesEqual(requireValue(values, id), v))

  const state = enumerateContexts(model, prior).filter(
    ({ context }) => holds(evaluate(model, context).values) && (given === undefined || evalFormula(model, context, given)),
  )
  const evidence = state.reduce((sum, w) => sum + w.p, 0)
  if (evidence <= 0) throw new ModelError(problem('blame-no-mass', {}))

  const budget = newBudget()
  let degree = 0
  const rows: BlameRow[] = state.map(({ context, p }) => {
    const r = responsibilityWithBudget(model, context, { cause, effect: query.effect }, theory, options, budget)
    const posterior = p / evidence
    degree += r.degree * posterior
    return { context, p: posterior, responsibility: r.degree, k: r.k, verdict: r.verdict }
  })
  return { theory, degree, evidence, rows }
}
