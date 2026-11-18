import type { Assignment, CausalModel } from '../../engine/index.ts'
import { atLeastAsNormal } from '../../engine/index.ts'
import { valuesEqual } from '../../engine/values.ts'
import type { Messages } from '../i18n/messages.ts'

/** A world against the model's default values: which variables deviate, and how it compares with the actual world. */

/** The variables of `world` off their default value, in the model's order. */
export function deviations(model: CausalModel, world: Assignment, normality: Assignment): string[] {
  return model.variables
    .map((v) => v.id)
    .filter((id) => normality[id] !== undefined && world[id] !== undefined && !valuesEqual(world[id], normality[id]))
}

export type NormalityOrder = 'more' | 'same' | 'less' | 'incomparable'

/** How `world` compares with `actual` by `atLeastAsNormal`, both ways (deviant sets by inclusion). */
function normalityOrder(world: Assignment, actual: Assignment, normality: Assignment): NormalityOrder {
  const a = atLeastAsNormal(world, actual, normality)
  const b = atLeastAsNormal(actual, world, normality)
  return a && b ? 'same' : a ? 'more' : b ? 'less' : 'incomparable'
}

/**
 * The deviant sets as one line: `實際世界 {L, MD, FF}` for the actual world, otherwise
 * `這個世界 {GW, QW}；實際世界 {GW, D}，無法比較`. The playground's defaults line and the reason a
 * world fails HP with normality are this same sentence.
 */
export function normalityLine(t: Messages, model: CausalModel, world: Assignment, actual: Assignment, normality: Assignment, changed: boolean): string {
  const braces = (w: Assignment): string => `{${deviations(model, w, normality).join(', ')}}`
  if (!changed) return t.normality.actualOnly(braces(actual))
  return t.normality.compare(braces(world), braces(actual), t.normality.order[normalityOrder(world, actual, normality)])
}
