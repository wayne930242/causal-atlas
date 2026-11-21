import type { ReactNode } from 'react'
import { renderIdent } from '../../engine/index.ts'
import { Tex } from './Tex.tsx'
import type { KnownIds } from './typeset-text.ts'
import { isIdent, splitProse, textToLatex } from './typeset-text.ts'

/** Variable names and formula fragments as typeset math, the way the equations show them. */

/** One variable id: `N_S1` as an italic N with a subscript S1. An id that is not a valid name (typed half-way in the editor) stays plain. */
export function Ident({ id }: { readonly id: string }) {
  return isIdent(id) ? <Tex tex={renderIdent(id, 'latex')} text={id} /> : <>{id}</>
}

/** A string that is wholly a formula, such as `do(A=0)` or `P(C=1 | S=1)`. */
export function Formula({ text, ids }: { readonly text: string; readonly ids?: KnownIds }) {
  return <Tex tex={textToLatex(text, ids)} text={text} />
}

/** A translated sentence with fixed notation that the model-expression scanner cannot infer. */
export function MathProse({ text, math, ids = NO_IDS }: { text: string; math: Readonly<Record<string, string>>; ids?: KnownIds }): ReactNode {
  const fragments = Object.keys(math).sort((a, b) => b.length - a.length)
  const alternatives = fragments.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
  const parts = text.split(new RegExp(`(?<![A-Za-z0-9_])(${alternatives})(?![A-Za-z0-9_])`, 'g'))
  return parts.map((part, i) => i % 2 === 0 ? <Rich key={i} text={part} ids={ids} /> : <Tex key={i} tex={math[part]} text={part} />)
}

const NO_IDS = new Set<string>()

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
      {parts.map((s, i) => (s.formula ? <Formula key={i} text={s.text} ids={ids} /> : s.text))}
    </>
  )
}
