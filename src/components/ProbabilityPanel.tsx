import type { ReactNode } from 'react'
import { useMemo, useRef, useState } from 'react'
import type { LoadedCase } from '../data/load.ts'
import type { ModelDoc } from '../data/schema.ts'
import type { Assignment } from '../engine/index.ts'
import { evaluate, getVariable, probability } from '../engine/index.ts'
import { graphExport, renderDetached } from './export-render.tsx'
import { useCaseOrDoc } from './doc-case.ts'
import { CopyLatex, Equations } from './Equations.tsx'
import type { ExportPanel, ExportSource } from './export-image.ts'
import { ExportMenu } from './ExportMenu.tsx'
import type { Locale, Messages } from './i18n.ts'
import { LocaleProvider, LocaleScope, messagesFor, useMessages } from './i18n.ts'
import type { UiNotation } from './notation.ts'
import { notations } from './notation.ts'
import { DocProblems, Disclosure, Segmented, Tag } from './parts.tsx'
import { SignalGraph } from './SignalGraph.tsx'
import { Formula, Ident, Rich } from './typeset.tsx'
import { useNarrow } from './use-narrow.ts'
import type { SeeDoPair } from './verdict-rows.ts'
import { originCitations, originSources, seeDoPair } from './verdict-rows.ts'
import {
  defaultSliders,
  doText,
  label,
  marginals,
  priorWithSliders,
  probLegend,
  probText,
  shownVariables,
  sliderVariables,
  targetText,
  phraseOf,
} from './view-model.ts'

export type ProbabilityView = 'sliders' | 'compare'

export type ProbabilityPanelProps = ProbabilitySource & ProbabilityOptions

/** What to draw: a bundled case by id, or a model document (invalid ones show their problem codes). */
export type ProbabilitySource =
  | { readonly caseId: string; readonly doc?: undefined }
  | { readonly doc: ModelDoc; readonly caseId?: undefined }

export interface ProbabilityOptions {
  /** Notation the equations start in; the reader can still switch. Default 'propositional'. */
  readonly defaultNotation?: UiNotation
  /** `sliders`: set p per exogenous variable. `compare`: observing vs do() side by side. */
  readonly view?: ProbabilityView
  /** For `compare`: the observation, the do() and the event. Defaults to the case's own pair. */
  readonly pair?: SeeDoPair
  /** Link in the exported image's watermark. */
  readonly exportUrl?: string
  /** Interface language. Default: the surrounding LocaleProvider's, else zh-TW. */
  readonly locale?: Locale
}

const SAME = 0.005

function notesAgainst(
  t: Messages,
  base: Readonly<Record<string, number>>,
  now: Readonly<Record<string, number>>,
  shown: readonly string[],
  own: string,
  ownNote: string,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const id of shown) {
    if (id === own) out[id] = ownNote
    else out[id] = Math.abs((now[id] ?? 0) - (base[id] ?? 0)) < SAME ? t.unchanged : t.was(probText(base[id] ?? Number.NaN))
  }
  return out
}

interface SlidersProps {
  readonly c: LoadedCase
  readonly sliders: Readonly<Record<string, number>>
  readonly onSlider: (id: string, p: number) => void
  readonly notation: UiNotation
  readonly onNotation: (n: UiNotation) => void
  readonly shown: readonly string[]
  readonly withHead: boolean
}

function SliderSection({ c, sliders, onSlider, notation, onNotation, shown, withHead }: SlidersProps) {
  const t = useMessages()
  const ids = sliderVariables(c)
  return (
    <div className="ca-prob-sliders">
      <div className="ca-eq-head">
        {withHead && <h3 className="ca-h3">{t.probEquations}</h3>}
        <Segmented label={t.notationLabel} options={notations(t)} value={notation} onChange={onNotation} />
        <CopyLatex c={c} shown={shown} notation={notation} interventions={{}} />
      </div>
      <Equations c={c} shown={shown} notation={notation} interventions={{}} />
      {ids.length === 0 ? (
        <p className="ca-muted">{t.jointOnly}</p>
      ) : (
        <ul className="ca-slider-list">
          {ids.map((id) => {
            const variable = getVariable(c.model, id)
            const p = sliders[id] ?? 0
            return (
              <li key={id} className="ca-slider-row">
                <span className="ca-slider-var ca-mono">
                  <Ident id={id} />
                </span>
                <label className="ca-slider-label" htmlFor={`ca-slider-${c.data.id}-${id}`}>
                  {t.sliderLabel(label(c.model, id, t.locale))}
                </label>
                <input
                  id={`ca-slider-${c.data.id}-${id}`}
                  className="ca-slider"
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={p}
                  aria-valuetext={`P(${targetText(variable)}) = ${probText(p)}`}
                  onChange={(e) => onSlider(id, Number(e.currentTarget.value))}
                />
                <output className="ca-slider-value ca-mono" htmlFor={`ca-slider-${c.data.id}-${id}`}>
                  p = {probText(p)}
                </output>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/** Direction 1 probability mode: per-exogenous p sliders; node fill is P(V=1); observing vs do() side by side. */
export function ProbabilityPanel({ caseId, doc, view = 'sliders', pair, exportUrl, defaultNotation, locale }: ProbabilityPanelProps) {
  return (
    <LocaleScope locale={locale}>
      <ProbabilityPanelResolved caseId={caseId} doc={doc} view={view} pair={pair} exportUrl={exportUrl} defaultNotation={defaultNotation} />
    </LocaleScope>
  )
}

function ProbabilityPanelResolved({ caseId, doc, view, pair, exportUrl, defaultNotation }: Omit<ProbabilityPanelProps, 'locale'>) {
  const resolved = useCaseOrDoc(caseId, doc)
  if (!resolved.ok) return <DocProblems problems={resolved.problems} />
  return <ProbabilityPanelFor c={resolved.c} view={view} pair={pair} exportUrl={exportUrl} defaultNotation={defaultNotation} />
}

export function ProbabilityPanelFor({
  c,
  view = 'sliders',
  pair,
  exportUrl,
  defaultNotation,
}: {
  c: LoadedCase
  view?: ProbabilityView
  pair?: SeeDoPair
  exportUrl?: string
  defaultNotation?: UiNotation
}) {
  const t = useMessages()
  const [sliders, setSliders] = useState<Record<string, number>>(() => defaultSliders(c))
  const [notation, setNotation] = useState<UiNotation>(defaultNotation ?? 'propositional')
  const [mode, setMode] = useState<'value' | 'probability'>('probability')
  const shown = useMemo(() => shownVariables(c), [c])
  const prior = useMemo(() => priorWithSliders(c, sliders), [c, sliders])
  const baseM = useMemo(() => marginals(c.model, prior), [c, prior])
  const base = baseM.p
  const onSlider = (id: string, p: number): void => setSliders((s) => ({ ...s, [id]: p }))
  const wrap = useRef<HTMLDivElement>(null)
  const narrow = useNarrow(wrap, 560)

  if (view === 'compare') {
    const p = pair ?? seeDoPair(c)
    if (p === undefined) throw new Error(`case ${c.data.id} has no observe/do pair for the comparison`)
    return <Compare c={c} pair={p} prior={prior} base={base} shown={shown} exportUrl={exportUrl} sliderSection={
      <SliderSection c={c} sliders={sliders} onSlider={onSlider} notation={notation} onNotation={setNotation} shown={shown} withHead={false} />
    } />
  }

  const showValues = mode === 'value' && c.context !== undefined
  const values = showValues && c.context !== undefined ? evaluate(c.model, c.context).values : undefined
  const legend = probLegend(t, c.model, shown)
  const graph = (m: Messages) => (
    <SignalGraph
      compact={narrow}
      c={c}
      shown={shown}
      values={values}
      probs={showValues ? undefined : base}
      dists={showValues ? undefined : baseM.dist}
      interventions={{}}
      removedEdges={[]}
      title={m.probGraphTitle(c.data.title[m.locale])}
    />
  )
  const exportSource = (locale: Locale): ExportSource | undefined => {
    const m = messagesFor(locale)
    const { svg, dispose } = graphExport(locale, t, () => wrap.current?.querySelector<SVGSVGElement>('svg.ca-graph'), () => graph(m))
    if (svg === null) {
      dispose?.()
      return undefined
    }
    return {
      name: `${c.data.id}-probability`,
      title: c.data.title[locale],
      panels: [{ svg, tags: [{ text: showValues ? m.actualWorld : m.probability, tone: 'fg' as const }] }],
      legend: showValues ? m.valueLegend : probLegend(m, c.model, shown),
      origin: originSources(m, c),
      originCitations: originCitations(c),
      dispose,
    }
  }
  return (
    <div className="ca-root not-prose ca-panel ca-prob" data-case={c.data.id} data-view="sliders" lang={t.locale}>
      <div className="ca-box ca-graph-box">
        <div className="ca-box-head">
          {c.context !== undefined ? (
            <Segmented
              label={t.nodesShow}
              options={[
                { value: 'value', label: t.zeroOne },
                { value: 'probability', label: t.probability },
              ]}
              value={mode}
              onChange={setMode}
            />
          ) : (
            <Tag tone="fg">{t.probability}</Tag>
          )}
          <span className="ca-muted ca-small">{legend}</span>
          <ExportMenu source={exportSource} url={exportUrl} origins={originCitations(c)} />
        </div>
        <div className="ca-graph-wrap" ref={wrap}>
          {graph(t)}
        </div>
      </div>
      <div className="ca-box ca-eq-box">
        <SliderSection c={c} sliders={sliders} onSlider={onSlider} notation={notation} onNotation={setNotation} shown={shown} withHead />
      </div>
    </div>
  )
}

interface CompareProps {
  readonly c: LoadedCase
  readonly pair: SeeDoPair
  readonly prior: ReturnType<typeof priorWithSliders>
  readonly base: Readonly<Record<string, number>>
  readonly shown: readonly string[]
  readonly sliderSection: ReactNode
  readonly exportUrl?: string
}

function Compare({ c, pair, prior, base, shown, sliderSection, exportUrl }: CompareProps) {
  const t = useMessages()
  const root = useRef<HTMLDivElement>(null)
  const observedId = /^\s*([A-Za-z_][A-Za-z0-9_]*)/.exec(pair.observe)?.[1] ?? ''
  const doId = Object.keys(pair.intervene)[0] ?? ''
  let see: Record<string, number> | undefined
  let seeDist: Readonly<Record<string, readonly number[]>> = {}
  let seeValue = Number.NaN
  try {
    const seen = marginals(c.model, prior, { given: pair.observe })
    see = { ...seen.p }
    seeDist = seen.dist
    seeValue = probability(c.model, prior, { event: pair.event, given: pair.observe }).value
  } catch {
    see = undefined
  }
  const doM = marginals(c.model, prior, { do: pair.intervene })
  const doP = doM.p
  const doValue = probability(c.model, prior, { event: pair.event, do: pair.intervene }).value
  const cut = new Set(Object.keys(pair.intervene))
  const removed = c.model.edges.filter((e) => cut.has(e.to))
  const seeExpr = `P(${pair.event} | ${pair.observe})`
  const doExpr = `P(${pair.event} | ${doText(pair.intervene)})`
  const obsPhrase = phraseOf(c.model, t.locale, pair.observe, false)
  const doPhrase = phraseOf(c.model, t.locale, doText(pair.intervene), true, pair.intervene)
  const seeGraph = (m: Messages) =>
    see === undefined ? null : (
      <SignalGraph
        c={c}
        shown={shown}
        probs={see}
        dists={seeDist}
        probNotes={notesAgainst(m, base, see, shown, observedId, m.observed)}
        observed={[observedId]}
        compact
        interventions={{}}
        removedEdges={[]}
        title={m.afterObserving(pair.observe)}
      />
    )
  const doGraph = (m: Messages) => (
    <SignalGraph
      c={c}
      shown={shown}
      probs={doP}
      dists={doM.dist}
      probNotes={notesAgainst(m, base, doP, shown, doId, m.setByDo)}
      interventions={pair.intervene as Assignment}
      removedEdges={removed}
      compact
      title={m.afterSetting(doText(pair.intervene))}
    />
  )
  const exportSource = (locale: Locale): ExportSource | undefined => {
    const m = messagesFor(locale)
    const view =
      locale === t.locale
        ? undefined
        : renderDetached(
            <LocaleProvider locale={locale}>
              <div data-side="see">{seeGraph(m)}</div>
              <div data-side="do">{doGraph(m)}</div>
            </LocaleProvider>,
          )
    const scope = view?.container ?? root.current
    const graph = (side: string) => scope?.querySelector<SVGSVGElement>(`[data-side="${side}"] svg.ca-graph`) ?? null
    const panels: ExportPanel[] = []
    const seeSvg = graph('see')
    const doSvg = graph('do')
    if (seeSvg !== null) {
      panels.push({ svg: seeSvg, tags: [{ text: m.observing(pair.observe), tone: 'outline' }], foot: `${seeExpr} = ${probText(seeValue)}` })
    }
    if (doSvg !== null) {
      panels.push({
        svg: doSvg,
        tags: [
          { text: m.afterDo, tone: 'slate' },
          { text: doText(pair.intervene), tone: 'accent', mono: true },
        ],
        foot: `${doExpr} = ${probText(doValue)}`,
        tint: true,
      })
    }
    return {
      name: `${c.data.id}-compare`,
      title: c.data.title[locale],
      panels,
      legend: probLegend(m, c.model, shown),
      origin: originSources(m, c),
      originCitations: originCitations(c),
      dispose: view?.dispose,
    }
  }
  return (
    <div className="ca-root not-prose ca-panel ca-prob" data-case={c.data.id} data-view="compare" lang={t.locale} ref={root}>
      <div className="ca-box-head ca-compare-head">
        <span className="ca-muted ca-small">{probLegend(t, c.model, shown)}</span>
        <ExportMenu source={exportSource} url={exportUrl} origins={originCitations(c)} />
      </div>
      <div className="ca-compare">
        <div className="ca-compare-side" data-side="see">
          <div className="ca-box-head">
            <Tag tone="outline">
              <Rich text={t.observing(pair.observe)} ids={c.model.byId} />
            </Tag>
          </div>
          <div className="ca-graph-wrap">{see === undefined ? <p className="ca-muted">{t.zeroObservation}</p> : seeGraph(t)}</div>
          <div className="ca-compare-result">
            <div>
              <code className="ca-mono ca-muted ca-small">
                <Formula text={seeExpr} />
              </code>
              <p className="ca-big ca-mono" data-testid="see-value">
                {probText(seeValue)}
              </p>
            </div>
            <p className="ca-compare-text">
              <Rich text={t.seeText(obsPhrase)} ids={c.model.byId} />
            </p>
          </div>
        </div>
        <div className="ca-compare-side is-cf" data-side="do">
          <div className="ca-box-head">
            <div className="ca-tags">
              <Tag tone="slate">{t.afterDo}</Tag>
              <Tag tone="accent" mono>
                <Formula text={doText(pair.intervene)} />
              </Tag>
            </div>
          </div>
          <div className="ca-graph-wrap">{doGraph(t)}</div>
          <div className="ca-compare-result">
            <div>
              <code className="ca-mono ca-muted ca-small">
                <Formula text={doExpr} />
              </code>
              <p className="ca-big ca-mono" data-testid="do-value">
                {probText(doValue)}
              </p>
            </div>
            <p className="ca-compare-text">
              <Rich text={t.doText(doPhrase)} ids={c.model.byId} />
            </p>
          </div>
        </div>
      </div>
      <Disclosure kicker="" title={t.probEquations} className="ca-compare-more">
        {sliderSection}
      </Disclosure>
    </div>
  )
}
