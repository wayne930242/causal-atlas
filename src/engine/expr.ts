import type { Assignment, Value } from './types.ts'
import { ModelError, asBool, valuesEqual } from './values.ts'

/**
 * Expression AST shared by structural equations and by the Halpern–Pearl causal
 * formula language. The `do` node (`[X←x]φ`) is only legal in formulas; models
 * reject equations that contain it.
 */
export type Expr =
  | VarRef
  | Const
  | NotExpr
  | AndExpr
  | OrExpr
  | ImpliesExpr
  | IffExpr
  | EqExpr
  | IfExpr
  | LookupExpr
  | DoExpr

export interface VarRef {
  readonly op: 'var'
  readonly name: string
}

export interface Const {
  readonly op: 'const'
  readonly value: Value
}

export interface NotExpr {
  readonly op: 'not'
  readonly arg: Expr
}

export interface AndExpr {
  readonly op: 'and'
  readonly args: readonly Expr[]
}

export interface OrExpr {
  readonly op: 'or'
  readonly args: readonly Expr[]
}

export interface ImpliesExpr {
  readonly op: 'implies'
  readonly left: Expr
  readonly right: Expr
}

export interface IffExpr {
  readonly op: 'iff'
  readonly left: Expr
  readonly right: Expr
}

/** `left = right`; `negated` renders and evaluates as `left ≠ right`. */
export interface EqExpr {
  readonly op: 'eq'
  readonly left: Expr
  readonly right: Expr
  readonly negated: boolean
}

export interface IfExpr {
  readonly op: 'if'
  readonly cond: Expr
  readonly then: Expr
  readonly else: Expr
}

export interface LookupRow {
  readonly when: readonly Value[]
  readonly value: Value
}

/** Explicit table: the row whose `when` matches the inputs (rows are distinct), else `fallback`. */
export interface LookupExpr {
  readonly op: 'lookup'
  readonly inputs: readonly string[]
  readonly rows: readonly LookupRow[]
  readonly fallback?: Value
}

export interface InterventionItem {
  readonly variable: string
  readonly value: Value
}

/** Halpern–Pearl `[X1←x1, …, Xk←xk] body`. */
export interface DoExpr {
  readonly op: 'do'
  readonly interventions: readonly InterventionItem[]
  readonly body: Expr
}

/** How evaluation resolves variables and `[X←x]` subformulas. */
export interface EvalEnv {
  readonly values: Assignment
  /** Evaluates `body` in the world obtained by applying extra interventions; absent for equations. */
  readonly intervene?: (interventions: readonly InterventionItem[], body: Expr) => Value
}

export function evalExpr(expr: Expr, env: EvalEnv): Value {
  switch (expr.op) {
    case 'var': {
      const value = env.values[expr.name]
      if (value === undefined) throw new ModelError(`variable ${expr.name} has no value yet`)
      return value
    }
    case 'const':
      return expr.value
    case 'not':
      return !asBool(evalExpr(expr.arg, env), 'not')
    case 'and':
      return expr.args.every((a) => asBool(evalExpr(a, env), 'and'))
    case 'or':
      return expr.args.some((a) => asBool(evalExpr(a, env), 'or'))
    case 'implies':
      return !asBool(evalExpr(expr.left, env), 'implies') || asBool(evalExpr(expr.right, env), 'implies')
    case 'iff':
      return asBool(evalExpr(expr.left, env), 'iff') === asBool(evalExpr(expr.right, env), 'iff')
    case 'eq': {
      const equal = valuesEqual(evalExpr(expr.left, env), evalExpr(expr.right, env))
      return expr.negated ? !equal : equal
    }
    case 'if':
      return asBool(evalExpr(expr.cond, env), 'if')
        ? evalExpr(expr.then, env)
        : evalExpr(expr.else, env)
    case 'lookup': {
      const inputs = expr.inputs.map((name) => evalExpr({ op: 'var', name }, env))
      for (const row of expr.rows) {
        if (row.when.every((w, i) => valuesEqual(w, inputs[i]))) return row.value
      }
      if (expr.fallback !== undefined) return expr.fallback
      throw new ModelError(`lookup on (${expr.inputs.join(', ')}) has no row for (${inputs.join(', ')})`)
    }
    case 'do':
      if (env.intervene === undefined) {
        throw new ModelError('[X←x] formulas can only be evaluated against a model and context')
      }
      return env.intervene(expr.interventions, expr.body)
  }
}

/** Variables an expression reads, excluding variables only intervened on inside `[X←x]`. */
export function freeVariables(expr: Expr): Set<string> {
  const out = new Set<string>()
  const visit = (e: Expr): void => {
    switch (e.op) {
      case 'var':
        out.add(e.name)
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
      case 'eq':
        visit(e.left)
        visit(e.right)
        return
      case 'if':
        visit(e.cond)
        visit(e.then)
        visit(e.else)
        return
      case 'lookup':
        e.inputs.forEach((name) => out.add(name))
        return
      case 'do':
        e.interventions.forEach((i) => out.add(i.variable))
        visit(e.body)
        return
    }
  }
  visit(expr)
  return out
}

export function containsDo(expr: Expr): boolean {
  switch (expr.op) {
    case 'do':
      return true
    case 'var':
    case 'const':
    case 'lookup':
      return false
    case 'not':
      return containsDo(expr.arg)
    case 'and':
    case 'or':
      return expr.args.some(containsDo)
    case 'implies':
    case 'iff':
    case 'eq':
      return containsDo(expr.left) || containsDo(expr.right)
    case 'if':
      return containsDo(expr.cond) || containsDo(expr.then) || containsDo(expr.else)
  }
}
