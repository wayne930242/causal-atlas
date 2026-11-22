import { problem } from '../errors.ts'
import type { CausalModel } from '../model.ts'
import { getVariable } from '../model.ts'
import type { Prior, WeightedContext } from '../probability.ts'
import { MAX_CONTEXTS, enumerateContexts } from '../probability.ts'
import type { Assignment, Value } from '../types.ts'
import { ModelError, domainValues, formatValue } from '../values.ts'
import { jointOf } from './check.ts'
import type { ObservedRow } from './evaluate.ts'
import { MAX_EXPR_EVALUATIONS, ProbEvaluator } from './evaluate.ts'
import type { DoExpr } from './prob-expr.ts'
import { actsOf, freeOf } from './prob-expr.ts'

/**
 * Evaluates expressions with do() terms on a model: P(vars | do(acts), given) is read from the
 * model's distribution with `acts` set to their values in the environment. `undefined` marks a
 * conditional on an event of probability 0, with the conventions of {@link ProbEvaluator}.
 */
export class DoEvaluator {
  private readonly model: CausalModel
  private readonly contexts: readonly WeightedContext[]
  readonly domains: Readonly<Record<string, readonly Value[]>>
  private readonly joints = new Map<string, ObservedRow[]>()
  private byActs = new Map<string, ProbEvaluator>()
  private steps = 0

  constructor(model: CausalModel, prior: Prior) {
    this.model = model
    this.contexts = enumerateContexts(model, prior)
    const domains: Record<string, readonly Value[]> = {}
    for (const id of model.endogenous) domains[id] = domainValues(getVariable(model, id).domain)
    this.domains = domains
  }

  private under(acts: readonly string[], env: ReadonlyMap<string, Value>): ProbEvaluator {
    const set: Record<string, Value> = {}
    for (const id of acts) {
      const value = env.get(id)
      if (value === undefined) throw new ModelError(problem('no-value', { id }))
      set[id] = value
    }
    const key = acts.map((id) => `${id}=${JSON.stringify(formatValue(set[id]))}`).join('&')
    let hit = this.byActs.get(key)
    if (hit === undefined) {
      let joint = this.joints.get(key)
      if (joint === undefined) {
        joint = jointOf(this.model, this.contexts, set)
        this.joints.set(key, joint)
      }
      hit = new ProbEvaluator(joint, this.domains)
      this.byActs.set(key, hit)
    }
    return hit
  }

  /** Starts a new budget of MAX_EXPR_EVALUATIONS (the distributions stay cached). */
  begin(): void {
    this.steps = 0
    this.byActs = new Map()
  }

  evaluate(e: DoExpr, env: ReadonlyMap<string, Value>): number | undefined {
    this.steps += 1
    if (this.steps > MAX_EXPR_EVALUATIONS) throw new ModelError(problem('identify-budget', { limit: MAX_EXPR_EVALUATIONS }))
    switch (e.kind) {
      case 'p':
        return this.under(actsOf(e), env).evaluate({ kind: 'p', vars: e.vars, given: e.given }, env)
      case 'sum': {
        let total = 0
        let defined = true
        const inner = new Map(env)
        const walk = (i: number): void => {
          if (i === e.over.length) {
            const term = this.evaluate(e.body, inner)
            if (term === undefined) defined = false
            else total += term
            return
          }
          const domain = this.domains[e.over[i]]
          if (domain === undefined) throw new ModelError(problem('unknown-variable', { id: e.over[i] }))
          for (const value of domain) {
            inner.set(e.over[i], value)
            walk(i + 1)
          }
        }
        walk(0)
        return defined ? total : undefined
      }
      case 'product': {
        const values = e.factors.map((f) => this.evaluate(f, env))
        if (values.some((v) => v === 0)) return 0
        if (values.some((v) => v === undefined)) return undefined
        return (values as number[]).reduce((a, b) => a * b, 1)
      }
      case 'ratio': {
        const den = this.evaluate(e.den, env)
        const num = this.evaluate(e.num, env)
        if (den === undefined || den <= 0 || num === undefined) return undefined
        return num / den
      }
    }
  }
}

/** Two expressions compared on a model at every assignment of their free variables. */
export interface ExprComparison {
  /** The free variables of either side, in the model's order. */
  readonly free: readonly string[]
  /** Assignments where both sides are defined. */
  readonly rows: number
  /** Assignments where a side conditions on an event of probability 0. */
  readonly skipped: number
  /** The largest |left − right| over the defined rows; 0 without rows. */
  readonly maxError: number
  /** The first assignment where the sides differ by `tolerance` or more. */
  readonly differsAt?: Assignment
}

/**
 * Compares `left` and `right` on the model's distributions at every assignment of their free
 * variables (summed variables range over their domains). Throws a ModelError (`identify-budget`)
 * past MAX_CONTEXTS assignments.
 */
export function compareDoExprs(
  model: CausalModel,
  prior: Prior,
  left: DoExpr,
  right: DoExpr,
  tolerance: number,
  evaluator: DoEvaluator = new DoEvaluator(model, prior),
): ExprComparison {
  const names = new Set([...freeOf(left), ...freeOf(right)])
  const free = model.endogenous.filter((id) => names.has(id))
  for (const id of names) if (!free.includes(id)) throw new ModelError(problem('unknown-variable', { id }))
  const count = free.reduce((n, id) => n * evaluator.domains[id].length, 1)
  if (count > MAX_CONTEXTS) throw new ModelError(problem('identify-budget', { limit: MAX_CONTEXTS }))
  evaluator.begin()
  let rows = 0
  let skipped = 0
  let maxError = 0
  let differsAt: Assignment | undefined
  const env = new Map<string, Value>()
  const walk = (i: number): void => {
    if (i === free.length) {
      const a = evaluator.evaluate(left, env)
      const b = evaluator.evaluate(right, env)
      if (a === undefined || b === undefined) {
        skipped++
        return
      }
      rows++
      const error = Math.abs(a - b)
      maxError = Math.max(maxError, error)
      if (error >= tolerance && differsAt === undefined) differsAt = Object.fromEntries(env)
      return
    }
    for (const value of evaluator.domains[free[i]]) {
      env.set(free[i], value)
      walk(i + 1)
    }
    env.delete(free[i])
  }
  walk(0)
  return { free, rows, skipped, maxError, ...(differsAt === undefined ? {} : { differsAt }) }
}
