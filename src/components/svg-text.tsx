import type { ReactNode } from 'react'
import { Fragment } from 'react'
import { SUB_DY, SUB_SIZE, ZWSP, subscriptParts } from './subscript.ts'

/**
 * SVG text with `X_Y` identifiers drawn as X with a smaller, lowered Y (`dy` pairs, which every SVG
 * renderer honours). The plain text stays in the aria-label and `data-*` attributes.
 */
export function sub(text: string): ReactNode {
  const parts = subscriptParts(text)
  if (parts.length === 1 && typeof parts[0] === 'string') return text
  return parts.map((p, i) =>
    typeof p === 'string' ? (
      p
    ) : (
      <Fragment key={i}>
        {p.head}
        <tspan dy={SUB_DY} fontSize={SUB_SIZE}>
          {p.sub}
        </tspan>
        <tspan dy={`-${SUB_DY}`}>{ZWSP}</tspan>
      </Fragment>
    ),
  )
}
