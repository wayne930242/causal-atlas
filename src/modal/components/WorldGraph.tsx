import type { KeyboardEvent } from 'react'
import { sub } from '../../components/text/svg-text.tsx'
import type { GraphLayout } from './world-graph.ts'

/** How a world is marked: its value under the formula in focus, or its part in a modal step. */
export type WorldMark = 'true' | 'false' | 'witness' | 'counter' | 'dim'

export interface WorldGraphProps {
  readonly layout: GraphLayout
  /** The accessible name of the picture. */
  readonly label: string
  readonly selected?: string
  readonly marks?: ReadonlyMap<string, WorldMark>
  /** Each world's accessible name. */
  readonly worldLabel: (id: string) => string
  /** Makes each world a button that selects it. */
  readonly onSelect?: (id: string) => void
}

const LINE = 17
const PAD = 10

/** A Kripke picture: Garson-style world boxes and accessibility arrows; the selected world's arrows are drawn strong. */
export function WorldGraph({ layout, label, selected, marks, worldLabel, onSelect }: WorldGraphProps) {
  const key = (id: string) => (e: KeyboardEvent<SVGGElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect?.(id)
    }
  }
  return (
    <svg className="ca-modal-graph" viewBox={layout.viewBox} width={layout.width} role="group" aria-label={label}>
      <g className="ca-modal-edges" aria-hidden="true">
        {layout.edges.map((e) => {
          const active = selected !== undefined && (e.from === selected || (e.both && e.to === selected))
          return (
            <g key={`${e.from}-${e.to}`} className="ca-modal-edge" data-from={e.from} data-to={e.to} data-active={active ? 'true' : undefined}>
              <path d={e.path} fill="none" />
              {e.heads.map((h, i) => (
                <path key={i} d={h} className="ca-modal-head" />
              ))}
            </g>
          )
        })}
      </g>
      {layout.worlds.map((w) => {
        const mark = marks?.get(w.id)
        const top = w.cy - w.h / 2
        return (
          <g
            key={w.id}
            className="ca-modal-world"
            data-world={w.id}
            data-mark={mark}
            data-selected={w.id === selected ? 'true' : undefined}
            role={onSelect === undefined ? 'img' : 'button'}
            tabIndex={onSelect === undefined ? undefined : 0}
            aria-label={worldLabel(w.id)}
            aria-pressed={onSelect === undefined ? undefined : w.id === selected}
            onClick={onSelect === undefined ? undefined : () => onSelect(w.id)}
            onKeyDown={onSelect === undefined ? undefined : key(w.id)}
          >
            <rect x={w.cx - w.w / 2} y={top} width={w.w} height={w.h} rx="3" className="ca-modal-box" />
            {w.lines.map((line, i) => (
              <text key={line} x={w.cx} y={top + PAD + i * LINE + 9} textAnchor="middle" className="ca-modal-atom" data-negated={line.startsWith('¬') || line.startsWith('~') ? 'true' : undefined}>
                {sub(line)}
              </text>
            ))}
            <text x={w.label.x} y={w.label.y} textAnchor={w.label.anchor} className="ca-modal-name">
              {sub(w.name)}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
