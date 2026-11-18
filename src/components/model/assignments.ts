import type { Assignment, Value, Variable } from '../../engine/index.ts'
import { formatValue, valuesEqual } from '../../engine/values.ts'

/** Assignments of values to variables: comparing them, stepping a value, writing them as a formula, and stochastic do(). */

/** The same variables at the same values, in any order. */
export function sameAssignment(a: Assignment, b: Assignment): boolean {
  const keys = Object.keys(a)
  return keys.length === Object.keys(b).length && keys.every((id) => id in b && valuesEqual(a[id], b[id]))
}

/**
 * Stochastic interventions (Pearl 2009, pp. 113–114, a stochastic policy without conditioning):
 * P*(X=1) for each boolean variable so set, strictly between 0 and 1. The endpoints are the
 * ordinary do(X=0) and do(X=1) and live in the `Assignment` of hard interventions instead.
 */
export type Stochastic = Readonly<Record<string, number>>

/** An observation as a formula for `marginals`' `given`: `Z=1 and A='one'`; undefined when empty. */
export function observationFormula(observed: Assignment): string | undefined {
  if (Object.keys(observed).length === 0) return undefined
  const literal = (v: Value): string => (typeof v !== 'string' ? formatValue(v) : v.includes("'") ? `"${v}"` : `'${v}'`)
  return Object.entries(observed)
    .map(([id, v]) => `${id}=${literal(v)}`)
    .join(' and ')
}

/** The flipped value: booleans negate, finite domains take the next value. */
export function flipValue(variable: Variable, value: Value): Value {
  if (variable.domain.kind === 'boolean') return value !== true
  const values = variable.domain.values
  const i = values.findIndex((v) => valuesEqual(v, value))
  return values[(i + 1) % values.length]
}
