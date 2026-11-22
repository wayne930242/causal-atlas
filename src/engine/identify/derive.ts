import type { Admg, Graph } from './admg.ts'
import { ancestors, cComponents, inOrder, mSeparated, prepareGraph } from './admg.ts'
import type { Hedge } from './id.ts'
import { identify } from './id.ts'
import type { DoAtom, DoExpr, ProbExpr } from './prob-expr.ts'
import { Algebra, actsOf, keyOf } from './prob-expr.ts'
import { probExprLatex, probExprText } from './prob-render.ts'

/**
 * A do-calculus derivation of P(y | do(x)) or P(y | do(x), w) from the observational distribution,
 * generated along the recursion of ID / IDC (Shpitser & Pearl 2006, whose completeness proof shows
 * each line is a sequence of do-calculus rules and probability calculus; Pearl 1995 for the rules).
 * Every rule step names the separation it needs on its cut graph, computed from the graph; every
 * other step is an identity of probability calculus that holds in every distribution.
 */

/**
 * The probability-calculus steps:
 * - `expand`: Σ-expansion, P(a | c) = Σ_b P(a, b | c);
 * - `chain`: the chain rule, P(a, b | c) = P(a | b, c) P(b | c), in either direction;
 * - `conditional`: the definition of a conditional, P(a | b, c) = P(a, b | c) / P(b | c);
 * - `substitute`: a term replaced by the expression earlier steps derived for it;
 * - `simplify`: algebra valid in every distribution: summing a variable out of its own factor,
 *   joining P(a | b, c) P(b | c) into P(a, b | c), cancelling a ratio.
 */
export type CalculusKind = 'expand' | 'chain' | 'conditional' | 'substitute' | 'simplify'

/**
 * What a rule step tests: `moved` (the Z whose observation or do() the rule adds, removes or
 * exchanges) d-separated from `head` (the term's Y) given `given` (the term's do() and observed
 * variables, Z itself excluded), in the graph with the edges into `cutIn` and the arrows out of
 * `cutOut` removed.
 */
export interface RuleTest {
  readonly moved: readonly string[]
  readonly head: readonly string[]
  readonly given: readonly string[]
  readonly cutIn: readonly string[]
  readonly cutOut: readonly string[]
}

export interface RuleDerivationStep {
  readonly kind: 'rule'
  readonly rule: 1 | 2 | 3
  /** The whole expression before and after the step. */
  readonly from: DoExpr
  readonly to: DoExpr
  /** The term the rule rewrites, and what it becomes (every occurrence in `from` is rewritten). */
  readonly left: DoAtom
  readonly right: DoAtom
  readonly test: RuleTest
}

export interface CalculusDerivationStep {
  readonly kind: CalculusKind
  readonly from: DoExpr
  readonly to: DoExpr
  readonly left: DoExpr
  readonly right: DoExpr
}

export type DerivationStep = RuleDerivationStep | CalculusDerivationStep

export type DeriveResult =
  | {
      readonly identifiable: true
      /** P(y | do(x), w). */
      readonly query: DoAtom
      readonly steps: readonly DerivationStep[]
      /** The last step's expression: identify()'s formula when `matches`. */
      readonly formula: ProbExpr
      /** Whether `formula` has the structure of identify()'s formula (else it is only equal in value). */
      readonly matches: boolean
      readonly text: string
      readonly latex: string
    }
  | { readonly identifiable: false; readonly hedge: Hedge; readonly reason: string }

/** A derivation the generator could not complete: a bug in the generator, never a property of the graph. */
export class DerivationError extends Error {}

const minus = (a: Iterable<string>, b: Iterable<string>): string[] => {
  const drop = new Set(b)
  return [...new Set(a)].filter((v) => !drop.has(v))
}
const within = (a: Iterable<string>, b: Iterable<string>): string[] => {
  const keep = new Set(b)
  return [...new Set(a)].filter((v) => keep.has(v))
}
const sameSet = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((v) => b.includes(v))
const byName = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)
const sorted = (ids: Iterable<string>): string[] => [...new Set(ids)].sort(byName)

/** P(vars | do(acts), given), as written: no simplification. */
function term(vars: Iterable<string>, given: Iterable<string> = [], acts: Iterable<string> = []): DoAtom {
  const d = sorted(acts)
  return { kind: 'p', vars: sorted(vars), given: sorted(given), ...(d.length > 0 ? { do: d } : {}) }
}

function rawSum(over: readonly string[], body: DoExpr): DoExpr {
  return over.length === 0 ? body : { kind: 'sum', over: sorted(over), body }
}

function rawProduct(factors: readonly DoExpr[]): DoExpr {
  return factors.length === 1 ? factors[0] : { kind: 'product', factors }
}

/** `e` with every subexpression whose key is `key` replaced by `by`. */
function replace(e: DoExpr, key: string, by: DoExpr): DoExpr {
  if (keyOf(e) === key) return by
  switch (e.kind) {
    case 'p':
      return e
    case 'sum': {
      const body = replace(e.body, key, by)
      return body === e.body ? e : { kind: 'sum', over: e.over, body }
    }
    case 'product': {
      const factors = e.factors.map((f) => replace(f, key, by))
      return factors.every((f, i) => f === e.factors[i]) ? e : { kind: 'product', factors }
    }
    case 'ratio': {
      const num = replace(e.num, key, by)
      const den = replace(e.den, key, by)
      return num === e.num && den === e.den ? e : { kind: 'ratio', num, den }
    }
  }
}

function contains(e: DoExpr, key: string): boolean {
  if (keyOf(e) === key) return true
  switch (e.kind) {
    case 'p':
      return false
    case 'sum':
      return contains(e.body, key)
    case 'product':
      return e.factors.some((f) => contains(f, key))
    case 'ratio':
      return contains(e.num, key) || contains(e.den, key)
  }
}

function* atomsOf(e: DoExpr): Generator<DoAtom> {
  switch (e.kind) {
    case 'p':
      yield e
      return
    case 'sum':
      yield* atomsOf(e.body)
      return
    case 'product':
      for (const f of e.factors) yield* atomsOf(f)
      return
    case 'ratio':
      yield* atomsOf(e.num)
      yield* atomsOf(e.den)
  }
}

/**
 * The separation test of the rule that turns `a` into `b` (or `b` into `a`), when the two terms
 * differ by one rule's move: rule 1 adds or removes observations, rule 2 exchanges do(Z) for
 * observing Z, rule 3 adds or removes do(Z). Pearl (1995), with Z(W) the Z not ancestors of W in
 * the graph with the arrows into X cut.
 */
export function ruleTest(graph: Graph, a: DoAtom, b: DoAtom): { readonly rule: 1 | 2 | 3; readonly test: RuleTest } | undefined {
  if (!sameSet(a.vars, b.vars)) return undefined
  const [actsA, actsB] = [actsOf(a), actsOf(b)]
  const head = a.vars
  const oneSided = (p: readonly string[], q: readonly string[]): readonly string[] | undefined => {
    const [extraP, extraQ] = [minus(p, q), minus(q, p)]
    if (extraP.length > 0 && extraQ.length > 0) return undefined
    return extraP.length > 0 ? extraP : extraQ
  }
  if (sameSet(actsA, actsB)) {
    const moved = oneSided(a.given, b.given)
    if (moved === undefined || moved.length === 0) return undefined
    const given = within(a.given, b.given)
    return { rule: 1, test: { moved, head, given: inOrder(graph, [...actsA, ...given]), cutIn: inOrder(graph, actsA), cutOut: [] } }
  }
  if (sameSet(a.given, b.given)) {
    const moved = oneSided(actsA, actsB)
    if (moved === undefined) return undefined
    const x = within(actsA, actsB)
    const w = a.given
    const anW = ancestors(graph, w, new Set(graph.nodes), new Set(x))
    const zw = moved.filter((z) => !anW.has(z))
    return { rule: 3, test: { moved, head, given: inOrder(graph, [...x, ...w]), cutIn: inOrder(graph, [...x, ...zw]), cutOut: [] } }
  }
  // rule 2: Z set by do() on one side and observed on the other, the rest common.
  const [doOnlyA, doOnlyB] = [minus(actsA, actsB), minus(actsB, actsA)]
  const [seenOnlyA, seenOnlyB] = [minus(a.given, b.given), minus(b.given, a.given)]
  const forward = doOnlyB.length === 0 && seenOnlyA.length === 0 && sameSet(doOnlyA, seenOnlyB)
  const backward = doOnlyA.length === 0 && seenOnlyB.length === 0 && sameSet(doOnlyB, seenOnlyA)
  if (!forward && !backward) return undefined
  const moved = forward ? doOnlyA : doOnlyB
  const x = within(actsA, actsB)
  const w = within(a.given, b.given)
  return { rule: 2, test: { moved: inOrder(graph, moved), head, given: inOrder(graph, [...x, ...w]), cutIn: inOrder(graph, x), cutOut: inOrder(graph, moved) } }
}

function passes(graph: Graph, test: RuleTest): boolean {
  return mSeparated(graph, new Set(test.head), new Set(test.moved), new Set(test.given), new Set(test.cutIn), new Set(test.cutOut))
}

interface Context {
  /** The variables of the current subgraph; the distribution there is P(s | do(V∖s)). */
  readonly s: readonly string[]
  /** `root`: s = V; `marginal`: s holds the ancestors of the query in the parent's subgraph (ID line 2); `factor`: s is a C-component of the parent's subgraph (line 7). */
  readonly kind: 'root' | 'marginal' | 'factor'
  readonly parent?: Context
}

class Deriver {
  readonly graph: Graph
  readonly all: readonly string[]
  expr: DoExpr
  readonly steps: DerivationStep[] = []
  private readonly tests = new Map<string, boolean>()
  /** Terms already reduced, by key, and what the steps made of them. */
  private readonly done = new Map<string, DoExpr>()
  /** The terms being reduced, each rewritten along with the expression: what the steps make of it. */
  private readonly shadows: { expr: DoExpr }[] = []

  constructor(graph: Graph, query: DoAtom) {
    this.graph = graph
    this.all = graph.order
    this.expr = query
  }

  private ordered(ids: Iterable<string>): string[] {
    return inOrder(this.graph, ids)
  }

  private before(s: readonly string[], v: string): string[] {
    const rank = this.graph.rank.get(v) as number
    return this.ordered(s).filter((u) => (this.graph.rank.get(u) as number) < rank)
  }

  private outside(s: readonly string[]): string[] {
    return minus(this.all, s)
  }

  /** Rewrites every occurrence of `left` by `right` in the expression and in the terms being reduced. */
  private apply(left: DoExpr, right: DoExpr): DoExpr {
    const key = keyOf(left)
    for (const s of this.shadows) s.expr = replace(s.expr, key, right)
    return replace(this.expr, key, right)
  }

  calculus(kind: CalculusKind, left: DoExpr, right: DoExpr): void {
    const key = keyOf(left)
    if (key === keyOf(right) || !contains(this.expr, key)) return
    const to = this.apply(left, right)
    this.steps.push({ kind, from: this.expr, to, left, right })
    this.expr = to
  }

  private valid(a: DoAtom, b: DoAtom): { readonly rule: 1 | 2 | 3; readonly test: RuleTest } | undefined {
    const found = ruleTest(this.graph, a, b)
    if (found === undefined) return undefined
    const key = JSON.stringify(found.test) + found.rule
    let ok = this.tests.get(key)
    if (ok === undefined) {
      ok = passes(this.graph, found.test)
      this.tests.set(key, ok)
    }
    return ok ? found : undefined
  }

  /**
   * Records a rule step. When it continues the previous rule step on the same term, a return to
   * where that step started drops both, and a pair one rule can do at once becomes that rule.
   */
  private rule(left: DoAtom, right: DoAtom, found: { readonly rule: 1 | 2 | 3; readonly test: RuleTest }): void {
    const key = keyOf(left)
    if (!contains(this.expr, key)) return
    const to = this.apply(left, right)
    const last = this.steps[this.steps.length - 1]
    if (last?.kind === 'rule' && last.to === this.expr && keyOf(last.right) === key) {
      if (keyOf(last.left) === keyOf(right) && keyOf(last.from) === keyOf(to)) {
        this.steps.pop()
        this.expr = last.from
        return
      }
      const merged = this.valid(last.left, right)
      const direct = replace(last.from, keyOf(last.left), right)
      if (merged !== undefined && keyOf(direct) === keyOf(to)) {
        this.steps[this.steps.length - 1] = { kind: 'rule', rule: merged.rule, from: last.from, to: direct, left: last.left, right, test: merged.test }
        this.expr = direct
        return
      }
    }
    this.steps.push({ kind: 'rule', rule: found.rule, from: this.expr, to, left, right, test: found.test })
    this.expr = to
  }

  /** Rewrites `source` into `target` (same head) by do-calculus rules, each checked on the graph. */
  moveTo(source: DoAtom, target: DoAtom): DoAtom {
    if (keyOf(source) === keyOf(target)) return target
    const path = this.directPath(source, target)
    if (path === undefined) throw new DerivationError(`no do-calculus path from ${keyOf(source)} to ${keyOf(target)}`)
    let at = source
    for (const next of path) {
      const found = this.valid(at, next)
      if (found === undefined) throw new DerivationError(`invalid rule step from ${keyOf(at)} to ${keyOf(next)}`)
      this.rule(at, next, found)
      at = next
    }
    return target
  }

  /**
   * One rule per kind of change, in this order: drop the do()s the target lacks (rule 3), exchange
   * do()s for observations (rule 2, either way), drop then add observations (rule 1), add do()s
   * (rule 3). Undefined when a move fails its test. The generator asks only for moves this order
   * licenses (Tian & Pearl's factorisation; ID's lines 2, 3 and 7; IDC's rule-2 moves).
   */
  private directPath(source: DoAtom, target: DoAtom): DoAtom[] | undefined {
    const tActs = actsOf(target)
    const states: DoAtom[] = []
    let acts = [...actsOf(source)]
    let seen = [...source.given]
    const push = (): void => {
      const next = term(source.vars, seen, acts)
      const last = states.length === 0 ? source : states[states.length - 1]
      if (keyOf(next) !== keyOf(last)) states.push(next)
    }
    acts = acts.filter((v) => tActs.includes(v) || target.given.includes(v))
    push()
    const toSeen = acts.filter((v) => target.given.includes(v))
    acts = minus(acts, toSeen)
    seen = [...seen, ...toSeen]
    push()
    const toDo = seen.filter((v) => tActs.includes(v))
    seen = minus(seen, toDo)
    acts = [...acts, ...toDo]
    push()
    seen = seen.filter((v) => target.given.includes(v))
    push()
    seen = [...seen, ...minus(target.given, [...seen, ...acts])]
    push()
    acts = [...acts, ...minus(tActs, [...acts, ...seen])]
    push()
    if (states.length === 0 || keyOf(states[states.length - 1]) !== keyOf(target)) return undefined
    let at = source
    for (const next of states) {
      if (this.valid(at, next) === undefined) return undefined
      at = next
    }
    return states
  }

  /** Reduces `t` by `reduce`, or substitutes what an earlier reduction of the same term gave. */
  private once(t: DoAtom, reduce: () => void): void {
    const key = keyOf(t)
    const hit = this.done.get(key)
    if (hit !== undefined) return this.calculus('substitute', t, hit)
    const shadow = { expr: t as DoExpr }
    this.shadows.push(shadow)
    try {
      reduce()
    } finally {
      this.shadows.splice(this.shadows.indexOf(shadow), 1)
    }
    this.done.set(key, shadow.expr)
  }

  /** P(a | do(d)) in `ctx` (V∖s ⊆ d): ID(a, d ∩ s, P(s | do(V∖s)), G[s]). */
  joint(t: DoAtom, ctx: Context): void {
    this.once(t, () => this.jointSteps(t, ctx))
  }

  private jointSteps(t: DoAtom, ctx: Context): void {
    const s = ctx.s
    const d = actsOf(t)
    const x = within(d, s)
    const a = t.vars
    if (x.length === 0) return this.marginal(t, ctx)
    // line 2: only the ancestors of a matter; intervening on the rest changes nothing (rule 3).
    const an = ancestors(this.graph, a, new Set(s))
    if (an.size < s.length) {
      const next = term(a, [], [...d, ...minus(s, an)])
      this.moveTo(t, next)
      return this.joint(next, { s: this.ordered(an), kind: 'marginal', parent: ctx })
    }
    // line 3: intervening on what does not affect a once x is set changes nothing (rule 3).
    const anCut = ancestors(this.graph, a, new Set(s), new Set(x))
    const w = s.filter((v) => !x.includes(v) && !anCut.has(v))
    if (w.length > 0) {
      const next = term(a, [], [...d, ...w])
      this.moveTo(t, next)
      return this.joint(next, ctx)
    }
    const rest = this.ordered(minus(s, x))
    const parts = cComponents(this.graph, new Set(rest))
    const whole = cComponents(this.graph, new Set(s))
    const isPart = (c: readonly string[], of: readonly (readonly string[])[]): boolean => of.some((p) => sameSet(p, c))
    if (parts.length === 1 && !isPart(parts[0], whole)) {
      const bigger = whole.find((c) => parts[0].every((v) => c.includes(v)))
      if (bigger === undefined || bigger.length === s.length) throw new DerivationError(`hedge reached for ${keyOf(t)}`)
      // line 7: the C-component of G[s] around rest; P(bigger | do(V∖bigger)) is the new distribution.
      return this.joint(t, { s: bigger, kind: 'factor', parent: ctx })
    }
    // lines 4 and 6: P(rest | do(d)) factorises over the C-components of G[rest].
    const all = term(rest, [], d)
    this.calculus('expand', t, rawSum(minus(rest, a), all))
    const factor = (v: string): DoAtom => term([v], this.before(rest, v), d)
    const grouped = parts.map((p) => rawProduct(p.map(factor)))
    this.calculus('chain', all, rawProduct(grouped))
    for (const part of parts) {
      // ID(part, s∖part): line 2 keeps the ancestors of part; then line 6 or 7.
      const anPart = ancestors(this.graph, part, new Set(s))
      const sub: Context = anPart.size < s.length ? { s: this.ordered(anPart), kind: 'marginal', parent: ctx } : ctx
      if (isPart(part, cComponents(this.graph, new Set(sub.s)))) {
        for (const v of part) this.conditional(this.moveTo(factor(v), term([v], this.before(sub.s, v), this.outside(sub.s))), sub)
        continue
      }
      const bigger = cComponents(this.graph, new Set(sub.s)).find((c) => part.every((v) => c.includes(v)))
      if (bigger === undefined || bigger.length === sub.s.length) throw new DerivationError(`hedge reached for ${keyOf(term(part, [], minus(this.all, part)))}`)
      const q = part.map((v) => this.moveTo(factor(v), term([v], this.before(part, v), this.outside(part))))
      const joint = term(part, [], this.outside(part))
      this.calculus('chain', rawProduct(q), joint)
      this.joint(joint, { s: bigger, kind: 'factor', parent: sub })
    }
  }

  /** P(v | s before v, do(V∖s)), a conditional of the distribution in `ctx`, as observed probabilities. */
  conditional(t: DoAtom, ctx: Context): void {
    this.once(t, () => this.conditionalSteps(t, ctx))
  }

  private conditionalSteps(t: DoAtom, ctx: Context): void {
    const parent = ctx.parent
    if (parent === undefined) return
    const v = t.vars[0]
    if (ctx.kind === 'factor') {
      // Q[s] = Π P_parent(u | parent's s before u) over u in s (Tian & Pearl 2002).
      return this.conditional(this.moveTo(t, term([v], this.before(parent.s, v), this.outside(parent.s))), parent)
    }
    const pre = this.before(ctx.s, v)
    // When v comes before every variable outside s, the parent's conditional is this one with fewer do()s (rule 3).
    const up = term([v], this.before(parent.s, v), this.outside(parent.s))
    if (sameSet(up.given, pre)) return this.conditional(this.moveTo(t, up), parent)
    const num = term([...pre, v], [], this.outside(ctx.s))
    const den = term(pre, [], this.outside(ctx.s))
    if (pre.length > 0) this.calculus('conditional', t, { kind: 'ratio', num, den })
    for (const j of pre.length > 0 ? [num, den] : [num]) this.marginal(j, ctx)
  }

  /** P(b | do(V∖s)), b ⊆ s, a marginal of the distribution in `ctx`, as observed probabilities. */
  marginal(t: DoAtom, ctx: Context): void {
    this.once(t, () => this.marginalSteps(t, ctx))
  }

  private marginalSteps(t: DoAtom, ctx: Context): void {
    const parent = ctx.parent
    if (parent === undefined) return
    if (ctx.kind === 'marginal') {
      // the variables of the parent's subgraph outside s do not affect s (rule 3).
      return this.marginal(this.moveTo(t, term(t.vars, [], this.outside(parent.s))), parent)
    }
    const s = ctx.s
    const all = term(s, [], this.outside(s))
    if (keyOf(all) !== keyOf(t)) {
      this.calculus('expand', t, rawSum(minus(s, t.vars), all))
      return this.marginal(all, ctx)
    }
    const factors = s.map((u) => term([u], this.before(s, u), this.outside(s)))
    this.calculus('chain', all, rawProduct(factors))
    for (const f of factors) this.conditional(f, ctx)
  }

  /** IDC: move each w that may be intervened on instead (rule 2), as identify() does, then ID. */
  query(y: readonly string[], x: readonly string[], w: readonly string[]): void {
    const g = this.graph
    let doSet = [...x]
    let seen = [...w]
    let at = this.expr as DoAtom
    let moved = true
    while (moved) {
      moved = false
      for (const z of inOrder(g, seen)) {
        const others = seen.filter((v) => v !== z)
        if (mSeparated(g, new Set(y), new Set([z]), new Set([...doSet, ...others]), new Set(doSet), new Set([z]))) {
          doSet = [...doSet, z]
          seen = others
          at = this.moveTo(at, term(y, seen, doSet))
          moved = true
          break
        }
      }
    }
    const root: Context = { s: this.ordered(g.nodes), kind: 'root' }
    if (seen.length === 0) return this.joint(at, root)
    const joint = term([...y, ...seen], [], doSet)
    const den = term(seen, [], doSet)
    this.calculus('conditional', at, { kind: 'ratio', num: joint, den })
    this.calculus('expand', den, rawSum(this.ordered(y), joint))
    this.joint(joint, root)
  }
}

/** `e` rebuilt bottom-up by `algebra`. */
function normalize(algebra: Algebra, e: DoExpr): ProbExpr {
  switch (e.kind) {
    case 'p':
      if (actsOf(e).length > 0) throw new DerivationError(`do() left in ${keyOf(e)}`)
      return algebra.atom(e.vars, e.given)
    case 'sum':
      return algebra.sum(e.over, normalize(algebra, e.body))
    case 'product':
      return algebra.product(e.factors.map((f) => normalize(algebra, f)))
    case 'ratio':
      return algebra.ratio(normalize(algebra, e.num), normalize(algebra, e.den))
  }
}

function* productsOf(e: DoExpr): Generator<readonly DoExpr[]> {
  switch (e.kind) {
    case 'p':
      return
    case 'sum':
      yield* productsOf(e.body)
      return
    case 'product':
      yield e.factors
      for (const f of e.factors) yield* productsOf(f)
      return
    case 'ratio':
      yield* productsOf(e.num)
      yield* productsOf(e.den)
  }
}

/** One condition an observed atom is m-separated from, dropped by rule 1 (latest first). */
function pruneOnce(d: Deriver): boolean {
  const g = d.graph
  for (const a of atomsOf(d.expr)) {
    const latestFirst = [...a.given].sort((p, q) => (g.rank.get(q) as number) - (g.rank.get(p) as number))
    for (const b of latestFirst) {
      const next = term(a.vars, a.given.filter((v) => v !== b))
      const found = ruleTest(g, a, next)
      if (found === undefined || !passes(g, found.test)) continue
      d.moveTo(a, next)
      return true
    }
  }
  return false
}

/**
 * Two factors P(a | b, c) and P(c | b) of a product the algebra could join into P(a, c | b) once
 * either gains conditions it is m-separated from: those conditions added by rule 1.
 */
function widenOnce(d: Deriver): boolean {
  const g = d.graph
  const holds = (from: DoAtom, to: DoAtom): boolean => {
    if (keyOf(from) === keyOf(to)) return true
    const found = ruleTest(g, from, to)
    return found !== undefined && passes(g, found.test)
  }
  for (const factors of productsOf(d.expr)) {
    const atoms = factors.filter((f): f is DoAtom => f.kind === 'p')
    for (const a of atoms) {
      for (const c of atoms) {
        if (a === c || !c.vars.every((v) => a.given.includes(v))) continue
        const b = minus([...a.given, ...c.given], c.vars)
        if (b.some((v) => a.vars.includes(v))) continue
        const [wideA, wideC] = [term(a.vars, [...b, ...c.vars]), term(c.vars, b)]
        if (keyOf(wideA) === keyOf(a) && keyOf(wideC) === keyOf(c)) continue
        if (!holds(a, wideA) || !holds(c, wideC)) continue
        d.moveTo(a, wideA)
        d.moveTo(c, wideC)
        return true
      }
    }
  }
  return false
}

/**
 * The conditional independences tidy() uses, as rule-1 steps: an observed atom loses a condition it
 * is m-separated from, or two factors gain the conditions that let them join; then the algebra
 * simplifies; until neither applies.
 */
function pruneSteps(d: Deriver, algebra: Algebra): void {
  for (let round = 0; round < 64; round++) {
    if (!pruneOnce(d) && !widenOnce(d)) return
    d.calculus('simplify', d.expr, normalize(algebra, d.expr))
  }
}

/**
 * A derivation of P(y | do(x)) — or P(y | do(x), w) — from the observational distribution of an
 * ADMG, step by step, when identify() finds the effect identifiable; else identify()'s hedge.
 * Throws what identify() throws, and a DerivationError if the generator fails (a bug).
 */
export function derive(g: Admg, y: readonly string[], x: readonly string[], w: readonly string[] = []): DeriveResult {
  const result = identify(g, y, x, w)
  if (!result.identifiable) return result
  const graph = prepareGraph(g)
  const query = term(y, w, x)
  const d = new Deriver(graph, query)
  d.query(y, x, w)
  const plain = new Algebra(graph.rank)
  d.calculus('simplify', d.expr, normalize(plain, d.expr))
  if (keyOf(d.expr) !== keyOf(result.formula)) pruneSteps(d, plain)
  const formula = normalize(plain, d.expr)
  const names = new Set([...y, ...x, ...w])
  const options = { names: g.nodes, inScope: [...names] }
  return {
    identifiable: true,
    query,
    steps: d.steps,
    formula,
    matches: keyOf(formula) === keyOf(result.formula),
    text: probExprText(formula, options),
    latex: probExprLatex(formula, options),
  }
}
