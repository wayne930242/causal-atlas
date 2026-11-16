import type { Expr } from './expr.ts'
import type { Interventions } from './evaluate.ts'
import { evalFormula, toFormula } from './formula.ts'
import type { CausalModel } from './model.ts'
import { getVariable } from './model.ts'
import type { Assignment, Value } from './types.ts'
import { ModelError, assignmentKey, coerceToDomain } from './values.ts'

const TOLERANCE = 1e-9

export interface Outcome {
  readonly value: Value
  readonly p: number
}

/** Exogenous variables are mutually independent with these marginals. */
export interface IndependentPrior {
  readonly kind: 'independent'
  readonly marginals: Readonly<Record<string, readonly Outcome[]>>
}

export interface JointRow {
  readonly context: Assignment
  readonly p: number
}

/** An explicit joint distribution over full contexts; unlisted contexts have probability 0. */
export interface JointPrior {
  readonly kind: 'joint'
  readonly rows: readonly JointRow[]
}

export type Prior = IndependentPrior | JointPrior

export interface WeightedContext {
  readonly context: Assignment
  readonly p: number
}

/** The deterministic case: all mass on one context. */
export function pointMass(context: Assignment): JointPrior {
  return { kind: 'joint', rows: [{ context, p: 1 }] }
}

function checkProbability(p: number, where: string): void {
  if (!Number.isFinite(p) || p < 0 || p > 1 + TOLERANCE) throw new ModelError(`${where}: invalid probability ${p}`)
}

function checkSum(total: number, where: string): void {
  if (Math.abs(total - 1) > 1e-6) throw new ModelError(`${where}: probabilities sum to ${total}, not 1`)
}

/** Contexts with positive probability, validated against the model. */
export function enumerateContexts(model: CausalModel, prior: Prior): WeightedContext[] {
  if (prior.kind === 'joint') {
    const seen = new Set<string>()
    let total = 0
    const out: WeightedContext[] = []
    for (const row of prior.rows) {
      checkProbability(row.p, 'joint prior')
      const context: Record<string, Value> = {}
      for (const id of model.exogenous) {
        const raw = row.context[id]
        if (raw === undefined) throw new ModelError(`joint prior row has no value for ${id}`)
        context[id] = coerceToDomain(getVariable(model, id), raw)
      }
      for (const id of Object.keys(row.context)) {
        if (getVariable(model, id).kind !== 'exogenous') throw new ModelError(`joint prior assigns endogenous ${id}`)
      }
      const key = assignmentKey(context, model.exogenous)
      if (seen.has(key)) throw new ModelError(`joint prior lists context ${key} twice`)
      seen.add(key)
      total += row.p
      if (row.p > 0) out.push({ context, p: row.p })
    }
    checkSum(total, 'joint prior')
    return out
  }

  const marginals = model.exogenous.map((id) => {
    const outcomes = prior.marginals[id]
    if (outcomes === undefined) throw new ModelError(`prior has no marginal for exogenous ${id}`)
    const variable = getVariable(model, id)
    const seen = new Set<string>()
    let total = 0
    const normalized = outcomes.map((o) => {
      checkProbability(o.p, `marginal of ${id}`)
      const value = coerceToDomain(variable, o.value)
      const key = String(value)
      if (seen.has(key)) throw new ModelError(`marginal of ${id} lists ${key} twice`)
      seen.add(key)
      total += o.p
      return { value, p: o.p }
    })
    checkSum(total, `marginal of ${id}`)
    return { id, outcomes: normalized.filter((o) => o.p > 0) }
  })
  for (const id of Object.keys(prior.marginals)) {
    if (getVariable(model, id).kind !== 'exogenous') throw new ModelError(`prior has a marginal for endogenous ${id}`)
  }

  let worlds: WeightedContext[] = [{ context: {}, p: 1 }]
  for (const { id, outcomes } of marginals) {
    worlds = worlds.flatMap((w) => outcomes.map((o) => ({ context: { ...w.context, [id]: o.value }, p: w.p * o.p })))
  }
  return worlds
}

export interface ProbabilityQuery {
  /** The event, e.g. `C=1`; may itself contain `[X←x]` (a counterfactual event). */
  readonly event: Expr | string
  /** Observation to condition on, evaluated in the (possibly intervened) model. */
  readonly given?: Expr | string
  /** do(X=x): evaluate in the mutilated model M_{X←x}. */
  readonly do?: Interventions
}

export interface ProbabilityResult {
  readonly value: number
  /** P(event ∧ given), under the intervention if any. */
  readonly joint: number
  /** P(given), under the intervention if any; 1 when nothing is observed. */
  readonly evidence: number
}

/**
 * P(event | given) or P(event | do(X=x), given), by enumerating contexts.
 * Throws when the conditioning event has probability 0.
 */
export function probability(model: CausalModel, prior: Prior, query: ProbabilityQuery): ProbabilityResult {
  const event = toFormula(model, query.event)
  const given = query.given === undefined ? undefined : toFormula(model, query.given)
  let joint = 0
  let evidence = 0
  for (const { context, p } of enumerateContexts(model, prior)) {
    const intervention = query.do ?? {}
    if (given !== undefined && !evalFormula(model, context, given, intervention)) continue
    evidence += p
    if (evalFormula(model, context, event, intervention)) joint += p
  }
  if (evidence <= 0) throw new ModelError('conditioning event has probability 0')
  return { value: joint / evidence, joint, evidence }
}
