import type { Expr, InterventionItem } from './expr.ts'
import type { Value } from './types.ts'
import { RESERVED_WORDS } from './values.ts'

/**
 * Compact authoring syntax for equations and causal formulas.
 *
 *   expr    := iff
 *   iff     := implies (('<->' | '↔' | 'iff') implies)*
 *   implies := or (('->' | '→' | 'implies') implies)?        right-associative
 *   or      := and (('or' | '|' | '||' | '∨') and)*
 *   and     := unary (('and' | '&' | '&&' | '∧') unary)*
 *   unary   := ('not' | '!' | '¬') unary
 *            | '[' X ('<-' | '←') value (',' X ('<-' | '←') value)* ']' unary   formulas only
 *            | cmp
 *   cmp     := atom (('=' | '==' | '!=' | '≠') atom)?
 *   atom    := IDENT | NUMBER | 'quoted string' | true | false | '(' expr ')'
 *            | 'if' expr 'then' expr 'else' expr
 *
 * `[X←x]` binds like negation: `[X←0] A=1 and B=1` is `([X←0] A=1) and B=1`.
 * A bare boolean variable `BS` in a formula means `BS=1`.
 */

export class ParseError extends Error {
  readonly source: string
  readonly position: number

  constructor(message: string, source: string, position: number) {
    super(`${message} at position ${position} in ${JSON.stringify(source)}`)
    this.name = 'ParseError'
    this.source = source
    this.position = position
  }
}

type TokenKind = 'ident' | 'number' | 'string' | 'symbol' | 'end'

interface Token {
  readonly kind: TokenKind
  readonly text: string
  readonly position: number
}

const SYMBOLS = [
  '<->',
  '&&',
  '||',
  '->',
  '<-',
  '==',
  '!=',
  '↔',
  '→',
  '←',
  '≠',
  '¬',
  '∧',
  '∨',
  '(',
  ')',
  '[',
  ']',
  ',',
  '=',
  '!',
  '&',
  '|',
]

const KEYWORDS = RESERVED_WORDS

function tokenize(source: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < source.length) {
    const ch = source[i]
    if (/\s/.test(ch)) {
      i += 1
      continue
    }
    const ident = /^[A-Za-z_][A-Za-z0-9_]*/.exec(source.slice(i))
    if (ident) {
      tokens.push({ kind: 'ident', text: ident[0], position: i })
      i += ident[0].length
      continue
    }
    const num = /^-?\d+(\.\d+)?/.exec(source.slice(i))
    if (num) {
      tokens.push({ kind: 'number', text: num[0], position: i })
      i += num[0].length
      continue
    }
    if (ch === "'" || ch === '"') {
      const end = source.indexOf(ch, i + 1)
      if (end < 0) throw new ParseError('unterminated string', source, i)
      tokens.push({ kind: 'string', text: source.slice(i + 1, end), position: i })
      i = end + 1
      continue
    }
    const symbol = SYMBOLS.find((s) => source.startsWith(s, i))
    if (symbol === undefined) throw new ParseError(`unexpected character ${JSON.stringify(ch)}`, source, i)
    tokens.push({ kind: 'symbol', text: symbol, position: i })
    i += symbol.length
  }
  tokens.push({ kind: 'end', text: '', position: source.length })
  return tokens
}

class Parser {
  private index = 0
  private readonly tokens: Token[]
  private readonly source: string
  private readonly allowDo: boolean

  constructor(source: string, allowDo: boolean) {
    this.source = source
    this.allowDo = allowDo
    this.tokens = tokenize(source)
  }

  parseAll(): Expr {
    const expr = this.parseIff()
    const next = this.peek()
    if (next.kind !== 'end') this.fail(`unexpected ${JSON.stringify(next.text)}`)
    return expr
  }

  private peek(): Token {
    return this.tokens[this.index]
  }

  private next(): Token {
    const token = this.tokens[this.index]
    this.index += 1
    return token
  }

  private fail(message: string): never {
    throw new ParseError(message, this.source, this.peek().position)
  }

  /** Consume the next token if it is one of `options` (symbol or keyword). */
  private accept(...options: string[]): boolean {
    const token = this.peek()
    if ((token.kind === 'symbol' || token.kind === 'ident') && options.includes(token.text)) {
      this.index += 1
      return true
    }
    return false
  }

  private expect(...options: string[]): void {
    if (!this.accept(...options)) this.fail(`expected ${options.join(' or ')}`)
  }

  private parseIff(): Expr {
    let left = this.parseImplies()
    while (this.accept('<->', '↔', 'iff')) {
      left = { op: 'iff', left, right: this.parseImplies() }
    }
    return left
  }

  private parseImplies(): Expr {
    const left = this.parseOr()
    if (this.accept('->', '→', 'implies')) {
      return { op: 'implies', left, right: this.parseImplies() }
    }
    return left
  }

  private parseOr(): Expr {
    const args = [this.parseAnd()]
    while (this.accept('or', '|', '||', '∨')) args.push(this.parseAnd())
    return args.length === 1 ? args[0] : { op: 'or', args }
  }

  private parseAnd(): Expr {
    const args = [this.parseUnary()]
    while (this.accept('and', '&', '&&', '∧')) args.push(this.parseUnary())
    return args.length === 1 ? args[0] : { op: 'and', args }
  }

  private parseUnary(): Expr {
    if (this.accept('not', '!', '¬')) return { op: 'not', arg: this.parseUnary() }
    if (this.peek().text === '[' && this.peek().kind === 'symbol') {
      if (!this.allowDo) this.fail('interventions [X←x] are only allowed in causal formulas')
      this.next()
      const interventions: InterventionItem[] = []
      do {
        const name = this.next()
        if (name.kind !== 'ident' || KEYWORDS.has(name.text)) {
          this.index -= 1
          this.fail('expected a variable name')
        }
        this.expect('<-', '←')
        interventions.push({ variable: name.text, value: this.parseLiteral() })
      } while (this.accept(','))
      this.expect(']')
      return { op: 'do', interventions, body: this.parseUnary() }
    }
    return this.parseCmp()
  }

  private parseCmp(): Expr {
    const left = this.parseAtom()
    if (this.accept('=', '==')) return { op: 'eq', left, right: this.parseAtom(), negated: false }
    if (this.accept('!=', '≠')) return { op: 'eq', left, right: this.parseAtom(), negated: true }
    return left
  }

  private parseLiteral(): Value {
    const token = this.next()
    if (token.kind === 'number') return Number(token.text)
    if (token.kind === 'string') return token.text
    if (token.kind === 'ident' && token.text === 'true') return true
    if (token.kind === 'ident' && token.text === 'false') return false
    this.index -= 1
    return this.fail('expected a value')
  }

  private parseAtom(): Expr {
    const token = this.peek()
    if (token.kind === 'symbol' && token.text === '(') {
      this.next()
      const inner = this.parseIff()
      this.expect(')')
      return inner
    }
    if (token.kind === 'ident' && token.text === 'if') {
      this.next()
      const cond = this.parseIff()
      this.expect('then')
      const then = this.parseIff()
      this.expect('else')
      return { op: 'if', cond, then, else: this.parseIff() }
    }
    if (token.kind === 'ident' && !KEYWORDS.has(token.text)) {
      this.next()
      return { op: 'var', name: token.text }
    }
    return { op: 'const', value: this.parseLiteral() }
  }
}

/** Parse a structural-equation right-hand side such as `BT and not SH`. */
export function parseExpr(source: string): Expr {
  return new Parser(source, false).parseAll()
}

/** Parse a Halpern–Pearl causal formula such as `[ST<-0, BH<-0] not BS=1`. */
export function parseFormula(source: string): Expr {
  return new Parser(source, true).parseAll()
}
