import type { LoadedCase } from '../../data/load.ts'
import type { Assignment, CausalModel, Outcome, Prior, Value, Variable } from '../../engine/index.ts'
import { enumerateContexts, evaluate, getVariable, holdsIn, toFormula } from '../../engine/index.ts'
import { valuesEqual } from '../../engine/values.ts'
import type { Stochastic } from './assignments.ts'

/** What a probability graph shows: the target value of each node, the sliders, and the marginals after do() and observations. */

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
 * With `given`, each part is conditioned in its own intervened model and the parts are weighted by
 * P*(setting) · P(given | do(setting)), so the result is P(· | do(…), given); `evidence` is P(given).
 */
export function mixedMarginals(model: CausalModel, prior: Prior, hard: Assignment, stochastic: Stochastic, given?: string): Marginals {
  const ids = Object.keys(stochastic)
  if (ids.length === 0) return marginals(model, prior, { do: hard, given })
  const p: Record<string, number> = {}
  const dist: Record<string, number[]> = {}
  let evidence = 0
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
    const part = marginals(model, prior, { do: setting, given })
    const w = weight * part.evidence
    evidence += w
    for (const [id, v] of Object.entries(part.p)) p[id] = (p[id] ?? 0) + (w > 0 ? w * v : 0)
    for (const [id, row] of Object.entries(part.dist)) {
      const acc = dist[id] ?? row.map(() => 0)
      row.forEach((v, i) => (acc[i] += w > 0 ? w * v : 0))
      dist[id] = acc
    }
  }
  for (const id of Object.keys(p)) p[id] = evidence > 0 ? p[id] / evidence : Number.NaN
  for (const row of Object.values(dist)) row.forEach((v, i) => (row[i] = evidence > 0 ? v / evidence : Number.NaN))
  return { p, dist, evidence }
}
