import { problem } from '../errors.ts'
import { ModelError } from '../values.ts'
import type { Admg, Graph } from './admg.ts'
import { ancestors, cComponents, inOrder, mSeparated, prepareGraph } from './admg.ts'
import type { ProbExpr } from './prob-expr.ts'
import { Algebra, freeOf } from './prob-expr.ts'
import { probExprLatex, probExprText } from './prob-render.ts'

/**
 * Identification of P(y | do(x)) (the ID algorithm) and P(y | do(x), w) (IDC), written from
 * Shpitser & Pearl, "Identification of joint interventional distributions in recursive
 * semi-Markovian causal models" (AAAI 2006) and "Identification of conditional interventional
 * distributions" (UAI 2006), with C-components as in Tian & Pearl (2002).
 */

/** Two R-rooted C-forests F′ ⊂ F, F meeting x and F′ not: the effect differs between two models that agree on P(V). */
export interface Hedge {
  readonly f: readonly string[]
  readonly fPrime: readonly string[]
}

export type IdentifyResult =
  | {
      readonly identifiable: true
      /** Over observed variables only; free in y ∪ x ∪ w and `arbitrary`. */
      readonly formula: ProbExpr
      readonly text: string
      readonly latex: string
      /**
       * Free variables outside y ∪ x ∪ w: ID's line 3 adds them to do() because they do not affect
       * y, so the formula takes the same value at any setting of them where it is defined.
       */
      readonly arbitrary: readonly string[]
    }
  | { readonly identifiable: false; readonly hedge: Hedge; readonly reason: string }

/** The most recursive ID calls one identification makes. */
export const MAX_IDENTIFY_STEPS = 10_000

class HedgeFound {
  readonly hedge: Hedge
  constructor(hedge: Hedge) {
    this.hedge = hedge
  }
}

const minus = (a: Iterable<string>, b: ReadonlySet<string>): Set<string> => new Set([...a].filter((v) => !b.has(v)))
const union = (...sets: Iterable<string>[]): Set<string> => new Set(sets.flatMap((s) => [...s]))
const within = (a: Iterable<string>, b: ReadonlySet<string>): Set<string> => new Set([...a].filter((v) => b.has(v)))

class Identifier {
  readonly graph: Graph
  readonly algebra: Algebra
  private steps = 0

  constructor(graph: Graph) {
    this.graph = graph
    const none = new Set<string>()
    this.algebra = new Algebra(graph.rank, (a, b, given) => mSeparated(graph, new Set(a), new Set(b), new Set(given), none, none))
  }

  private before(order: readonly string[], v: string): string[] {
    return order.slice(0, order.indexOf(v))
  }

  /** P(v | prefix) of the distribution `p` over `vars`. */
  private conditional(p: ProbExpr, vars: ReadonlySet<string>, v: string, prefix: readonly string[]): ProbExpr {
    const a = this.algebra
    const keep = new Set(prefix)
    const num = a.sum(minus(vars, union(keep, [v])), p)
    const den = a.sum(minus(vars, keep), p)
    return a.ratio(num, den)
  }

  /** ID(y, x, P, G[vars]); throws HedgeFound at line 5. */
  id(y: ReadonlySet<string>, x: ReadonlySet<string>, p: ProbExpr, vars: ReadonlySet<string>): ProbExpr {
    this.steps += 1
    if (this.steps > MAX_IDENTIFY_STEPS) throw new ModelError(problem('identify-budget', { limit: MAX_IDENTIFY_STEPS }))
    const a = this.algebra
    const g = this.graph
    // line 1
    if (x.size === 0) return a.sum(minus(vars, y), p)
    // line 2
    const an = ancestors(g, y, vars)
    if (an.size < vars.size) return this.id(y, within(x, an), a.sum(minus(vars, an), p), an)
    // line 3
    const anCut = ancestors(g, y, vars, x)
    const w = [...vars].filter((v) => !x.has(v) && !anCut.has(v))
    if (w.length > 0) return this.id(y, union(x, w), p, vars)
    // line 4
    const parts = cComponents(g, minus(vars, x))
    if (parts.length > 1) {
      const factors = parts.map((s) => this.id(new Set(s), minus(vars, new Set(s)), p, vars))
      return a.sum(minus(vars, union(y, x)), a.product(factors))
    }
    const s = parts[0]
    const whole = cComponents(g, vars)
    // line 5
    if (whole.length === 1) throw new HedgeFound({ f: inOrder(g, vars), fPrime: s })
    const order = inOrder(g, vars)
    // line 6
    if (whole.some((c) => c.length === s.length && c.every((v) => s.includes(v)))) {
      const factors = s.map((v) => this.conditional(p, vars, v, this.before(order, v)))
      return a.sum(minus(s, y), a.product(factors))
    }
    // line 7
    const bigger = whole.find((c) => s.every((v) => c.includes(v))) as string[]
    const factors = bigger.map((v) => this.conditional(p, vars, v, this.before(order, v)))
    const next = new Set(bigger)
    return this.id(y, within(x, next), a.product(factors), next)
  }

  /** IDC(y, x, w, P, G). */
  idc(y: ReadonlySet<string>, x: ReadonlySet<string>, w: ReadonlySet<string>): ProbExpr {
    const g = this.graph
    const all = new Set(g.nodes)
    const observed = this.algebra.atom(g.nodes)
    let doSet = new Set(x)
    let seen = new Set(w)
    let moved = true
    while (moved) {
      moved = false
      for (const z of inOrder(g, seen)) {
        const others = minus(seen, new Set([z]))
        if (mSeparated(g, y, new Set([z]), union(doSet, others), doSet, new Set([z]))) {
          doSet = union(doSet, [z])
          seen = others
          moved = true
          break
        }
      }
    }
    if (seen.size === 0) return this.id(y, doSet, observed, all)
    const joint = this.id(union(y, seen), doSet, observed, all)
    return this.algebra.ratio(joint, this.algebra.sum(y, joint))
  }
}

type SetName = 'y' | 'x' | 'w'

function checkSets(g: Admg, sets: readonly (readonly [SetName, readonly string[]])[]): void {
  const known = new Set(g.nodes)
  const owner = new Map<string, SetName>()
  for (const [name, ids] of sets) {
    for (const id of ids) {
      if (!known.has(id)) throw new ModelError(problem('unknown-variable', { id }))
      const first = owner.get(id)
      if (first !== undefined && first !== name) throw new ModelError(problem('identify-overlap', { id, first, second: name }))
      owner.set(id, name)
    }
  }
}

function setText(ids: readonly string[]): string {
  return `{${ids.join(', ')}}`
}

/**
 * Whether P(y | do(x)) — or P(y | do(x), w) when `w` is given — is identifiable from the
 * observational distribution of an ADMG, and if so a formula over the observed variables. When it
 * is not, the hedge the algorithm found. Throws a ModelError on an unknown variable, overlapping or
 * empty sets, a cyclic graph, or past MAX_IDENTIFY_STEPS.
 */
export function identify(g: Admg, y: readonly string[], x: readonly string[], w: readonly string[] = []): IdentifyResult {
  const graph = prepareGraph(g)
  checkSets(g, [
    ['y', y],
    ['x', x],
    ['w', w],
  ])
  if (y.length === 0) throw new ModelError(problem('identify-empty', { set: 'y' }))
  const identifier = new Identifier(graph)
  let formula: ProbExpr
  try {
    formula = identifier.algebra.tidy(identifier.idc(new Set(y), new Set(x), new Set(w)))
  } catch (error) {
    if (!(error instanceof HedgeFound)) throw error
    const { f, fPrime } = error.hedge
    const query = `P(${y.join(', ')}${x.length > 0 ? ` | do(${x.join(', ')})` : ''}${w.length > 0 ? `${x.length > 0 ? ', ' : ' | '}${w.join(', ')}` : ''})`
    const reason =
      `${query} is not identifiable: hedge F = ${setText(f)}, F′ = ${setText(fPrime)}. ` +
      `F and F′ are C-forests with the same root set, F′ ⊂ F, and F meets the intervention while F′ does not, ` +
      `so two models that agree on every observed probability give different values for the effect.`
    return { identifiable: false, hedge: { f, fPrime }, reason }
  }
  const query = new Set([...y, ...x, ...w])
  const arbitrary = inOrder(
    graph,
    [...freeOf(formula)].filter((v) => !query.has(v)),
  )
  const options = { names: g.nodes, inScope: [...query] }
  return { identifiable: true, formula, text: probExprText(formula, options), latex: probExprLatex(formula, options), arbitrary }
}
