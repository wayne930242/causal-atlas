import type { Assignment } from '../../engine/index.ts'
import { formatValue } from '../../engine/values.ts'
import type { Messages } from '../i18n/messages.ts'
import { probText } from '../model/wording.ts'

/** The trail under a playground graph: the tracked nodes' readings after each change of what is set. */

/** One reading of a trail: what was set (`settingText`, '' for nothing) and each tracked node's number or value. */
export interface TrailEntry {
  readonly setting: string
  readonly values: Readonly<Record<string, string>>
}

/** Entries a trail keeps; older ones give way to `…`. */
export const TRAIL_LENGTH = 5

/** The tracked nodes' numbers (a probability graph) or values in `world`, as text. */
export function trailEntry(world: { readonly probs?: Readonly<Record<string, number>>; readonly values?: Assignment }, ids: readonly string[], setting: string): TrailEntry {
  const values: Record<string, string> = {}
  for (const id of ids) {
    const p = world.probs?.[id]
    const v = world.values?.[id]
    values[id] = p !== undefined ? probText(p) : v !== undefined ? formatValue(v) : '—'
  }
  return { setting, values }
}

/** `Y：0.50 → 0.67（Z=1）→ 0.50（Z=1, X=1）`, with `…` first when older readings were dropped. */
export function trailText(t: Messages, id: string, trail: readonly TrailEntry[], dropped: boolean): string {
  const steps = trail.map((e) => t.trailStep(e.values[id] ?? '—', e.setting))
  return t.trailLine(id, steps, dropped)
}
