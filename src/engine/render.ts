import type { Expr, LookupExpr } from './expr.ts'
import { evalExpr } from './expr.ts'
import type { CausalModel } from './model.ts'
import { getVariable } from './model.ts'
import type { Value } from './types.ts'
import { coerceToDomain, enumerateAssignments, formatValue } from './values.ts'

export type RenderFormat = 'text' | 'latex'

/** (a) `BS := ST ∨ BT`, (b) `BS ↔ (ST ∨ BT)`, (c) `[ST←1, BT←0](BS=1) ∧ …`. */
export type Notation = 'structural' | 'propositional' | 'causal'

interface Symbols {
  readonly not: string
  readonly and: string
  readonly or: string
  readonly implies: string
  readonly iff: string
  readonly eq: string
  readonly neq: string
  readonly assign: string
  readonly gets: string
}

const TEXT: Symbols = {
  not: '¬',
  and: ' ∧ ',
  or: ' ∨ ',
  implies: ' → ',
  iff: ' ↔ ',
  eq: '=',
  neq: '≠',
  assign: ' := ',
  gets: '←',
}

const LATEX: Symbols = {
  not: '\\lnot ',
  and: ' \\land ',
  or: ' \\lor ',
  implies: ' \\rightarrow ',
  iff: ' \\leftrightarrow ',
  eq: '=',
  neq: '\\neq ',
  assign: ' := ',
  gets: '\\leftarrow ',
}

const symbolsFor = (format: RenderFormat): Symbols => (format === 'text' ? TEXT : LATEX)

function latexIdent(name: string): string {
  const word = (w: string): string => (w.length === 1 ? w : `\\mathit{${w.replace(/_/g, '\\_')}}`)
  const underscore = name.indexOf('_')
  if (underscore > 0 && underscore < name.length - 1) {
    return `${word(name.slice(0, underscore))}_{${word(name.slice(underscore + 1))}}`
  }
  return word(name)
}

export function renderIdent(name: string, format: RenderFormat): string {
  return format === 'text' ? name : latexIdent(name)
}

export function renderValue(value: Value, format: RenderFormat): string {
  if (typeof value === 'string' && format === 'latex') return `\\text{${value}}`
  return formatValue(value)
}

// Binding strength: higher binds tighter.
const PREC = { iff: 1, implies: 2, or: 3, and: 4, unary: 5, eq: 6, atom: 7 } as const

function precedence(expr: Expr): number {
  switch (expr.op) {
    case 'iff':
      return PREC.iff
    case 'implies':
      return PREC.implies
    case 'or':
      return PREC.or
    case 'and':
      return PREC.and
    case 'not':
    case 'do':
      return PREC.unary
    case 'eq':
      return PREC.eq
    case 'if':
      return 0
    case 'var':
    case 'const':
    case 'lookup':
      return PREC.atom
  }
}

/** Render an expression or causal formula with minimal parentheses. */
export function renderExpr(expr: Expr, format: RenderFormat): string {
  const s = symbolsFor(format)
  const go = (e: Expr, min: number): string => {
    const body = raw(e)
    return precedence(e) < min ? `(${body})` : body
  }
  const raw = (e: Expr): string => {
    switch (e.op) {
      case 'var':
        return renderIdent(e.name, format)
      case 'const':
        return renderValue(e.value, format)
      case 'not':
        return `${s.not}${go(e.arg, PREC.unary)}`
      case 'and':
        return e.args.map((a) => go(a, PREC.and + 1)).join(s.and)
      case 'or':
        return e.args.map((a) => go(a, PREC.or + 1)).join(s.or)
      case 'implies':
        return `${go(e.left, PREC.implies + 1)}${s.implies}${go(e.right, PREC.implies)}`
      case 'iff':
        return `${go(e.left, PREC.iff)}${s.iff}${go(e.right, PREC.iff + 1)}`
      case 'eq':
        return `${go(e.left, PREC.atom)}${e.negated ? s.neq : s.eq}${go(e.right, PREC.atom)}`
      case 'if':
        return format === 'text'
          ? `if ${go(e.cond, 1)} then ${go(e.then, 1)} else ${go(e.else, 1)}`
          : `\\textbf{if}\\ ${go(e.cond, 1)}\\ \\textbf{then}\\ ${go(e.then, 1)}\\ \\textbf{else}\\ ${go(e.else, 1)}`
      case 'lookup':
        return `table(${e.inputs.map((n) => renderIdent(n, format)).join(', ')})`
      case 'do': {
        const items = e.interventions
          .map((i) => `${renderIdent(i.variable, format)}${s.gets}${renderValue(i.value, format)}`)
          .join(', ')
        return `[${items}]${go(e.body, PREC.atom)}`
      }
    }
  }
  return go(expr, 0)
}

function rowCondition(lookup: LookupExpr, when: readonly Value[]): Expr {
  const conds: Expr[] = lookup.inputs.map((name, i) => ({
    op: 'eq',
    left: { op: 'var', name },
    right: { op: 'const', value: when[i] },
    negated: false,
  }))
  return conds.length === 1 ? conds[0] : { op: 'and', args: conds }
}

function eventExpr(id: string, value: Value): Expr {
  return { op: 'eq', left: { op: 'var', name: id }, right: { op: 'const', value }, negated: false }
}

function renderStructural(model: CausalModel, id: string, format: RenderFormat): string {
  const expr = equationOf(model, id)
  const s = symbolsFor(format)
  const lhs = renderIdent(id, format)
  if (expr.op !== 'lookup') return `${lhs}${s.assign}${renderExpr(expr, format)}`
  const rows = expr.rows.map((row) => ({
    value: renderValue(row.value, format),
    cond: renderExpr(rowCondition(expr, row.when), format),
  }))
  const fallback = expr.fallback === undefined ? [] : [{ value: renderValue(expr.fallback, format), cond: '' }]
  if (format === 'text') {
    const parts = [...rows, ...fallback].map((r) => (r.cond === '' ? `${r.value} otherwise` : `${r.value} if ${r.cond}`))
    return `${lhs}${s.assign}{ ${parts.join('; ')} }`
  }
  const parts = [...rows, ...fallback].map((r) =>
    r.cond === '' ? `${r.value} & \\text{otherwise}` : `${r.value} & \\text{if } ${r.cond}`,
  )
  return `${lhs}${s.assign}\\begin{cases} ${parts.join(' \\\\ ')} \\end{cases}`
}

/** The equation as a propositional formula over primitive events. */
function propositionalExpr(model: CausalModel, id: string, expr: Expr): Expr {
  const target = getVariable(model, id)
  if (expr.op === 'lookup') {
    const conjuncts: Expr[] = expr.rows.map((row) => ({
      op: 'implies',
      left: rowCondition(expr, row.when),
      right: eventExpr(id, coerceToDomain(target, row.value)),
    }))
    if (expr.fallback !== undefined) {
      const none: Expr = { op: 'not', arg: { op: 'or', args: expr.rows.map((r) => rowCondition(expr, r.when)) } }
      conjuncts.push({ op: 'implies', left: none, right: eventExpr(id, coerceToDomain(target, expr.fallback)) })
    }
    return conjuncts.length === 1 ? conjuncts[0] : { op: 'and', args: conjuncts }
  }
  if (expr.op === 'if') {
    return {
      op: 'and',
      args: [
        { op: 'implies', left: expr.cond, right: propositionalExpr(model, id, expr.then) },
        { op: 'implies', left: { op: 'not', arg: expr.cond }, right: propositionalExpr(model, id, expr.else) },
      ],
    }
  }
  if (target.domain.kind === 'boolean') {
    return { op: 'iff', left: { op: 'var', name: id }, right: expr }
  }
  return { op: 'eq', left: { op: 'var', name: id }, right: expr, negated: false }
}

/**
 * The equation in the Halpern–Pearl causal language: one conjunct per setting of the
 * parents. Endogenous parents are intervened on (`[ST←1, BT←0](BS=1)`); exogenous
 * parents, which interventions on endogenous variables never change, become antecedents
 * (`U_ST=1 → ST=1`).
 */
export function causalFormulas(model: CausalModel, id: string): Expr[] {
  const expr = equationOf(model, id)
  const parents = (model.parents.get(id) ?? []).map((p) => getVariable(model, p))
  const target = getVariable(model, id)
  const formulas: Expr[] = []
  for (const setting of enumerateAssignments(parents)) {
    const value = coerceToDomain(target, evalExpr(expr, { values: setting }))
    const endo = parents.filter((p) => p.kind === 'endogenous')
    const exo = parents.filter((p) => p.kind === 'exogenous')
    let body: Expr = eventExpr(id, value)
    if (endo.length > 0) {
      body = { op: 'do', interventions: endo.map((p) => ({ variable: p.id, value: setting[p.id] })), body }
    }
    if (exo.length > 0) {
      const conds = exo.map((p) => eventExpr(p.id, setting[p.id]))
      body = { op: 'implies', left: conds.length === 1 ? conds[0] : { op: 'and', args: conds }, right: body }
    }
    formulas.push(body)
  }
  return formulas
}

function equationOf(model: CausalModel, id: string): Expr {
  const expr = model.equations.get(id)
  if (expr === undefined) throw new Error(`${id} has no equation (is it exogenous?)`)
  return expr
}

/** Render one endogenous variable's equation in the given notation. */
export function renderEquation(model: CausalModel, id: string, notation: Notation, format: RenderFormat): string {
  switch (notation) {
    case 'structural':
      return renderStructural(model, id, format)
    case 'propositional': {
      const prop = propositionalExpr(model, id, equationOf(model, id))
      if (prop.op === 'iff' && precedence(prop.right) < PREC.atom) {
        // Bracket the right-hand side so the formula reads as the equation: BS ↔ (ST ∨ BT).
        const s = symbolsFor(format)
        return `${renderExpr(prop.left, format)}${s.iff}(${renderExpr(prop.right, format)})`
      }
      return renderExpr(prop, format)
    }
    case 'causal': {
      const formulas = causalFormulas(model, id)
      return formulas.length === 1
        ? renderExpr(formulas[0], format)
        : renderExpr({ op: 'and', args: formulas }, format)
    }
  }
}

/** Render every equation, in topological order. */
export function renderModel(model: CausalModel, notation: Notation, format: RenderFormat): string[] {
  return model.endogenous.map((id) => renderEquation(model, id, notation, format))
}
