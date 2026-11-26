import { useMemo } from 'react'
import type { ModalProblem } from '../engine/errors.ts'
import { modalProblem } from '../engine/errors.ts'
import type { Formula } from '../engine/formula.ts'
import { atomsOf, parseFormula } from '../engine/formula.ts'
import { parseModalJson } from '../data/load.ts'
import type { ModalDoc, ModalDocInput } from '../data/schema.ts'

/** Loading a component's document and its formulas. */

export type Loaded<K extends ModalDoc['kind']> = { readonly ok: true; readonly doc: Extract<ModalDoc, { kind: K }> } | { readonly ok: false; readonly errors: readonly ModalProblem[] }

/** The document checked once per value, narrowed to the kinds the component draws (`kinds`: a module constant). */
export function useModalDoc<K extends ModalDoc['kind']>(model: ModalDocInput | string, kinds: readonly K[]): Loaded<K> {
  return useMemo(() => {
    const result = parseModalJson(model)
    if (!result.ok) return result
    if (!(kinds as readonly string[]).includes(result.doc.kind)) {
      return { ok: false, errors: [modalProblem('wrong-kind', { kind: result.doc.kind, expected: kinds }, 'kind')] }
    }
    return { ok: true, doc: result.doc as Extract<ModalDoc, { kind: K }> }
  }, [model, kinds])
}

export type ParsedFormula = { readonly ok: true; readonly source: string; readonly formula: Formula } | { readonly ok: false; readonly source: string; readonly error: unknown }

/** Parse a list of formula sources, keeping each failure in place. */
export function parseAll(sources: readonly string[]): ParsedFormula[] {
  return sources.map((source) => {
    try {
      return { ok: true, source, formula: parseFormula(source) }
    } catch (error) {
      return { ok: false, source, error }
    }
  })
}

/** The first atom of `formulas` the document does not have, as a problem. */
export function unknownAtomProblem(formulas: readonly Formula[], atoms: readonly string[]): ModalProblem | undefined {
  for (const f of formulas) for (const a of atomsOf(f)) if (!atoms.includes(a)) return modalProblem('unknown-atom', { atom: a })
  return undefined
}
