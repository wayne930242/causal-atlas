import type { Locale } from '../../engine/types.ts'
import type { ModalNotation } from '../engine/print.ts'
import { operatorSymbol } from '../engine/print.ts'
import { modalText } from '../data/load.ts'
import type { FrameDoc, KripkeDoc, SpheresDoc } from '../data/schema.ts'
import type { GraphInput } from './world-graph.ts'

/** From a checked document to what the pictures draw: world names and box lines. Pure. */

type AnyDoc = KripkeDoc | FrameDoc | SpheresDoc

/** Each world's display name: its label in `locale`, else its id. */
export function worldNames(doc: AnyDoc, locale: Locale): ReadonlyMap<string, string> {
  return new Map(doc.worlds.map((w) => [w.id, modalText(w.label, locale) ?? w.id]))
}

/** The names of `ids`, in order. */
export function namesOf(names: ReadonlyMap<string, string>, ids: readonly string[]): string[] {
  return ids.map((id) => names.get(id) ?? id)
}

/** The lines in a world's box: its true atoms, then (when asked) its false ones negated. */
export function boxLines(atoms: readonly string[], trueHere: readonly string[], showFalse: boolean, notation: ModalNotation): string[] {
  const not = operatorSymbol('not', notation).text
  const lines = atoms.filter((a) => trueHere.includes(a))
  return showFalse ? [...lines, ...atoms.filter((a) => !trueHere.includes(a)).map((a) => `${not}${a}`)] : lines
}

/** The graph a Kripke or frame document draws, with `valuation` and `pairs` overriding its own (the editor's state). */
export function docGraphInput(
  doc: KripkeDoc | FrameDoc,
  locale: Locale,
  options: {
    readonly showFalse: boolean
    readonly notation: ModalNotation
    readonly mergeSymmetric: boolean
    readonly valuation?: Readonly<Record<string, readonly string[]>>
    readonly pairs?: readonly (readonly [string, string])[]
  },
): GraphInput {
  const names = worldNames(doc, locale)
  const atoms = doc.kind === 'kripke' ? doc.atoms.map((a) => a.id) : []
  return {
    worlds: doc.worlds.map((w) => ({
      id: w.id,
      name: names.get(w.id) ?? w.id,
      lines: boxLines(atoms, options.valuation?.[w.id] ?? ('true' in w ? w.true : []), options.showFalse, options.notation),
      pos: w.pos,
    })),
    pairs: options.pairs ?? doc.access,
    layout: doc.layout,
    root: doc.actual,
    mergeSymmetric: options.mergeSymmetric,
  }
}
