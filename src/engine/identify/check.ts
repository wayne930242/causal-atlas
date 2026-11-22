import { problem } from '../errors.ts'
import { evaluate } from '../evaluate.ts'
import type { CausalModel } from '../model.ts'
import { getVariable } from '../model.ts'
import type { Prior, WeightedContext } from '../probability.ts'
import { MAX_CONTEXTS, enumerateContexts } from '../probability.ts'
import type { Assignment, Value } from '../types.ts'
import { ModelError, domainValues, formatValue } from '../values.ts'
import type { Admg } from './admg.ts'
import { admgOf, admgOfLatents } from './admg.ts'
import type { ObservedRow } from './evaluate.ts'
import { ProbEvaluator } from './evaluate.ts'
import type { IdentifyResult } from './id.ts'
import { identify } from './id.ts'

export interface IdentificationQuery {
  readonly y: readonly string[]
  readonly x: readonly string[]
  readonly w?: readonly string[]
}

/** One assignment of y ∪ x ∪ w (and the formula's arbitrary variables). */
export interface IdentificationRow {
  readonly at: Assignment
  /** The formula on the model's observational joint. */
  readonly formulaValue: number
  /** P(y | do(x), w) computed in the model. */
  readonly doValue: number
}

export interface SkippedRow {
  readonly at: Assignment
  /** `evidence-zero`: P(w | do(x)) = 0; `formula-undefined`: the formula conditions on an observed event of probability 0. */
  readonly reason: 'evidence-zero' | 'formula-undefined'
}

export interface IdentificationCheck {
  /** The graph identification ran on (see {@link admgForPrior}). */
  readonly graph: Admg
  readonly result: IdentifyResult
  readonly rows: readonly IdentificationRow[]
  readonly skipped: readonly SkippedRow[]
  /** The largest |formulaValue − doValue| over `rows`; 0 without rows. */
  readonly maxError: number
}

const TOLERANCE = 1e-9

function keyOf(ids: readonly string[], values: Assignment): string {
  return ids.map((id) => formatValue(values[id] as Value)).join('|')
}

/** The observational distribution of the endogenous variables under `prior`. */
export function observedJoint(model: CausalModel, prior: Prior): ObservedRow[] {
  return jointOf(model, enumerateContexts(model, prior), {})
}

function jointOf(model: CausalModel, contexts: readonly WeightedContext[], interventions: Assignment): ObservedRow[] {
  const rows = new Map<string, { assignment: Record<string, Value>; p: number }>()
  for (const { context, p } of contexts) {
    const { values } = evaluate(model, context, interventions)
    const assignment: Record<string, Value> = {}
    for (const id of model.endogenous) assignment[id] = values[id]
    const key = keyOf(model.endogenous, assignment)
    const row = rows.get(key)
    if (row === undefined) rows.set(key, { assignment, p })
    else row.p += p
  }
  return [...rows.values()]
}

/**
 * Groups of exogenous variables that are dependent within and independent across under `contexts`
 * (pairwise dependence joins two groups; if the groups still do not factorise the joint, all
 * exogenous variables form one group).
 */
function dependenceGroups(model: CausalModel, contexts: readonly WeightedContext[]): string[][] {
  const ids = model.exogenous
  const marginal = (members: readonly string[], context: Assignment): number => {
    const key = keyOf(members, context)
    let total = 0
    for (const c of contexts) if (keyOf(members, c.context) === key) total += c.p
    return total
  }
  const group = new Map(ids.map((id) => [id, id]))
  const find = (id: string): string => {
    let at = id
    while (group.get(at) !== at) at = group.get(at) as string
    return at
  }
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const [u, v] = [ids[i], ids[j]]
      if (find(u) === find(v)) continue
      const dependent = contexts.some((c) => Math.abs(marginal([u, v], c.context) - marginal([u], c.context) * marginal([v], c.context)) > TOLERANCE)
      if (dependent) group.set(find(u), find(v))
    }
  }
  const groups = new Map<string, string[]>()
  for (const id of ids) groups.set(find(id), [...(groups.get(find(id)) ?? []), id])
  const parts = [...groups.values()]
  let covered = 0
  for (const c of contexts) {
    const product = parts.reduce((acc, members) => acc * marginal(members, c.context), 1)
    if (Math.abs(product - c.p) > TOLERANCE) return [[...ids]]
    covered += product
  }
  return Math.abs(covered - 1) > TOLERANCE ? [[...ids]] : parts
}

/**
 * The ADMG identification should use for `model` under `prior`: {@link admgOf} for independent
 * exogenous variables; with a joint prior, dependent exogenous variables act as one latent cause.
 */
export function admgForPrior(model: CausalModel, prior: Prior): Admg {
  return graphFor(model, prior, enumerateContexts(model, prior))
}

function graphFor(model: CausalModel, prior: Prior, contexts: readonly WeightedContext[]): Admg {
  return prior.kind === 'independent' ? admgOf(model) : admgOfLatents(model, dependenceGroups(model, contexts))
}

function* assignments(ids: readonly string[], domains: Readonly<Record<string, readonly Value[]>>): Generator<Record<string, Value>> {
  const walk = function* (i: number, acc: Record<string, Value>): Generator<Record<string, Value>> {
    if (i === ids.length) {
      yield { ...acc }
      return
    }
    for (const value of domains[ids[i]]) {
      acc[ids[i]] = value
      yield* walk(i + 1, acc)
    }
  }
  yield* walk(0, {})
}

/**
 * Identifies P(y | do(x), w) on the model's graph and compares the formula, evaluated on the
 * model's observational joint, with the effect computed in the model by do(), for every assignment
 * of y ∪ x ∪ w (and the formula's arbitrary variables). Rows where either side is undefined are
 * reported in `skipped`. Contexts are enumerated within MAX_CONTEXTS; more than MAX_CONTEXTS rows
 * is a ModelError (`identify-budget`).
 */
export function checkIdentification(model: CausalModel, prior: Prior, query: IdentificationQuery): IdentificationCheck {
  const contexts = enumerateContexts(model, prior)
  const graph = graphFor(model, prior, contexts)
  const y = [...new Set(query.y)]
  const x = [...new Set(query.x)]
  const w = [...new Set(query.w ?? [])]
  const result = identify(graph, y, x, w)
  if (!result.identifiable) return { graph, result, rows: [], skipped: [], maxError: 0 }

  const domains: Record<string, readonly Value[]> = {}
  for (const id of model.endogenous) domains[id] = domainValues(getVariable(model, id).domain)
  const free = [...x, ...result.arbitrary]
  const count = [...y, ...w, ...free].reduce((n, id) => n * domains[id].length, 1)
  if (count > MAX_CONTEXTS) throw new ModelError(problem('identify-budget', { limit: MAX_CONTEXTS }))

  const evaluator = new ProbEvaluator(jointOf(model, contexts, {}), domains)
  const rows: IdentificationRow[] = []
  const skipped: SkippedRow[] = []
  let maxError = 0
  const doCache = new Map<string, ObservedRow[]>()
  for (const setting of assignments(free, domains)) {
    const doX: Record<string, Value> = {}
    for (const id of x) doX[id] = setting[id]
    const doKey = keyOf(x, doX)
    let after = doCache.get(doKey)
    if (after === undefined) {
      after = jointOf(model, contexts, doX)
      doCache.set(doKey, after)
    }
    for (const outcome of assignments([...y, ...w], domains)) {
      const at = { ...setting, ...outcome }
      let evidence = 0
      let both = 0
      for (const row of after) {
        if (keyOf(w, row.assignment) !== keyOf(w, at)) continue
        evidence += row.p
        if (keyOf(y, row.assignment) === keyOf(y, at)) both += row.p
      }
      if (evidence <= 0) {
        skipped.push({ at, reason: 'evidence-zero' })
        continue
      }
      const formulaValue = evaluator.evaluate(result.formula, new Map(Object.entries(at)))
      if (formulaValue === undefined) {
        skipped.push({ at, reason: 'formula-undefined' })
        continue
      }
      const doValue = both / evidence
      rows.push({ at, formulaValue, doValue })
      maxError = Math.max(maxError, Math.abs(formulaValue - doValue))
    }
  }
  return { graph, result, rows, skipped, maxError }
}
