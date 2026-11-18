import type { LoadedCase } from '../../data/load.ts'
import type { Assignment, Value } from '../../engine/index.ts'
import { coerceToDomain } from '../../engine/index.ts'
import type { DoState } from '../model/model-state.ts'

/**
 * What of the editor's do() and observations still fits the model after an edit: each kept only
 * while it names a variable it can apply to, with a value in that variable's domain.
 */

/** Interventions that still name a variable of the model with a value in its domain. */
export function validInterventions(c: LoadedCase, interventions: Assignment): Assignment {
  const out: Record<string, Value> = {}
  for (const [id, value] of Object.entries(interventions)) {
    const v = c.model.byId.get(id)
    if (v === undefined || v.kind === 'exogenous') continue
    try {
      out[id] = coerceToDomain(v, value)
    } catch {
      // A value read from the address as a number may name a text value, e.g. '2'.
      try {
        if (typeof value === 'number') out[id] = coerceToDomain(v, String(value))
      } catch {
        // dropped: the domain changed
      }
    }
  }
  return out
}

/**
 * Stochastic interventions that still name a boolean endogenous variable not set otherwise, in a
 * model drawn with probabilities (one without an actual context).
 */
export function validStochastic(c: LoadedCase, state: DoState, hard: Assignment): DoState['stochastic'] {
  if (c.context !== undefined) return {}
  const out: Record<string, number> = {}
  for (const [id, p] of Object.entries(state.stochastic)) {
    const v = c.model.byId.get(id)
    if (v === undefined || v.kind === 'exogenous' || v.domain.kind !== 'boolean' || id in hard || !(p > 0 && p < 1)) continue
    out[id] = p
  }
  return out
}

export const NO_DO: DoState = { interventions: {}, stochastic: {} }
export const NO_OBSERVATION: Assignment = {}

/** Observations that still name a variable with a value in its domain, not intervened on, in a model drawn with probabilities. */
export function validObserved(c: LoadedCase, observed: Assignment, active: DoState): Assignment {
  if (c.context !== undefined) return NO_OBSERVATION
  const out: Record<string, Value> = {}
  for (const [id, value] of Object.entries(validInterventions(c, observed))) {
    if (!(id in active.interventions) && !(id in active.stochastic)) out[id] = value
  }
  return out
}
