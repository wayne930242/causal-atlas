import type { Interventions } from './evaluate.ts'
import { evaluate } from './evaluate.ts'
import type { CausalModel } from './model.ts'
import { getVariable } from './model.ts'
import type { Prior } from './probability.ts'
import { enumerateContexts } from './probability.ts'
import type { Assignment, Edge } from './types.ts'
import { coerceToDomain, domainValues, valuesEqual } from './values.ts'

/** A collider on an open path, and the known variable that opens it: itself or a descendant. */
export interface OpenedCollider {
  readonly collider: string
  readonly by: string
}

/** One path between the two variables, with each edge in its own direction. */
export interface DPath {
  /** The nodes from x to y. */
  readonly nodes: readonly string[]
  /** The edges along the path, as they point in the model. */
  readonly edges: readonly Edge[]
  readonly open: boolean
  /** A blocked path: the first node that blocks it. */
  readonly blockedBy?: string
  /** `known`: a chain or fork middle that is known; `collider`: a collider with neither it nor a descendant known. */
  readonly kind?: 'known' | 'collider'
  /** An open path: each collider on it, with what opens it. */
  readonly opened?: readonly OpenedCollider[]
}

export interface DSeparationResult {
  /** No open path: x and y are d-separated by `given` in the graph after do(). */
  readonly separated: boolean
  readonly paths: readonly DPath[]
}

/** Edges of the graph after do(): the arrows into each variable in `cut` are gone. */
function cutEdges(model: CausalModel, cut: readonly string[]): Edge[] {
  const gone = new Set(cut)
  return model.edges.filter((e) => !gone.has(e.to))
}

function descendantsOf(edges: readonly Edge[], id: string): Set<string> {
  const out = new Set<string>()
  const queue = [id]
  while (queue.length > 0) {
    const at = queue.shift() as string
    for (const e of edges) {
      if (e.from === at && !out.has(e.to)) {
        out.add(e.to)
        queue.push(e.to)
      }
    }
  }
  return out
}

/**
 * d-separation (Pearl 2009, Def. 1.2.3) of `x` and `y` by the known variables `given`, in the
 * graph after do() on `cut` (the arrows into them removed). Every simple path between the two is
 * listed, shortest first: a path is blocked by a chain or fork middle that is known, or by a
 * collider that is unknown along with all its descendants; otherwise it is open.
 */
export function dSeparation(model: CausalModel, x: string, y: string, given: readonly string[], cut: readonly string[] = []): DSeparationResult {
  getVariable(model, x)
  getVariable(model, y)
  for (const id of given) getVariable(model, id)
  const edges = cutEdges(model, cut)
  const known = new Set(given.filter((id) => id !== x && id !== y))
  const neighbours = new Map<string, Edge[]>()
  for (const e of edges) {
    neighbours.set(e.from, [...(neighbours.get(e.from) ?? []), e])
    neighbours.set(e.to, [...(neighbours.get(e.to) ?? []), e])
  }
  const found: { nodes: string[]; edges: Edge[] }[] = []
  const walk = (at: string, nodes: string[], along: Edge[]): void => {
    if (at === y) {
      found.push({ nodes: [...nodes], edges: [...along] })
      return
    }
    for (const e of neighbours.get(at) ?? []) {
      const next = e.from === at ? e.to : e.from
      if (nodes.includes(next)) continue
      nodes.push(next)
      along.push(e)
      walk(next, nodes, along)
      nodes.pop()
      along.pop()
    }
  }
  if (x !== y) walk(x, [x], [])
  found.sort((a, b) => a.nodes.length - b.nodes.length)
  const paths = found.map(({ nodes, edges: along }): DPath => {
    const opened: OpenedCollider[] = []
    for (let i = 1; i < nodes.length - 1; i++) {
      const m = nodes[i]
      const collider = along[i - 1].to === m && along[i].to === m
      if (!collider) {
        if (known.has(m)) return { nodes, edges: along, open: false, blockedBy: m, kind: 'known' }
        continue
      }
      if (known.has(m)) {
        opened.push({ collider: m, by: m })
        continue
      }
      const by = [...descendantsOf(edges, m)].find((d) => known.has(d))
      if (by === undefined) return { nodes, edges: along, open: false, blockedBy: m, kind: 'collider' }
      opened.push({ collider: m, by })
    }
    return { nodes, edges: along, open: true, opened }
  })
  return { separated: paths.every((p) => !p.open), paths }
}

/**
 * The dependence of `x` and `y` given the values `given`, in the model after do(`interventions`):
 * δ(X, Y | z) = max over x, y of |P(x, y | z) − P(x | z) P(y | z)| (lesson 04's measure, 0 exactly
 * when X and Y are independent given z). NaN when `given` has probability 0.
 */
export function dependence(
  model: CausalModel,
  prior: Prior,
  x: string,
  y: string,
  given: Assignment = {},
  interventions: Interventions = {},
  /** Stochastic do(): P*(X=1) per boolean variable; the worlds mix by those weights. */
  stochastic: Readonly<Record<string, number>> = {},
): number {
  const vx = getVariable(model, x)
  const vy = getVariable(model, y)
  const xs = domainValues(vx.domain)
  const ys = domainValues(vy.domain)
  const z = Object.entries(given).map(([id, v]) => [id, coerceToDomain(getVariable(model, id), v)] as const)
  const joint = xs.map(() => ys.map(() => 0))
  let total = 0
  const soft = Object.keys(stochastic)
  const contexts = enumerateContexts(model, prior)
  for (let mask = 0; mask < 1 << soft.length; mask++) {
    const setting: Record<string, Assignment[string]> = { ...(interventions as Assignment) }
    let weight = 1
    soft.forEach((id, k) => {
      const on = (mask & (1 << k)) !== 0
      setting[id] = on
      weight *= on ? stochastic[id] : 1 - stochastic[id]
    })
    for (const { context, p } of contexts) {
      const world = evaluate(model, context, setting).values
      if (!z.every(([id, v]) => world[id] !== undefined && valuesEqual(world[id], v))) continue
      const i = xs.findIndex((v) => valuesEqual(v, world[x]))
      const j = ys.findIndex((v) => valuesEqual(v, world[y]))
      if (i < 0 || j < 0) continue
      joint[i][j] += weight * p
      total += weight * p
    }
  }
  if (!(total > 0)) return Number.NaN
  const px = joint.map((row) => row.reduce((s, q) => s + q, 0) / total)
  const py = ys.map((_, j) => joint.reduce((s, row) => s + row[j], 0) / total)
  let max = 0
  joint.forEach((row, i) => row.forEach((q, j) => (max = Math.max(max, Math.abs(q / total - px[i] * py[j])))))
  return max
}
