import type { ReactNode } from 'react'
import { useMessages } from '../i18n/messages.ts'
import { probText } from '../model/wording.ts'
import { barLayout } from '../text/text-measure.ts'
import type { Block } from './signal-shapes.ts'
import { BAR_H, BAR_LABEL } from './signal-shapes.ts'

export interface BarChartProps {
  readonly id: string
  /** Each value as text, in domain order. */
  readonly labels: readonly string[]
  /** P(id = value) per value; NaN where it cannot be computed. */
  readonly dist: readonly number[] | undefined
  /** The node's label block: the bars stand on its baseline from its left edge. */
  readonly block: Block
  /** Each bar's tooltip, `P(X=v)=0.25`. */
  readonly barText: (i: number) => string
}

/** One bar per value, scaled so the most likely value fills the chart's height; that probability is written beside it. */
export function BarChart({ id, labels, dist, block, barText }: BarChartProps): ReactNode {
  const t = useMessages()
  const layout = barLayout(labels, BAR_LABEL)
  const known = (dist ?? []).filter((x) => !Number.isNaN(x))
  const max = known.length === 0 ? Number.NaN : Math.max(...known)
  return (
    <g className="ca-bars" data-bars={id} transform={`translate(${block.x0} ${block.baseline})`}>
      <line x1={0} x2={layout.width} y1={0} y2={0} className="ca-hair" />
      {!Number.isNaN(max) && (
        <text x={-5} y={-BAR_H + 8} textAnchor="end" className="ca-mono ca-svg-tiny ca-fill-muted" data-max={max.toFixed(4)}>
          {t.barMax(probText(max))}
        </text>
      )}
      {labels.map((text, i) => {
        const p = dist?.[i]
        const ok = p !== undefined && !Number.isNaN(p)
        const h = ok && max > 0 && p > 0 ? Math.max(1, (p / max) * BAR_H) : 0
        const cx = i * layout.pitch + layout.pitch / 2
        const edge = i === 0 || i === labels.length - 1
        return (
          <g key={text} data-bar={text} data-p={ok ? p.toFixed(4) : ''}>
            <title>{barText(i)}</title>
            <rect x={cx - layout.barW / 2} y={-h} width={layout.barW} height={h} className="ca-fill-fg" />
            {(layout.labelsFit || edge) && (
              <text x={cx} y={BAR_LABEL + 2} textAnchor="middle" className="ca-mono ca-svg-tiny ca-fill-muted">
                {text}
              </text>
            )}
          </g>
        )
      })}
    </g>
  )
}
