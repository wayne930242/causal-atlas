import { problem } from './errors.ts'
import type { Expr } from './expr.ts'
import type { CausalModel } from './model.ts'
import { getVariable } from './model.ts'
import type { Value } from './types.ts'
import { ModelError, valuesEqual } from './values.ts'

/**
 * Arithmetic (0/1-valued) form of an equation, as the SEM literature in philosophy writes it:
 * ¬A = 1−A, A∧B = A·B, A∨B = max(A, B), 𝟙[X=v] for finite domains, piecewise cases for tables.
 */
export type Arith =
  | { readonly op: 'num'; readonly value: number | string }
  | { readonly op: 'var'; readonly name: string }
  | { readonly op: 'sub'; readonly left: Arith; readonly right: Arith }
  | { readonly op: 'add'; readonly args: readonly Arith[] }
  | { readonly op: 'mul'; readonly args: readonly Arith[] }
  | { readonly op: 'max'; readonly args: readonly Arith[] }
  | { readonly op: 'abs'; readonly arg: Arith }
  | { readonly op: 'ind'; readonly left: Arith; readonly right: Arith }
  | { readonly op: 'cases'; readonly rows: readonly CaseRow[]; readonly otherwise?: Arith }

export interface CaseRow {
  readonly value: Arith
  /** All pairs must be equal for the row to apply. */
  readonly when: readonly { readonly left: Arith; readonly right: Arith }[]
}

const num = (value: number | string): Arith => ({ op: 'num', value })
const one = num(1)
const oneMinus = (arg: Arith): Arith => ({ op: 'sub', left: one, right: arg })

function constArith(value: Value): Arith {
  return num(typeof value === 'boolean' ? (value ? 1 : 0) : value)
}

/** Translate a (do-free) equation body into arithmetic. */
export function toArith(model: CausalModel, expr: Expr): Arith {
  const go = (e: Expr): Arith => {
    switch (e.op) {
      case 'var':
        return { op: 'var', name: e.name }
      case 'const':
        return constArith(e.value)
      case 'not':
        return oneMinus(go(e.arg))
      case 'and':
        return e.args.length === 1 ? go(e.args[0]) : { op: 'mul', args: e.args.map(go) }
      case 'or':
        return e.args.length === 1 ? go(e.args[0]) : { op: 'max', args: e.args.map(go) }
      case 'implies':
        return { op: 'max', args: [oneMinus(go(e.left)), go(e.right)] }
      case 'iff':
        return oneMinus({ op: 'abs', arg: { op: 'sub', left: go(e.left), right: go(e.right) } })
      case 'eq': {
        const lit = (x: Expr, y: Expr): Arith | undefined => {
          if (x.op !== 'var' || y.op !== 'const' || typeof y.value !== 'boolean') return undefined
          if (getVariable(model, x.name).domain.kind !== 'boolean') return undefined
          return y.value === !e.negated ? go(x) : oneMinus(go(x))
        }
        const simple = lit(e.left, e.right) ?? lit(e.right, e.left)
        if (simple !== undefined) return simple
        const ind: Arith = { op: 'ind', left: go(e.left), right: go(e.right) }
        return e.negated ? oneMinus(ind) : ind
      }
      case 'if': {
        const then = go(e.then)
        const other = go(e.else)
        const stringy = (a: Arith): boolean => a.op === 'num' && typeof a.value === 'string'
        if (stringy(then) || stringy(other)) {
          return { op: 'cases', rows: [{ value: then, when: [{ left: go(e.cond), right: one }] }], otherwise: other }
        }
        const cond = go(e.cond)
        return { op: 'add', args: [{ op: 'mul', args: [cond, then] }, { op: 'mul', args: [oneMinus(cond), other] }] }
      }
      case 'lookup':
        return {
          op: 'cases',
          rows: e.rows.map((row) => ({
            value: constArith(row.value),
            when: e.inputs.map((name, i) => ({ left: { op: 'var', name } as Arith, right: constArith(row.when[i]) })),
          })),
          otherwise: e.fallback === undefined ? undefined : constArith(e.fallback),
        }
      case 'do':
        throw new ModelError(problem('arithmetic-intervention', {}))
    }
  }
  return go(expr)
}

type Num = number | string

const toNum = (v: Value): Num => (typeof v === 'boolean' ? (v ? 1 : 0) : v)

function asNumber(v: Num): number {
  if (typeof v !== 'number') throw new ModelError(problem('arithmetic-non-number', { value: JSON.stringify(v) }))
  return v
}

/** Evaluate an arithmetic AST numerically (booleans as 0/1). */
export function evalArith(a: Arith, values: Readonly<Record<string, Value>>): Num {
  const ev = (x: Arith): Num => evalArith(x, values)
  const n = (x: Arith): number => asNumber(ev(x))
  switch (a.op) {
    case 'num':
      return a.value
    case 'var': {
      const v = values[a.name]
      if (v === undefined) throw new ModelError(problem('no-value', { id: a.name }))
      return toNum(v)
    }
    case 'sub':
      return n(a.left) - n(a.right)
    case 'add':
      return a.args.reduce((s, x) => s + n(x), 0)
    case 'mul':
      return a.args.reduce((s, x) => s * n(x), 1)
    case 'max':
      return Math.max(...a.args.map(n))
    case 'abs':
      return Math.abs(n(a.arg))
    case 'ind':
      return valuesEqual(ev(a.left), ev(a.right)) ? 1 : 0
    case 'cases': {
      for (const row of a.rows) {
        if (row.when.every((w) => valuesEqual(ev(w.left), ev(w.right)))) return ev(row.value)
      }
      if (a.otherwise !== undefined) return ev(a.otherwise)
      throw new ModelError(problem('arithmetic-no-case', {}))
    }
  }
}
