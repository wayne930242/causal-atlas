import { useRef } from 'react'
import type { LoadedCase } from '../data/load.ts'
import type { Assignment } from '../engine/index.ts'
import type { ExportTag } from './export-image.ts'
import { ExportMenu } from './ExportMenu.tsx'
import type { ModelWorld } from './model-state.ts'
import { toggled } from './model-state.ts'
import { useNarrow } from './use-narrow.ts'
import { Equations } from './Equations.tsx'
import type { UiNotation } from './notation.ts'
import { NOTATIONS } from './notation.ts'
import { Segmented, Tag } from './parts.tsx'
import { SignalGraph } from './SignalGraph.tsx'
import { originSources } from './verdict-rows.ts'
import { doText, probLegend } from './view-model.ts'

export interface GraphBoxProps {
  readonly c: LoadedCase
  readonly world: ModelWorld
  readonly interventions: Assignment
  readonly onInterventions?: (next: Assignment) => void
  readonly witness?: Assignment
  readonly legend?: boolean
  readonly title?: string
  /** Link in the exported image's watermark. */
  readonly exportUrl?: string
  /** Node drag in the editor: grid offset in columns and rows. */
  readonly onMove?: (id: string, dCol: number, dRow: number) => void
}

/** The graph with its world tags; clicking a node toggles do() on it. */
export function GraphBox({ c, world, interventions, onInterventions, witness, legend, title, exportUrl, onMove }: GraphBoxProps) {
  const hasDo = Object.keys(interventions).length > 0
  const wrap = useRef<HTMLDivElement>(null)
  const narrow = useNarrow(wrap, 560)
  const legendText = world.probs !== undefined ? probLegend(c.model, world.shown) : '黑＝發生（1）　白＝沒發生（0）'
  const exportSource = () => {
    const svg = wrap.current?.querySelector<SVGSVGElement>('svg.ca-graph')
    if (svg === null || svg === undefined) return undefined
    const tags: ExportTag[] = hasDo
      ? [
          { text: '干預後', tone: 'slate' },
          { text: doText(interventions), tone: 'accent', mono: true },
        ]
      : [{ text: world.probs !== undefined ? '機率' : '實際世界', tone: 'fg' }]
    return {
      name: `${c.data.id}-graph`,
      title: c.data.title.zh,
      panels: [{ svg, tags, tint: hasDo }],
      legend: legendText,
      origin: originSources(c),
    }
  }
  return (
    <div className={`ca-box ca-graph-box${hasDo ? ' is-cf' : ''}`} data-world={hasDo ? 'do' : 'actual'}>
      <div className="ca-box-head">
        <div className="ca-tags">
          {hasDo ? (
            <>
              <Tag tone="slate">干預後</Tag>
              <span className="ca-do-chip ca-mono">
                {doText(interventions)}
                {onInterventions !== undefined && (
                  <button
                    type="button"
                    className="ca-do-clear"
                    aria-label={`取消 ${doText(interventions)}`}
                    onClick={() => onInterventions({})}
                  >
                    ×
                  </button>
                )}
              </span>
            </>
          ) : (
            <Tag tone="fg">{world.probs !== undefined ? '機率' : '實際世界'}</Tag>
          )}
        </div>
        <div className="ca-box-actions">
          {hasDo && onInterventions !== undefined && (
            <button type="button" className="ca-link" onClick={() => onInterventions({})}>
              回到實際世界
            </button>
          )}
          <ExportMenu source={exportSource} url={exportUrl} />
        </div>
      </div>
      <div className="ca-graph-wrap" ref={wrap}>
        <SignalGraph
          compact={narrow}
          c={c}
          shown={world.shown}
          values={world.values}
          original={world.original}
          probs={world.probs}
          interventions={interventions}
          removedEdges={world.removedEdges}
          witness={witness}
          onToggle={onInterventions === undefined ? undefined : (id) => onInterventions(toggled(c, interventions, world, id))}
          title={title ?? `${c.data.title.zh}的因果圖`}
          onMove={onMove}
        />
      </div>
      {legend === true && (
        <p className="ca-legend">{legendText}</p>
      )}
    </div>
  )
}

export interface EquationBoxProps {
  readonly c: LoadedCase
  readonly world: ModelWorld
  readonly interventions: Assignment
  readonly notation: UiNotation
  readonly onNotation: (n: UiNotation) => void
}

export function EquationBox({ c, world, interventions, notation, onNotation }: EquationBoxProps) {
  return (
    <div className="ca-box ca-eq-box">
      <div className="ca-eq-head">
        <h3 className="ca-h3">式子</h3>
        <Segmented label="式子的寫法" options={NOTATIONS} value={notation} onChange={onNotation} />
      </div>
      <Equations c={c} shown={world.shown} notation={notation} values={world.values} interventions={interventions} />
    </div>
  )
}

