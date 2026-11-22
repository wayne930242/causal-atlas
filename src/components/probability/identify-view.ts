import type { LoadedCase } from '../../data/load.ts'
import type { Admg, Expr, IdentificationRow, Value, Variable } from '../../engine/index.ts'
import { buildModel, checkIdentification, getVariable, problemOf, valuesEqual } from '../../engine/index.ts'
import { targetValue } from '../model/probability-view.ts'

export interface IdentifyQuery {
  readonly x: string
  readonly y: string
  readonly w?: string
}

type EdgeKind = 'directed' | 'bidirected'
type Pair = readonly [string, string]

function matches([a, b]: Pair, [x, y]: Pair, kind: EdgeKind): boolean {
  return (a === x && b === y) || (kind === 'bidirected' && a === y && b === x)
}

export function hasEdge(g: Admg, kind: EdgeKind, pair: Pair): boolean {
  return g[kind].some((edge) => matches(edge, pair, kind))
}

export function toggleEdge(g: Admg, kind: EdgeKind, pair: Pair): Admg {
  const edges = g[kind]
  return { ...g, [kind]: hasEdge(g, kind, pair) ? edges.filter((edge) => !matches(edge, pair, kind)) : [...edges, pair] }
}

export function sameEdges(a: Admg, b: Admg): boolean {
  return (['directed', 'bidirected'] as const).every((kind) => a[kind].length === b[kind].length && a[kind].every((pair) => hasEdge(b, kind, pair)))
}

/** Adding from → to forms a directed cycle exactly when from is already a descendant of to. */
export function wouldCycle(g: Admg, [from, to]: Pair): boolean {
  const seen = new Set<string>()
  const pending = [to]
  while (pending.length > 0) {
    const v = pending.pop() as string
    if (v === from) return true
    if (seen.has(v)) continue
    seen.add(v)
    for (const [a, b] of g.directed) if (a === v) pending.push(b)
  }
  return false
}

/**
 * Lift each bidirected arc to a private latent parent so the existing signal layout and d-separation
 * view can read the ADMG. The Boolean equations only encode adjacency. This case has no prior or
 * context; never use it to evaluate a probability. Numerical comparisons use the original SCM.
 */
export function graphCase(c: LoadedCase, g: Admg, edited: boolean): LoadedCase {
  const domain = { kind: 'boolean' } as const
  const variables: Variable[] = g.nodes.map((id) => ({ ...getVariable(c.model, id), domain }))
  const used = new Set(g.nodes)
  const parents = new Map(g.nodes.map((id) => [id, [] as string[]]))
  for (const [from, to] of g.directed) parents.get(to)?.push(from)
  let i = 0
  const latent = g.bidirected.map(([a, b]) => {
    let id: string
    do id = `U_${++i}`; while (used.has(id))
    used.add(id)
    variables.push({ id, kind: 'exogenous', domain, label: { 'zh-TW': id, en: id } })
    parents.get(a)?.push(id)
    parents.get(b)?.push(id)
    return id
  })
  const equations = Object.fromEntries([...parents].map(([id, p]) => {
    const expr: Expr = p.length === 0 ? { op: 'const', value: false } : { op: 'or', args: p.map((name) => ({ op: 'var', name })) }
    return [id, expr]
  }))
  const model = buildModel({ variables, equations })
  return { data: { ...c.data, layout: edited ? undefined : c.data.layout, latent_as_arcs: latent }, model }
}

/** Use the same readout convention as the other panels: 1 for Booleans, first value for finite domains. */
export function modelComparison(c: LoadedCase, edited: boolean, { x, y, w }: IdentifyQuery): IdentificationRow | 'editedNoModel' | 'noModel' | 'noValues' | 'checkBudget' {
  if (edited) return 'editedNoModel'
  if (c.prior === undefined) return 'noModel'
  const ids = [x, y, ...(w === undefined ? [] : [w])]
  const at = ids.map((id) => [id, targetValue(getVariable(c.model, id))] as const)
  try {
    const check = checkIdentification(c.model, c.prior, { x: [x], y: [y], w: w === undefined ? [] : [w] })
    return check.rows.find((row) => at.every(([id, v]) => valuesEqual(row.at[id] as Value, v))) ?? 'noValues'
  } catch (error) {
    if (problemOf(error)?.code === 'identify-budget') return 'checkBudget'
    throw error
  }
}
