import type { BinaryKind, Formula, UnaryKind } from './formula.ts'

/**
 * Formulas written out for display: plain text and LaTeX, in one of the notation sets. Brackets are
 * the fewest that parse back to the same tree, except that a conditional inside a conditional keeps
 * them (□(p ⊃ q) ⊃ (□p ⊃ □q)). `ascii` writes the authoring syntax.
 */

/** `modern`: ¬ ∧ ∨ ⊃ ≡ □ ◇ > (the default); `garson`: Garson's ~ and &; `ascii`: the authoring syntax. */
export type ModalNotation = 'modern' | 'garson' | 'ascii'

type Op = UnaryKind | BinaryKind | 'top' | 'bot'

interface Symbols {
  readonly text: Readonly<Record<Op, string>>
  readonly latex: Readonly<Record<Op, string>>
}

const MODERN_TEXT: Readonly<Record<Op, string>> = { not: '¬', box: '□', dia: '◇', and: '∧', or: '∨', imp: '⊃', iff: '≡', cf: '>', top: '⊤', bot: '⊥' }
const MODERN_LATEX: Readonly<Record<Op, string>> = {
  not: '\\neg ',
  box: '\\Box ',
  dia: '\\Diamond ',
  and: '\\land',
  or: '\\lor',
  imp: '\\supset',
  iff: '\\equiv',
  cf: '>',
  top: '\\top',
  bot: '\\bot',
}

export const NOTATIONS: Readonly<Record<ModalNotation, Symbols>> = {
  modern: { text: MODERN_TEXT, latex: MODERN_LATEX },
  garson: {
    text: { ...MODERN_TEXT, not: '~', and: '&' },
    latex: { ...MODERN_LATEX, not: '{\\sim}', and: '\\mathbin{\\&}' },
  },
  ascii: {
    text: { not: '~', box: '[]', dia: '<>', and: '&', or: '|', imp: '->', iff: '<->', cf: '>', top: 'true', bot: 'false' },
    latex: MODERN_LATEX,
  },
}

/** Binding strength: higher binds tighter. */
const LEVEL: Readonly<Record<Formula['kind'], number>> = { atom: 5, top: 5, bot: 5, not: 5, box: 5, dia: 5, and: 4, or: 3, cf: 2, imp: 1, iff: 1 }

/** Whether `child` needs brackets as the `side` operand of a `parent` binary node. */
function bracket(parent: BinaryKind, child: Formula, side: 'left' | 'right'): boolean {
  const c = LEVEL[child.kind]
  const p = LEVEL[parent]
  if (c > p) {
    // Unbracketed `>` may not stand beside ⊃ or ≡.
    return child.kind === 'cf' && (parent === 'imp' || parent === 'iff')
  }
  if (c < p) return true
  // Same level: ∧ and ∨ chain to the left unbracketed; nested conditionals keep their brackets on either side, as textbooks write them.
  if (parent === 'and' || parent === 'or') return side === 'right'
  return true
}

function atomText(id: string): string {
  return id
}

/** `rain` → \mathit{rain}; `p_1` → p_{1}; `p` → p. */
function atomLatex(id: string): string {
  const [head = id, ...rest] = id.split('_')
  const base = head.length > 1 ? `\\mathit{${head}}` : head
  return rest.length === 0 ? base : `${base}_{${rest.join('\\_')}}`
}

function write(f: Formula, sym: Readonly<Record<Op, string>>, atom: (id: string) => string, open: string, close: string): string {
  const go = (g: Formula): string => {
    switch (g.kind) {
      case 'atom':
        return atom(g.id)
      case 'top':
      case 'bot':
        return sym[g.kind]
      case 'not':
      case 'box':
      case 'dia': {
        const inner = go(g.arg)
        return LEVEL[g.arg.kind] < 5 ? `${sym[g.kind]}${open}${inner}${close}` : `${sym[g.kind]}${inner}`
      }
      default: {
        const l = go(g.left)
        const r = go(g.right)
        const left = bracket(g.kind, g.left, 'left') ? `${open}${l}${close}` : l
        const right = bracket(g.kind, g.right, 'right') ? `${open}${r}${close}` : r
        return `${left} ${sym[g.kind]} ${right}`
      }
    }
  }
  return go(f)
}

/** The formula as plain text. */
export function formulaText(f: Formula, notation: ModalNotation = 'modern'): string {
  return write(f, NOTATIONS[notation].text, atomText, '(', ')')
}

/** The formula as LaTeX. */
export function formulaLatex(f: Formula, notation: ModalNotation = 'modern'): string {
  return write(f, NOTATIONS[notation].latex, atomLatex, '(', ')')
}

/** Both forms at once. */
export function printFormula(f: Formula, notation: ModalNotation = 'modern'): { readonly text: string; readonly latex: string } {
  return { text: formulaText(f, notation), latex: formulaLatex(f, notation) }
}

/** A canonical key: the ASCII text, equal for equal trees. */
export function formulaKey(f: Formula): string {
  return formulaText(f, 'ascii')
}

/** An operator's symbol in a notation, for legends and headings. */
export function operatorSymbol(op: Op, notation: ModalNotation = 'modern'): { readonly text: string; readonly latex: string } {
  return { text: NOTATIONS[notation].text[op], latex: NOTATIONS[notation].latex[op] }
}
