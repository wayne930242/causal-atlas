import type { Notation } from '../engine/index.ts'
import type { Messages } from './i18n.ts'

export type UiNotation = Extract<Notation, 'propositional' | 'arithmetic' | 'causal'>

const ORDER: readonly UiNotation[] = ['propositional', 'arithmetic', 'causal']

/** The notation switch's options, labelled in the table's language. */
export function notations(t: Messages): readonly { readonly value: UiNotation; readonly label: string }[] {
  return ORDER.map((value) => ({ value, label: t.notation[value] }))
}
