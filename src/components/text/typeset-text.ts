import { renderIdent } from '../../engine/index.ts'

/**
 * Plain text that names variables, to LaTeX. `textToLatex` is for a string that is wholly a formula
 * (`do(A=0)`, `P(C=1 | S=1)`); `splitProse` finds the formula fragments in a sentence. Pure, so the
 * same code serves the server and the browser.
 */

/** Words that name an operation when a `(` follows. */
const FUNCTIONS = new Set(['do', 'P', 'max', 'abs'])

/** True when `id` is a valid variable name. */
export const isIdent = (id: string): boolean => /^[A-Za-z][A-Za-z0-9_]*$/.test(id)

/** Known variable ids; a `Map` keyed by id (a model's `byId`) fits too. */
export interface KnownIds {
  has(id: string): boolean
}

export interface Segment {
  /** True when `text` is a formula fragment to typeset; false for prose. */
  readonly formula: boolean
  readonly text: string
}

const SYMBOLS: Readonly<Record<string, string>> = {
  '←': '\\leftarrow ',
  '→': '\\rightarrow ',
  '↔': '\\leftrightarrow ',
  '⇒': '\\Rightarrow ',
  '∧': '\\land ',
  '∨': '\\lor ',
  '¬': '\\lnot ',
  '≠': '\\neq ',
  '⊨': '\\models ',
  '·': '\\cdot ',
  '*': '\\ast ',
  '−': '-',
  '′': "'",
  '|': '\\mid ',
  ',': ',\\ ',
  '{': '\\{',
  '}': '\\}',
  '%': '\\%',
  '#': '\\#',
  '&': '\\&',
  $: '\\$',
  _: '\\_',
  '^': '\\^{}',
  '~': '\\~{}',
  '\\': '\\backslash ',
  Σ: '\\Sigma ',
  φ: '\\varphi ',
}

const FUNCTION_LATEX: Readonly<Record<string, string>> = { do: '\\operatorname{do}', P: 'P', max: '\\max ', abs: '\\operatorname{abs}' }

const WORD = /[A-Za-z][A-Za-z0-9_]*/y
const NUMBER = /\d+(?:\.\d+)?/y

function wordAt(text: string, at: number): string | undefined {
  WORD.lastIndex = at
  return WORD.exec(text)?.[0]
}

const isWordChar = (ch: string | undefined): boolean => ch !== undefined && /[A-Za-z0-9_]/.test(ch)

/** The LaTeX for a string that is entirely a formula: ids as in the equations, operators spaced by KaTeX. */
export function textToLatex(text: string, ids?: KnownIds): string {
  let out = ''
  let relation: string | undefined
  let i = 0
  while (i < text.length) {
    const ch = text[i]
    if (ch === ' ' || ch === '\u00a0') {
      i += 1
      continue
    }
    const previousRelation = relation
    relation = undefined
    if (ch === "'" || ch === '"') {
      const close = text.indexOf(ch, i + 1)
      const end = close < 0 ? text.length : close
      out += `\\text{${text.slice(i + 1, end).replace(/[\\{}%#&$^~_]/g, (c) => `\\${c}`)}}`
      i = close < 0 ? text.length : close + 1
      continue
    }
    NUMBER.lastIndex = i
    const num = NUMBER.exec(text)
    if (num !== null) {
      out += num[0]
      i += num[0].length
      continue
    }
    const word = wordAt(text, i)
    if (word !== undefined) {
      i += word.length
      if (word === 'P' && text.startsWith('*(', i)) {
        out += 'P^{*}'
        i += 1
      } else if (text[i] === '(' && FUNCTIONS.has(word)) out += FUNCTION_LATEX[word]
      else if (previousRelation !== undefined && !(previousRelation === '←' && ids?.has(word)) && /^[A-Za-z0-9.]+$/.test(word)) out += `\\text{${word}}`
      else if (word === 'and') out += '\\land '
      else if (word === 'or') out += '\\lor '
      else if (word === 'not') out += '\\lnot '
      else out += renderIdent(word, 'latex')
      continue
    }
    if (RELATIONS.has(ch)) relation = ch
    const mapped = SYMBOLS[ch]
    if (mapped !== undefined) out += mapped
    else if (/[\x20-\x7e]/.test(ch)) out += ch
    else out += `\\text{${ch}}`
    i += 1
  }
  return out
}

const RELATIONS = new Set(['=', '≠', '←'])
const OPERATORS = new Set(['=', '≠', '←', '·', '∧', '∨', '⇒', '→', '↔', '+', '−', '*'])
const INSIDE_ONLY = new Set([',', '|'])

interface Scan {
  readonly text: string
  readonly ids: KnownIds
  /** Variable ids met so far in this run. */
  found: number
}

const skipSpaces = (s: string, at: number): number => {
  let i = at
  while (s[i] === ' ' || s[i] === '\u00a0') i += 1
  return i
}

/** Index after a `(...)` or `[...]` group starting at `open`, or -1. */
function group(scan: Scan, open: number, close: string): number {
  const end = expression(scan, open + 1, true)
  return end >= 0 && scan.text[end] === close ? end + 1 : -1
}

/** Index after one operand starting at `at`, or -1. */
function operand(scan: Scan, at: number, afterRelation: boolean): number {
  const { text } = scan
  let i = at
  while (text[i] === '¬' || text[i] === '−') i += 1
  const ch = text[i]
  if (ch === undefined) return -1
  if (ch === '(') return group(scan, i, ')')
  if (ch === '{') return group(scan, i, '}')
  if (ch === '[') {
    const end = group(scan, i, ']')
    // [X←x](Y=y): the bracket qualifies the group that follows it.
    return end >= 0 && text[end] === '(' ? group(scan, end, ')') : end
  }
  if (ch === "'" || ch === '"') {
    const close = text.indexOf(ch, i + 1)
    return close < 0 ? -1 : close + 1
  }
  NUMBER.lastIndex = i
  const num = NUMBER.exec(text)
  if (num !== null) return i + num[0].length
  const word = wordAt(text, i)
  if (word === undefined) return -1
  const end = i + word.length
  if (word === 'P' && text.startsWith('*(', end)) return group(scan, end + 1, ')')
  if (word === 'do' && text.startsWith('()', end)) {
    scan.found += 1
    return end + 2
  }
  if (text[end] === '(' && (FUNCTIONS.has(word) || scan.ids.has(word))) {
    const next = group(scan, end, ')')
    if (next >= 0) {
      if (scan.ids.has(word)) scan.found += 1
      return next
    }
  }
  if (scan.ids.has(word)) {
    scan.found += 1
    return end
  }
  if (afterRelation && /^[A-Za-z0-9.]+$/.test(word)) return end
  return -1
}

/** Index after `operand (op operand)*` starting at `at`, or -1; `,` and `|` join operands only inside a group. */
function expression(scan: Scan, at: number, inside: boolean): number {
  let end = operand(scan, skipSpaces(scan.text, at), false)
  if (end < 0) return -1
  for (;;) {
    const k = skipSpaces(scan.text, end)
    const op = scan.text[k]
    if (op === undefined || !(OPERATORS.has(op) || (inside && INSIDE_ONLY.has(op)))) return end
    const next = operand(scan, skipSpaces(scan.text, k + 1), RELATIONS.has(op))
    if (next < 0) return end
    end = next
  }
}

const SENTENCE_END = /[.?!。！？\n]/

/** True when `at` starts the text or a sentence (only spaces and quotes before it). */
function sentenceStart(text: string, at: number): boolean {
  let i = at - 1
  while (i >= 0 && (text[i] === ' ' || text[i] === '"' || text[i] === '“' || text[i] === '「')) i -= 1
  return i < 0 || SENTENCE_END.test(text[i])
}

/**
 * The text cut into prose and formula fragments. A fragment starts at a known variable id (or a
 * `do(`/`P(` call) and runs through operators, so `A=0`, `do(A=0)`, `P(C=1 | S=1)`, `D=1 ⇒ U=1` and
 * `FF = max(L, MD)` each come out whole, while `L=1 and MD=1` comes out as two. `narrative` reads a
 * capital A that begins a sentence as the English article, not the variable.
 */
export function splitProse(text: string, ids: KnownIds, narrative = false): Segment[] {
  const out: Segment[] = []
  let plain = 0
  let i = 0
  const emitPlain = (to: number): void => {
    if (to > plain) out.push({ formula: false, text: text.slice(plain, to) })
  }
  while (i < text.length) {
    const ch = text[i]
    const word = /[A-Za-z]/.test(ch) && !isWordChar(text[i - 1]) ? wordAt(text, i) : undefined
    const startsAtWord = word !== undefined && (
      ids.has(word) || (FUNCTIONS.has(word) && text[i + word.length] === '(') || (word === 'P' && text.startsWith('*(', i + 1))
    )
    const startsAtNot = ch === '¬' && /[A-Za-z]/.test(text[i + 1] ?? '')
    if (!startsAtWord && !startsAtNot && ch !== '{' && ch !== '[') {
      // A word that is not an id is passed whole, so no id is taken from inside it.
      i += word?.length ?? 1
      continue
    }
    const scan: Scan = { text, ids, found: 0 }
    const end = expression(scan, i, false)
    const article =
      narrative &&
      (word === 'A' || word === 'I') &&
      sentenceStart(text, i) &&
      !(end > i + 1 && RELATIONS.has(text[skipSpaces(text, i + 1)] ?? ''))
    if (end > i && scan.found > 0 && !article) {
      emitPlain(i)
      out.push({ formula: true, text: text.slice(i, end) })
      plain = end
      i = end
    } else {
      i += word?.length ?? 1
    }
  }
  emitPlain(text.length)
  return out
}
