import type { KeyboardEvent } from 'react'
import { sub } from '../../components/text/svg-text.tsx'
import type { SphereLayout } from './sphere-graph.ts'

/** A world's part in a counterfactual: an antecedent world, one of the closest, one where the consequent fails. */
export type SphereMark = 'antecedent' | 'selected' | 'counter'

export interface SphereDiagramProps {
  readonly layout: SphereLayout
  readonly label: string
  readonly center: string
  readonly marks?: ReadonlyMap<string, SphereMark>
  /** The sphere drawn strong: the smallest holding an antecedent world. */
  readonly sphere?: number
  readonly sphereName: (i: number) => string
  readonly worldLabel: (id: string) => string
  readonly onSelect?: (id: string) => void
}

/** Concentric spheres around a world, with the worlds in their rings. */
export function SphereDiagram({ layout, label, center, marks, sphere, sphereName, worldLabel, onSelect }: SphereDiagramProps) {
  const key = (id: string) => (e: KeyboardEvent<SVGGElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect?.(id)
    }
  }
  return (
    <svg className="ca-modal-spheres" viewBox={layout.viewBox} width={layout.width} role="group" aria-label={label}>
      <g aria-hidden="true">
        {[...layout.radii].reverse().map((r, k) => {
          const i = layout.radii.length - 1 - k
          return <circle key={i} r={r} className="ca-modal-sphere" data-sphere={i} data-active={i === sphere ? 'true' : undefined} />
        })}
        {layout.sphereLabels.map((l, i) => (
          <text key={i} x={l.x} y={l.y} className="ca-modal-sphere-name" data-active={i === sphere ? 'true' : undefined}>
            {sphereName(i)}
          </text>
        ))}
      </g>
      {layout.worlds.map((w) => (
        <g
          key={w.id}
          className="ca-modal-dot"
          data-world={w.id}
          data-mark={marks?.get(w.id)}
          data-center={w.id === center ? 'true' : undefined}
          role={onSelect === undefined ? 'img' : 'button'}
          tabIndex={onSelect === undefined ? undefined : 0}
          aria-label={worldLabel(w.id)}
          onClick={onSelect === undefined ? undefined : () => onSelect(w.id)}
          onKeyDown={onSelect === undefined ? undefined : key(w.id)}
        >
          <circle cx={w.x} cy={w.y} r={6} />
          <text x={w.label.x} y={w.label.y} textAnchor={w.label.anchor} className="ca-modal-name">
            {sub(w.name)}
          </text>
          {w.detail !== '' && (
            <text x={w.detailAt.x} y={w.detailAt.y} textAnchor={w.label.anchor} className="ca-modal-detail">
              {w.detail}
            </text>
          )}
        </g>
      ))}
    </svg>
  )
}
