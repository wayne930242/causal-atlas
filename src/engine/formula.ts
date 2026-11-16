import type { Expr, InterventionItem } from './expr.ts'
import { evalExpr } from './expr.ts'
import type { Interventions } from './evaluate.ts'
import { evaluate } from './evaluate.ts'
import type { CausalModel } from './model.ts'
import { checkExpr } from './model.ts'
import { parseFormula } from './parse.ts'
import type { Assignment, Value } from './types.ts'
import { asBool } from './values.ts'

/** Parse (if needed) and validate a causal formula against a model. */
export function toFormula(model: CausalModel, formula: Expr | string): Expr {
  const expr = typeof formula === 'string' ? parseFormula(formula) : formula
  checkExpr(expr, model.byId, { kind: 'formula', text: typeof formula === 'string' ? formula.trim() : '' })
  return expr
}

export function interventionsToAssignment(items: readonly InterventionItem[]): Record<string, Value> {
  const out: Record<string, Value> = {}
  for (const item of items) out[item.variable] = item.value
  return out
}

function evalIn(model: CausalModel, context: Assignment, interventions: Interventions, expr: Expr): Value {
  const { values } = evaluate(model, context, interventions)
  return evalExpr(expr, {
    values,
    // Nested `[X←x][Y←y]φ` composes: the inner intervention overrides the outer on shared variables.
    intervene: (items, body) =>
      evalIn(model, context, { ...interventions, ...interventionsToAssignment(items) }, body),
  })
}

/**
 * `(M, u) ⊨ φ` for a Halpern–Pearl causal formula φ: boolean combinations of primitive
 * events `Y=y` and of `[X←x]ψ`. Optional `interventions` evaluate in M_{X←x} instead.
 */
export function satisfies(
  model: CausalModel,
  context: Assignment,
  formula: Expr | string,
  interventions: Interventions = {},
): boolean {
  return evalFormula(model, context, toFormula(model, formula), interventions)
}

/** Like `satisfies` for an already parsed and validated formula. */
export function evalFormula(
  model: CausalModel,
  context: Assignment,
  formula: Expr,
  interventions: Interventions = {},
): boolean {
  return asBool(evalIn(model, context, interventions, formula), { kind: 'formula', text: '' })
}

/** Truth of an intervention-free formula in an already computed world. */
export function holdsIn(world: Assignment, formula: Expr): boolean {
  return asBool(evalExpr(formula, { values: world }), { kind: 'formula', text: '' })
}
