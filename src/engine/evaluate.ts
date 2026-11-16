import { evalExpr } from './expr.ts'
import type { CausalModel } from './model.ts'
import { getVariable } from './model.ts'
import type { Assignment, Edge, Value } from './types.ts'
import { ModelError, coerceToDomain } from './values.ts'

/** A partial assignment `do(X1=x1, …)`. */
export type Interventions = Assignment

export interface Evaluation {
  /** Full assignment to every exogenous and endogenous variable. */
  readonly values: Assignment
  readonly intervened: readonly string[]
  /** Edges of the mutilated graph M_{X←x}: incoming edges of intervened variables removed. */
  readonly edges: readonly Edge[]
  /** The edges `do` cut, for highlighting. */
  readonly removedEdges: readonly Edge[]
}

/** Validate a partial assignment against the model and coerce values into their domains. */
export function normalizeAssignment(model: CausalModel, assignment: Assignment): Record<string, Value> {
  const out: Record<string, Value> = {}
  for (const [id, value] of Object.entries(assignment)) {
    out[id] = coerceToDomain(getVariable(model, id), value)
  }
  return out
}

/**
 * Solve the model in `context` (values of exogenous variables) under `do(interventions)`.
 * Intervened variables keep their set value and their equations are ignored.
 */
export function evaluate(model: CausalModel, context: Assignment, interventions: Interventions = {}): Evaluation {
  const fixed = normalizeAssignment(model, interventions)
  const values: Record<string, Value> = {}
  for (const id of model.exogenous) {
    const raw = fixed[id] ?? context[id]
    if (raw === undefined) throw new ModelError(`context has no value for exogenous variable ${id}`)
    values[id] = coerceToDomain(getVariable(model, id), raw)
  }
  for (const id of model.endogenous) {
    const forced = fixed[id]
    if (forced !== undefined) {
      values[id] = forced
      continue
    }
    const expr = model.equations.get(id)
    if (expr === undefined) throw new ModelError(`no equation for ${id}`)
    values[id] = coerceToDomain(getVariable(model, id), evalExpr(expr, { values }))
  }
  const intervened = Object.keys(fixed)
  const cut = new Set(intervened)
  return {
    values,
    intervened,
    edges: model.edges.filter((e) => !cut.has(e.to)),
    removedEdges: model.edges.filter((e) => cut.has(e.to)),
  }
}
