import { useMemo, useState } from 'react'
import type { LoadedCase } from '../../data/load.ts'
import type { Assignment, Edge, Value } from '../../engine/index.ts'
import { counterfactual, evaluate, getVariable, valuesEqual } from '../../engine/index.ts'
import type { UiNotation } from './notation.ts'
import type { Stochastic } from './assignments.ts'
import { shownVariables } from '../graph/graph-layout.ts'
import { flipValue, observationFormula } from './assignments.ts'
import { mixedMarginals, targetValue } from './probability-view.ts'

/** What is set by do(): hard interventions, and stochastic ones (P*(X=1) of a boolean, 0 < p < 1). */
export interface DoState {
  readonly interventions: Assignment
  readonly stochastic: Stochastic
}

export interface ModelWorld {
  readonly shown: readonly string[]
  /** Deterministic values after do(); undefined for a case without an actual context. */
  readonly values?: Assignment
  readonly original?: Assignment
  /** P(V=1) after do() and the observations, for a case without an actual context. */
  readonly probs?: Readonly<Record<string, number>>
  /** P(observations | do()), for a case without an actual context; 1 when nothing is observed. */
  readonly evidence?: number
  /** P(V = value) per value for each non-boolean variable, alongside `probs`. */
  readonly dists?: Readonly<Record<string, readonly number[]>>
  readonly removedEdges: readonly Edge[]
}

/**
 * Solve the case under do(interventions): values when it has a context, probabilities otherwise.
 * `stochastic` interventions need probabilities: the world is their mixture (see `mixedMarginals`).
 * `observed` conditions the probabilities in the intervened model, P(· | do(…), observed); a case
 * with a context has nothing to observe.
 */
export function solve(c: LoadedCase, interventions: Assignment, stochastic: Stochastic = {}, observed: Assignment = {}): ModelWorld {
  const shown = shownVariables(c)
  if (c.context !== undefined) {
    if (Object.keys(stochastic).length > 0) throw new Error(`case ${c.data.id} has an actual context: a stochastic do() needs probabilities`)
    if (Object.keys(observed).length > 0) throw new Error(`case ${c.data.id} has an actual context: an observation needs probabilities`)
    const now = evaluate(c.model, c.context, interventions)
    const before = evaluate(c.model, c.context)
    return { shown, values: now.values, original: before.values, removedEdges: now.removedEdges }
  }
  if (c.prior === undefined) throw new Error(`case ${c.data.id} has neither a context nor a prior`)
  const cut = new Set([...Object.keys(interventions), ...Object.keys(stochastic)])
  const m = mixedMarginals(c.model, c.prior, interventions, stochastic, observationFormula(observed))
  return {
    shown,
    probs: m.p,
    dists: m.dist,
    evidence: m.evidence,
    removedEdges: c.model.edges.filter((e) => cut.has(e.to)),
  }
}

/**
 * How a probability graph reads what is set. `interventional`: P(· | do(…), observed), the
 * observations conditioning the intervened model. `counterfactual`: the observations are evidence
 * about the actual world and the do() a hypothetical action, P(V_{do(…)} | evidence) by abduction,
 * action and prediction (Pearl 2009, §7.1); a node may then be both evidence and action.
 */
export type Reading = 'interventional' | 'counterfactual'

/**
 * The counterfactual world: each variable's distribution in the world changed by do(), given the
 * evidence about the actual one. A stochastic do() mixes the hard settings by their weights (the
 * abduction does not depend on the action). `evidence` is P(evidence) under the prior.
 */
function solveCounterfactual(c: LoadedCase, interventions: Assignment, stochastic: Stochastic = {}, evidence: Assignment = {}): ModelWorld {
  const shown = shownVariables(c)
  if (c.prior === undefined) throw new Error(`case ${c.data.id} has an actual context: a counterfactual reading needs probabilities`)
  const prior = c.prior
  const given = observationFormula(evidence)
  const cut = new Set([...Object.keys(interventions), ...Object.keys(stochastic)])
  const removedEdges = c.model.edges.filter((e) => cut.has(e.to))
  // Evidence the actual world cannot show leaves nothing to abduce: every number reads —.
  if (given !== undefined && !((solve(c, {}, {}, evidence).evidence ?? 0) > 0)) {
    const none: Record<string, number> = Object.fromEntries(c.model.variables.map((v) => [v.id, Number.NaN]))
    const noDist: Record<string, number[]> = Object.fromEntries(
      c.model.variables.flatMap((v) => (v.domain.kind === 'finite' ? [[v.id, v.domain.values.map(() => Number.NaN)]] : [])),
    )
    return { shown, probs: none, dists: noDist, evidence: 0, removedEdges }
  }
  const ids = Object.keys(stochastic)
  const p: Record<string, number> = {}
  const dist: Record<string, number[]> = {}
  for (const v of c.model.variables) {
    p[v.id] = 0
    if (v.domain.kind === 'finite') dist[v.id] = v.domain.values.map(() => 0)
  }
  let pEvidence = 1
  for (let mask = 0; mask < 1 << ids.length; mask++) {
    const setting: Record<string, Value> = { ...interventions }
    let weight = 1
    ids.forEach((id, i) => {
      const on = (mask & (1 << i)) !== 0
      setting[id] = on
      weight *= on ? stochastic[id] : 1 - stochastic[id]
    })
    const result = counterfactual(c.model, prior, { evidence: given, do: setting })
    pEvidence = result.evidenceProbability
    for (const w of result.worlds) {
      for (const v of c.model.variables) {
        const value = w.counterfactual[v.id]
        if (value === undefined) continue
        if (valuesEqual(value, targetValue(v))) p[v.id] += weight * w.posterior
        if (v.domain.kind === 'finite') {
          const at = v.domain.values.findIndex((o) => valuesEqual(o, value))
          if (at >= 0) dist[v.id][at] += weight * w.posterior
        }
      }
    }
  }
  return { shown, probs: p, dists: dist, evidence: pEvidence, removedEdges }
}

/** The interventions with `id` set to `value`, or released when `value` is undefined. */
export function withValue(interventions: Assignment, id: string, value: Value | undefined): Assignment {
  const next: Record<string, Value> = { ...interventions }
  if (value === undefined) delete next[id]
  else next[id] = value
  return next
}

/** P*(X=1) on a slider step, in hundredths. */
function hundredths(p: number): number {
  return Math.round(p * 100) / 100
}

/**
 * do() with boolean `id` set to P*(id=1) = `p`: 0 and 1 are do(id=0) and do(id=1), a value between
 * them a stochastic intervention, and undefined releases `id` either way.
 */
export function withProbability(state: DoState, id: string, p: number | undefined): DoState {
  const interventions: Record<string, Value> = { ...state.interventions }
  const stochastic: Record<string, number> = { ...state.stochastic }
  delete interventions[id]
  delete stochastic[id]
  if (p !== undefined) {
    const q = hundredths(Math.min(1, Math.max(0, p)))
    if (q === 0 || q === 1) interventions[id] = q === 1
    else stochastic[id] = q
  }
  return { interventions, stochastic }
}

/**
 * A click that intervenes on a node with a value: do() at the value it shows first (or at 1, the
 * first value, when it has none), then the other value, then released. A multi-valued node goes
 * through its values in turn before it is released. What it shows is its value under the other
 * interventions, so after do(C=0) a node that C sets starts from its value there.
 */
export function toggled(c: LoadedCase, interventions: Assignment, world: ModelWorld, id: string): Assignment {
  const next: Record<string, Assignment[string]> = { ...interventions }
  const variable = getVariable(c.model, id)
  const set = next[id]
  if (set === undefined) {
    next[id] = world.values?.[id] ?? targetValue(variable)
    return next
  }
  delete next[id]
  const start = c.context === undefined ? targetValue(variable) : evaluate(c.model, c.context, next).values[id]
  const after = flipValue(variable, set)
  if (!valuesEqual(after, start ?? targetValue(variable))) next[id] = after
  return next
}

/** A click that observes a node: =1, then =0, then released; a multi-valued one goes through its values first. */
export function observedNext(c: LoadedCase, observed: Assignment, id: string): Assignment {
  const variable = getVariable(c.model, id)
  const now = observed[id]
  const next: Record<string, Value> = { ...observed }
  if (now === undefined) next[id] = targetValue(variable)
  else {
    const after = flipValue(variable, now)
    if (valuesEqual(after, targetValue(variable))) delete next[id]
    else next[id] = after
  }
  return next
}

function useNotation(initial: UiNotation = 'propositional'): [UiNotation, (n: UiNotation) => void] {
  return useState<UiNotation>(initial)
}

const NONE: Stochastic = {}

/**
 * Shared state for a graph with do() and observations: interventions, observations, notation and
 * the solved world. `setDo` sets the hard and stochastic interventions; `setObserved` the observations.
 */
export function useModel(c: LoadedCase, initial: Assignment = {}, initialNotation: UiNotation = 'propositional', reading: Reading = 'interventional') {
  const [state, setDo] = useState<DoState>(() => ({ interventions: initial, stochastic: NONE }))
  const [observed, setObserved] = useState<Assignment>(NO_OBSERVATION)
  const [notation, setNotation] = useNotation(initialNotation)
  const world = useMemo(
    () =>
      reading === 'counterfactual' && c.prior !== undefined && c.context === undefined
        ? solveCounterfactual(c, state.interventions, state.stochastic, observed)
        : solve(c, state.interventions, state.stochastic, observed),
    [c, state, observed, reading],
  )
  /** Hard interventions only: clears any stochastic one and every observation. */
  const setInterventions = (interventions: Assignment): void => {
    setDo({ interventions, stochastic: NONE })
    setObserved(NO_OBSERVATION)
  }
  return {
    interventions: state.interventions,
    stochastic: state.stochastic,
    observed,
    setInterventions,
    setDo,
    setObserved,
    notation,
    setNotation,
    world,
  }
}

const NO_OBSERVATION: Assignment = {}
