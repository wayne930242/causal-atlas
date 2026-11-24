import type { LoadedCase } from '../../data/load.ts'
import { decisionProblem } from '../../data/load.ts'
import type { CaseDecision } from '../../data/schema.ts'
import type { Assignment, DecisionProblem, LocalizedText } from '../../engine/index.ts'
import { coerceToDomain, evaluate, getVariable, parseCause, valuesEqual } from '../../engine/index.ts'
import type { Locale } from '../i18n/messages.ts'
import type { DsepPair } from '../model/dsep-view.ts'
import { defaultSliders, sliderVariables } from '../model/probability-view.ts'
import type { VerdictQuery } from '../model/verdict-rows.ts'

/**
 * CausalPlayground's props read against the case: the presets as buttons, the slider start values,
 * the decision problem, the dsep pairs and the query in force. A prop the case cannot take throws
 * here, with the message the playground has always thrown.
 */

export const NONE: Assignment = {}

/**
 * A step button under the graph: one press sets these do()s and observations (and nothing else).
 * A bundled case brings its own (do() only); a document takes a list.
 */
export interface PlaygroundPreset {
  readonly label: string | LocalizedText
  /** do() to set. */
  readonly interventions?: Assignment
  /** Observations to set; probability graphs only (a graph with values throws). */
  readonly observed?: Assignment
  /**
   * Variables an HP witness holds fixed: set by do() like `interventions`, but drawn in the amber
   * hull (固定) instead of with a clamp.
   */
  readonly hold?: Assignment
  /** Name of this step’s test (defaults to the button label). */
  readonly test?: string | LocalizedText
  /** Required outcome on a graph with values. After a click, compare each entry with the solved world. */
  readonly expect?: Assignment
}

/** A step button: its text and what one press sets. */
export interface PresetButton {
  readonly text: string
  readonly test?: string
  readonly expect?: Assignment
  /** Every do(), the held variables included. */
  readonly interventions: Assignment
  readonly observed: Assignment
  readonly hold: Assignment
}

/** The decision problem the bars show: the case's own for `true`. */
export function decisionFor(c: LoadedCase, decision: true | CaseDecision | undefined): DecisionProblem | undefined {
  if (decision === undefined) return undefined
  if (c.context !== undefined || c.prior === undefined) throw new Error(`${c.data.id}: decision needs a probability graph (priors, no context)`)
  if (decision !== true) return decisionProblem(decision)
  if (c.decision === undefined) throw new Error(`${c.data.id}: decision={true} needs the case's own decision; give one instead`)
  return c.decision
}

/** The sliders' and `prior`'s start values; throws on a variable no slider can set. */
export function sliderStart(c: LoadedCase, sliders: readonly string[], prior: Readonly<Record<string, number>> | undefined): Record<string, number> {
  const ids = [...sliders, ...Object.keys(prior ?? {})]
  if (ids.length === 0) return {}
  if (c.context !== undefined || c.prior === undefined) throw new Error(`${c.data.id}: sliders and prior need a probability graph (priors, no context)`)
  const settable = new Set(sliderVariables(c))
  for (const id of ids) {
    getVariable(c.model, id)
    if (!settable.has(id)) throw new Error(`${c.data.id}: no slider can set ${id} (a boolean or two-valued exogenous variable, independent prior)`)
  }
  for (const [id, p] of Object.entries(prior ?? {})) {
    if (!(p >= 0 && p <= 1)) throw new Error(`${c.data.id}: prior ${id} = ${p} is not a probability`)
  }
  const own = defaultSliders(c)
  return Object.fromEntries(ids.map((id) => [id, prior?.[id] ?? own[id]]))
}

/** Throws when `verdicts` are given for a graph without values (no actual context). */
export function checkVerdicts(c: LoadedCase, verdicts: readonly VerdictQuery[] | undefined): void {
  if (verdicts !== undefined && c.context === undefined) throw new Error(`${c.data.id}: verdicts need a graph with values (an actual context)`)
}

function isPair(dsep: DsepPair | readonly DsepPair[]): dsep is DsepPair {
  return typeof dsep[0] === 'string'
}

/** The dsep pairs as a list; throws unless the graph has probabilities and both ends of each are its variables. */
export function dsepPairs(c: LoadedCase, dsep: DsepPair | readonly DsepPair[] | undefined): readonly DsepPair[] {
  const pairs: readonly DsepPair[] = dsep === undefined ? [] : isPair(dsep) ? [dsep] : dsep
  if (pairs.length > 0 && (c.context !== undefined || c.prior === undefined)) throw new Error(`${c.data.id}: dsep needs a probability graph (priors, no context)`)
  for (const [x, y] of pairs) {
    getVariable(c.model, x)
    getVariable(c.model, y)
  }
  return pairs
}

/** Throws on a tracked id that names no variable. */
export function checkTrack(c: LoadedCase, track: readonly string[]): void {
  for (const id of track) getVariable(c.model, id)
}

/** The most specific cause set by these non-held interventions, not all at actual values; else the first. */
export function activeQuery(c: LoadedCase, queries: readonly VerdictQuery[], interventions: Assignment): number {
  const actual = c.context === undefined ? NONE : evaluate(c.model, c.context).values
  let best = 0
  let size = 0
  queries.forEach((q, i) => {
    const cause = parseCause(c.model, q.cause)
    const ids = Object.keys(cause)
    if (ids.length > size && ids.every((id) => id in interventions) && ids.some((id) => !valuesEqual(interventions[id], actual[id]))) {
      best = i
      size = ids.length
    }
  })
  return best
}

/** The step buttons: a bundled case's own showcase for `true`, the given list, or none; held variables are set by do() too. */
export function presetButtons(c: LoadedCase, presets: boolean | readonly PlaygroundPreset[], locale: Locale): PresetButton[] {
  if (presets === false) return []
  const list: readonly PlaygroundPreset[] = presets === true ? c.data.showcase : presets
  return list.map((s) => {
    const text = typeof s.label === 'string' ? s.label : s.label[locale]
    const observed = s.observed ?? NONE
    if (c.context !== undefined && Object.keys(observed).length > 0) {
      throw new Error(`preset "${text}": observed needs probabilities, and ${c.data.id} has an actual context`)
    }
    const hold = s.hold ?? NONE
    if (s.expect !== undefined) {
      if (c.context === undefined || Object.keys(s.expect).length === 0) throw new Error(`preset "${text}": expect needs an outcome and an actual context`)
      for (const [id, value] of Object.entries(s.expect)) coerceToDomain(getVariable(c.model, id), value)
    }
    return { text, test: typeof s.test === 'string' ? s.test : s.test?.[locale], expect: s.expect, interventions: { ...(s.interventions ?? NONE), ...hold }, observed, hold }
  })
}
