/** `X_Y` identifiers drawn as X with a smaller, lowered Y; shared by the live SVG labels and the exported images. */

/** The head and the subscript of an `X_Y` identifier, at word boundaries. */
export const SUB_IDENT = /(?<![A-Za-z0-9_])([A-Za-z]+)_([A-Za-z0-9]+)(?![A-Za-z0-9_])/g
export const SUB_DY = '0.25em'
export const SUB_SIZE = '70%'
/** A zero-width space carries the baseline-restoring `dy` after a subscript. */
export const ZWSP = '\u200b'

export type SubPart = string | { readonly head: string; readonly sub: string }

/** Text split into plain runs and `X_Y` identifiers. */
export function subscriptParts(text: string): SubPart[] {
  const out: SubPart[] = []
  let last = 0
  for (const m of text.matchAll(SUB_IDENT)) {
    if (m.index > last) out.push(text.slice(last, m.index))
    out.push({ head: m[1], sub: m[2] })
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}
