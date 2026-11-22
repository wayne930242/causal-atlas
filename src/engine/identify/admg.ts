import { problem } from '../errors.ts'
import type { CausalModel } from '../model.ts'
import { CyclicModelError } from '../model.ts'
import { ModelError } from '../values.ts'

/**
 * An acyclic directed mixed graph over the observed variables: `directed` holds the arrows
 * [from, to], `bidirected` the pairs that share a latent common cause.
 */
export interface Admg {
  readonly nodes: readonly string[]
  readonly directed: readonly (readonly [string, string])[]
  readonly bidirected: readonly (readonly [string, string])[]
}

/**
 * The ADMG of a model: the endogenous variables are observed and keep the model's arrows between
 * them (only where an equation actually depends on its input); each exogenous variable with two or
 * more endogenous children becomes a bidirected arc between every pair of them, as
 * `latent_as_arcs` draws it. The engine has its own copy of that rule; it does not import the graph
 * component.
 */
export function admgOf(model: CausalModel): Admg {
  return admgOfLatents(
    model,
    model.exogenous.map((id) => [id]),
  )
}

/**
 * The ADMG when each group of exogenous variables acts as one latent cause (a group is
 * statistically dependent within, independent of the others): a group with two or more endogenous
 * children joins every pair of them.
 */
export function admgOfLatents(model: CausalModel, groups: readonly (readonly string[])[]): Admg {
  const nodes = model.endogenous
  const rank = new Map(nodes.map((v, i) => [v, i]))
  const observed = (id: string): boolean => rank.has(id)
  const directed = model.edges
    .filter((e) => observed(e.from) && observed(e.to))
    .map((e) => [e.from, e.to] as const)
    .sort((a, b) => (rank.get(a[1]) as number) - (rank.get(b[1]) as number) || (rank.get(a[0]) as number) - (rank.get(b[0]) as number))
  const pairs = new Map<string, readonly [string, string]>()
  for (const group of groups) {
    const members = new Set(group)
    const kids = nodes.filter((v) => model.edges.some((e) => e.to === v && members.has(e.from)))
    for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) pairs.set(`${kids[i]}\u0000${kids[j]}`, [kids[i], kids[j]])
  }
  const bidirected = [...pairs.values()].sort(
    (a, b) => (rank.get(a[0]) as number) - (rank.get(b[0]) as number) || (rank.get(a[1]) as number) - (rank.get(b[1]) as number),
  )
  return { nodes: [...nodes], directed, bidirected }
}

/** A validated ADMG with its adjacency and one topological order. */
export interface Graph {
  readonly nodes: readonly string[]
  /** Topological order; ties keep the order of `nodes`. */
  readonly order: readonly string[]
  readonly rank: ReadonlyMap<string, number>
  readonly parents: ReadonlyMap<string, readonly string[]>
  readonly children: ReadonlyMap<string, readonly string[]>
  /** Bidirected neighbours. */
  readonly siblings: ReadonlyMap<string, readonly string[]>
}

/** Validate `g` (known endpoints, no directed cycle) and index it. */
export function prepareGraph(g: Admg): Graph {
  const known = new Set(g.nodes)
  const check = (id: string): void => {
    if (!known.has(id)) throw new ModelError(problem('unknown-variable', { id }))
  }
  const parents = new Map<string, string[]>(g.nodes.map((v) => [v, []]))
  const children = new Map<string, string[]>(g.nodes.map((v) => [v, []]))
  const siblings = new Map<string, string[]>(g.nodes.map((v) => [v, []]))
  for (const [from, to] of g.directed) {
    check(from)
    check(to)
    if (from === to) throw new CyclicModelError([from, to])
    if (!(parents.get(to) as string[]).includes(from)) {
      ;(parents.get(to) as string[]).push(from)
      ;(children.get(from) as string[]).push(to)
    }
  }
  for (const [a, b] of g.bidirected) {
    check(a)
    check(b)
    if (a === b) continue
    if (!(siblings.get(a) as string[]).includes(b)) {
      ;(siblings.get(a) as string[]).push(b)
      ;(siblings.get(b) as string[]).push(a)
    }
  }
  const order = topological(g.nodes, parents)
  return { nodes: g.nodes, order, rank: new Map(order.map((v, i) => [v, i])), parents, children, siblings }
}

function topological(nodes: readonly string[], parents: ReadonlyMap<string, readonly string[]>): string[] {
  const order: string[] = []
  const state = new Map<string, 'visiting' | 'done'>()
  const stack: string[] = []
  const visit = (id: string): void => {
    const s = state.get(id)
    if (s === 'done') return
    if (s === 'visiting') throw new CyclicModelError([...stack.slice(stack.indexOf(id)), id])
    state.set(id, 'visiting')
    stack.push(id)
    for (const p of parents.get(id) ?? []) visit(p)
    stack.pop()
    state.set(id, 'done')
    order.push(id)
  }
  for (const id of nodes) visit(id)
  return order
}

/** `ids` in the graph's topological order. */
export function inOrder(graph: Graph, ids: Iterable<string>): string[] {
  return [...new Set(ids)].sort((a, b) => (graph.rank.get(a) as number) - (graph.rank.get(b) as number))
}

/**
 * The ancestors of `targets` (themselves included) in the subgraph over `within`, with the arrows
 * into `cutInto` removed.
 */
export function ancestors(graph: Graph, targets: Iterable<string>, within: ReadonlySet<string>, cutInto: ReadonlySet<string> = new Set()): Set<string> {
  const out = new Set<string>()
  const stack = [...targets].filter((v) => within.has(v))
  while (stack.length > 0) {
    const v = stack.pop() as string
    if (out.has(v)) continue
    out.add(v)
    if (cutInto.has(v)) continue
    for (const p of graph.parents.get(v) ?? []) if (within.has(p)) stack.push(p)
  }
  return out
}

/** The C-components (bidirected-connected parts) of the subgraph over `within`, each in topological order, ordered by their first node. */
export function cComponents(graph: Graph, within: ReadonlySet<string>): string[][] {
  const seen = new Set<string>()
  const out: string[][] = []
  for (const start of graph.order) {
    if (!within.has(start) || seen.has(start)) continue
    const part: string[] = []
    const stack = [start]
    while (stack.length > 0) {
      const v = stack.pop() as string
      if (seen.has(v)) continue
      seen.add(v)
      part.push(v)
      for (const s of graph.siblings.get(v) ?? []) if (within.has(s) && !seen.has(s)) stack.push(s)
    }
    out.push(inOrder(graph, part))
  }
  return out
}

/**
 * Whether `a` and `b` are m-separated by `given` in the graph with the edges into `cutInto` (arrows
 * and arcs) and the arrows out of `cutOutOf` removed. Each bidirected arc counts as a latent parent
 * of both ends; the test runs on the moral graph of the ancestral set.
 */
export function mSeparated(
  graph: Graph,
  a: ReadonlySet<string>,
  b: ReadonlySet<string>,
  given: ReadonlySet<string>,
  cutInto: ReadonlySet<string>,
  cutOutOf: ReadonlySet<string>,
): boolean {
  const parents = new Map<string, string[]>()
  for (const v of graph.nodes) {
    if (cutInto.has(v)) {
      parents.set(v, [])
      continue
    }
    const own = (graph.parents.get(v) ?? []).filter((p) => !cutOutOf.has(p))
    const latent = (graph.siblings.get(v) ?? []).filter((s) => !cutInto.has(s)).map((s) => latentName(v, s))
    parents.set(v, [...own, ...latent])
  }
  const relevant = new Set<string>()
  const stack = [...a, ...b, ...given]
  while (stack.length > 0) {
    const v = stack.pop() as string
    if (relevant.has(v)) continue
    relevant.add(v)
    for (const p of parents.get(v) ?? []) stack.push(p)
  }
  const adjacent = new Map<string, Set<string>>()
  const link = (u: string, v: string): void => {
    if (!adjacent.has(u)) adjacent.set(u, new Set())
    if (!adjacent.has(v)) adjacent.set(v, new Set())
    ;(adjacent.get(u) as Set<string>).add(v)
    ;(adjacent.get(v) as Set<string>).add(u)
  }
  for (const v of relevant) {
    const ps = parents.get(v) ?? []
    for (const p of ps) link(p, v)
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) link(ps[i], ps[j])
  }
  const seen = new Set<string>()
  const queue = [...a].filter((v) => !given.has(v))
  while (queue.length > 0) {
    const v = queue.pop() as string
    if (seen.has(v)) continue
    seen.add(v)
    if (b.has(v)) return false
    for (const u of adjacent.get(v) ?? []) if (!given.has(u) && !seen.has(u)) queue.push(u)
  }
  return true
}

function latentName(u: string, v: string): string {
  return u < v ? `\u0000${u}\u0000${v}` : `\u0000${v}\u0000${u}`
}
