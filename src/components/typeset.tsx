import type { ReactNode } from 'react'
import { renderIdent } from '../engine/index.ts'
import { Tex } from './Tex.tsx'
import type { KnownIds } from './typeset-text.ts'
import { isIdent, splitProse, textToLatex } from './typeset-text.ts'

/** Variable names and formula fragments as typeset math, the way the equations show them. */

/** One variable id: `N_S1` as an italic N with a subscript S1. An id that is not a valid name (typed half-way in the editor) stays plain. */
export function Ident({ id }: { readonly id: string }) {
  return isIdent(id) ? <Tex tex={renderIdent(id, 'latex')} text={id} /> : <>{id}</>
}

/** A string that is wholly a formula, such as `do(A=0)` or `P(C=1 | S=1)`. */
export function Formula({ text }: { readonly text: string }) {
  return <Tex tex={textToLatex(text)} text={text} />
}

export interface RichProps {
  readonly text: string
  /** The model's variable ids: a bare id, or an `id=value` assignment, in the sentence is typeset. */
  readonly ids: KnownIds
  /** Running story text: a capital A that begins a sentence is the article, not the variable. */
  readonly narrative?: boolean
}

/** A sentence with its variable names and formula fragments (`A=0`, `do(A=0)`, `D = ¬GW·¬QW`) typeset and the rest left as text. */
export function Rich({ text, ids, narrative }: RichProps): ReactNode {
  const parts = splitProse(text, ids, narrative)
  if (parts.length === 1 && !parts[0].formula) return text
  return (
    <>
      {parts.map((s, i) => (s.formula ? <Formula key={i} text={s.text} /> : s.text))}
    </>
  )
}
