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
  renderIdent,
  renderValue,
  toFormula,
} from '../engine/index.ts'
import type { Locale } from '../engine/types.ts'
import { coerceToDomain, enumerateAssignments, formatValue, valuesEqual } from '../engine/values.ts'
import type { Messages } from './i18n.ts'
import { messagesFor } from './i18n.ts'

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

/**
 * The label as drawn after the id: without a repeat of the id. A label equal to the id gives '';
 * one that ends with " <id>" or starts with "<id> " loses that part ("共同原因 Z" for Z is drawn
 * "Z 共同原因", not "Z 共同原因 Z").
 */
export function nameAfterId(id: string, name: string): string {
  const text = name.trim()
  if (text === id) return ''
  if (text.endsWith(` ${id}`)) return text.slice(0, -id.length).trim()
  if (text.startsWith(`${id} `)) return text.slice(id.length).trim()
  return text
}

/** The variable's label in `locale` as drawn beside its id (see `nameAfterId`). */
export function shortLabel(model: CausalModel, id: string, locale: Locale): string {
  return nameAfterId(id, label(model, id, locale))
}

/** The id and its label as one line of text, `X` alone when the label only repeats it. */
export function idWithName(id: string, name: string): string {
  return name === '' ? id : `${id} ${name}`
}

export function valueText(value: Value | undefined): string {
  return value === undefined ? '' : formatValue(value)
}

export function assignmentText(a: Assignment, sep = ', '): string {
  return Object.entries(a)
    .map(([id, v]) => `${id}=${formatValue(v)}`)
    .join(sep)
}

/**
 * A variable's label with its value, worded by value: a boolean 0 says the label's event did not
 * happen, so the label alone is never read as the event having occurred. `text` is `A=0` or `do(A=0)`.
 */
export function valuePhrase(model: CausalModel, locale: Locale, id: string, value: Value, text: string, doing: boolean): string {
  const t = messagesFor(locale).phrase
  const name = label(model, id, locale)
  if (getVariable(model, id).domain.kind !== 'boolean' || ![true, false, 0, 1].includes(value as never)) return t.other(name, text)
  const on = value === true || value === 1
  return (doing ? (on ? t.doOn : t.doOff) : on ? t.seeOn : t.seeOff)(name, text)
}

/** `valuePhrase` for an observation text like `A=0`, or for the first entry of a do() assignment. */
export function phraseOf(model: CausalModel, locale: Locale, text: string, doing: boolean, assignment?: Assignment): string {
  const [id, value] = assignment !== undefined ? (Object.entries(assignment)[0] ?? ['', 0]) : (/^\s*([A-Za-z_]\w*)\s*=\s*(\S+)\s*$/.exec(text)?.slice(1) ?? ['', '0'])
  if (id === '') return text
  const v: Value = value === '0' ? 0 : value === '1' ? 1 : value === 'true' ? true : value === 'false' ? false : (value as Value)
  return valuePhrase(model, locale, id, v, text, doing)
}

/**
 * Stochastic interventions (Pearl 2009, pp. 113–114, a stochastic policy without conditioning):
 * P*(X=1) for each boolean variable so set, strictly between 0 and 1. The endpoints are the
 * ordinary do(X=0) and do(X=1) and live in the `Assignment` of hard interventions instead.
 */
export type Stochastic = Readonly<Record<string, number>>

/** `P(X=1)=0.30` for each stochastic intervention. */
export function stochasticText(s: Stochastic, sep = ', '): string {
  return Object.entries(s)
    .map(([id, p]) => `P(${id}=1)=${probText(p)}`)
    .join(sep)
}

/** `do(X=1, P(Y=1)=0.30)`: the hard interventions, then the stochastic ones. */
export function doText(a: Assignment, s: Stochastic = {}): string {
  return `do(${[assignmentText(a), stochasticText(s)].filter((x) => x !== '').join(', ')})`
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
export function equationIds(c: LoadedCase, shown: readonly string[], interventions: Assignment = {}, stochastic: Stochastic = {}): string[] {
  const set = new Set(shown)
  return c.model.endogenous.filter(
    (id) => set.has(id) && (id in interventions || id in stochastic || c.model.edges.some((e) => e.to === id && set.has(e.from))),
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
  /** LaTeX forms of `text`, `struck` and `worked`, for typesetting. */
  readonly latex: string
  readonly struckLatex?: string
  readonly workedLatex?: string
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
  stochastic: Stochastic = {},
): EquationRow[] {
  const { model } = c
  const set = new Set(shown)
  return ids.map((id) => {
    const text = renderEquation(model, id, notation, 'text')
    const latex = renderEquation(model, id, notation, 'latex')
    const forced = interventions[id]
    const soft = stochastic[id]
    if (soft !== undefined) {
      // A stochastic do(): the equation gives way to a coin with P(X=1) = p.
      const parents = model.edges.filter((e) => e.to === id && set.has(e.from)).map((e) => e.from)
      return {
        id,
        text: `${id} ~ Bernoulli(${probText(soft)})`,
        latex: `${renderIdent(id, 'latex')} \\sim \\mathrm{Bernoulli}(${probText(soft)})`,
        struck: text,
        struckLatex: latex,
        intervened: true,
        note: t.setByChance(parents, probText(soft)),
      }
    }
    if (forced !== undefined) {
      const parents = model.edges.filter((e) => e.to === id && set.has(e.from)).map((e) => e.from)
      return {
        id,
        text: `${id} = ${formatValue(forced)}`,
        latex: `${renderIdent(id, 'latex')} = ${renderValue(forced, 'latex')}`,
        struck: text,
        struckLatex: latex,
        intervened: true,
        note: t.setDirectly(parents, formatValue(forced)),
      }
    }
    let worked: string | undefined
    let workedLatex: string | undefined
    if (notation === 'arithmetic' && values !== undefined) {
      const expr = model.equations.get(id)
      if (expr !== undefined) {
        const arith = toArith(model, expr)
        const result = evalArith(arith, values)
        const plugged = renderArith(substitute(arith, values), 'text')
        // A bare parent (C = U) substitutes straight to the result; skip the repeat.
        worked = plugged === String(result) ? `= ${plugged}` : `= ${plugged} = ${String(result)}`
        const pluggedLatex = renderArith(substitute(arith, values), 'latex')
        workedLatex = plugged === String(result) ? `= ${pluggedLatex}` : `= ${pluggedLatex} = ${String(result)}`
      }
    }
    return { id, text, latex, worked, workedLatex, intervened: false, note: label(model, id, t.locale) }
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
  /** Non-boolean variables: P(V = value) for each value, in domain order. */
  readonly dist: Readonly<Record<string, readonly number[]>>
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
  const perValue: Record<string, number[]> = {}
  for (const v of model.variables) {
    sums[v.id] = 0
    if (v.domain.kind === 'finite') perValue[v.id] = v.domain.values.map(() => 0)
  }
  let evidence = 0
  for (const { context, p } of enumerateContexts(model, prior)) {
    const world = evaluate(model, context, query.do ?? {}).values
    if (given !== undefined && !holdsIn(world, given)) continue
    evidence += p
    for (const v of model.variables) {
      const value = world[v.id]
      if (value === undefined) continue
      if (valuesEqual(value, targetValue(v))) sums[v.id] += p
      if (v.domain.kind === 'finite') {
        const at = v.domain.values.findIndex((o) => valuesEqual(o, value))
        if (at >= 0) perValue[v.id][at] += p
      }
    }
  }
  const out: Record<string, number> = {}
  for (const [id, s] of Object.entries(sums)) out[id] = evidence > 0 ? s / evidence : Number.NaN
  const dist: Record<string, readonly number[]> = {}
  for (const [id, row] of Object.entries(perValue)) dist[id] = row.map((s) => (evidence > 0 ? s / evidence : Number.NaN))
  return { p: out, dist, evidence }
}

/**
 * Marginals under the hard interventions `hard` and the stochastic ones `stochastic`: the mixture
 * Σ ∏ w · P(· | do(hard, X₁=x₁, …)) over every 0/1 setting of the stochastic variables, each
 * weighted by P*(Xᵢ=xᵢ) (Pearl 2009, pp. 113–114). Without stochastic ones it is `marginals`.
 */
export function mixedMarginals(model: CausalModel, prior: Prior, hard: Assignment, stochastic: Stochastic): Marginals {
  const ids = Object.keys(stochastic)
  if (ids.length === 0) return marginals(model, prior, { do: hard })
  const p: Record<string, number> = {}
  const dist: Record<string, number[]> = {}
  for (let mask = 0; mask < 1 << ids.length; mask++) {
    const setting: Record<string, Value> = { ...hard }
    let weight = 1
    ids.forEach((id, i) => {
      const on = (mask & (1 << i)) !== 0
      const q = stochastic[id]
      if (getVariable(model, id).domain.kind !== 'boolean') throw new Error(`stochastic do() needs a boolean variable: ${id}`)
      if (!(q > 0 && q < 1)) throw new Error(`stochastic do() needs 0 < P(${id}=1) < 1, got ${q}`)
      setting[id] = on
      weight *= on ? q : 1 - q
    })
    const part = marginals(model, prior, { do: setting })
    for (const [id, v] of Object.entries(part.p)) p[id] = (p[id] ?? 0) + weight * v
    for (const [id, row] of Object.entries(part.dist)) {
      const acc = dist[id] ?? row.map(() => 0)
      row.forEach((v, i) => (acc[i] += weight * v))
      dist[id] = acc
    }
  }
  return { p, dist, evidence: 1 }
}

/** Geometry of one node's per-value bars (a chart `width` wide, `barW` bars every `pitch`, in px). */
export interface BarLayout {
  readonly pitch: number
  readonly barW: number
  readonly width: number
  /** False when the value labels would touch: only the first and last are written. */
  readonly labelsFit: boolean
}

export const BAR_MAX_WIDTH = 126

/** Lay out one bar per value, in `size`-px labels, within BAR_MAX_WIDTH. */
export function barLayout(labels: readonly string[], size: number): BarLayout {
  const widest = Math.max(0, ...labels.map((l) => textWidth(l, size)))
  const wanted = Math.max(14, Math.ceil(widest) + 5)
  const pitch = Math.min(wanted, BAR_MAX_WIDTH / Math.max(1, labels.length))
  return { pitch, barW: Math.max(3, Math.min(12, pitch - 5)), width: pitch * labels.length, labelsFit: pitch >= widest + 2 }
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

/**
 * A probability as text: two decimals, except that a value within 0.01 of 0 or 1 (and not exactly
 * 0 or 1) gets enough decimals to show two significant digits of its distance from that end, so
 * 0.0001 reads 0.0001 and 0.9999 reads 0.9999 rather than 0.00 and 1.00 (trailing zeros past the
 * second decimal are dropped). Below 1e-6 from an end
 * it reads as a bound.
 */
export function probText(p: number): string {
  if (Number.isNaN(p)) return '—'
  if (p <= 0 || p >= 1) return p.toFixed(2)
  const gap = Math.min(p, 1 - p)
  if (gap >= 0.01) return p.toFixed(2)
  if (gap < 1e-6) return p < 0.5 ? '<0.000001' : '>0.999999'
  const digits = Math.ceil(-Math.log10(gap) - 1e-9) + 1
  return p.toFixed(Math.min(digits, 7)).replace(/(\.\d\d\d*?)0+$/, '$1')
}

/** Legend for probability readouts (the value legend is `t.valueLegend`): fill for 0/1 variables, bars for the others. */
export function probLegend(t: Messages, model: CausalModel, shown: readonly string[]): string {
  const finite = shown.filter((id) => getVariable(model, id).domain.kind === 'finite').length
  if (finite === 0) return t.probLegend
  return finite === shown.length ? t.probLegendBars : t.probLegendFinite
}
