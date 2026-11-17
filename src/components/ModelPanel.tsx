import { useRef } from 'react'
import type { LoadedCase } from '../data/load.ts'
import type { Assignment } from '../engine/index.ts'
import { graphExport } from './export-render.tsx'
import type { ExportSource, ExportTag } from './export-image.ts'
import { ExportMenu } from './ExportMenu.tsx'
import type { Locale, Messages } from './i18n.ts'
import { messagesFor, useMessages } from './i18n.ts'
import type { ModelWorld } from './model-state.ts'
import { toggled, withValue } from './model-state.ts'
import { useNarrow } from './use-narrow.ts'
import { CopyLatex, Equations } from './Equations.tsx'
import type { UiNotation } from './notation.ts'
import { notations } from './notation.ts'
import { Segmented, Tag } from './parts.tsx'
import { SignalGraph } from './SignalGraph.tsx'
import { Formula } from './typeset.tsx'
import { originCitations, originSources } from './verdict-rows.ts'
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
  const t = useMessages()
  const hasDo = Object.keys(interventions).length > 0
  const wrap = useRef<HTMLDivElement>(null)
  const narrow = useNarrow(wrap, 560)
  const legendFor = (m: Messages): string => (world.probs !== undefined ? probLegend(m, c.model, world.shown) : m.valueLegend)
  const graph = (m: Messages, interactive: boolean) => (
    <SignalGraph
      compact={narrow}
      c={c}
      shown={world.shown}
      values={world.values}
      original={world.original}
      probs={world.probs}
      dists={world.dists}
      interventions={interventions}
      removedEdges={world.removedEdges}
      witness={witness}
      onToggle={!interactive || onInterventions === undefined ? undefined : (id) => onInterventions(toggled(c, interventions, world, id))}
      onSetValue={!interactive || onInterventions === undefined ? undefined : (id, value) => onInterventions(withValue(interventions, id, value))}
      title={title ?? m.graphTitle(c.data.title[m.locale])}
      onMove={interactive ? onMove : undefined}
    />
  )
  const exportSource = (locale: Locale): ExportSource | undefined => {
    const m = messagesFor(locale)
    const { svg, dispose } = graphExport(locale, t, () => wrap.current?.querySelector<SVGSVGElement>('svg.ca-graph'), () => graph(m, false))
    if (svg === null) {
      dispose?.()
      return undefined
    }
    const tags: ExportTag[] = hasDo
      ? [
          { text: m.afterDo, tone: 'slate' },
          { text: doText(interventions), tone: 'accent', mono: true },
        ]
      : [{ text: world.probs !== undefined ? m.probability : m.actualWorld, tone: 'fg' }]
    return {
      name: `${c.data.id}-graph`,
      title: c.data.title[locale],
      panels: [{ svg, tags, tint: hasDo }],
      legend: legendFor(m),
      origin: originSources(m, c),
      originCitations: originCitations(c),
      dispose,
    }
  }
  return (
    <div className={`ca-box ca-graph-box${hasDo ? ' is-cf' : ''}`} data-world={hasDo ? 'do' : 'actual'}>
      <div className="ca-box-head">
        <div className="ca-tags">
          {hasDo ? (
            <>
              <Tag tone="slate">{t.afterDo}</Tag>
              <span className="ca-do-chip ca-mono">
                <Formula text={doText(interventions)} />
                {onInterventions !== undefined && (
                  <button
                    type="button"
                    className="ca-do-clear"
                    aria-label={t.removeDo(doText(interventions))}
                    onClick={() => onInterventions({})}
                  >
                    ×
                  </button>
                )}
              </span>
            </>
          ) : (
            <Tag tone="fg">{world.probs !== undefined ? t.probability : t.actualWorld}</Tag>
          )}
        </div>
        <div className="ca-box-actions">
          {hasDo && onInterventions !== undefined && (
            <button type="button" className="ca-link" onClick={() => onInterventions({})}>
              {t.backToActual}
            </button>
          )}
          <ExportMenu source={exportSource} url={exportUrl} origins={originCitations(c)} />
        </div>
      </div>
      <div className="ca-graph-wrap" ref={wrap}>
        {graph(t, true)}
      </div>
      {legend === true && <p className="ca-legend">{legendFor(t)}</p>}
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
  const t = useMessages()
  return (
    <div className="ca-box ca-eq-box">
      <div className="ca-eq-head">
        <h3 className="ca-h3">{t.equations}</h3>
        <Segmented label={t.notationLabel} options={notations(t)} value={notation} onChange={onNotation} />
        <CopyLatex c={c} shown={world.shown} notation={notation} values={world.values} interventions={interventions} />
      </div>
      <Equations c={c} shown={world.shown} notation={notation} values={world.values} interventions={interventions} />
    </div>
  )
}
