import type { CausalModel } from '../../engine/index.ts'

/**
 * Which drawn nodes an exogenous slider moves: the variable itself when the graph draws it, else
 * the drawn endogenous variables whose equations read it (the CPT entries of lesson 04 feed one
 * node each; a shared background may feed several).
 */
export function sliderTargets(model: CausalModel, shown: readonly string[], slider: string): string[] {
  if (shown.includes(slider)) return [slider]
  return shown.filter((id) => model.parents.get(id)?.includes(slider) === true)
}

/** The sliders that move drawn node `node`, in the order given. */
export function nodeSliders(model: CausalModel, shown: readonly string[], sliders: readonly string[], node: string): string[] {
  return sliders.filter((s) => sliderTargets(model, shown, s).includes(node))
}

export interface SliderGroup {
  /** The drawn nodes every slider of the group moves; empty for sliders that move none. */
  readonly nodes: readonly string[]
  readonly sliders: readonly string[]
}

/**
 * The sliders grouped by the nodes they move, so a reader finds a node's probabilities under its
 * name: groups in the order their first node is drawn (sliders that move no drawn node last), the
 * sliders of a group in the order given.
 */
export function sliderGroups(model: CausalModel, shown: readonly string[], sliders: readonly string[]): SliderGroup[] {
  const byKey = new Map<string, { nodes: string[]; sliders: string[] }>()
  for (const s of sliders) {
    const nodes = sliderTargets(model, shown, s)
    const key = nodes.join(',')
    const group = byKey.get(key)
    if (group === undefined) byKey.set(key, { nodes, sliders: [s] })
    else group.sliders.push(s)
  }
  const rank = (g: SliderGroup): number => (g.nodes.length === 0 ? shown.length : Math.min(...g.nodes.map((n) => shown.indexOf(n))))
  return [...byKey.values()].sort((a, b) => rank(a) - rank(b))
}
