import type { ProbExpr } from './prob-expr.ts'
import { freeOf } from './prob-expr.ts'

/**
 * Text and LaTeX for probability expressions, in Pearl's lower-case convention: the value of X is
 * written x. A summed variable whose name is already in use (free in the expression, part of the
 * query, or bound outside) is primed: Σ_x' P(y|x',z) P(x').
 */

export interface RenderOptions {
  /** Every variable name that can occur, to keep the lower-case symbols distinct. */
  readonly names: readonly string[]
  /** Names to treat as in use at the top, e.g. the query's variables. */
  readonly inScope?: readonly string[]
}

type Format = 'text' | 'latex'

function baseSymbols(names: readonly string[]): (id: string) => string {
  const lower = new Set(names.map((n) => n.toLowerCase()))
  const distinct = lower.size === new Set(names).size
  return distinct ? (id) => id.toLowerCase() : (id) => id
}

function latexSymbol(symbol: string): string {
  const primes = /'*$/.exec(symbol)?.[0] ?? ''
  const bare = symbol.slice(0, symbol.length - primes.length)
  const cut = bare.indexOf('_')
  const head = cut < 0 ? bare : bare.slice(0, cut)
  const tail = cut < 0 ? '' : bare.slice(cut + 1).replaceAll('_', '\\_')
  const headTex = head.length > 1 ? `\\mathit{${head}}` : head
  return `${headTex}${tail === '' ? '' : `_{${tail}}`}${primes}`
}

function render(e: ProbExpr, format: Format, options: RenderOptions): string {
  const base = baseSymbols(options.names)
  const top = new Map<string, string>()
  for (const v of [...(options.inScope ?? []), ...freeOf(e)]) top.set(v, base(v))
  const sym = (scope: ReadonlyMap<string, string>, v: string): string => {
    const s = scope.get(v) ?? base(v)
    return format === 'latex' ? latexSymbol(s) : s
  }
  const go = (x: ProbExpr, scope: ReadonlyMap<string, string>): string => {
    switch (x.kind) {
      case 'p': {
        const vars = x.vars.map((v) => sym(scope, v))
        const given = x.given.map((v) => sym(scope, v))
        if (format === 'text') return `P(${vars.join(',')}${given.length > 0 ? `|${given.join(',')}` : ''})`
        return `P(${vars.join(', ')}${given.length > 0 ? ` \\mid ${given.join(', ')}` : ''})`
      }
      case 'sum': {
        const inner = new Map(scope)
        const used = new Set(scope.values())
        const bound = x.over.map((v) => {
          let s = base(v)
          while (used.has(s)) s += "'"
          used.add(s)
          inner.set(v, s)
          return format === 'latex' ? latexSymbol(s) : s
        })
        const body = go(x.body, inner)
        if (format === 'latex') return `\\sum_{${bound.join(', ')}} ${body}`
        return `Σ_${bound.length === 1 ? bound[0] : `{${bound.join(',')}}`} ${body}`
      }
      case 'product': {
        if (x.factors.length === 0) return '1'
        const parts = x.factors.map((f, i) => {
          const s = go(f, scope)
          const wrap = (f.kind === 'sum' && i < x.factors.length - 1) || f.kind === 'ratio'
          if (!wrap) return s
          return format === 'latex' ? `\\left(${s}\\right)` : `(${s})`
        })
        return parts.join(format === 'latex' ? '\\, ' : ' ')
      }
      case 'ratio': {
        const num = go(x.num, scope)
        const den = go(x.den, scope)
        if (format === 'latex') return `\\frac{${num}}{${den}}`
        const side = (part: ProbExpr, s: string): string => (part.kind === 'p' ? s : `[${s}]`)
        return `${side(x.num, num)} / ${side(x.den, den)}`
      }
    }
  }
  return go(e, top)
}

/** Plain text: `Σ_z P(y|x,z) P(z)`. */
export function probExprText(e: ProbExpr, options: RenderOptions): string {
  return render(e, 'text', options)
}

/** LaTeX: `\sum_{z} P(y \mid x, z)\, P(z)`. */
export function probExprLatex(e: ProbExpr, options: RenderOptions): string {
  return render(e, 'latex', options)
}
