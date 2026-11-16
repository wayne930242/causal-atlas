import type { Where } from './errors.ts'
import { problem } from './errors.ts'
import type { Expr } from './expr.ts'
import { containsDo, evalExpr, freeVariables } from './expr.ts'
import { parseExpr } from './parse.ts'
import type { Edge, Value, Variable } from './types.ts'
import { ModelError, coerceToDomain, enumerateAssignments, isReservedName, valuesEqual } from './values.ts'

export interface ModelSpec {
  readonly variables: readonly Variable[]
  /** Right-hand side per endogenous variable: compact syntax or a ready AST (e.g. a lookup table). */
  readonly equations: Readonly<Record<string, string | Expr>>
}

/** A validated, acyclic structural causal model. */
export interface CausalModel {
  readonly variables: readonly Variable[]
  readonly byId: ReadonlyMap<string, Variable>
  readonly exogenous: readonly string[]
  /** Endogenous variables in a topological order of the causal graph. */
  readonly endogenous: readonly string[]
  readonly equations: ReadonlyMap<string, Expr>
  /**
   * Variables each endogenous equation mentions, in variable-declaration order. A variable the
   * equation mentions without its value ever mattering (`F := L or not L`) is listed here but has
   * no entry in `edges`.
   */
  readonly parents: ReadonlyMap<string, readonly string[]>
  /** X→Y only where Y's equation actually depends on X over the domains (see {@link dependsOn}). */
  readonly edges: readonly Edge[]
}

/** The most assignments of the other referenced variables checked per edge; beyond it a mention counts as a dependence. */
const MAX_DEPENDENCE_CHECKS = 4096

/**
 * Whether the value of `expr` changes with `from` for some setting of the other variables it
 * mentions, checked over the whole domain. Too large a check, or an equation that cannot be
 * evaluated somewhere, counts as dependent.
 */
export function dependsOn(expr: Expr, from: string, mentioned: readonly Variable[]): boolean {
  const source = mentioned.find((v) => v.id === from)
  if (source === undefined) return false
  const others = mentioned.filter((v) => v.id !== from)
  const size = mentioned.reduce((n, v) => n * (v.domain.kind === 'boolean' ? 2 : v.domain.values.length), 1)
  if (size > MAX_DEPENDENCE_CHECKS) return true
  const own = source.domain.kind === 'boolean' ? [false, true] : source.domain.values
  try {
    for (const setting of enumerateAssignments(others)) {
      let first: Value | undefined
      for (const value of own) {
        const out = evalExpr(expr, { values: { ...setting, [from]: value } })
        if (first === undefined) first = out
        else if (!valuesEqual(first, out)) return true
      }
    }
  } catch {
    return true
  }
  return false
}

export class CyclicModelError extends ModelError {
  readonly cycle: readonly string[]

  constructor(cycle: readonly string[]) {
    super(problem('cyclic', { cycle }))
    this.name = 'CyclicModelError'
    this.cycle = cycle
  }
}

export function getVariable(model: CausalModel, id: string): Variable {
  const variable = model.byId.get(id)
  if (variable === undefined) throw new ModelError(problem('unknown-variable', { id }))
  return variable
}

export function buildModel(spec: ModelSpec): CausalModel {
  const byId = new Map<string, Variable>()
  for (const variable of spec.variables) {
    if (isReservedName(variable.id)) throw new ModelError(problem('reserved-name', { id: variable.id }))
    if (byId.has(variable.id)) throw new ModelError(problem('duplicate-variable', { id: variable.id }))
    if (variable.domain.kind === 'finite' && variable.domain.values.length === 0) {
      throw new ModelError(problem('empty-domain', { id: variable.id }))
    }
    byId.set(variable.id, variable)
  }

  const equations = new Map<string, Expr>()
  for (const [id, rhs] of Object.entries(spec.equations)) {
    const variable = byId.get(id)
    if (variable === undefined) throw new ModelError(problem('equation-for-unknown', { id }))
    if (variable.kind === 'exogenous') throw new ModelError(problem('equation-for-exogenous', { id }))
    const where: Where = { kind: 'equation', id }
    const expr = typeof rhs === 'string' ? parseExpr(rhs) : rhs
    if (containsDo(expr)) throw new ModelError(problem('intervention-in-equation', {}, where))
    checkExpr(expr, byId, where, variable)
    equations.set(id, expr)
  }

  const parents = new Map<string, string[]>()
  for (const variable of spec.variables) {
    if (variable.kind === 'exogenous') continue
    const expr = equations.get(variable.id)
    if (expr === undefined) throw new ModelError(problem('missing-equation', { id: variable.id }))
    const free = freeVariables(expr)
    parents.set(
      variable.id,
      spec.variables.filter((v) => free.has(v.id)).map((v) => v.id),
    )
  }

  const endogenous = topologicalOrder(
    spec.variables.filter((v) => v.kind === 'endogenous').map((v) => v.id),
    parents,
  )
  const edges: Edge[] = []
  for (const id of endogenous) {
    const expr = equations.get(id)
    const mentioned = (parents.get(id) ?? []).map((p) => byId.get(p) as Variable)
    for (const parent of parents.get(id) ?? []) {
      if (expr !== undefined && dependsOn(expr, parent, mentioned)) edges.push({ from: parent, to: id })
    }
  }

  return {
    variables: spec.variables,
    byId,
    exogenous: spec.variables.filter((v) => v.kind === 'exogenous').map((v) => v.id),
    endogenous,
    equations,
    parents,
    edges,
  }
}

function topologicalOrder(ids: readonly string[], parents: ReadonlyMap<string, readonly string[]>): string[] {
  const order: string[] = []
  const state = new Map<string, 'visiting' | 'done'>()
  const stack: string[] = []
  const visit = (id: string): void => {
    const s = state.get(id)
    if (s === 'done') return
    if (s === 'visiting') {
      throw new CyclicModelError([...stack.slice(stack.indexOf(id)), id])
    }
    state.set(id, 'visiting')
    stack.push(id)
    for (const parent of parents.get(id) ?? []) {
      if (parents.has(parent)) visit(parent)
    }
    stack.pop()
    state.set(id, 'done')
    order.push(id)
  }
  ids.forEach(visit)
  return order
}

/**
 * Check references and that constants compared to a variable lie in its domain.
 * With an `owner` (an equation), interventions are rejected and lookup outputs are checked
 * against the owner's domain; without one (a formula), interventions are checked.
 */
export function checkExpr(
  expr: Expr,
  byId: ReadonlyMap<string, Variable>,
  where: Where,
  owner?: Variable,
): void {
  const lookupVar = (name: string): Variable => {
    const v = byId.get(name)
    if (v === undefined) throw new ModelError(problem('unknown-variable', { id: name }, where))
    return v
  }
  const checkConst = (variable: Variable, value: Value): void => {
    try {
      coerceToDomain(variable, value)
    } catch (error) {
      if (error instanceof ModelError) throw new ModelError({ ...error.problem, where })
      throw error
    }
  }
  const visit = (e: Expr): void => {
    switch (e.op) {
      case 'var':
        lookupVar(e.name)
        return
      case 'const':
        return
      case 'not':
        visit(e.arg)
        return
      case 'and':
      case 'or':
        e.args.forEach(visit)
        return
      case 'implies':
      case 'iff':
        visit(e.left)
        visit(e.right)
        return
      case 'eq':
        visit(e.left)
        visit(e.right)
        if (e.left.op === 'var' && e.right.op === 'const') checkConst(lookupVar(e.left.name), e.right.value)
        if (e.right.op === 'var' && e.left.op === 'const') checkConst(lookupVar(e.right.name), e.left.value)
        return
      case 'if':
        visit(e.cond)
        visit(e.then)
        visit(e.else)
        return
      case 'lookup': {
        const inputs = e.inputs.map(lookupVar)
        const seen = new Set<string>()
        for (const row of e.rows) {
          if (row.when.length !== inputs.length) {
            throw new ModelError(problem('lookup-row-length', { got: row.when.length, expected: inputs.length }, where))
          }
          row.when.forEach((value, i) => checkConst(inputs[i], value))
          const key = row.when.map((value, i) => String(coerceToDomain(inputs[i], value))).join('|')
          if (seen.has(key)) throw new ModelError(problem('lookup-duplicate', { key }, where))
          seen.add(key)
          if (owner !== undefined) checkConst(owner, row.value)
        }
        if (owner !== undefined && e.fallback !== undefined) checkConst(owner, e.fallback)
        return
      }
      case 'do':
        if (owner !== undefined) throw new ModelError(problem('intervention-in-equation', {}, where))
        e.interventions.forEach((item) => checkConst(lookupVar(item.variable), item.value))
        visit(e.body)
        return
    }
  }
  visit(expr)
}
