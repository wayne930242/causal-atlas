import type { RelationCheck } from '../../logic/relations.ts'
import { checkRelation } from '../../logic/relations.ts'
import { ModalError, modalProblem } from './errors.ts'
import type { Formula } from './formula.ts'
import { atomsOf, parseFormula } from './formula.ts'
import type { Frame } from './model.ts'
import { accessPairs } from './model.ts'

/**
 * Frame conditions and the axioms they correspond to (Garson, pp. 112–113): an axiom is valid on a
 * frame (true at every world under every assignment) exactly when the frame meets its condition.
 */

export type FrameCondition = 'serial' | 'reflexive' | 'transitive' | 'symmetric' | 'euclidean'

/** The axioms the first phase shows. Garson's M is the T of most texts. */
export type AxiomName = 'K' | 'D' | 'M' | '4' | 'B' | '5'

export interface AxiomInfo {
  readonly name: AxiomName
  /** The axiom in the authoring syntax. */
  readonly source: string
  readonly formula: Formula
  /** The frame condition it corresponds to; K has none: it is valid on every frame. */
  readonly condition: FrameCondition | undefined
}

const axiom = (name: AxiomName, source: string, condition: FrameCondition | undefined): AxiomInfo => ({ name, source, formula: parseFormula(source), condition })

export const AXIOMS: Readonly<Record<AxiomName, AxiomInfo>> = {
  K: axiom('K', '[](p -> q) -> ([]p -> []q)', undefined),
  D: axiom('D', '[]p -> <>p', 'serial'),
  M: axiom('M', '[]p -> p', 'reflexive'),
  '4': axiom('4', '[]p -> [][]p', 'transitive'),
  B: axiom('B', 'p -> []<>p', 'symmetric'),
  '5': axiom('5', '<>p -> []<>p', 'euclidean'),
}

/** The conditions in the order the components list them, with their axioms. */
export const CONDITION_AXIOM: Readonly<Record<FrameCondition, AxiomName>> = { serial: 'D', reflexive: 'M', transitive: '4', symmetric: 'B', euclidean: '5' }
export const FRAME_CONDITIONS: readonly FrameCondition[] = ['serial', 'reflexive', 'transitive', 'symmetric', 'euclidean']

/**
 * Whether the frame's R meets `condition`. A failure names the worlds that break it: serial and
 * reflexive one world w; symmetric (w, v) with wRv, not vRw; transitive (w, v, u) with wRv, vRu,
 * not wRu; euclidean (w, v, u) with wRv, wRu, not vRu.
 */
export function checkCondition(frame: Frame, condition: FrameCondition): RelationCheck {
  return checkRelation({ elements: frame.worlds, pairs: accessPairs(frame) }, condition)
}

/** Assignments `validOnFrame` enumerates at most: 2^16, e.g. two atoms on eight worlds. */
export const MAX_ASSIGNMENTS = 65_536

/** A failed axiom instance: the assignment (each atom with the worlds where it is true) and the world where the formula is false. */
export interface FrameCounterexample {
  readonly world: string
  readonly trueAt: Readonly<Record<string, readonly string[]>>
}

export type FrameValidity = { readonly valid: true } | { readonly valid: false; readonly counterexample: FrameCounterexample }

/** Truth sets as bit masks over the frame's worlds: fast enough to try every assignment. */
function compileFrame(frame: Frame): { readonly n: number; readonly all: number; readonly succ: readonly number[] } {
  const n = frame.worlds.length
  const index = new Map(frame.worlds.map((w, i) => [w, i]))
  const succ = frame.worlds.map((w) => (frame.access[w] ?? []).reduce((m, v) => m | (1 << (index.get(v) as number)), 0))
  return { n, all: n === 0 ? 0 : (2 ** n - 1) | 0, succ }
}

function maskOf(f: Formula, atoms: ReadonlyMap<string, number>, c: ReturnType<typeof compileFrame>): number {
  switch (f.kind) {
    case 'atom':
      return atoms.get(f.id) as number
    case 'top':
      return c.all
    case 'bot':
      return 0
    case 'not':
      return c.all & ~maskOf(f.arg, atoms, c)
    case 'and':
      return maskOf(f.left, atoms, c) & maskOf(f.right, atoms, c)
    case 'or':
      return maskOf(f.left, atoms, c) | maskOf(f.right, atoms, c)
    case 'imp':
      return (c.all & ~maskOf(f.left, atoms, c)) | maskOf(f.right, atoms, c)
    case 'iff':
      return c.all & ~(maskOf(f.left, atoms, c) ^ maskOf(f.right, atoms, c))
    case 'box': {
      const a = maskOf(f.arg, atoms, c)
      let out = 0
      for (let i = 0; i < c.n; i += 1) if (((c.succ[i] as number) & ~a) === 0) out |= 1 << i
      return out
    }
    case 'dia': {
      const a = maskOf(f.arg, atoms, c)
      let out = 0
      for (let i = 0; i < c.n; i += 1) if (((c.succ[i] as number) & a) !== 0) out |= 1 << i
      return out
    }
    case 'cf':
      return 0
  }
}

/**
 * Whether `formula` is valid on the frame: true at every world under every assignment of its atoms.
 * Tries all (2^|W|)^atoms assignments, at most {@link MAX_ASSIGNMENTS}; a failure returns the first
 * assignment and world that falsify it.
 */
export function validOnFrame(frame: Frame, formula: Formula): FrameValidity {
  if (JSON.stringify(formula).includes('"kind":"cf"')) throw new ModalError(modalProblem('no-sphere-system', { world: frame.worlds[0] as string }))
  const atoms = atomsOf(formula)
  const c = compileFrame(frame)
  const count = 2 ** (c.n * atoms.length)
  if (count > MAX_ASSIGNMENTS) throw new ModalError(modalProblem('too-many-assignments', { count, limit: MAX_ASSIGNMENTS }))
  const subsets = 2 ** c.n
  const masks = new Map<string, number>()
  for (let code = 0; code < count; code += 1) {
    let rest = code
    for (const a of atoms) {
      masks.set(a, rest % subsets)
      rest = Math.floor(rest / subsets)
    }
    const value = maskOf(formula, masks, c)
    if (value !== c.all) {
      const i = frame.worlds.findIndex((_, k) => (value & (1 << k)) === 0)
      const trueAt = Object.fromEntries(atoms.map((a) => [a, frame.worlds.filter((_, k) => ((masks.get(a) as number) & (1 << k)) !== 0)]))
      return { valid: false, counterexample: { world: frame.worlds[i] as string, trueAt } }
    }
  }
  return { valid: true }
}

/** The normal systems whose frame classes the first phase names. */
export type ModalSystem = 'K' | 'D' | 'M' | 'S4' | 'B' | 'S5'

/** Each system with the conditions that define its frames (Garson, pp. 112–113). */
export const SYSTEM_CONDITIONS: Readonly<Record<ModalSystem, readonly FrameCondition[]>> = {
  K: [],
  D: ['serial'],
  M: ['reflexive'],
  S4: ['reflexive', 'transitive'],
  B: ['reflexive', 'symmetric'],
  S5: ['reflexive', 'symmetric', 'transitive'],
}

export const SYSTEMS: readonly ModalSystem[] = ['K', 'D', 'M', 'S4', 'B', 'S5']

/** The systems whose frame class contains this frame: every theorem of each is valid on it. */
export function systemsOf(frame: Frame): ModalSystem[] {
  const met = new Set(FRAME_CONDITIONS.filter((c) => checkCondition(frame, c).holds))
  return SYSTEMS.filter((s) => SYSTEM_CONDITIONS[s].every((c) => met.has(c)))
}
