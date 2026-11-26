import type { Explanation, ModalEvaluator } from '../engine/evaluate.ts'
import type { Formula } from '../engine/formula.ts'
import { formulaText } from '../engine/print.ts'
import type { ModalMessages } from '../i18n/messages.ts'
import { namesOf } from './doc-graph.ts'
import type { ParsedFormula } from './use-doc.ts'
import type { WorldMark } from './WorldGraph.tsx'

/** Words and marks for a formula's value at a world. Pure. */

/** The sentence that says why `e` has its value. */
export function explanationText(e: Explanation, names: ReadonlyMap<string, string>, t: ModalMessages, notation: 'modern' | 'garson'): string {
  const name = (id: string) => names.get(id) ?? id
  const f = e.formula
  if (f.kind !== 'box' && f.kind !== 'dia') return t.plainValue(name(e.world), e.value)
  const arg = formulaText(f.arg, notation)
  const seen = namesOf(names, e.accessible ?? [])
  if (f.kind === 'box') return e.value ? t.boxTrue(name(e.world), arg, seen) : t.boxFalse(name(e.world), arg, name(e.witness ?? ''))
  return e.value ? t.diaTrue(name(e.world), arg, name(e.witness ?? '')) : t.diaFalse(name(e.world), arg, seen)
}

/** Marks for the focused formula: the selected world's view for □ and ◇, else every world's value. */
export function marksFor(e: Explanation | undefined, ev: ModalEvaluator | undefined, f: Formula | undefined): Map<string, WorldMark> {
  const marks = new Map<string, WorldMark>()
  if (e === undefined || ev === undefined || f === undefined) return marks
  if (f.kind === 'box' || f.kind === 'dia') {
    for (const c of e.children) marks.set(c.world, c.value ? 'true' : 'false')
    if (e.witness !== undefined) marks.set(e.witness, f.kind === 'box' ? 'counter' : 'witness')
    return marks
  }
  for (const w of ev.model.worlds) marks.set(w, ev.holds(f, w) ? 'true' : 'false')
  return marks
}

/** A parsed formula's value at `world`, or undefined when it does not parse or cannot be evaluated there. */
export function valueOrUndefined(parsed: ParsedFormula, ev: ModalEvaluator, world: string): boolean | undefined {
  if (!parsed.ok) return undefined
  try {
    return ev.holds(parsed.formula, world)
  } catch {
    return undefined
  }
}
