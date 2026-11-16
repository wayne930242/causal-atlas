import { useRef } from 'react'
import type { LoadedCase } from '../data/load.ts'
import type { Assignment } from '../engine/index.ts'
import type { ModelWorld } from './model-state.ts'
import { toggled } from './model-state.ts'
import { useNarrow } from './use-narrow.ts'
import { Equations } from './Equations.tsx'
import type { UiNotation } from './notation.ts'
import { NOTATIONS } from './notation.ts'
import { Segmented, Tag } from './parts.tsx'
import { SignalGraph } from './SignalGraph.tsx'
import { doText, probLegend } from './view-model.ts'

export interface GraphBoxProps {
  readonly c: LoadedCase
  readonly world: ModelWorld
  readonly interventions: Assignment
  readonly onInterventions?: (next: Assignment) => void
  readonly witness?: Assignment
  readonly legend?: boolean
  readonly title?: string
}

/** The graph with its world tags; clicking a node toggles do() on it. */
export function GraphBox({ c, world, interventions, onInterventions, witness, legend, title }: GraphBoxProps) {
  const hasDo = Object.keys(interventions).length > 0
  const wrap = useRef<HTMLDivElement>(null)
  const narrow = useNarrow(wrap, 560)
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
        {hasDo && onInterventions !== undefined && (
          <button type="button" className="ca-link" onClick={() => onInterventions({})}>
            回到實際世界
          </button>
        )}
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
        />
      </div>
      {legend === true && (
        <p className="ca-legend">
          {world.probs !== undefined ? probLegend(c.model, world.shown) : '黑＝發生（1）　白＝沒發生（0）'}
        </p>
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

