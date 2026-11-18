import type { LoadedCase } from '../data/load.ts'
import type { Assignment, DPath, Prior, Value } from '../engine/index.ts'
import { dSeparation, descendants, domainValues, enumerateContexts, evaluate, getVariable, valuesEqual } from '../engine/index.ts'
import { enumerateAssignments } from '../engine/values.ts'
import type { PathMarks } from './dsep-view.ts'
import { fixed, targetValue } from './view-model.ts'

/** Pure helpers for the probability panel's adjustment calculator (lesson 05's back-door formula). */

/** One stratum of the grouping: its values, P(stratum), and P(y | x, stratum) per value of x (NaN with no data). */
export interface Stratum {
  readonly values: Assignment
  readonly weight: number
  readonly given: readonly number[]
}

export interface AdjustView {
  readonly set: readonly string[]
  /** The values of x, one column each (1 before 0 for a boolean). */
  readonly xs: readonly Value[]
  readonly y: string
  readonly yValue: Value
  readonly strata: readonly Stratum[]
  /** Σ P(y | x, s) P(s) per value of x; undefined when a stratum with weight has no data for that x. */
  readonly sums: readonly (number | undefined)[]
  /** P(y | do(x)) per value of x. */
  readonly doValues: readonly number[]
  /** The back-door criterion: no member a descendant of x, and every path into x blocked once the arrows out of x are gone. */
  readonly criterion: boolean
  /** Every sum equals its do() value. */
  readonly equal: boolean
  readonly descendants: readonly string[]
  /** Open paths in the full graph that a known collider (or its descendant) opens, with what opens them. */
  readonly opened: readonly { readonly path: DPath; readonly by: string }[]
  /** Back-door paths still open in the graph without the arrows out of x. */
  readonly openBackdoors: readonly DPath[]
  /** The non-causal paths between x and y, lit when open and dashed when blocked; x→…→y is not marked. */
  readonly marks: PathMarks
}

const TOLERANCE = 1e-9

/** A path that follows the arrows from x to y. */
function causalPath(p: DPath): boolean {
  return p.edges.every((e, i) => e.from === p.nodes[i])
}

export function adjustView(c: LoadedCase, prior: Prior, x: string, y: string, set: readonly string[]): AdjustView {
  const { model } = c
  const vx = getVariable(model, x)
  const vy = getVariable(model, y)
  const xs = vx.domain.kind === 'boolean' ? [true, false] : domainValues(vx.domain)
  const yValue = targetValue(vy)
  const contexts = enumerateContexts(model, prior)
  const worlds = contexts.map(({ context, p }) => ({ w: evaluate(model, context).values, p }))
  const strataValues = [...enumerateAssignments(set.map((id) => getVariable(model, id)))]
  // A boolean stratum reads 1 before 0, as the lesson's table does.
  const order = (a: Assignment): string => set.map((id) => (a[id] === true ? '0' : a[id] === false ? '1' : String(domainValues(getVariable(model, id).domain).indexOf(a[id])))).join(',')
  strataValues.sort((a, b) => order(a).localeCompare(order(b)))
  const strata = strataValues.map((values): Stratum => {
    const inStratum = worlds.filter(({ w }) => set.every((id) => valuesEqual(w[id], values[id])))
    const weight = inStratum.reduce((s, { p }) => s + p, 0)
    const given = xs.map((xv) => {
      const withX = inStratum.filter(({ w }) => valuesEqual(w[x], xv))
      const px = withX.reduce((s, { p }) => s + p, 0)
      if (!(px > 0)) return Number.NaN
      return withX.filter(({ w }) => valuesEqual(w[y], yValue)).reduce((s, { p }) => s + p, 0) / px
    })
    return { values, weight, given }
  })
  const sums = xs.map((_, i) => {
    let total = 0
    for (const s of strata) {
      if (!(s.weight > 0)) continue
      if (Number.isNaN(s.given[i])) return undefined
      total += s.weight * s.given[i]
    }
    return total
  })
  const doValues = xs.map((xv) => {
    let hit = 0
    let all = 0
    for (const { context, p } of contexts) {
      all += p
      if (valuesEqual(evaluate(model, context, { [x]: xv }).values[y], yValue)) hit += p
    }
    return all > 0 ? hit / all : Number.NaN
  })
  const below = new Set(descendants(model, x))
  const desc = set.filter((id) => below.has(id))
  const backdoor = dSeparation(model, x, y, set, [], [x])
  const openBackdoors = backdoor.paths.filter((p) => p.open)
  const full = dSeparation(model, x, y, set)
  const nonCausal = full.paths.filter((p) => !causalPath(p))
  const opened = nonCausal.flatMap((p) => (p.open ? (p.opened ?? []).map((o) => ({ path: p, by: o.by })) : []))
  const key = (e: { from: string; to: string }): string => `${e.from}>${e.to}`
  const causalEdges = new Set(full.paths.filter(causalPath).flatMap((p) => p.edges.map(key)))
  const open = new Set(nonCausal.filter((p) => p.open).flatMap((p) => p.edges.map(key)))
  const blocked = new Set(nonCausal.filter((p) => !p.open).flatMap((p) => p.edges.map(key)).filter((k) => !open.has(k)))
  for (const k of causalEdges) {
    open.delete(k)
    blocked.delete(k)
  }
  return {
    set,
    xs,
    y,
    yValue,
    strata,
    sums,
    doValues,
    criterion: desc.length === 0 && openBackdoors.length === 0,
    equal: sums.every((s, i) => s !== undefined && Math.abs(s - doValues[i]) < TOLERANCE),
    descendants: desc,
    opened,
    openBackdoors,
    marks: { open, blocked, ends: [x, y] },
  }
}

/** Every grouping of the candidates (the endogenous variables other than x and y), smallest first; at most three candidates. */
export function adjustSets(c: LoadedCase, x: string, y: string): string[][] {
  const candidates = c.model.endogenous.filter((id) => id !== x && id !== y)
  if (candidates.length > 3) throw new Error(`${c.data.id}: adjust has ${candidates.length} candidates to group by; give sets`)
  const out: string[][] = []
  for (let mask = 0; mask < 1 << candidates.length; mask++) out.push(candidates.filter((_, i) => (mask & (1 << i)) !== 0))
  return out.sort((a, b) => a.length - b.length)
}

/** A probability for the table: up to four decimals, trailing zeros dropped (0.175, 0.1536, 1). */
export function tableNumber(p: number | undefined): string {
  if (p === undefined || Number.isNaN(p)) return '—'
  return String(Number(fixed(p, 4)))
}
