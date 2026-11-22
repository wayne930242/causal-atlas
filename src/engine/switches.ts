import type { CausalModel } from './model.ts'
import { getVariable } from './model.ts'
import type { Variable } from './types.ts'
import { ModelError } from './values.ts'
import { problem } from './errors.ts'

/** The id of the switch on `id`: `F_Z` for `Z`. */
export function switchId(id: string): string {
  return `F_${id}`
}

/**
 * The model's graph with an intervention switch `F_v → v` for each of `ids` (Pearl 2009, §3.2.2,
 * the regime indicator F_X; §3.4.3 reads do-calculus rules 2 and 3 off it). Each switch is a new
 * exogenous boolean with one arrow, into its variable; no arrow into the variable is cut, so the
 * graph holds both regimes: the switch off, the variable follows its own equation; on, it is set.
 * Only the graph gains the switch: the equations, and so every probability, are those of `model`.
 * For d-separation and drawing. A switch id the model already uses fails fast.
 */
export function withSwitches(model: CausalModel, ids: readonly string[]): CausalModel {
  if (ids.length === 0) return model
  const added: Variable[] = []
  for (const id of ids) {
    const v = getVariable(model, id)
    const f = switchId(id)
    if (model.byId.has(f) || added.some((a) => a.id === f)) throw new ModelError(problem('duplicate-variable', { id: f }))
    added.push({
      id: f,
      label: { 'zh-TW': `${v.id} 的干預開關`, en: `intervention switch on ${v.id}` },
      kind: 'exogenous',
      domain: { kind: 'boolean' },
    })
  }
  const variables = [...added, ...model.variables]
  return {
    ...model,
    variables,
    byId: new Map(variables.map((v) => [v.id, v])),
    exogenous: [...added.map((v) => v.id), ...model.exogenous],
    edges: [...ids.map((id) => ({ from: switchId(id), to: id })), ...model.edges],
  }
}
