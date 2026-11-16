import { useMemo, useState } from 'react'
import type { LoadedCase } from '../data/load.ts'
import type { Assignment, Edge } from '../engine/index.ts'
import { evaluate, getVariable } from '../engine/index.ts'
import type { UiNotation } from './notation.ts'
import { flipValue, marginals, shownVariables, targetValue } from './view-model.ts'

export interface ModelWorld {
  readonly shown: readonly string[]
  /** Deterministic values after do(); undefined for a case without an actual context. */
  readonly values?: Assignment
  readonly original?: Assignment
  /** P(V=1) after do(), for a case without an actual context. */
  readonly probs?: Readonly<Record<string, number>>
  readonly removedEdges: readonly Edge[]
}

/** Solve the case under do(interventions): values when it has a context, probabilities otherwise. */
export function solve(c: LoadedCase, interventions: Assignment): ModelWorld {
  const shown = shownVariables(c)
  if (c.context !== undefined) {
    const now = evaluate(c.model, c.context, interventions)
    const before = evaluate(c.model, c.context)
    return { shown, values: now.values, original: before.values, removedEdges: now.removedEdges }
  }
  if (c.prior === undefined) throw new Error(`case ${c.data.id} has neither a context nor a prior`)
  const cut = new Set(Object.keys(interventions))
  return {
    shown,
    probs: marginals(c.model, c.prior, { do: interventions }).p,
    removedEdges: c.model.edges.filter((e) => cut.has(e.to)),
  }
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

/** Shared state for a graph with do(): interventions, notation and the solved world. */
export function useModel(c: LoadedCase, initial: Assignment = {}) {
  const [interventions, setInterventions] = useState<Assignment>(initial)
  const [notation, setNotation] = useNotation()
  const world = useMemo(() => solve(c, interventions), [c, interventions])
  return { interventions, setInterventions, notation, setNotation, world }
}
