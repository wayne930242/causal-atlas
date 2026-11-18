import { useRef, useState } from 'react'
import type { LoadedCase } from '../data/load.ts'
import type { Assignment } from '../engine/index.ts'
import { graphExport } from './export-render.tsx'
import type { ExportSource, ExportTag } from './export-image.ts'
import { ExportMenu } from './ExportMenu.tsx'
import type { Locale, Messages } from './i18n.ts'
import { messagesFor, useMessages } from './i18n.ts'
import type { DoState, ModelWorld } from './model-state.ts'
import { observedNext, solve, toggled, withProbability, withValue } from './model-state.ts'
import { useNarrow } from './use-narrow.ts'
import { CopyLatex, Equations } from './Equations.tsx'
import type { UiNotation } from './notation.ts'
import { notations } from './notation.ts'
import { Segmented, Tag } from './parts.tsx'
import { SignalGraph } from './SignalGraph.tsx'
import { Formula, Rich } from './typeset.tsx'
import { originCitations, originSources } from './verdict-rows.ts'
import type { Stochastic } from './view-model.ts'
import { assignmentText, probLegend, settingText } from './view-model.ts'

export interface GraphBoxProps {
  readonly c: LoadedCase
  readonly world: ModelWorld
  readonly interventions: Assignment
  /** Stochastic interventions, P*(X=1) per boolean node (probability mode only). */
  readonly stochastic?: Stochastic
  /** A click on a node: the new do() state. */
  readonly onDo?: (next: DoState) => void
  /** Observations the probabilities are conditioned on (probability mode only). */
  readonly observed?: Assignment
  /**
   * The new observations after a click. Given in probability mode, a click observes and a long
   * press or Shift+click intervenes; without it every click intervenes.
   */
  readonly onObserve?: (next: Assignment) => void
  readonly witness?: Assignment
  readonly legend?: boolean
  readonly title?: string
  /** Link in the exported image's watermark. */
  readonly exportUrl?: string
  /** Node drag in the editor: grid offset in columns and rows. */
  readonly onMove?: (id: string, dCol: number, dRow: number) => void
  /** Builds the embed code (iframe and citation) for the figure as it stands; the export menu offers it when given. */
  readonly embedCode?: () => string
}

const NONE: Stochastic = {}
const NO_OBSERVATION: Assignment = {}

/** `do` without `id`, hard or stochastic. */
function withoutDo(state: DoState, id: string): DoState {
  const interventions: Record<string, Assignment[string]> = { ...state.interventions }
  const stochastic: Record<string, number> = { ...state.stochastic }
  delete interventions[id]
  delete stochastic[id]
  return { interventions, stochastic }
}

function withoutKey(a: Assignment, id: string): Assignment {
  const next: Record<string, Assignment[string]> = { ...a }
  delete next[id]
  return next
}

/**
 * The graph with its world tags. With values, a click intervenes on a node. With probabilities and
 * `onObserve`, a click observes it and a long press or Shift+click intervenes (a boolean node is set
 * to 1 at once, with a slider for P*(X=1) beside it); an observation that cannot happen under what is
 * set is refused with a note.
 */
export function GraphBox({
  c,
  world,
  interventions,
  stochastic = NONE,
  onDo,
  observed = NO_OBSERVATION,
  onObserve,
  witness,
  legend,
  title,
  exportUrl,
  onMove,
  embedCode,
}: GraphBoxProps) {
  const t = useMessages()
  const [notice, setNotice] = useState<string | undefined>(undefined)
  const hasDo = Object.keys(interventions).length > 0 || Object.keys(stochastic).length > 0
  const hasObs = Object.keys(observed).length > 0
  const hasSet = hasDo || hasObs
  const state: DoState = { interventions, stochastic }
  const setNow = settingText(interventions, stochastic, observed)
  const wrap = useRef<HTMLDivElement>(null)
  const narrow = useNarrow(wrap, 560)
  const prob = world.probs !== undefined
  const observes = prob && onObserve !== undefined
  const legendFor = (m: Messages): string => (world.probs !== undefined ? probLegend(m, c.model, world.shown) : m.valueLegend)
  const headTag = (m: Messages): string => (hasDo && hasObs ? m.afterDoObserve : hasObs ? m.afterObserve : m.afterDo)
  /** Commit do() and observations together, unless the observations cannot happen under that do(). */
  const commit = (next: DoState, nextObserved: Assignment): void => {
    if (Object.keys(nextObserved).length > 0 && prob) {
      const evidence = solve(c, next.interventions, next.stochastic, nextObserved).evidence ?? 1
      if (!(evidence > 0)) {
        setNotice(t.observeImpossible(assignmentText(nextObserved)))
        return
      }
    }
    setNotice(undefined)
    if (nextObserved !== observed) onObserve?.(nextObserved)
    if (next.interventions !== interventions || next.stochastic !== stochastic) onDo?.(next)
  }
  // A do() on a node first drops its observation: the node keeps the value, now set by intervention.
  const doing = (next: DoState, id: string): void => commit(next, id in observed ? withoutKey(observed, id) : observed)
  const clearAll = (): void => commit({ interventions: {}, stochastic: NONE }, NO_OBSERVATION)
  const graph = (m: Messages, interactive: boolean) => (
    <SignalGraph
      compact={narrow}
      c={c}
      shown={world.shown}
      values={world.values}
      original={world.original}
      probs={world.probs}
      dists={world.dists}
      observed={Object.keys(observed)}
      observedValues={observed}
      interventions={interventions}
      stochastic={stochastic}
      removedEdges={world.removedEdges}
      witness={witness}
      onToggle={!interactive || onDo === undefined ? undefined : (id) => doing({ stochastic, interventions: toggled(c, interventions, world, id) }, id)}
      onSetValue={!interactive || onDo === undefined ? undefined : (id, value) => doing({ stochastic, interventions: withValue(interventions, id, value) }, id)}
      onSetProbability={!interactive || onDo === undefined || !prob ? undefined : (id, p) => doing(withProbability(state, id, p), id)}
      onObserve={
        !interactive || !observes
          ? undefined
          : (id) => {
              const forced = interventions[id]
              if (forced !== undefined || id in stochastic) {
                // Observing an intervened node: the same value, now observed (1 for a stochastic one).
                commit(withoutDo(state, id), { ...observed, [id]: forced ?? true })
              } else commit(state, observedNext(c, observed, id))
            }
      }
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
    const tags: ExportTag[] = hasSet
      ? [
          { text: headTag(m), tone: 'slate' },
          { text: setNow, tone: 'accent', mono: true },
        ]
      : [{ text: world.probs !== undefined ? m.probability : m.actualWorld, tone: 'fg' }]
    return {
      name: `${c.data.id}-graph`,
      title: c.data.title[locale],
      panels: [{ svg, tags, tint: hasSet }],
      legend: legendFor(m),
      origin: originSources(m, c),
      originCitations: originCitations(c),
      dispose,
    }
  }
  const editable = onDo !== undefined || onObserve !== undefined
  return (
    <div className={`ca-box ca-graph-box${hasSet ? ' is-cf' : ''}`} data-world={hasDo ? 'do' : hasObs ? 'observed' : 'actual'}>
      <div className="ca-box-head">
        <div className="ca-tags">
          {hasSet ? (
            <>
              <Tag tone="slate">{headTag(t)}</Tag>
              <span className="ca-do-chip ca-mono">
                <Formula text={setNow} />
                {editable && (
                  <button type="button" className="ca-do-clear" aria-label={hasObs ? t.clearSettings(setNow) : t.removeDo(setNow)} onClick={clearAll}>
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
          {hasSet && editable && (
            <button type="button" className="ca-link" onClick={clearAll}>
              {prob ? t.backToPrior : t.backToActual}
            </button>
          )}
          <ExportMenu source={exportSource} url={exportUrl} origins={originCitations(c)} embedCode={embedCode} />
        </div>
      </div>
      <div className="ca-graph-wrap" ref={wrap}>
        {graph(t, true)}
      </div>
      {notice !== undefined && (
        <p className="ca-notice" role="status">
          <Rich text={notice} ids={c.model.byId} />
        </p>
      )}
      {legend === true && <p className="ca-legend">{legendFor(t)}</p>}
    </div>
  )
}

export interface EquationBoxProps {
  readonly c: LoadedCase
  readonly world: ModelWorld
  readonly interventions: Assignment
  readonly stochastic?: Stochastic
  readonly notation: UiNotation
  readonly onNotation: (n: UiNotation) => void
}

export function EquationBox({ c, world, interventions, stochastic = NONE, notation, onNotation }: EquationBoxProps) {
  const t = useMessages()
  return (
    <div className="ca-box ca-eq-box">
      <div className="ca-eq-head">
        <h3 className="ca-h3">{t.equations}</h3>
        <Segmented label={t.notationLabel} options={notations(t)} value={notation} onChange={onNotation} />
        <CopyLatex c={c} shown={world.shown} notation={notation} values={world.values} interventions={interventions} stochastic={stochastic} />
      </div>
      <Equations c={c} shown={world.shown} notation={notation} values={world.values} interventions={interventions} stochastic={stochastic} />
    </div>
  )
}
