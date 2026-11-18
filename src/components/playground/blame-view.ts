import type { LoadedCase } from '../../data/load.ts'
import { priorOf } from '../../data/load.ts'
import type { ModelDoc } from '../../data/schema.ts'
import type { BlameResult, LocalizedText, Prior, ResponsibilityTheory } from '../../engine/index.ts'
import { blame, parseCause } from '../../engine/index.ts'
import type { Locale } from '../i18n/messages.ts'
import { cfText } from '../probability/cf-steps.ts'

/** Pure helpers for the playground's 責備 block: Halpern's degree of blame (2016, Def. 6.2.1) per epistemic state and standard. */

/** One epistemic state: the probabilities the agent has (a model document's `priors`), and what has been observed since. */
export interface BlameState {
  /** What the state is called in the table; default `文件裡的機率` / "The document's probabilities". */
  readonly label?: string | LocalizedText
  /** The state's probabilities in the model document's `priors` format; default the document's own. */
  readonly prior?: NonNullable<ModelDoc['priors']>
  /** An observation that narrows the state, e.g. `D=1` (the outcome seen after acting). */
  readonly given?: string
}

/** `blame={{ cause: 'T=1', effect: 'D=1', states: [...] }}` on `CausalPlayground`. */
export interface BlameSpec {
  /** A single event X=x. */
  readonly cause: string
  /** The outcome φ. */
  readonly effect: string
  /** The Halpern–Pearl standards to compute under; default the three HP definitions, and HP with normality when the model has defaults. */
  readonly theories?: readonly ResponsibilityTheory[]
  /** The epistemic states, one row each; default one, the document's own `priors`. */
  readonly states?: readonly BlameState[]
}

export interface BlameStateView {
  /** The row's name, in the table's language; undefined for the document's own probabilities. */
  readonly label?: string
  readonly given?: string
  /** Backgrounds of the state (positive probability, `cause` holding). */
  readonly contexts: number
  readonly results: Readonly<Record<ResponsibilityTheory, BlameResult>>
}

export interface BlameView {
  readonly theories: readonly ResponsibilityTheory[]
  readonly states: readonly BlameStateView[]
}

/** The standards blame is computed under by default for this case. */
export function defaultBlameTheories(c: LoadedCase): ResponsibilityTheory[] {
  const out: ResponsibilityTheory[] = ['hp-original', 'hp-updated', 'hp-modified']
  if (c.normality !== undefined) out.push('hp-normality')
  return out
}

/** A degree of blame or responsibility: `0`, `1`, or at most four decimals, at least two. */
export function degreeNumber(x: number): string {
  return x === 0 ? '0' : x === 1 ? '1' : cfText(x)
}

/**
 * The blame of `spec.cause` for `spec.effect` in each epistemic state under each standard. Throws
 * when the document has no `priors` and no state gives one, and with the engine's own errors (a
 * cause that is not a single event, a standard that is not an HP definition, a search past its budget).
 */
export function blameView(c: LoadedCase, spec: BlameSpec, locale: Locale): BlameView {
  const given: readonly BlameState[] = spec.states ?? [{}]
  if (given.length === 0) throw new Error(`${c.data.id}: blame needs at least one state`)
  parseCause(c.model, spec.cause)
  const own: Prior | undefined = c.data.priors === undefined ? undefined : c.prior
  const theories = spec.theories ?? defaultBlameTheories(c)
  const states = given.map((state): BlameStateView => {
    const prior = state.prior === undefined ? own : priorOf(state.prior, c.model)
    if (prior === undefined) throw new Error(`${c.data.id}: blame needs priors, in the document or in each state`)
    const results = Object.fromEntries(
      theories.map((theory) => [
        theory,
        blame(c.model, prior, { cause: spec.cause, effect: spec.effect, given: state.given }, theory, { normality: c.normality }),
      ]),
    ) as Record<ResponsibilityTheory, BlameResult>
    const label = state.label === undefined ? undefined : typeof state.label === 'string' ? state.label : state.label[locale]
    return { label, given: state.given, contexts: results[theories[0]]?.rows.length ?? 0, results }
  })
  return { theories, states }
}
