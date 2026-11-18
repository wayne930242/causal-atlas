import type { LoadedCase } from '../../data/load.ts'

/**
 * Variables drawn in the graph: the case layout's, else the endogenous ones, the exogenous causes
 * shared by two or more variables, and the exogenous ones the case names in `show_exogenous`.
 * Those named in `latent_as_arcs` are never drawn as nodes: they are the arcs between their children.
 */
export function shownVariables(c: LoadedCase): string[] {
  const { model } = c
  const layout = c.data.layout
  const arcs = new Set(c.data.latent_as_arcs ?? [])
  if (layout !== undefined) return model.variables.map((v) => v.id).filter((id) => id in layout && !arcs.has(id))
  const children = new Map<string, number>()
  for (const e of model.edges) children.set(e.from, (children.get(e.from) ?? 0) + 1)
  const named = new Set(c.data.show_exogenous ?? [])
  return model.variables
    .filter((v) => !arcs.has(v.id) && (v.kind === 'endogenous' || (children.get(v.id) ?? 0) >= 2 || named.has(v.id)))
    .map((v) => v.id)
}
