/**
 * Every error the modal engine and its data layer raise has a stable code and its parameters, so an
 * interface can word it in its own language. `Error.message` is the English wording below.
 */

/** Parameters per problem code. */
export interface ModalProblemParams {
  // formula syntax; positions are 0-based character offsets into `source`
  readonly 'parse-unexpected-character': { readonly source: string; readonly position: number; readonly character: string }
  readonly 'parse-unexpected-token': { readonly source: string; readonly position: number; readonly token: string }
  readonly 'parse-unexpected-end': { readonly source: string; readonly position: number }
  readonly 'parse-expected': { readonly source: string; readonly position: number; readonly expected: string }
  /** `>` beside `⊃` or `≡`, or `≡` chained, without brackets. */
  readonly 'ambiguous-mix': { readonly source: string; readonly position: number; readonly operators: string }
  readonly 'reserved-atom': { readonly atom: string }
  // models
  readonly 'unknown-atom': { readonly atom: string }
  readonly 'unknown-world': { readonly world: string }
  readonly 'duplicate-world': { readonly world: string }
  readonly 'duplicate-atom': { readonly atom: string }
  readonly 'no-worlds': Record<string, never>
  readonly 'too-many-worlds': { readonly count: number; readonly limit: number }
  readonly 'missing-position': { readonly world: string }
  readonly 'no-sphere-system': { readonly world: string }
  /** Sphere `index` (1-based, innermost is 1) does not contain the sphere inside it. */
  readonly 'spheres-not-nested': { readonly world: string; readonly index: number }
  readonly 'empty-sphere': { readonly world: string; readonly index: number }
  /** Strong: the innermost sphere is not exactly {world}; weak: world is not in it. */
  readonly centering: { readonly world: string; readonly centering: 'strong' | 'weak' }
  readonly 'spheres-source': Record<string, never>
  // evaluation
  /** Stalnaker's selection is undefined: the closest antecedent worlds are several. */
  readonly 'not-unique': { readonly world: string; readonly candidates: readonly string[] }
  readonly 'too-many-assignments': { readonly count: number; readonly limit: number }
  // structural equations
  readonly 'cyclic-equations': { readonly cycle: readonly string[] }
  readonly 'not-truth-functional': { readonly formula: string }
  readonly 'surgery-antecedent': { readonly formula: string }
  // documents
  readonly 'not-json': { readonly detail: string }
  readonly 'too-large': Record<string, never>
  /** Any other schema complaint, already worded per locale. */
  readonly schema: { readonly message: { readonly 'zh-TW': string; readonly en: string } }
}

export type ModalProblemCode = keyof ModalProblemParams

/** One problem: its code, parameters and, when known, where it sits (a path into the document, e.g. `formulas.1`). */
export type ModalProblem = {
  readonly [K in ModalProblemCode]: { readonly code: K; readonly params: ModalProblemParams[K]; readonly where?: string }
}[ModalProblemCode]

export function modalProblem<K extends ModalProblemCode>(code: K, params: ModalProblemParams[K], where?: string): ModalProblem {
  return (where === undefined ? { code, params } : { code, params, where }) as ModalProblem
}

/** Wording per code; the interface supplies one per locale. */
export interface ModalProblemWording {
  readonly messages: { readonly [K in ModalProblemCode]: (params: ModalProblemParams[K]) => string }
  /** Joins a `where` path and the message. */
  readonly join: (where: string, message: string) => string
}

const at = (p: { readonly source: string; readonly position: number }): string => ` at position ${p.position + 1} of ${JSON.stringify(p.source)}`

export const MODAL_PROBLEMS_EN: ModalProblemWording = {
  join: (where, message) => `${where}: ${message}`,
  messages: {
    'parse-unexpected-character': (p) => `unexpected character ${p.character}${at(p)}`,
    'parse-unexpected-token': (p) => `unexpected ${p.token}${at(p)}`,
    'parse-unexpected-end': (p) => `the formula ends too early${at(p)}`,
    'parse-expected': (p) => `expected ${p.expected}${at(p)}`,
    'ambiguous-mix': (p) => `add brackets: ${p.operators} cannot stand side by side unbracketed${at(p)}`,
    'reserved-atom': (p) => `${p.atom} is a reserved word, not an atom`,
    'unknown-atom': (p) => `no atom ${p.atom}`,
    'unknown-world': (p) => `no world ${p.world}`,
    'duplicate-world': (p) => `world ${p.world} is listed twice`,
    'duplicate-atom': (p) => `atom ${p.atom} is listed twice`,
    'no-worlds': () => 'the model has no worlds',
    'too-many-worlds': (p) => `${p.count} worlds; the limit is ${p.limit}`,
    'missing-position': (p) => `world ${p.world} has no position, which the manual layout needs`,
    'no-sphere-system': (p) => `world ${p.world} has no system of spheres`,
    'spheres-not-nested': (p) => `sphere ${p.index} around ${p.world} does not contain the sphere inside it`,
    'empty-sphere': (p) => `sphere ${p.index} around ${p.world} is empty`,
    centering: (p) =>
      p.centering === 'strong' ? `the innermost sphere around ${p.world} must be exactly {${p.world}}` : `the innermost sphere around ${p.world} must contain ${p.world}`,
    'spheres-source': () => 'give exactly one of: center with spheres, center with similarity, or systems',
    'not-unique': (p) => `Stalnaker's selection is undefined at ${p.world}: the closest antecedent worlds are ${p.candidates.join(', ')}`,
    'too-many-assignments': (p) => `${p.count} assignments to enumerate; the limit is ${p.limit}`,
    'cyclic-equations': (p) => `the equations form a cycle: ${p.cycle.join(' → ')}`,
    'not-truth-functional': (p) => `${p.formula} must be truth-functional (no □, ◇ or >)`,
    'surgery-antecedent': (p) => `${p.formula} is not a conjunction of atoms and negated atoms, which surgery needs`,
    'not-json': (p) => `not JSON: ${p.detail}`,
    'too-large': () => 'the document is too large',
    schema: (p) => p.message.en,
  },
}

/** The problem worded by `wording` (English by default). */
export function modalProblemText(p: ModalProblem, wording: ModalProblemWording = MODAL_PROBLEMS_EN): string {
  const message = (wording.messages[p.code] as (params: unknown) => string)(p.params)
  return p.where === undefined ? message : wording.join(p.where, message)
}

/** An error carrying a {@link ModalProblem}; its message is the English wording. */
export class ModalError extends Error {
  readonly problem: ModalProblem

  constructor(p: ModalProblem) {
    super(modalProblemText(p))
    this.name = 'ModalError'
    this.problem = p
  }
}

/** The problem behind `error`, when it is one of ours. */
export function modalProblemOf(error: unknown): ModalProblem | undefined {
  return error instanceof ModalError ? error.problem : undefined
}
