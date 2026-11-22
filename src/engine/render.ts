import type { Arith } from './arithmetic.ts'
import { toArith } from './arithmetic.ts'
import type { Expr, LookupExpr } from './expr.ts'
import { evalExpr } from './expr.ts'
import { digitSubscript } from './identifier-format.ts'
import type { CausalModel } from './model.ts'
import { getVariable } from './model.ts'
import type { Assignment, Value, Variable } from './types.ts'
import { coerceToDomain, domainValues, enumerateAssignments, formatValue, valuesEqual } from './values.ts'

export type RenderFormat = 'text' | 'latex'

/**
 * (a) `BS := ST ∨ BT`, (b) `BS ↔ (ST ∨ BT)`, (c) `[ST←1, BT←0](BS=1) ∧ …`, (d) `BS = ST + BT − ST·BT`,
 * (e) piecewise `Y = { A11 if X=1, U=1; A10 if X=1, U=0; A0 if X=0 }`.
 */
export type Notation = 'structural' | 'propositional' | 'causal' | 'arithmetic' | 'cases'

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
  const digit = digitSubscript(name)
  if (digit !== undefined) {
    const { head, sub } = digit
    return `${word(head)}_${sub.length === 1 ? sub : `{${sub}}`}`
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
  return [...enumerateAssignments(parents)].map((setting) =>
    causalFormula(model, id, parents.map((p) => p.id), setting, coerceToDomain(target, evalExpr(expr, { values: setting }))),
  )
}

/** One row of a causal table: the parents it names, the value they give, and the row as a formula. */
export interface CausalRow {
  /** Every endogenous parent, and the exogenous parents that decide the value here. */
  readonly setting: Assignment
  readonly value: Value
  readonly formula: Expr
}

/** `[endo←e](id=v)`, under the exogenous antecedents of `setting`, in the parents' order. */
function causalFormula(model: CausalModel, id: string, order: readonly string[], setting: Assignment, value: Value): Expr {
  const named = order.filter((p) => setting[p] !== undefined).map((p) => getVariable(model, p))
  const endo = named.filter((p) => p.kind === 'endogenous')
  const exo = named.filter((p) => p.kind === 'exogenous')
  let body: Expr = eventExpr(id, value)
  if (endo.length > 0) {
    body = { op: 'do', interventions: endo.map((p) => ({ variable: p.id, value: setting[p.id] })), body }
  }
  if (exo.length > 0) {
    const conds = exo.map((p) => eventExpr(p.id, setting[p.id]))
    body = { op: 'implies', left: conds.length === 1 ? conds[0] : { op: 'and', args: conds }, right: body }
  }
  return body
}

/**
 * The causal table of `id` with the exogenous parents that do not matter left out: per setting of
 * the endogenous parents (each row intervenes on all of them), a decision tree over the exogenous
 * ones, in the parents' order, that splits on the first one the value still depends on. The rows
 * partition the settings of the parents, so together they say what `causalFormulas` says; bow A's
 * Y has 6 rows instead of 32 (`U=0 ∧ A10=1 → [X←1](Y=1)`).
 */
export function causalRows(model: CausalModel, id: string): CausalRow[] {
  const expr = equationOf(model, id)
  const target = getVariable(model, id)
  const order = model.parents.get(id) ?? []
  const parents = order.map((p) => getVariable(model, p))
  const endo = parents.filter((p) => p.kind === 'endogenous')
  const exo = parents.filter((p) => p.kind === 'exogenous')
  const valueAt = (setting: Assignment): Value => coerceToDomain(target, evalExpr(expr, { values: setting }))
  const completions = (fixed: Assignment, free: readonly Variable[]): Assignment[] =>
    [...enumerateAssignments(free)].map((rest) => ({ ...fixed, ...rest }))
  const rows: CausalRow[] = []
  const split = (fixed: Assignment, free: readonly Variable[]): void => {
    const all = completions(fixed, free)
    const first = valueAt(all[0])
    if (all.every((a) => valuesEqual(valueAt(a), first))) {
      rows.push({ setting: fixed, value: first, formula: causalFormula(model, id, order, fixed, first) })
      return
    }
    // The first free parent that changes the value for some setting of the others.
    const decides = free.find((x) => {
      const others = free.filter((o) => o !== x)
      return completions(fixed, others).some((a) => {
        const seen = domainValues(x.domain).map((v) => valueAt({ ...a, [x.id]: v }))
        return seen.some((v) => !valuesEqual(v, seen[0]))
      })
    })
    if (decides === undefined) throw new Error(`${id}: no parent decides the value`)
    for (const v of domainValues(decides.domain)) split({ ...fixed, [decides.id]: v }, free.filter((o) => o !== decides))
  }
  for (const setting of enumerateAssignments(endo)) split(setting, exo)
  return rows
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
    case 'arithmetic':
      return renderArithEquation(model, id, format)
    case 'cases':
      return renderCasesEquation(model, id, format)
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

// Arithmetic notation: precedence 1 sum/difference, 2 product, 3 atom.
export function renderArith(a: Arith, format: RenderFormat): string {
  const latex = format === 'latex'
  const go = (x: Arith, min: number): string => {
    const [body, prec] = raw(x)
    return prec < min ? `(${body})` : body
  }
  const raw = (x: Arith): [string, number] => {
    switch (x.op) {
      case 'num':
        return [typeof x.value === 'string' ? (latex ? `\\text{${x.value}}` : x.value) : String(x.value), 3]
      case 'var':
        return [renderIdent(x.name, format), 3]
      case 'sub':
        return [`${go(x.left, 1)}${latex ? ' - ' : '−'}${go(x.right, 2)}`, 1]
      case 'add':
        return [x.args.map((y) => go(y, 1)).join(' + '), 1]
      case 'mul':
        return [x.args.map((y) => go(y, 2)).join(latex ? ' \\cdot ' : '·'), 2]
      case 'max':
        return [`${latex ? '\\max' : 'max'}(${x.args.map((y) => go(y, 0)).join(', ')})`, 3]
      case 'abs':
        return [latex ? `\\lvert ${go(x.arg, 0)} \\rvert` : `|${go(x.arg, 0)}|`, 3]
      case 'ind':
        return [`${latex ? '\\mathbb{1}' : '𝟙'}[${go(x.left, 0)}=${go(x.right, 0)}]`, 3]
      case 'cases': {
        const cond = (r: (typeof x.rows)[number]): string =>
          r.when.map((w) => `${go(w.left, 0)}=${go(w.right, 0)}`).join(', ')
        const rows = x.rows.map((r) => ({ value: go(r.value, 0), cond: cond(r) }))
        const other = x.otherwise === undefined ? [] : [{ value: go(x.otherwise, 0), cond: '' }]
        const all = [...rows, ...other]
        if (!latex) {
          return [`{ ${all.map((r) => (r.cond === '' ? `${r.value} otherwise` : `${r.value} if ${r.cond}`)).join('; ')} }`, 3]
        }
        const parts = all.map((r) => (r.cond === '' ? `${r.value} & \\text{otherwise}` : `${r.value} & \\text{if } ${r.cond}`))
        return [`\\begin{cases} ${parts.join(' \\\\ ')} \\end{cases}`, 3]
      }
    }
  }
  return go(a, 0)
}

function renderArithEquation(model: CausalModel, id: string, format: RenderFormat): string {
  return `${renderIdent(id, format)} = ${renderArith(toArith(model, equationOf(model, id)), format)}`
}

/** One row of the piecewise notation: the conditions that pick it (all must hold) and the value it gives. */
export interface CasePiece {
  readonly when: readonly Expr[]
  readonly value: Expr
}

const isBoolVar = (model: CausalModel, e: Expr): e is { op: 'var'; name: string } =>
  e.op === 'var' && getVariable(model, e.name).domain.kind === 'boolean'

/** A condition with its two-valued variables written as events: `X` → `X=1`, `¬X` → `X=0`. */
function literalize(model: CausalModel, e: Expr): Expr {
  if (isBoolVar(model, e)) return eventExpr(e.name, true)
  switch (e.op) {
    case 'not':
      return isBoolVar(model, e.arg) ? eventExpr(e.arg.name, false) : negate(model, e.arg)
    case 'and':
    case 'or':
      return { op: e.op, args: e.args.map((a) => literalize(model, a)) }
    default:
      return e
  }
}

/** The negation of a condition, pushed down to its events (De Morgan), so no `¬(…)` is left to read. */
function negate(model: CausalModel, e: Expr): Expr {
  if (isBoolVar(model, e)) return eventExpr(e.name, false)
  switch (e.op) {
    case 'not':
      return literalize(model, e.arg)
    case 'and':
      return { op: 'or', args: e.args.map((a) => negate(model, a)) }
    case 'or':
      return { op: 'and', args: e.args.map((a) => negate(model, a)) }
    case 'eq': {
      // A two-valued variable's other value reads better than `≠`: ¬(X=1) is X=0.
      const flip = (v: Expr, c: Expr): Expr | undefined =>
        isBoolVar(model, v) && c.op === 'const' && (typeof c.value === 'boolean' || c.value === 0 || c.value === 1)
          ? eventExpr(v.name, e.negated === (c.value === true || c.value === 1))
          : undefined
      return flip(e.left, e.right) ?? flip(e.right, e.left) ?? { ...e, negated: !e.negated }
    }
    case 'const':
      return { op: 'const', value: typeof e.value === 'boolean' ? !e.value : e.value }
    default:
      return { op: 'not', arg: e }
  }
}

/** A conjunction becomes separate conditions, read as the comma in `X=1, U=1`. */
const conjuncts = (e: Expr): Expr[] => (e.op === 'and' ? e.args.flatMap(conjuncts) : [e])

/**
 * The equation of `id` as condition rows. Nested `if`s are flattened: each branch's row carries every
 * condition on the way to it (`if X then (if U then A11 else A10) else A0` gives three rows). A table
 * gives one row per entry. Any other two-valued equation gives a row for 1 and one for 0
 * (`BS = ST ∨ BT`: 1 when ST=1 ∨ BT=1, 0 when ST=0, BT=0); a bare variable or constant, or a
 * many-valued equation without `if`, gives no rows (`renderEquation` then falls back).
 */
export function casePieces(model: CausalModel, id: string): CasePiece[] {
  const expr = equationOf(model, id)
  const target = getVariable(model, id)
  const walk = (e: Expr, when: readonly Expr[]): CasePiece[] =>
    e.op === 'if'
      ? [
          ...walk(e.then, [...when, ...conjuncts(literalize(model, e.cond))]),
          ...walk(e.else, [...when, ...conjuncts(negate(model, e.cond))]),
        ]
      : [{ when, value: e }]
  if (expr.op === 'if') return walk(expr, [])
  if (expr.op === 'lookup') {
    return expr.rows.map((row) => ({
      when: conjuncts(rowCondition(expr, row.when)),
      value: { op: 'const', value: coerceToDomain(target, row.value) },
    }))
  }
  if (target.domain.kind === 'boolean' && expr.op !== 'var' && expr.op !== 'const') {
    return [
      { when: conjuncts(literalize(model, expr)), value: { op: 'const', value: true } },
      { when: conjuncts(negate(model, expr)), value: { op: 'const', value: false } },
    ]
  }
  return []
}

/**
 * The piecewise notation: `Y = { A11 if X=1, U=1; A10 if X=1, U=0; A0 if X=0 }`, in LaTeX a `cases`
 * block with the conditions in the right column. A table's fallback is the row `otherwise`. With no
 * rows (`C = U`, a many-valued sum) the equation is written as in the arithmetic notation.
 */
function renderCasesEquation(model: CausalModel, id: string, format: RenderFormat): string {
  const pieces = casePieces(model, id)
  const lhs = renderIdent(id, format)
  if (pieces.length === 0) {
    const expr = equationOf(model, id)
    if (expr.op === 'var' || expr.op === 'const') return `${lhs} = ${renderExpr(expr, format)}`
    return renderArithEquation(model, id, format)
  }
  const expr = equationOf(model, id)
  const target = getVariable(model, id)
  const fallback = expr.op === 'lookup' && expr.fallback !== undefined ? coerceToDomain(target, expr.fallback) : undefined
  const latex = format === 'latex'
  const rows = pieces.map((p) => ({
    value: renderExpr(p.value, format),
    cond: p.when.map((w) => renderExpr(w, format)).join(latex ? ',\\ ' : ', '),
  }))
  if (fallback !== undefined) rows.push({ value: renderValue(fallback, format), cond: '' })
  if (!latex) {
    return `${lhs} = { ${rows.map((r) => (r.cond === '' ? `${r.value} otherwise` : `${r.value} if ${r.cond}`)).join('; ')} }`
  }
  const parts = rows.map((r) => `${r.value} & ${r.cond === '' ? '\\text{otherwise}' : r.cond}`)
  return `${lhs} = \\begin{cases} ${parts.join(' \\\\ ')} \\end{cases}`
}
