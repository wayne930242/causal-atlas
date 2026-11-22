import { problem } from '../errors.ts'
import type { Value } from '../types.ts'
import { ModelError, formatValue, valuesEqual } from '../values.ts'
import type { ProbExpr } from './prob-expr.ts'

/** One row of an observational joint distribution over the observed variables. */
export interface ObservedRow {
  readonly assignment: Readonly<Record<string, Value>>
  readonly p: number
}

/** The most expression nodes one evaluation visits (sums multiply them by the domain sizes). */
export const MAX_EXPR_EVALUATIONS = 1_000_000

/**
 * Evaluates expressions on a joint table. `undefined` marks a value the expression does not
 * define: a conditional on an event of probability 0. A product with a factor equal to 0 is 0 even
 * when another factor is undefined (the chain rule's convention: P(a) P(b | a) = 0 when P(a) = 0).
 */
export class ProbEvaluator {
  private readonly joint: readonly ObservedRow[]
  private readonly domains: Readonly<Record<string, readonly Value[]>>
  private readonly cache = new Map<string, number>()
  private steps = 0

  constructor(joint: readonly ObservedRow[], domains: Readonly<Record<string, readonly Value[]>>) {
    this.joint = joint
    this.domains = domains
  }

  /** P(event), the event a partial assignment. */
  private mass(ids: readonly string[], env: ReadonlyMap<string, Value>): number {
    if (ids.length === 0) return 1
    const values = ids.map((id) => {
      const value = env.get(id)
      if (value === undefined) throw new ModelError(problem('no-value', { id }))
      return value
    })
    const key = ids.map((id, i) => `${id}=${JSON.stringify(formatValue(values[i]))}`).join('&')
    const hit = this.cache.get(key)
    if (hit !== undefined) return hit
    let total = 0
    for (const row of this.joint) {
      let match = true
      for (let i = 0; i < ids.length; i++) {
        const value = row.assignment[ids[i]]
        if (value === undefined || !valuesEqual(value, values[i])) {
          match = false
          break
        }
      }
      if (match) total += row.p
    }
    this.cache.set(key, total)
    return total
  }

  private tick(): void {
    this.steps += 1
    if (this.steps > MAX_EXPR_EVALUATIONS) throw new ModelError(problem('identify-budget', { limit: MAX_EXPR_EVALUATIONS }))
  }

  evaluate(e: ProbExpr, env: ReadonlyMap<string, Value>): number | undefined {
    this.tick()
    switch (e.kind) {
      case 'p': {
        const given = [...e.given].sort()
        const evidence = this.mass(given, env)
        if (evidence <= 0) return undefined
        const all = [...e.vars, ...e.given].sort()
        return this.mass(all, env) / evidence
      }
      case 'sum': {
        const domains = e.over.map((id) => {
          const d = this.domains[id]
          if (d === undefined) throw new ModelError(problem('unknown-variable', { id }))
          return d
        })
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
          for (const value of domains[i]) {
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

/**
 * The value of `e` on the observational `joint`, with its free variables set by `at`; summed
 * variables range over `domains`. Throws a ModelError (`zero-probability-evidence`) when the
 * expression conditions on an event of probability 0, and (`no-value`) when `at` misses a free
 * variable.
 */
export function evaluateProbExpr(
  e: ProbExpr,
  joint: readonly ObservedRow[],
  at: Readonly<Record<string, Value>>,
  domains: Readonly<Record<string, readonly Value[]>>,
): number {
  const value = new ProbEvaluator(joint, domains).evaluate(e, new Map(Object.entries(at)))
  if (value === undefined) throw new ModelError(problem('zero-probability-evidence', {}))
  return value
}
