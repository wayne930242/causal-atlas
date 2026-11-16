import type { Expr } from './expr.ts'
import { containsDo, freeVariables } from './expr.ts'
import { parseExpr } from './parse.ts'
import type { Edge, Value, Variable } from './types.ts'
import { ModelError, coerceToDomain, isReservedName } from './values.ts'

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
  /** Direct causes of each endogenous variable, in variable-declaration order. */
  readonly parents: ReadonlyMap<string, readonly string[]>
  readonly edges: readonly Edge[]
}

export class CyclicModelError extends ModelError {
  readonly cycle: readonly string[]

  constructor(cycle: readonly string[]) {
    super(`model is cyclic: ${cycle.join(' → ')}`)
    this.name = 'CyclicModelError'
    this.cycle = cycle
  }
}

export function getVariable(model: CausalModel, id: string): Variable {
  const variable = model.byId.get(id)
  if (variable === undefined) throw new ModelError(`unknown variable ${id}`)
  return variable
}

export function buildModel(spec: ModelSpec): CausalModel {
  const byId = new Map<string, Variable>()
  for (const variable of spec.variables) {
    if (isReservedName(variable.id)) throw new ModelError(`${variable.id} is a reserved name and cannot be a variable`)
    if (byId.has(variable.id)) throw new ModelError(`duplicate variable ${variable.id}`)
    if (variable.domain.kind === 'finite' && variable.domain.values.length === 0) {
      throw new ModelError(`variable ${variable.id} has an empty domain`)
    }
    byId.set(variable.id, variable)
  }

  const equations = new Map<string, Expr>()
  for (const [id, rhs] of Object.entries(spec.equations)) {
    const variable = byId.get(id)
    if (variable === undefined) throw new ModelError(`equation for unknown variable ${id}`)
    if (variable.kind === 'exogenous') throw new ModelError(`exogenous variable ${id} cannot have an equation`)
    const expr = typeof rhs === 'string' ? parseExpr(rhs) : rhs
    if (containsDo(expr)) throw new ModelError(`equation for ${id} contains an intervention`)
    checkExpr(expr, byId, `equation for ${id}`, variable)
    equations.set(id, expr)
  }

  const parents = new Map<string, string[]>()
  for (const variable of spec.variables) {
    if (variable.kind === 'exogenous') continue
    const expr = equations.get(variable.id)
    if (expr === undefined) throw new ModelError(`endogenous variable ${variable.id} has no equation`)
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
    for (const parent of parents.get(id) ?? []) edges.push({ from: parent, to: id })
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
  where: string,
  owner?: Variable,
): void {
  const lookupVar = (name: string): Variable => {
    const v = byId.get(name)
    if (v === undefined) throw new ModelError(`${where}: unknown variable ${name}`)
    return v
  }
  const checkConst = (variable: Variable, value: Value): void => {
    try {
      coerceToDomain(variable, value)
    } catch (error) {
      throw new ModelError(`${where}: ${(error as Error).message}`)
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
            throw new ModelError(`${where}: lookup row has ${row.when.length} inputs, expected ${inputs.length}`)
          }
          row.when.forEach((value, i) => checkConst(inputs[i], value))
          const key = row.when.map((value, i) => String(coerceToDomain(inputs[i], value))).join('|')
          if (seen.has(key)) throw new ModelError(`${where}: lookup lists inputs (${key}) twice`)
          seen.add(key)
          if (owner !== undefined) checkConst(owner, row.value)
        }
        if (owner !== undefined && e.fallback !== undefined) checkConst(owner, e.fallback)
        return
      }
      case 'do':
        if (owner !== undefined) throw new ModelError(`${where}: interventions are not allowed in equations`)
        e.interventions.forEach((item) => checkConst(lookupVar(item.variable), item.value))
        visit(e.body)
        return
    }
  }
  visit(expr)
}
