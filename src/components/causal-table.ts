import type { LoadedCase } from '../data/load.ts'
import type { Assignment, Prior, Value } from '../engine/index.ts'
import { causalRows, domainValues, enumerateContexts, evaluate, formatValue, getVariable, renderExpr, renderIdent, renderValue, valuesEqual } from '../engine/index.ts'
import type { Stochastic } from './view-model.ts'
import { probText } from './view-model.ts'

/** The causal notation's default rows: the ones that can hold under what is set, with the parents that do not matter left out. */

export interface CausalLine {
  readonly text: string
  readonly latex: string
}

export interface CausalTableRow {
  readonly id: string
  readonly lines: readonly CausalLine[]
  /** Set by do(): one line, `X←1` (or its coin). */
  readonly intervened: boolean
}

export interface CausalTable {
  readonly rows: readonly CausalTableRow[]
  /** Lines shown. */
  readonly count: number
  /** Lines of the full table (`causalFormulas`, every variable). */
  readonly full: number
}

export interface CausalTableOptions {
  /** A graph with values (no do()): only the actual world's row of each variable. */
  readonly values?: Assignment
  readonly interventions: Assignment
  readonly stochastic?: Stochastic
  readonly observed?: Assignment
  /** The prior the rows must have positive probability under; default the case's. */
  readonly prior?: Prior
  /** The observations are evidence about the actual world, the do() a supposition (the counterfactual reading). */
  readonly counterfactual?: boolean
}

/** The worlds that can happen under what is set; undefined when nothing is known about the context. */
function liveWorlds(c: LoadedCase, o: CausalTableOptions): Assignment[] | undefined {
  if (o.values !== undefined) return [o.values]
  const prior = o.prior ?? c.prior
  if (prior === undefined) return undefined
  const observed = Object.entries(o.observed ?? {})
  const soft = Object.keys(o.stochastic ?? {})
  const settings: Assignment[] = []
  for (let mask = 0; mask < 1 << soft.length; mask++) {
    const s: Record<string, Value> = { ...o.interventions }
    soft.forEach((id, k) => (s[id] = (mask & (1 << k)) !== 0))
    settings.push(s)
  }
  const sees = (w: Assignment): boolean => observed.every(([id, v]) => w[id] !== undefined && valuesEqual(w[id], v))
  const out: Assignment[] = []
  for (const { context, p } of enumerateContexts(c.model, prior)) {
    if (!(p > 0)) continue
    if (o.counterfactual === true && !sees(evaluate(c.model, context).values)) continue
    for (const s of settings) {
      const w = evaluate(c.model, context, s).values
      if (o.counterfactual === true || sees(w)) out.push(w)
    }
  }
  return out
}

function fullRows(c: LoadedCase, id: string): number {
  return (c.model.parents.get(id) ?? []).reduce((n, p) => n * domainValues(getVariable(c.model, p).domain).length, 1)
}

export function causalTable(c: LoadedCase, o: CausalTableOptions): CausalTable {
  const worlds = liveWorlds(c, o)
  let full = 0
  const rows = c.model.endogenous.map((id): CausalTableRow => {
    full += fullRows(c, id)
    const forced = o.interventions[id]
    const soft = o.stochastic?.[id]
    if (forced !== undefined) {
      return { id, intervened: true, lines: [{ text: `${id}←${formatValue(forced)}`, latex: `${renderIdent(id, 'latex')} \\leftarrow ${renderValue(forced, 'latex')}` }] }
    }
    if (soft !== undefined) {
      return { id, intervened: true, lines: [{ text: `${id} ~ Bernoulli(${probText(soft)})`, latex: `${renderIdent(id, 'latex')} \\sim \\mathrm{Bernoulli}(${probText(soft)})` }] }
    }
    const live = causalRows(c.model, id).filter(
      (r) => worlds === undefined || worlds.some((w) => Object.entries(r.setting).every(([p, v]) => w[p] !== undefined && valuesEqual(w[p], v))),
    )
    return { id, intervened: false, lines: live.map((r) => ({ text: renderExpr(r.formula, 'text'), latex: renderExpr(r.formula, 'latex') })) }
  })
  return { rows, count: rows.reduce((n, r) => n + r.lines.length, 0), full }
}
