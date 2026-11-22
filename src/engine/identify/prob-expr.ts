/**
 * Probability expressions over observed variables: P(A | B), Σ over variables, products and ratios.
 * Scoping is lexical: a variable inside Σ_v stands for the summed value, elsewhere for the value
 * the caller assigns. An empty product is 1.
 */

export interface ProbAtom {
  readonly kind: 'p'
  /** P(vars | given); both sorted by name, disjoint. */
  readonly vars: readonly string[]
  readonly given: readonly string[]
}

export interface ProbSum {
  readonly kind: 'sum'
  /** Bound variables, sorted by name. */
  readonly over: readonly string[]
  readonly body: ProbExpr
}

export interface ProbProduct {
  readonly kind: 'product'
  readonly factors: readonly ProbExpr[]
}

export interface ProbRatio {
  readonly kind: 'ratio'
  readonly num: ProbExpr
  readonly den: ProbExpr
}

export type ProbExpr = ProbAtom | ProbSum | ProbProduct | ProbRatio

export const ONE: ProbExpr = { kind: 'product', factors: [] }

/** Whether A ⊥ B | C holds in the observational distribution. */
export type Independence = (a: readonly string[], b: readonly string[], given: readonly string[]) => boolean

const byName = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)
const sorted = (ids: Iterable<string>): string[] => [...new Set(ids)].sort(byName)

const freeMemo = new WeakMap<ProbExpr, ReadonlySet<string>>()

/** The variables `e` leaves free (its value depends on them). */
export function freeOf(e: ProbExpr): ReadonlySet<string> {
  const hit = freeMemo.get(e)
  if (hit !== undefined) return hit
  let out: Set<string>
  switch (e.kind) {
    case 'p':
      out = new Set([...e.vars, ...e.given])
      break
    case 'sum': {
      out = new Set(freeOf(e.body))
      for (const v of e.over) out.delete(v)
      break
    }
    case 'product':
      out = new Set(e.factors.flatMap((f) => [...freeOf(f)]))
      break
    case 'ratio':
      out = new Set([...freeOf(e.num), ...freeOf(e.den)])
      break
  }
  freeMemo.set(e, out)
  return out
}

const keyMemo = new WeakMap<ProbExpr, string>()

/** A canonical text of `e`'s structure: equal keys mean the same expression. */
export function keyOf(e: ProbExpr): string {
  const hit = keyMemo.get(e)
  if (hit !== undefined) return hit
  let out: string
  switch (e.kind) {
    case 'p':
      out = `P(${e.vars.join(',')}|${e.given.join(',')})`
      break
    case 'sum':
      out = `S[${e.over.join(',')}]{${keyOf(e.body)}}`
      break
    case 'product':
      out = `*{${e.factors.map(keyOf).join(';')}}`
      break
    case 'ratio':
      out = `/{${keyOf(e.num)};${keyOf(e.den)}}`
      break
  }
  keyMemo.set(e, out)
  return out
}

const isOne = (e: ProbExpr): boolean => e.kind === 'product' && e.factors.length === 0
const sameSet = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((v) => b.includes(v))

/**
 * Builds expressions in a normal form with light simplifications that hold in every
 * distribution (whenever both sides are defined):
 * - Σ_a P(A|B) = P(A∖a | B) for a ∈ A, and Σ_a f·g = f·Σ_a g when f does not mention a;
 * - Σ_a (n / d) = (Σ_a n) / d when d does not mention a;
 * - P(A | B, C) · P(C | B) = P(A, C | B);
 * - P(A, C | B) / P(C | B) = P(A | B, C), and common factors of a ratio cancel;
 * and, in {@link Algebra.tidy}, conditional independences that hold in the distribution.
 * Factors are ordered for reading: atoms latest variable first, then ratios, then sums.
 */
export class Algebra {
  private readonly rank: ReadonlyMap<string, number>
  private readonly independent: Independence | undefined
  /** While tidying: atoms drop conditions the graph makes irrelevant, and merges may use them. */
  private pruning = false

  /** `independent`, when given, must hold in the observational distribution (e.g. m-separation in its graph). */
  constructor(rank: ReadonlyMap<string, number>, independent?: Independence) {
    this.rank = rank
    this.independent = independent
  }

  /**
   * `e` rebuilt with conditional independences: P(A | B) becomes P(A | B∖b) whenever A ⊥ b | B∖b,
   * which may let more factors merge and sums vanish.
   */
  tidy(e: ProbExpr): ProbExpr {
    if (this.independent === undefined) return e
    this.pruning = true
    try {
      let current = e
      for (let round = 0; round < 8; round++) {
        const next = this.rebuild(current)
        if (keyOf(next) === keyOf(current)) return next
        current = next
      }
      return current
    } finally {
      this.pruning = false
    }
  }

  private rebuild(e: ProbExpr): ProbExpr {
    switch (e.kind) {
      case 'p':
        return this.atom(e.vars, e.given)
      case 'sum':
        return this.sum(e.over, this.rebuild(e.body))
      case 'product':
        return this.product(e.factors.map((f) => this.rebuild(f)))
      case 'ratio':
        return this.ratio(this.rebuild(e.num), this.rebuild(e.den))
    }
  }

  private prune(vars: readonly string[], given: readonly string[]): string[] {
    const independent = this.independent
    if (!this.pruning || independent === undefined) return [...given]
    const kept = [...given]
    const latestFirst = [...given].sort((a, b) => this.rankOf(b) - this.rankOf(a) || byName(a, b))
    for (const b of latestFirst) {
      const rest = kept.filter((v) => v !== b)
      if (independent(vars, [b], rest)) kept.splice(kept.indexOf(b), 1)
    }
    return kept
  }

  /** Whether P(vars | given) equals P(vars | wider) (`given` ⊆ `wider`): trivially, or by independence while tidying. */
  private widens(vars: readonly string[], given: readonly string[], wider: readonly string[]): boolean {
    const extra = wider.filter((v) => !given.includes(v))
    if (extra.length === 0) return true
    return this.pruning && this.independent !== undefined && this.independent(vars, extra, given)
  }

  private rankOf(v: string): number {
    return this.rank.get(v) ?? -1
  }

  atom(vars: Iterable<string>, given: Iterable<string> = []): ProbExpr {
    const head = sorted(vars)
    if (head.length === 0) return ONE
    const cond = sorted(given).filter((v) => !head.includes(v))
    return { kind: 'p', vars: head, given: this.prune(head, cond) }
  }

  private compare = (a: ProbExpr, b: ProbExpr): number => {
    const cat = (e: ProbExpr): number => (e.kind === 'p' ? 0 : e.kind === 'ratio' ? 1 : 2)
    const top = (e: ProbExpr): number => Math.max(-1, ...(e.kind === 'p' ? e.vars : [...freeOf(e)]).map((v) => this.rankOf(v)))
    return cat(a) - cat(b) || top(b) - top(a) || byName(keyOf(a), keyOf(b))
  }

  product(factors: Iterable<ProbExpr>): ProbExpr {
    const flat: ProbExpr[] = []
    for (const f of factors) {
      if (f.kind === 'product') flat.push(...f.factors)
      else flat.push(f)
    }
    // P(A | B ∪ C) · P(C | B) → P(A ∪ C | B); while tidying, either factor may first gain conditions it is independent of.
    let merged = true
    while (merged) {
      merged = false
      outer: for (let i = 0; i < flat.length; i++) {
        const a = flat[i]
        if (a.kind !== 'p') continue
        for (let j = 0; j < flat.length; j++) {
          const c = flat[j]
          if (i === j || c.kind !== 'p') continue
          if (!c.vars.every((v) => a.given.includes(v))) continue
          const b = sorted([...a.given, ...c.given].filter((v) => !c.vars.includes(v)))
          if (b.some((v) => a.vars.includes(v))) continue
          if (!this.widens(a.vars, a.given, [...b, ...c.vars]) || !this.widens(c.vars, c.given, b)) continue
          const next = this.atom([...a.vars, ...c.vars], b)
          flat.splice(Math.max(i, j), 1)
          flat.splice(Math.min(i, j), 1, next)
          merged = true
          break outer
        }
      }
    }
    if (flat.length === 1) return flat[0]
    return { kind: 'product', factors: flat.sort(this.compare) }
  }

  sum(over: Iterable<string>, body: ProbExpr): ProbExpr {
    const bound = sorted(over)
    if (bound.length === 0) return body
    switch (body.kind) {
      case 'sum': {
        if (bound.some((v) => body.over.includes(v))) return { kind: 'sum', over: bound, body }
        return this.sum([...bound, ...body.over], body.body)
      }
      case 'p': {
        const reduced = this.atom(
          body.vars.filter((v) => !bound.includes(v)),
          body.given,
        )
        const rest = bound.filter((v) => !body.vars.includes(v))
        return rest.length === 0 ? reduced : { kind: 'sum', over: rest, body: reduced }
      }
      case 'ratio': {
        const den = freeOf(body.den)
        if (bound.some((v) => den.has(v))) return { kind: 'sum', over: bound, body }
        return this.ratio(this.sum(bound, body.num), body.den)
      }
      case 'product':
        return this.sumOfProduct(bound, body.factors)
    }
  }

  private sumOfProduct(bound: readonly string[], factors: readonly ProbExpr[]): ProbExpr {
    // Eliminate a variable that only one factor mentions, latest first, and start over.
    const latestFirst = [...bound].sort((a, b) => this.rankOf(b) - this.rankOf(a) || byName(a, b))
    for (const v of latestFirst) {
      const holders = factors.filter((f) => freeOf(f).has(v))
      if (holders.length !== 1) continue
      const reduced = this.sum([v], holders[0])
      if (reduced.kind === 'sum' && reduced.over.includes(v)) continue
      const next = factors.map((f) => (f === holders[0] ? reduced : f))
      return this.sum(
        bound.filter((u) => u !== v),
        this.product(next),
      )
    }
    // Split into factors free of the bound variables and groups linked by shared bound variables.
    const outside = factors.filter((f) => bound.every((v) => !freeOf(f).has(v)))
    const inside = factors.filter((f) => !outside.includes(f))
    const groups: { vars: Set<string>; factors: ProbExpr[] }[] = []
    for (const f of inside) {
      const vars = new Set(bound.filter((v) => freeOf(f).has(v)))
      const joined = groups.filter((g) => [...vars].some((v) => g.vars.has(v)))
      const group = { vars, factors: [f] }
      for (const g of joined) {
        for (const v of g.vars) group.vars.add(v)
        group.factors.push(...g.factors)
        groups.splice(groups.indexOf(g), 1)
      }
      groups.push(group)
    }
    const unused = bound.filter((v) => !groups.some((g) => g.vars.has(v)))
    const sums: ProbExpr[] = groups.map((g) => ({ kind: 'sum', over: sorted(g.vars), body: this.product(g.factors) }))
    if (unused.length > 0) sums.push({ kind: 'sum', over: unused, body: ONE })
    return this.product([...outside, ...sums])
  }

  ratio(num: ProbExpr, den: ProbExpr): ProbExpr {
    if (isOne(den)) return num
    if (keyOf(num) === keyOf(den)) return ONE
    if (num.kind === 'ratio') return this.ratio(num.num, this.product([num.den, den]))
    if (den.kind === 'ratio') return this.ratio(this.product([num, den.den]), den.num)
    const top = num.kind === 'product' ? [...num.factors] : [num]
    const bottom = den.kind === 'product' ? [...den.factors] : [den]
    for (let i = top.length - 1; i >= 0; i--) {
      const j = bottom.findIndex((d) => keyOf(d) === keyOf(top[i]))
      if (j >= 0) {
        top.splice(i, 1)
        bottom.splice(j, 1)
      }
    }
    // P(A ∪ C | B) / P(C | B) → P(A | B ∪ C)
    for (let i = 0; i < top.length; i++) {
      const a = top[i]
      if (a.kind !== 'p') continue
      const j = bottom.findIndex((c) => c.kind === 'p' && sameSet(c.given, a.given) && c.vars.every((v) => a.vars.includes(v)))
      if (j < 0) continue
      const c = bottom[j] as ProbAtom
      top[i] = this.atom(
        a.vars.filter((v) => !c.vars.includes(v)),
        [...a.given, ...c.vars],
      )
      bottom.splice(j, 1)
      i = -1
    }
    const n = this.product(top)
    const d = this.product(bottom)
    if (isOne(d)) return n
    if (keyOf(n) === keyOf(d)) return ONE
    return { kind: 'ratio', num: n, den: d }
  }
}
