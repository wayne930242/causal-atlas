import { ModalError, modalProblem } from './errors.ts'
import type { Formula } from './formula.ts'
import { atomsOf, isTruthFunctional } from './formula.ts'
import { formulaText } from './print.ts'

/**
 * Pearl's minimal surgery on boolean structural equations: an intervention replaces the equations of
 * the atoms it sets with constants and keeps every other equation; atoms without an equation are
 * background and keep their value at the centre world. The equations must be acyclic, so the
 * submodel has exactly one solution. No probabilities, abduction or many-valued variables: those
 * belong to the causal engine.
 */

/** Atom → its truth-functional equation, e.g. war := press ∧ connected. */
export type Equations = Readonly<Record<string, Formula>>

/** An atom assignment: atom → value. */
export type AtomValues = Readonly<Record<string, boolean>>

function valueIn(f: Formula, values: AtomValues): boolean {
  switch (f.kind) {
    case 'atom':
      return values[f.id] === true
    case 'top':
      return true
    case 'bot':
      return false
    case 'not':
      return !valueIn(f.arg, values)
    case 'and':
      return valueIn(f.left, values) && valueIn(f.right, values)
    case 'or':
      return valueIn(f.left, values) || valueIn(f.right, values)
    case 'imp':
      return !valueIn(f.left, values) || valueIn(f.right, values)
    case 'iff':
      return valueIn(f.left, values) === valueIn(f.right, values)
    default:
      throw new ModalError(modalProblem('not-truth-functional', { formula: formulaText(f) }))
  }
}

/** The atoms in solving order: each after every atom its equation reads; throws `cyclic-equations` on a cycle. */
export function equationOrder(atoms: readonly string[], equations: Equations): string[] {
  for (const [atom, f] of Object.entries(equations)) {
    if (!atoms.includes(atom)) throw new ModalError(modalProblem('unknown-atom', { atom }))
    if (!isTruthFunctional(f)) throw new ModalError(modalProblem('not-truth-functional', { formula: formulaText(f) }))
    for (const a of atomsOf(f)) if (!atoms.includes(a)) throw new ModalError(modalProblem('unknown-atom', { atom: a }))
  }
  const order: string[] = []
  const state = new Map<string, 'open' | 'done'>()
  const visit = (atom: string, path: readonly string[]): void => {
    if (state.get(atom) === 'done') return
    if (state.get(atom) === 'open') {
      const cycle = [...path.slice(path.indexOf(atom)), atom]
      throw new ModalError(modalProblem('cyclic-equations', { cycle }))
    }
    state.set(atom, 'open')
    const f = equations[atom]
    if (f !== undefined) for (const a of atomsOf(f)) visit(a, [...path, atom])
    state.set(atom, 'done')
    order.push(atom)
  }
  for (const a of atoms) visit(a, [])
  return order
}

/**
 * The antecedent as an intervention, when it is a conjunction of atoms and negated atoms (`press`,
 * `press ∧ ¬connected`); otherwise undefined. A conjunction setting one atom both ways is undefined too.
 */
export function literalsOf(f: Formula): AtomValues | undefined {
  const out: Record<string, boolean> = {}
  const add = (g: Formula): boolean => {
    if (g.kind === 'and') return add(g.left) && add(g.right)
    const [atom, value] = g.kind === 'atom' ? [g.id, true] : g.kind === 'not' && g.arg.kind === 'atom' ? [g.arg.id, false] : [undefined, false]
    if (atom === undefined) return false
    if (out[atom] !== undefined && out[atom] !== value) return false
    out[atom] = value
    return true
  }
  return add(f) ? out : undefined
}

export interface SurgeryResult {
  /** Every atom's value in the submodel's solution. */
  readonly values: AtomValues
  /** The atoms the intervention set. */
  readonly set: readonly string[]
  /** Atoms with an equation that the intervention left in place, in solving order. */
  readonly solved: readonly string[]
}

/**
 * Solve the submodel: `intervention` fixes its atoms, every other atom with an equation follows it
 * in solving order, and every atom without one keeps its value in `background` (the centre world's
 * true atoms).
 */
export function surgery(atoms: readonly string[], equations: Equations, background: readonly string[], intervention: AtomValues): SurgeryResult {
  for (const a of Object.keys(intervention)) if (!atoms.includes(a)) throw new ModalError(modalProblem('unknown-atom', { atom: a }))
  const order = equationOrder(atoms, equations)
  const values: Record<string, boolean> = {}
  const solved: string[] = []
  for (const atom of order) {
    const set = intervention[atom]
    const f = equations[atom]
    if (set !== undefined) values[atom] = set
    else if (f !== undefined) {
      values[atom] = valueIn(f, values)
      solved.push(atom)
    } else values[atom] = background.includes(atom)
  }
  return { values, set: atoms.filter((a) => intervention[a] !== undefined), solved }
}

/** The world of `worlds` whose true atoms are exactly those `values` makes true, if any. */
export function worldWith(worlds: readonly { readonly id: string; readonly true: readonly string[] }[], atoms: readonly string[], values: AtomValues): string | undefined {
  return worlds.find((w) => atoms.every((a) => w.true.includes(a) === (values[a] === true)))?.id
}
