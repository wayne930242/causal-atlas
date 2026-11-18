import type { LocalizedText } from './types.ts'

/**
 * Every error the engine and the data layer raise has a stable code and its parameters, so an
 * interface can word it in its own language. `Error.message` is the English wording below.
 */

/** Where in a model or document a problem sits; prefixed to the message. */
export type Where =
  | { readonly kind: 'equation'; readonly id: string }
  | { readonly kind: 'formula'; readonly text: string }
  | { readonly kind: 'operator'; readonly op: string }
  | { readonly kind: 'marginal'; readonly id: string }
  | { readonly kind: 'joint-prior' }
  | { readonly kind: 'table'; readonly id: string }
  | { readonly kind: 'utility' }
  /** A path into a JSON document, e.g. `layout.ZZ`; empty for the root. */
  | { readonly kind: 'path'; readonly path: string }

interface ParseAt {
  /** The text being parsed. */
  readonly source: string
  /** Character offset of the problem. */
  readonly position: number
}

/** Parameters per problem code. Values are pre-formatted text where the engine has a canonical form. */
export interface ProblemParams {
  // parsing
  readonly 'parse-unterminated-string': ParseAt
  readonly 'parse-unexpected-character': ParseAt & { readonly character: string }
  readonly 'parse-unexpected-token': ParseAt & { readonly token: string }
  readonly 'parse-expected': ParseAt & { readonly options: readonly string[] }
  readonly 'parse-intervention-not-allowed': ParseAt
  readonly 'parse-expected-variable': ParseAt
  readonly 'parse-expected-value': ParseAt
  // values and variables
  readonly 'not-boolean': { readonly value: string; readonly id?: string }
  readonly 'not-in-domain': { readonly id: string; readonly value: string; readonly values: string }
  readonly 'no-value': { readonly id: string }
  readonly 'unknown-variable': { readonly id: string }
  readonly 'reserved-name': { readonly id: string }
  readonly 'duplicate-variable': { readonly id: string }
  readonly 'empty-domain': { readonly id: string }
  // equations
  readonly 'equation-for-unknown': { readonly id: string }
  readonly 'equation-for-exogenous': { readonly id: string }
  readonly 'intervention-in-equation': Record<string, never>
  readonly 'missing-equation': { readonly id: string }
  readonly cyclic: { readonly cycle: readonly string[] }
  readonly 'lookup-row-length': { readonly got: number; readonly expected: number }
  readonly 'lookup-duplicate': { readonly key: string }
  readonly 'lookup-no-row': { readonly inputs: string; readonly values: string }
  readonly 'intervention-needs-model': Record<string, never>
  readonly 'context-missing': { readonly id: string }
  // probability
  readonly 'invalid-probability': { readonly p: number }
  readonly 'probabilities-sum': { readonly total: number }
  readonly 'too-many-contexts': { readonly count: number; readonly limit: number }
  readonly 'joint-row-missing': { readonly id: string }
  readonly 'joint-endogenous': { readonly id: string }
  readonly 'joint-duplicate': { readonly key: string }
  readonly 'marginal-missing': { readonly id: string }
  readonly 'marginal-duplicate': { readonly key: string }
  readonly 'marginal-endogenous': { readonly id: string }
  readonly 'zero-probability-evidence': Record<string, never>
  // actual causation
  readonly 'cause-not-conjunction': { readonly cause: string }
  readonly 'cause-repeats': { readonly id: string }
  readonly 'cause-not-endogenous': { readonly id: string }
  readonly 'cause-empty': Record<string, never>
  readonly 'search-budget': { readonly theory: string; readonly limit: number }
  readonly 'too-many-endogenous': { readonly limit: number }
  readonly 'effect-has-intervention': Record<string, never>
  readonly 'normality-missing': Record<string, never>
  // decisions and arithmetic
  readonly 'utility-row-length': Record<string, never>
  readonly 'utility-no-row': { readonly values: string }
  readonly 'prior-no-mass': Record<string, never>
  readonly 'arithmetic-intervention': Record<string, never>
  readonly 'arithmetic-non-number': { readonly value: string }
  readonly 'arithmetic-no-case': Record<string, never>
  // case files and model documents
  readonly 'row-empty': Record<string, never>
  readonly 'not-a-number': { readonly value: string }
  readonly 'table-row-length': { readonly id: string; readonly inputs: number }
  readonly 'bare-prior-not-boolean': { readonly id: string }
  readonly 'joint-row-length': Record<string, never>
  readonly 'case-missing': { readonly what: string }
  readonly 'no-such-act': { readonly act: string }
  readonly 'not-identifier': Record<string, never>
  readonly 'not-exogenous': { readonly id: string }
  readonly 'arc-needs-children': { readonly id: string }
  readonly 'arc-also-node': { readonly id: string }
  readonly 'needs-context-or-priors': Record<string, never>
  readonly 'too-large': Record<string, never>
  readonly 'not-json': { readonly detail: string }
  readonly 'share-version': { readonly version: string }
  readonly 'share-damaged': Record<string, never>
  readonly 'story-sentence-missing': { readonly locale: string }
  /** Any other schema complaint, already worded per locale. */
  readonly schema: { readonly message: LocalizedText }
}

export type ProblemCode = keyof ProblemParams

/** One problem: its code, parameters and, when known, where it sits. */
export type Problem = {
  readonly [K in ProblemCode]: { readonly code: K; readonly params: ProblemParams[K]; readonly where?: Where }
}[ProblemCode]

/** Build a problem with its parameters checked against the code. */
export function problem<K extends ProblemCode>(code: K, params: ProblemParams[K], where?: Where): Problem {
  return (where === undefined ? { code, params } : { code, params, where }) as Problem
}

/** Wording per code, and for the `where` prefix; the interface supplies one per locale. */
export interface ProblemWording {
  readonly messages: { readonly [K in ProblemCode]: (params: ProblemParams[K]) => string }
  readonly where: (where: Where) => string
  /** Joins a non-empty `where` text and the message. */
  readonly join: (where: string, message: string) => string
}

const list = (values: readonly string[]): string => values.join(' or ')
const at = (p: ParseAt): string => ` at position ${p.position} in ${JSON.stringify(p.source)}`

export const PROBLEMS_EN: ProblemWording = {
  messages: {
    'parse-unterminated-string': (p) => `unterminated string${at(p)}`,
    'parse-unexpected-character': (p) => `unexpected character ${JSON.stringify(p.character)}${at(p)}`,
    'parse-unexpected-token': (p) => `unexpected ${JSON.stringify(p.token)}${at(p)}`,
    'parse-expected': (p) => `expected ${list(p.options)}${at(p)}`,
    'parse-intervention-not-allowed': (p) => `interventions [X←x] are only allowed in causal formulas${at(p)}`,
    'parse-expected-variable': (p) => `expected a variable name${at(p)}`,
    'parse-expected-value': (p) => `expected a value${at(p)}`,
    'not-boolean': (p) => `${p.id === undefined ? '' : `variable ${p.id}: `}expected a boolean, got ${p.value}`,
    'not-in-domain': (p) => `variable ${p.id}: value ${p.value} is not in domain ${p.values}`,
    'no-value': (p) => `no value for variable ${p.id}`,
    'unknown-variable': (p) => `unknown variable ${p.id}`,
    'reserved-name': (p) => `${p.id} is a reserved name and cannot be a variable`,
    'duplicate-variable': (p) => `duplicate variable ${p.id}`,
    'empty-domain': (p) => `variable ${p.id} has an empty domain`,
    'equation-for-unknown': (p) => `equation for unknown variable ${p.id}`,
    'equation-for-exogenous': (p) => `exogenous variable ${p.id} cannot have an equation`,
    'intervention-in-equation': () => 'interventions are not allowed in equations',
    'missing-equation': (p) => `endogenous variable ${p.id} has no equation`,
    cyclic: (p) => `model is cyclic: ${p.cycle.join(' → ')}`,
    'lookup-row-length': (p) => `lookup row has ${p.got} inputs, expected ${p.expected}`,
    'lookup-duplicate': (p) => `lookup lists inputs (${p.key}) twice`,
    'lookup-no-row': (p) => `lookup on (${p.inputs}) has no row for (${p.values})`,
    'intervention-needs-model': () => '[X←x] formulas can only be evaluated against a model and context',
    'context-missing': (p) => `context has no value for exogenous variable ${p.id}`,
    'invalid-probability': (p) => `invalid probability ${p.p}`,
    'probabilities-sum': (p) => `probabilities sum to ${p.total}, not 1`,
    'too-many-contexts': (p) =>
      `too many contexts to enumerate: ${p.count.toLocaleString('en-US')} (limit ${p.limit.toLocaleString('en-US')}); use fewer exogenous variables or smaller supports`,
    'joint-row-missing': (p) => `joint prior row has no value for ${p.id}`,
    'joint-endogenous': (p) => `joint prior assigns endogenous ${p.id}`,
    'joint-duplicate': (p) => `joint prior lists context ${p.key} twice`,
    'marginal-missing': (p) => `prior has no marginal for exogenous ${p.id}`,
    'marginal-duplicate': (p) => `lists ${p.key} twice`,
    'marginal-endogenous': (p) => `prior has a marginal for endogenous ${p.id}`,
    'zero-probability-evidence': () => 'the evidence has probability 0',
    'cause-not-conjunction': (p) => `cause ${JSON.stringify(p.cause)} must be a conjunction of events X=x`,
    'cause-repeats': (p) => `cause mentions ${p.id} twice`,
    'cause-not-endogenous': (p) => `cause variable ${p.id} must be endogenous`,
    'cause-empty': () => 'cause is empty',
    'search-budget': (p) =>
      `${p.theory} search needs more than ${p.limit.toLocaleString('en-US')} evaluations; the model has too many endogenous variables for this theory`,
    'too-many-endogenous': (p) => `actual causation search is limited to ${p.limit} endogenous variables`,
    'effect-has-intervention': () => 'the effect must not contain interventions',
    'normality-missing': () => 'hp-normality needs default (normal) values',
    'utility-row-length': () => 'utility row has the wrong number of values',
    'utility-no-row': (p) => `utility table has no row for ${p.values}`,
    'prior-no-mass': () => 'prior has no mass',
    'arithmetic-intervention': () => '[X←x] has no arithmetic form',
    'arithmetic-non-number': (p) => `arithmetic on non-number ${p.value}`,
    'arithmetic-no-case': () => 'no case applies',
    'row-empty': () => 'empty row',
    'not-a-number': (p) => `expected a number, got ${p.value}`,
    'table-row-length': (p) => `table for ${p.id}: each row needs ${p.inputs} inputs and an output`,
    'bare-prior-not-boolean': (p) => `prior for ${p.id}: a bare number is only allowed for boolean variables`,
    'joint-row-length': () => 'joint prior row has the wrong length',
    'case-missing': (p) => `case has no ${p.what}`,
    'no-such-act': (p) => `no act ${p.act}`,
    'not-identifier': () => 'must be an identifier',
    'not-exogenous': (p) => `${p.id} is not exogenous`,
    'arc-needs-children': (p) => `${p.id} is drawn as an arc between its children, so it needs at least two`,
    'arc-also-node': (p) => `${p.id} cannot be drawn as an arc and as a node (show_exogenous or layout)`,
    'needs-context-or-priors': () => 'needs a context or priors',
    'too-large': () => 'the data is too large',
    'not-json': (p) => `not JSON: ${p.detail}`,
    'share-version': (p) => `share link version ${p.version === '' ? '(none)' : p.version} is not supported`,
    'share-damaged': () => 'the share link is damaged',
    'story-sentence-missing': (p) => `sentence not found in story.${p.locale}`,
    schema: (p) => p.message.en,
  },
  where: (w) => {
    switch (w.kind) {
      case 'equation':
        return `equation for ${w.id}`
      case 'formula':
        return w.text === '' ? 'formula' : `formula ${w.text}`
      case 'operator':
        return w.op
      case 'marginal':
        return `marginal of ${w.id}`
      case 'joint-prior':
        return 'joint prior'
      case 'table':
        return `table for ${w.id}`
      case 'utility':
        return 'utility'
      case 'path':
        return w.path === '' ? '(root)' : w.path
    }
  },
  join: (where, message) => `${where}: ${message}`,
}

/** The problem worded by `wording` (English by default). */
export function problemText(p: Problem, wording: ProblemWording = PROBLEMS_EN): string {
  const message = (wording.messages[p.code] as (params: unknown) => string)(p.params)
  return p.where === undefined ? message : wording.join(wording.where(p.where), message)
}

/** An error carrying a {@link Problem}; its message is the English wording. */
export class CausalAtlasError extends Error {
  readonly problem: Problem

  constructor(p: Problem) {
    super(problemText(p))
    this.name = 'CausalAtlasError'
    this.problem = p
  }
}

/** The problem behind `error`, when it is one of ours. */
export function problemOf(error: unknown): Problem | undefined {
  return error instanceof CausalAtlasError ? error.problem : undefined
}
