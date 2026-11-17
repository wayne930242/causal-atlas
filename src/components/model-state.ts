import { useMemo, useState } from 'react'
import type { LoadedCase } from '../data/load.ts'
import type { Assignment, Edge, Value } from '../engine/index.ts'
import { evaluate, getVariable } from '../engine/index.ts'
import type { UiNotation } from './notation.ts'
import type { Stochastic } from './view-model.ts'
import { flipValue, mixedMarginals, shownVariables, targetValue } from './view-model.ts'

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
  /** P(V=1) after do(), for a case without an actual context. */
  readonly probs?: Readonly<Record<string, number>>
  /** P(V = value) per value for each non-boolean variable, alongside `probs`. */
  readonly dists?: Readonly<Record<string, readonly number[]>>
  readonly removedEdges: readonly Edge[]
}

/**
 * Solve the case under do(interventions): values when it has a context, probabilities otherwise.
 * `stochastic` interventions need probabilities: the world is their mixture (see `mixedMarginals`).
 */
export function solve(c: LoadedCase, interventions: Assignment, stochastic: Stochastic = {}): ModelWorld {
  const shown = shownVariables(c)
  if (c.context !== undefined) {
    if (Object.keys(stochastic).length > 0) throw new Error(`case ${c.data.id} has an actual context: a stochastic do() needs probabilities`)
    const now = evaluate(c.model, c.context, interventions)
    const before = evaluate(c.model, c.context)
    return { shown, values: now.values, original: before.values, removedEdges: now.removedEdges }
  }
  if (c.prior === undefined) throw new Error(`case ${c.data.id} has neither a context nor a prior`)
  const cut = new Set([...Object.keys(interventions), ...Object.keys(stochastic)])
  const m = mixedMarginals(c.model, c.prior, interventions, stochastic)
  return {
    shown,
    probs: m.p,
    dists: m.dist,
    removedEdges: c.model.edges.filter((e) => cut.has(e.to)),
  }
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

/** Click on a node: set it to the other value, or release it. */
export function toggled(c: LoadedCase, interventions: Assignment, world: ModelWorld, id: string): Assignment {
  const next: Record<string, Assignment[string]> = { ...interventions }
  if (id in next) {
    delete next[id]
    return next
  }
  const variable = getVariable(c.model, id)
  const current = world.values?.[id]
  next[id] = current === undefined ? targetValue(variable) : flipValue(variable, current)
  return next
}

export function useNotation(initial: UiNotation = 'propositional'): [UiNotation, (n: UiNotation) => void] {
  return useState<UiNotation>(initial)
}

const NONE: Stochastic = {}

/**
 * Shared state for a graph with do(): interventions, notation and the solved world.
 * `setInterventions` sets hard interventions only and clears any stochastic one; `setDo` sets both.
 */
export function useModel(c: LoadedCase, initial: Assignment = {}, initialNotation: UiNotation = 'propositional') {
  const [state, setDo] = useState<DoState>(() => ({ interventions: initial, stochastic: NONE }))
  const [notation, setNotation] = useNotation(initialNotation)
  const world = useMemo(() => solve(c, state.interventions, state.stochastic), [c, state])
  const setInterventions = (interventions: Assignment): void => setDo({ interventions, stochastic: NONE })
  return { interventions: state.interventions, stochastic: state.stochastic, setInterventions, setDo, notation, setNotation, world }
}
