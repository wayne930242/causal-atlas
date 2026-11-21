import { digitSubscript } from '../../engine/identifier-format.ts'

/** `X_Y` identifiers drawn as X with a smaller, lowered Y; shared by the live SVG labels and the exported images. */

/** The head and the subscript of an `X_Y` identifier, at word boundaries. */
const UNDERSCORE_IDENT = /([A-Za-z]+)_([A-Za-z0-9]+)/
export const SUB_IDENT = new RegExp(`(?<![A-Za-z0-9_])${UNDERSCORE_IDENT.source}(?![A-Za-z0-9_])`, 'g')
const IDENT_TOKEN = /(?<![A-Za-z0-9_])[A-Za-z][A-Za-z0-9_]*/g
export const SUB_DY = '0.25em'
export const SUB_SIZE = '70%'
/** A zero-width space carries the baseline-restoring `dy` after a subscript. */
export const ZWSP = '\u200b'

export type SubPart = string | { readonly head: string; readonly sub: string }

/** Formula or identifier-label text split into plain runs and `X_Y` or `X1` identifiers. */
export function subscriptParts(text: string): SubPart[] {
  const out: SubPart[] = []
  let last = 0
  for (const m of text.matchAll(IDENT_TOKEN)) {
    const id = m[0]
    const explicit = UNDERSCORE_IDENT.exec(id)
    const parts = explicit?.[0] === id ? { head: explicit[1], sub: explicit[2] } : digitSubscript(id)
    if (parts === undefined) continue
    if (m.index > last) out.push(text.slice(last, m.index))
    out.push(parts)
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}
