import type { Notation } from '../engine/index.ts'

export type UiNotation = Extract<Notation, 'propositional' | 'arithmetic' | 'causal'>

export const NOTATIONS: readonly { readonly value: UiNotation; readonly label: string }[] = [
  { value: 'propositional', label: '邏輯式' },
  { value: 'arithmetic', label: '數學式' },
  { value: 'causal', label: '干預式' },
]
