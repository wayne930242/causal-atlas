import type { ReactNode } from 'react'
import { useMemo, useRef, useState } from 'react'
import type { LoadedCase } from '../../data/load.ts'
import type { ModelDoc } from '../../data/schema.ts'
import type { Assignment } from '../../engine/index.ts'
import { evaluate, probability } from '../../engine/index.ts'
import { graphExport, renderDetached } from '../export/export-render.tsx'
import { useCaseOrDoc } from '../model/doc-case.ts'
import { CopyLatex, Equations } from '../panels/Equations.tsx'
import type { ExportPanel, ExportSource } from '../export/export-image.ts'
import { ExportMenu } from '../export/ExportMenu.tsx'
import type { Locale, Messages } from '../i18n/messages.ts'
import { LocaleProvider, LocaleScope, messagesFor, useMessages } from '../i18n/messages.ts'
import type { UiNotation } from '../model/notation.ts'
import { notations } from '../model/notation.ts'
import { DocProblems, Disclosure, Segmented, Tag } from '../shared/parts.tsx'
import { SignalGraph } from '../graph/SignalGraph.tsx'
import { SliderList } from '../panels/SliderList.tsx'
import type { AdjustSpec } from './AdjustPanel.tsx'
import { AdjustPanel } from './AdjustPanel.tsx'
import type { RuleStep } from './rules-view.ts'
import { RulesPanel } from './RulesPanel.tsx'
import type { CounterfactualSpec } from './cf-steps.ts'
import { CfStepper } from './CfStepper.tsx'
import { Formula, Rich } from '../text/typeset.tsx'
import { useNarrow } from '../shared/use-narrow.ts'
import type { SeeDoPair } from '../model/verdict-rows.ts'
import { originCitations, originSources, seeDoPair } from '../model/verdict-rows.ts'
import { shownVariables } from '../graph/graph-layout.ts'
import { defaultSliders, marginals, priorWithSliders, sliderVariables } from '../model/probability-view.ts'
import { changeNotes, doText, probLegend, probText, phraseOf } from '../model/wording.ts'

export type ProbabilityView = 'sliders' | 'compare' | 'counterfactual' | 'adjust' | 'rules'

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
  /**
   * For `compare`: the observation, the do() and the event. Defaults to the case's own pair. Given
   * several, a switch in the panel's head (labelled by each `observe`) changes both sides at once.
   */
  readonly pair?: SeeDoPair | readonly SeeDoPair[]
  /**
   * For `counterfactual`: the evidence, the do() and the event, e.g.
   * `{ evidence: 'D=1', do: { A: 0 }, event: 'D=0' }` for P(D_{A=0}=0 | D=1).
   */
  readonly counterfactual?: CounterfactualSpec
  /**
   * For `adjust`: the cause x, the effect y (its event y=1, or its first value) and the groupings
   * the head offers (`sets`; default every grouping of the other endogenous variables, at most
   * three of them). Each grouping shows the back-door verdict and the adjustment formula's table.
   */
  readonly adjust?: AdjustSpec
  /**
   * For `rules`: the steps of a do-calculus derivation, one button each. A step names its rule,
   * the pair, the known set it starts with, the cut (`cutIn`: arrows into these removed;
   * `cutOut`: arrows out of them removed; as the lesson writes it) and the equation the rule
   * licenses, `equal: [side, side]`, each side `{ event, given?, do? }` computed on the full model.
   */
  readonly rules?: readonly RuleStep[]
  /** For `counterfactual`: the question in words, beside the formula in the head. */
  readonly actionLabel?: string
  /** For `counterfactual`: the step shown first, 1 (abduction, default), 2 (action) or 3 (prediction). */
  readonly initialStep?: number
  /** Link in the exported image's watermark. */
  readonly exportUrl?: string
  /** Interface language. Default: the surrounding LocaleProvider's, else zh-TW. */
  readonly locale?: Locale
}

const NO_DO: Assignment = {}

function notesAgainst(
  t: Messages,
  base: Readonly<Record<string, number>>,
  now: Readonly<Record<string, number>>,
  shown: readonly string[],
  own: string,
  ownNote: string,
): Record<string, string> {
  const changed = changeNotes(t, base, now, shown)
  const out: Record<string, string> = {}
  for (const id of shown) out[id] = id === own ? ownNote : (changed[id] ?? t.unchanged)
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
  const prior = useMemo(() => (c.prior === undefined ? undefined : priorWithSliders(c, sliders)), [c, sliders])
  const ids = sliderVariables(c)
  return (
    <div className="ca-prob-sliders">
      <div className="ca-eq-head">
        {withHead && <h3 className="ca-h3">{t.probEquations}</h3>}
        <Segmented label={t.notationLabel} options={notations(t)} value={notation} onChange={onNotation} />
        <CopyLatex c={c} shown={shown} notation={notation} interventions={NO_DO} prior={prior} />
      </div>
      <Equations c={c} shown={shown} notation={notation} interventions={NO_DO} prior={prior} />
      {ids.length === 0 ? (
        <p className="ca-muted">{t.jointOnly}</p>
      ) : (
        <SliderList c={c} ids={ids} values={sliders} onChange={onSlider} idPrefix={`ca-slider-${c.data.id}`} />
      )}
    </div>
  )
}

/** Direction 1 probability mode: per-exogenous p sliders; node fill is P(V=1); observing vs do() side by side. */
export function ProbabilityPanel({ locale, ...props }: ProbabilityPanelProps) {
  return (
    <LocaleScope locale={locale}>
      <ProbabilityPanelResolved {...props} />
    </LocaleScope>
  )
}

function ProbabilityPanelResolved({ caseId, doc, ...props }: Omit<ProbabilityPanelProps, 'locale'>) {
  const resolved = useCaseOrDoc(caseId, doc)
  if (!resolved.ok) return <DocProblems problems={resolved.problems} />
  return <ProbabilityPanelFor c={resolved.c} {...props} />
}

export function ProbabilityPanelFor({
  c,
  view = 'sliders',
  pair,
  counterfactual,
  actionLabel,
  initialStep,
  exportUrl,
  defaultNotation,
  sliders: heldSliders,
  onSliders,
  adjust,
  rules,
}: {
  c: LoadedCase
  view?: ProbabilityView
  pair?: SeeDoPair | readonly SeeDoPair[]
  adjust?: AdjustSpec
  rules?: readonly RuleStep[]
  counterfactual?: CounterfactualSpec
  actionLabel?: string
  initialStep?: number
  exportUrl?: string
  defaultNotation?: UiNotation
  /** The slider values, when the caller keeps them (with `onSliders`); else the panel does. */
  sliders?: Readonly<Record<string, number>>
  onSliders?: (next: Readonly<Record<string, number>>) => void
}) {
  const t = useMessages()
  const [ownSliders, setOwnSliders] = useState<Readonly<Record<string, number>>>(() => defaultSliders(c))
  const sliders = heldSliders ?? ownSliders
  const [notation, setNotation] = useState<UiNotation>(defaultNotation ?? 'propositional')
  const [mode, setMode] = useState<'value' | 'probability'>('probability')
  const shown = useMemo(() => shownVariables(c), [c])
  const prior = useMemo(() => priorWithSliders(c, sliders), [c, sliders])
  const baseM = useMemo(() => marginals(c.model, prior), [c, prior])
  const base = baseM.p
  const onSlider = (id: string, p: number): void => {
    const next = { ...sliders, [id]: p }
    if (onSliders !== undefined) onSliders(next)
    else setOwnSliders(next)
  }
  const wrap = useRef<HTMLDivElement>(null)
  const narrow = useNarrow(wrap, 560)

  if (view === 'compare') {
    const own = seeDoPair(c)
    const pairs: readonly SeeDoPair[] = pair === undefined ? (own === undefined ? [] : [own]) : isPairList(pair) ? pair : [pair]
    if (pairs.length === 0) throw new Error(`case ${c.data.id} has no observe/do pair for the comparison`)
    return <Compare c={c} pairs={pairs} prior={prior} base={base} shown={shown} exportUrl={exportUrl} sliderSection={
      <SliderSection c={c} sliders={sliders} onSlider={onSlider} notation={notation} onNotation={setNotation} shown={shown} withHead={false} />
    } />
  }

  if (view === 'adjust') {
    if (adjust === undefined) throw new Error(`case ${c.data.id}: view="adjust" needs adjust { x, y }`)
    return (
      <AdjustPanel
        c={c}
        prior={prior}
        spec={adjust}
        shown={shown}
        exportUrl={exportUrl}
        sliderSection={<SliderSection c={c} sliders={sliders} onSlider={onSlider} notation={notation} onNotation={setNotation} shown={shown} withHead={false} />}
      />
    )
  }

  if (view === 'rules') {
    if (rules === undefined) throw new Error(`case ${c.data.id}: view="rules" needs rules (the steps)`)
    return <RulesPanel c={c} prior={prior} steps={rules} shown={shown} exportUrl={exportUrl} />
  }

  if (view === 'counterfactual') {
    if (counterfactual === undefined) throw new Error(`case ${c.data.id}: view="counterfactual" needs a counterfactual { evidence, do, event }`)
    return (
      <CfStepper
        c={c}
        prior={prior}
        shown={shown}
        spec={counterfactual}
        actionLabel={actionLabel}
        initialStep={initialStep}
        exportUrl={exportUrl}
        sliderSection={<SliderSection c={c} sliders={sliders} onSlider={onSlider} notation={notation} onNotation={setNotation} shown={shown} withHead={false} />}
      />
    )
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

function isPairList(pair: SeeDoPair | readonly SeeDoPair[]): pair is readonly SeeDoPair[] {
  return Array.isArray(pair)
}

interface CompareProps {
  readonly c: LoadedCase
  readonly pairs: readonly SeeDoPair[]
  readonly prior: ReturnType<typeof priorWithSliders>
  readonly base: Readonly<Record<string, number>>
  readonly shown: readonly string[]
  readonly sliderSection: ReactNode
  readonly exportUrl?: string
}

function Compare({ c, pairs, prior, base, shown, sliderSection, exportUrl }: CompareProps) {
  const t = useMessages()
  const root = useRef<HTMLDivElement>(null)
  const [picked, setPicked] = useState(0)
  const pair = pairs[Math.min(picked, pairs.length - 1)]
  const labels = pairs.map((p) => p.observe)
  const pairLabel = (p: SeeDoPair, i: number): string => (labels.indexOf(p.observe) === i && labels.lastIndexOf(p.observe) === i ? p.observe : `${p.observe} · ${doText(p.intervene)}`)
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
        <div className="ca-box-actions">
          {pairs.length > 1 && (
            <Segmented
              label={t.comparePick}
              options={pairs.map((p, i) => ({ value: String(i), label: pairLabel(p, i) }))}
              value={String(Math.min(picked, pairs.length - 1))}
              onChange={(v) => setPicked(Number(v))}
            />
          )}
          <ExportMenu source={exportSource} url={exportUrl} origins={originCitations(c)} />
        </div>
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
