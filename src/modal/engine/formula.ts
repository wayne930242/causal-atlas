import { ModalError, modalProblem } from './errors.ts'

/**
 * Propositional modal formulas: their syntax tree and the parser for the authoring syntax, which takes
 * ASCII and Unicode alike (`~p`, `¬p`; `p & q`, `p ∧ q`; `p | q`, `p ∨ q`; `p -> q`, `p ⊃ q`;
 * `p <-> q`, `p ≡ q`; `[]p`, `□p`; `<>p`, `◇p`; `p > q`, `p □→ q`; `true`, `⊤`; `false`, `⊥`).
 *
 * Binding, tightest first: the unary operators (¬ □ ◇), then ∧, ∨, the counterfactual >, and last ⊃
 * and ≡. ∧ and ∨ group to the left, ⊃ and > to the right. `>` beside `⊃` or `≡`, and `≡` beside `⊃`
 * or another `≡`, need brackets: the parser reports `ambiguous-mix` rather than guess.
 */

export type BinaryKind = 'and' | 'or' | 'imp' | 'iff' | 'cf'
export type UnaryKind = 'not' | 'box' | 'dia'

export type Formula =
  | { readonly kind: 'atom'; readonly id: string }
  | { readonly kind: 'top' }
  | { readonly kind: 'bot' }
  | { readonly kind: UnaryKind; readonly arg: Formula }
  | { readonly kind: BinaryKind; readonly left: Formula; readonly right: Formula }

/** An atom: a lowercase letter, then letters, digits or underscores. */
export const ATOM_PATTERN = /^[a-z][A-Za-z0-9_]*$/

const RESERVED = new Set(['true', 'false'])

type TokenKind = 'atom' | 'top' | 'bot' | UnaryKind | BinaryKind | '(' | ')'

interface Token {
  readonly kind: TokenKind
  readonly text: string
  readonly position: number
}

/** Symbols longest first, so `<->` wins over `<>` and `□→` over `□`. */
const SYMBOLS: readonly (readonly [string, TokenKind])[] = [
  ['<->', 'iff'],
  ['->', 'imp'],
  ['<>', 'dia'],
  ['[]', 'box'],
  ['□→', 'cf'],
  ['~', 'not'],
  ['¬', 'not'],
  ['&', 'and'],
  ['∧', 'and'],
  ['|', 'or'],
  ['∨', 'or'],
  ['⊃', 'imp'],
  ['→', 'imp'],
  ['≡', 'iff'],
  ['↔', 'iff'],
  ['□', 'box'],
  ['◻', 'box'],
  ['◇', 'dia'],
  ['◊', 'dia'],
  ['>', 'cf'],
  ['⊤', 'top'],
  ['⊥', 'bot'],
  ['(', '('],
  [')', ')'],
]

function tokenize(source: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  outer: while (i < source.length) {
    const ch = source[i] as string
    if (/\s/.test(ch)) {
      i += 1
      continue
    }
    const word = /^[A-Za-z_][A-Za-z0-9_]*/.exec(source.slice(i))
    if (word !== null) {
      const text = word[0]
      if (text === 'true') tokens.push({ kind: 'top', text, position: i })
      else if (text === 'false') tokens.push({ kind: 'bot', text, position: i })
      else if (ATOM_PATTERN.test(text)) tokens.push({ kind: 'atom', text, position: i })
      else throw new ModalError(modalProblem('parse-unexpected-character', { source, position: i, character: text[0] as string }))
      i += text.length
      continue
    }
    for (const [symbol, kind] of SYMBOLS) {
      if (source.startsWith(symbol, i)) {
        tokens.push({ kind, text: symbol, position: i })
        i += symbol.length
        continue outer
      }
    }
    const cp = String.fromCodePoint(source.codePointAt(i) as number)
    throw new ModalError(modalProblem('parse-unexpected-character', { source, position: i, character: cp }))
  }
  return tokens
}

/** The text of each operator kind in the ambiguity message. */
const OP_TEXT: Readonly<Record<BinaryKind, string>> = { and: '∧', or: '∨', imp: '⊃', iff: '≡', cf: '>' }

class Parser {
  private i = 0
  /** Nodes written inside brackets: they may stand beside any operator. */
  private readonly bracketed = new WeakSet<Formula>()
  private readonly source: string
  private readonly tokens: readonly Token[]

  constructor(source: string, tokens: readonly Token[]) {
    this.source = source
    this.tokens = tokens
  }

  parse(): Formula {
    if (this.tokens.length === 0) throw new ModalError(modalProblem('parse-unexpected-end', { source: this.source, position: 0 }))
    const f = this.implication()
    const extra = this.tokens[this.i]
    if (extra !== undefined) {
      throw new ModalError(modalProblem('parse-unexpected-token', { source: this.source, position: extra.position, token: extra.text }))
    }
    return f
  }

  private peek(): Token | undefined {
    return this.tokens[this.i]
  }

  private end(): number {
    return this.source.length
  }

  /** A bare (unbracketed) binary node of one of `kinds`. */
  private bare(f: Formula, kinds: readonly BinaryKind[]): boolean {
    return (kinds as readonly string[]).includes(f.kind) && !this.bracketed.has(f)
  }

  private ambiguous(position: number, a: BinaryKind, b: BinaryKind): never {
    throw new ModalError(modalProblem('ambiguous-mix', { source: this.source, position, operators: `${OP_TEXT[a]} ${OP_TEXT[b]}` }))
  }

  /** ⊃ (right-grouping) and ≡ (no grouping): the loosest level. */
  private implication(): Formula {
    const left = this.counterfactual()
    const op = this.peek()
    if (op === undefined || (op.kind !== 'imp' && op.kind !== 'iff')) return left
    this.i += 1
    if (this.bare(left, ['cf'])) this.ambiguous(op.position, 'cf', op.kind)
    const right = op.kind === 'imp' ? this.implication() : this.counterfactual()
    if (this.bare(right, ['cf'])) this.ambiguous(op.position, op.kind, 'cf')
    if (op.kind === 'imp' && this.bare(right, ['iff'])) this.ambiguous(op.position, 'imp', 'iff')
    const next = this.peek()
    if (op.kind === 'iff' && next !== undefined && (next.kind === 'iff' || next.kind === 'imp')) this.ambiguous(next.position, 'iff', next.kind)
    return { kind: op.kind, left, right }
  }

  /** > (right-grouping). */
  private counterfactual(): Formula {
    const left = this.disjunction()
    const op = this.peek()
    if (op === undefined || op.kind !== 'cf') return left
    this.i += 1
    const right = this.counterfactual()
    return { kind: 'cf', left, right }
  }

  private disjunction(): Formula {
    let f = this.conjunction()
    while (this.peek()?.kind === 'or') {
      this.i += 1
      f = { kind: 'or', left: f, right: this.conjunction() }
    }
    return f
  }

  private conjunction(): Formula {
    let f = this.unary()
    while (this.peek()?.kind === 'and') {
      this.i += 1
      f = { kind: 'and', left: f, right: this.unary() }
    }
    return f
  }

  private unary(): Formula {
    const t = this.peek()
    if (t !== undefined && (t.kind === 'not' || t.kind === 'box' || t.kind === 'dia')) {
      this.i += 1
      return { kind: t.kind, arg: this.unary() }
    }
    return this.primary()
  }

  private primary(): Formula {
    const t = this.peek()
    if (t === undefined) throw new ModalError(modalProblem('parse-unexpected-end', { source: this.source, position: this.end() }))
    this.i += 1
    switch (t.kind) {
      case 'atom':
        return { kind: 'atom', id: t.text }
      case 'top':
        return { kind: 'top' }
      case 'bot':
        return { kind: 'bot' }
      case '(': {
        const inner = this.implication()
        const close = this.peek()
        if (close === undefined) throw new ModalError(modalProblem('parse-expected', { source: this.source, position: this.end(), expected: ')' }))
        if (close.kind !== ')') throw new ModalError(modalProblem('parse-expected', { source: this.source, position: close.position, expected: ')' }))
        this.i += 1
        this.bracketed.add(inner)
        return inner
      }
      default:
        throw new ModalError(modalProblem('parse-unexpected-token', { source: this.source, position: t.position, token: t.text }))
    }
  }
}

/** Parse a formula; throws {@link ModalError} with the position of the first problem. */
export function parseFormula(source: string): Formula {
  return new Parser(source, tokenize(source)).parse()
}

/** Whether `id` can name an atom. */
export function isAtomId(id: string): boolean {
  return ATOM_PATTERN.test(id) && !RESERVED.has(id)
}

/** The atoms of `f`, in order of first appearance. */
export function atomsOf(f: Formula): string[] {
  const out: string[] = []
  const walk = (g: Formula): void => {
    switch (g.kind) {
      case 'atom':
        if (!out.includes(g.id)) out.push(g.id)
        return
      case 'top':
      case 'bot':
        return
      case 'not':
      case 'box':
      case 'dia':
        walk(g.arg)
        return
      default:
        walk(g.left)
        walk(g.right)
    }
  }
  walk(f)
  return out
}

/** Whether `f` uses no □, ◇ or >. */
export function isTruthFunctional(f: Formula): boolean {
  switch (f.kind) {
    case 'atom':
    case 'top':
    case 'bot':
      return true
    case 'box':
    case 'dia':
    case 'cf':
      return false
    case 'not':
      return isTruthFunctional(f.arg)
    default:
      return isTruthFunctional(f.left) && isTruthFunctional(f.right)
  }
}

/** Formulas built in code, for the axiom schemas and inference patterns. */
export const F = {
  atom: (id: string): Formula => ({ kind: 'atom', id }),
  not: (arg: Formula): Formula => ({ kind: 'not', arg }),
  box: (arg: Formula): Formula => ({ kind: 'box', arg }),
  dia: (arg: Formula): Formula => ({ kind: 'dia', arg }),
  and: (left: Formula, right: Formula): Formula => ({ kind: 'and', left, right }),
  or: (left: Formula, right: Formula): Formula => ({ kind: 'or', left, right }),
  imp: (left: Formula, right: Formula): Formula => ({ kind: 'imp', left, right }),
  cf: (left: Formula, right: Formula): Formula => ({ kind: 'cf', left, right }),
  /** Strict implication: □(a ⊃ b). */
  strict: (left: Formula, right: Formula): Formula => ({ kind: 'box', arg: { kind: 'imp', left, right } }),
}
