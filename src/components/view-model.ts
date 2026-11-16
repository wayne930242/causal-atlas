import type { LoadedCase } from '../data/load.ts'
import type { Arith } from '../engine/arithmetic.ts'
import { evalArith, toArith } from '../engine/arithmetic.ts'
import { evalExpr } from '../engine/expr.ts'
import type { Assignment, CausalModel, Edge, Notation, Outcome, Prior, Value, Variable } from '../engine/index.ts'
import {
  enumerateContexts,
  evaluate,
  getVariable,
  holdsIn,
  renderArith,
  renderEquation,
  toFormula,
} from '../engine/index.ts'
import type { Locale } from '../engine/types.ts'
import { coerceToDomain, enumerateAssignments, formatValue, valuesEqual } from '../engine/values.ts'
import type { Messages } from './i18n.ts'

/** Pure helpers that turn a loaded case into what the components draw. No DOM access. */

export interface GridPos {
  readonly col: number
  readonly row: number
}

/** Variables drawn in the graph: the case layout's, else endogenous ones plus shared exogenous causes. */
export function shownVariables(c: LoadedCase): string[] {
  const { model } = c
  const layout = c.data.layout
  if (layout !== undefined) return model.variables.map((v) => v.id).filter((id) => id in layout)
  const children = new Map<string, number>()
  for (const e of model.edges) children.set(e.from, (children.get(e.from) ?? 0) + 1)
  return model.variables
    .filter((v) => v.kind === 'endogenous' || (children.get(v.id) ?? 0) >= 2)
    .map((v) => v.id)
}

/** Grid positions: the case layout, else layers by longest path among the shown variables. */
export function gridLayout(c: LoadedCase, shown: readonly string[]): Map<string, GridPos> {
  const layout = c.data.layout
  const out = new Map<string, GridPos>()
  if (layout !== undefined) {
    for (const id of shown) {
      const cell = layout[id]
      if (cell !== undefined) out.set(id, { col: cell[0], row: cell[1] })
    }
    return out
  }
  const set = new Set(shown)
  const layer = new Map<string, number>()
  const depth = (id: string): number => {
    const known = layer.get(id)
    if (known !== undefined) return known
    const parents = c.model.edges.filter((e) => e.to === id && set.has(e.from)).map((e) => e.from)
    const d = parents.length === 0 ? 0 : 1 + Math.max(...parents.map(depth))
    layer.set(id, d)
    return d
  }
  const rows = new Map<number, number>()
  for (const id of shown) {
    const col = depth(id)
    const row = rows.get(col) ?? 0
    rows.set(col, row + 1)
    out.set(id, { col, row })
  }
  // Centre short layers against the tallest one.
  const tallest = Math.max(...rows.values())
  for (const [id, pos] of out) {
    const count = rows.get(pos.col) ?? 1
    out.set(id, { col: pos.col, row: pos.row + (tallest - count) / 2 })
  }
  return out
}

export function shownEdges(edges: readonly Edge[], shown: readonly string[]): Edge[] {
  const set = new Set(shown)
  return edges.filter((e) => set.has(e.from) && set.has(e.to))
}

/** Lane column order: by grid column, then row, then declaration order. */
export function columnOrder(c: LoadedCase, shown: readonly string[]): string[] {
  const grid = gridLayout(c, shown)
  const index = new Map(shown.map((id, i) => [id, i]))
  return [...shown].sort((a, b) => {
    const pa = grid.get(a)
    const pb = grid.get(b)
    if (pa === undefined || pb === undefined) return (index.get(a) ?? 0) - (index.get(b) ?? 0)
    return pa.col - pb.col || pa.row - pb.row
  })
}

export type Polarity = 'promote' | 'inhibit' | 'mixed'

/**
 * Whether raising `from` from 0 to 1 only ever lowers `to` (inhibit), only raises it (promote),
 * or neither. Non-boolean ends count as `mixed`.
 */
export function edgePolarity(model: CausalModel, from: string, to: string): Polarity {
  const target = getVariable(model, to)
  const source = getVariable(model, from)
  const expr = model.equations.get(to)
  if (expr === undefined || target.domain.kind !== 'boolean' || source.domain.kind !== 'boolean') return 'mixed'
  const others = (model.parents.get(to) ?? []).filter((p) => p !== from).map((p) => getVariable(model, p))
  let up = false
  let down = false
  for (const setting of enumerateAssignments(others)) {
    const at = (v: boolean): boolean =>
      coerceToDomain(target, evalExpr(expr, { values: { ...setting, [from]: v } })) === true
    const lo = at(false)
    const hi = at(true)
    if (!lo && hi) up = true
    if (lo && !hi) down = true
  }
  if (down && !up) return 'inhibit'
  if (up && !down) return 'promote'
  return 'mixed'
}

/** An edge carries a signal when its source is 1 (non-boolean sources always do). */
export function edgeLive(values: Assignment | undefined, from: string): boolean {
  if (values === undefined) return true
  const v = values[from]
  return typeof v !== 'boolean' || v
}

export function label(model: CausalModel, id: string, locale: Locale): string {
  return getVariable(model, id).label[locale]
}

export function valueText(value: Value | undefined): string {
  return value === undefined ? '' : formatValue(value)
}

export function assignmentText(a: Assignment, sep = ', '): string {
  return Object.entries(a)
    .map(([id, v]) => `${id}=${formatValue(v)}`)
    .join(sep)
}

export function doText(a: Assignment): string {
  return `do(${assignmentText(a)})`
}

export function bracketText(a: Assignment): string {
  return `[${Object.entries(a)
    .map(([id, v]) => `${id}←${formatValue(v)}`)
    .join(', ')}]`
}

/** The flipped value: booleans negate, finite domains take the next value. */
export function flipValue(variable: Variable, value: Value): Value {
  if (variable.domain.kind === 'boolean') return value !== true
  const values = variable.domain.values
  const i = values.findIndex((v) => valuesEqual(v, value))
  return values[(i + 1) % values.length]
}

/**
 * Endogenous variables whose equation is shown: those with at least one drawn parent, plus any
 * intervened ones (their replaced equation is shown struck through).
 */
export function equationIds(c: LoadedCase, shown: readonly string[], interventions: Assignment = {}): string[] {
  const set = new Set(shown)
  return c.model.endogenous.filter(
    (id) => set.has(id) && (id in interventions || c.model.edges.some((e) => e.to === id && set.has(e.from))),
  )
}

function substitute(a: Arith, values: Assignment): Arith {
  switch (a.op) {
    case 'num':
      return a
    case 'var': {
      const v = values[a.name]
      if (v === undefined) return a
      return { op: 'num', value: typeof v === 'boolean' ? (v ? 1 : 0) : v }
    }
    case 'sub':
      return { op: 'sub', left: substitute(a.left, values), right: substitute(a.right, values) }
    case 'add':
    case 'mul':
    case 'max':
      return { op: a.op, args: a.args.map((x) => substitute(x, values)) }
    case 'abs':
      return { op: 'abs', arg: substitute(a.arg, values) }
    case 'ind':
      return { op: 'ind', left: substitute(a.left, values), right: substitute(a.right, values) }
    case 'cases':
      return {
        op: 'cases',
        rows: a.rows.map((r) => ({
          value: substitute(r.value, values),
          when: r.when.map((w) => ({ left: substitute(w.left, values), right: substitute(w.right, values) })),
        })),
        otherwise: a.otherwise === undefined ? undefined : substitute(a.otherwise, values),
      }
  }
}

export interface EquationRow {
  readonly id: string
  /** The equation as written in the chosen notation. */
  readonly text: string
  /** Under do(): the replaced equation, shown struck through. */
  readonly struck?: string
  /** Arithmetic notation: the equation with the current values filled in. */
  readonly worked?: string
  readonly intervened: boolean
  readonly note: string
}

export function equationRows(
  t: Messages,
  c: LoadedCase,
  ids: readonly string[],
  notation: Exclude<Notation, 'causal'>,
  values: Assignment | undefined,
  interventions: Assignment,
  shown: readonly string[],
): EquationRow[] {
  const { model } = c
  const set = new Set(shown)
  return ids.map((id) => {
    const text = renderEquation(model, id, notation, 'text')
    const forced = interventions[id]
    if (forced !== undefined) {
      const parents = model.edges.filter((e) => e.to === id && set.has(e.from)).map((e) => e.from)
      return {
        id,
        text: `${id} = ${formatValue(forced)}`,
        struck: text,
        intervened: true,
        note: t.setDirectly(parents, formatValue(forced)),
      }
    }
    let worked: string | undefined
    if (notation === 'arithmetic' && values !== undefined) {
      const expr = model.equations.get(id)
      if (expr !== undefined) {
        const arith = toArith(model, expr)
        const result = evalArith(arith, values)
        worked = `= ${renderArith(substitute(arith, values), 'text')} = ${String(result)}`
      }
    }
    return { id, text, worked, intervened: false, note: label(model, id, t.locale) }
  })
}

/** The variable whose value the case asks about: the first verdict's effect, else the last sink. */
export function outcomeVariable(c: LoadedCase): string {
  for (const v of c.data.verdicts) {
    if ('effect' in v.query) {
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)/.exec(v.query.effect)
      if (m !== null && c.model.byId.has(m[1])) return m[1]
    }
    if ('event' in v.query) {
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)/.exec(v.query.event)
      if (m !== null && c.model.byId.has(m[1])) return m[1]
    }
  }
  const hasChild = new Set(c.model.edges.map((e) => e.from))
  const sinks = c.model.endogenous.filter((id) => !hasChild.has(id))
  return sinks[sinks.length - 1] ?? c.model.endogenous[c.model.endogenous.length - 1]
}

// ---- probability ----

/** The value whose probability a node shows: 1 for booleans, the first listed value otherwise. */
export function targetValue(variable: Variable): Value {
  return variable.domain.kind === 'boolean' ? true : variable.domain.values[0]
}

export function targetText(variable: Variable): string {
  return variable.domain.kind === 'boolean' ? `${variable.id}=1` : `${variable.id}=${String(variable.domain.values[0])}`
}

/** Exogenous variables a slider can set: boolean ones and two-valued ones. */
export function sliderVariables(c: LoadedCase): string[] {
  if (c.data.priors !== undefined && 'joint' in c.data.priors) return []
  return c.model.exogenous.filter((id) => {
    const d = getVariable(c.model, id).domain
    return d.kind === 'boolean' || d.values.length === 2
  })
}

function baseMarginals(c: LoadedCase): Record<string, readonly Outcome[]> {
  const out: Record<string, readonly Outcome[]> = {}
  const prior = c.prior
  if (prior !== undefined && prior.kind === 'independent') return { ...prior.marginals }
  const context = c.context ?? {}
  for (const id of c.model.exogenous) {
    const v = context[id]
    const variable = getVariable(c.model, id)
    out[id] = [{ value: v ?? targetValue(variable), p: 1 }]
  }
  return out
}

/** Slider start values: the case prior, or 0/1 from the actual context. */
export function defaultSliders(c: LoadedCase): Record<string, number> {
  const marginals = baseMarginals(c)
  const out: Record<string, number> = {}
  for (const id of sliderVariables(c)) {
    const target = targetValue(getVariable(c.model, id))
    out[id] = (marginals[id] ?? []).filter((o) => valuesEqual(o.value, target)).reduce((s, o) => s + o.p, 0)
  }
  return out
}

/** The prior with each slider variable's P(target) replaced. */
export function priorWithSliders(c: LoadedCase, sliders: Readonly<Record<string, number>>): Prior {
  if (c.prior !== undefined && c.prior.kind === 'joint' && c.data.priors !== undefined) return c.prior
  const marginals = { ...baseMarginals(c) }
  for (const [id, p] of Object.entries(sliders)) {
    const variable = getVariable(c.model, id)
    const target = targetValue(variable)
    const other = variable.domain.kind === 'boolean' ? false : variable.domain.values[1]
    marginals[id] = [
      { value: target, p },
      { value: other, p: 1 - p },
    ]
  }
  return { kind: 'independent', marginals }
}

export interface Marginals {
  /** P(V = target) per variable. */
  readonly p: Readonly<Record<string, number>>
  /** P(given); 1 without an observation. */
  readonly evidence: number
}

/** P(V = target) for every variable, after do() and conditioning on `given`. */
export function marginals(
  model: CausalModel,
  prior: Prior,
  query: { readonly given?: string; readonly do?: Assignment } = {},
): Marginals {
  const given = query.given === undefined ? undefined : toFormula(model, query.given)
  const sums: Record<string, number> = {}
  for (const v of model.variables) sums[v.id] = 0
  let evidence = 0
  for (const { context, p } of enumerateContexts(model, prior)) {
    const world = evaluate(model, context, query.do ?? {}).values
    if (given !== undefined && !holdsIn(world, given)) continue
    evidence += p
    for (const v of model.variables) {
      const value = world[v.id]
      if (value !== undefined && valuesEqual(value, targetValue(v))) sums[v.id] += p
    }
  }
  const out: Record<string, number> = {}
  for (const [id, s] of Object.entries(sums)) out[id] = evidence > 0 ? s / evidence : Number.NaN
  return { p: out, evidence }
}

/** Estimated text width in px: CJK and full-width punctuation are one em, the rest about 0.6 em. */
export function textWidth(s: string, size: number): number {
  let w = 0
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 0
    w += code > 0x2e7f || '，。：；（）「」？！…—＝／、《》・'.includes(ch) ? size : size * 0.6
  }
  return w
}

export function probText(p: number): string {
  return Number.isNaN(p) ? '—' : p.toFixed(2)
}

/** Legend for probability fill (the value legend is `t.valueLegend`); names the convention for non-boolean variables when any is drawn. */
export function probLegend(t: Messages, model: CausalModel, shown: readonly string[]): string {
  const finite = shown.some((id) => getVariable(model, id).domain.kind === 'finite')
  return finite ? t.probLegendFinite : t.probLegend
}
