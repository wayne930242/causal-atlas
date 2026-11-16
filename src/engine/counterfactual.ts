import type { Expr } from './expr.ts'
import type { Interventions } from './evaluate.ts'
import { evaluate } from './evaluate.ts'
import { evalFormula, toFormula } from './formula.ts'
import type { CausalModel } from './model.ts'
import type { Prior } from './probability.ts'
import { enumerateContexts } from './probability.ts'
import type { Assignment, Edge } from './types.ts'
import { ModelError, valuesEqual } from './values.ts'

export interface CounterfactualQuery {
  /** What was observed in the actual world, e.g. `D=1`. Omit for no evidence. */
  readonly evidence?: Expr | string
  /** The antecedent, applied as do(X=x) in each abduced context. */
  readonly do: Interventions
  /** Event to score in the counterfactual world, e.g. `D=1`. */
  readonly event?: Expr | string
}

/** One abduced context with the actual and counterfactual worlds side by side (twin network). */
export interface TwinWorld {
  readonly context: Assignment
  readonly prior: number
  /** P(u | evidence). */
  readonly posterior: number
  readonly actual: Assignment
  readonly counterfactual: Assignment
  /** Variables whose counterfactual value differs from the actual one. */
  readonly changed: readonly string[]
  /** Whether `event` holds in the counterfactual world (undefined without an event). */
  readonly eventHolds?: boolean
}

export interface CounterfactualResult {
  /** P(evidence) under the prior. */
  readonly evidenceProbability: number
  /** Contexts consistent with the evidence, with posterior weights. */
  readonly worlds: readonly TwinWorld[]
  readonly intervened: readonly string[]
  /** Edges cut in the counterfactual world's graph. */
  readonly removedEdges: readonly Edge[]
  /** P(event in the counterfactual world | evidence), when an event is given. */
  readonly probability?: number
}

/**
 * Pearl's three steps (Causality, §7.1): abduction (update the prior over exogenous
 * variables on the evidence, by enumeration), action (do(X=x)), prediction (solve the
 * mutilated model in each abduced context). A point-mass prior is the deterministic case.
 */
export function counterfactual(model: CausalModel, prior: Prior, query: CounterfactualQuery): CounterfactualResult {
  const evidence = query.evidence === undefined ? undefined : toFormula(model, query.evidence)
  const event = query.event === undefined ? undefined : toFormula(model, query.event)

  // 1. Abduction.
  const consistent = enumerateContexts(model, prior).filter(
    ({ context }) => evidence === undefined || evalFormula(model, context, evidence),
  )
  const evidenceProbability = consistent.reduce((sum, w) => sum + w.p, 0)
  if (evidenceProbability <= 0) throw new ModelError('evidence has probability 0 under the prior')

  let removedEdges: readonly Edge[] = []
  let intervened: readonly string[] = []
  const worlds: TwinWorld[] = consistent.map(({ context, p }) => {
    const actual = evaluate(model, context).values
    // 2. Action and 3. prediction.
    const cf = evaluate(model, context, query.do)
    removedEdges = cf.removedEdges
    intervened = cf.intervened
    const changed = model.variables
      .map((v) => v.id)
      .filter((id) => {
        const a = actual[id]
        const b = cf.values[id]
        return a === undefined || b === undefined || !valuesEqual(a, b)
      })
    return {
      context,
      prior: p,
      posterior: p / evidenceProbability,
      actual,
      counterfactual: cf.values,
      changed,
      eventHolds: event === undefined ? undefined : evalFormula(model, context, event, query.do),
    }
  })

  const probability =
    event === undefined ? undefined : worlds.reduce((sum, w) => sum + (w.eventHolds === true ? w.posterior : 0), 0)
  return { evidenceProbability, worlds, intervened, removedEdges, probability }
}
