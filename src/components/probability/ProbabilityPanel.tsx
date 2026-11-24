import { useMemo, useRef, useState } from 'react'
import type { LoadedCase } from '../../data/load.ts'
import type { ModelDoc } from '../../data/schema.ts'
import { evaluate } from '../../engine/index.ts'
import { singleGraphSource } from '../export/export-render.tsx'
import { CaseGate } from '../model/CaseGate.tsx'
import { casesOf } from '../model/cases-of.ts'
import { useCaseOrDoc } from '../model/doc-case.ts'
import type { ExportSource } from '../export/export-image.ts'
import { ExportMenu } from '../export/ExportMenu.tsx'
import type { Locale, Messages } from '../i18n/messages.ts'
import { LocaleScope, useMessages } from '../i18n/messages.ts'
import type { UiNotation } from '../model/notation.ts'
import { DigitsScope, useDigits } from '../shared/digits.ts'
import { FigureTabs } from '../shared/FigureTabs.tsx'
import { DocProblems, Segmented, Tag } from '../shared/parts.tsx'
import { SignalGraph } from '../graph/SignalGraph.tsx'
import type { AdjustSpec } from './AdjustPanel.tsx'
import { AdjustPanel } from './AdjustPanel.tsx'
import type { RuleStep } from './rules-view.ts'
import { RulesPanel } from './RulesPanel.tsx'
import type { CounterfactualSpec } from './cf-steps.ts'
import { CfStepper } from './CfStepper.tsx'
import type { MediationSpec } from './mediation-steps.ts'
import { MediationStepper } from './MediationStepper.tsx'
import { useNarrow } from '../shared/use-narrow.ts'
import type { SeeDoPair } from '../model/verdict-rows.ts'
import { originCitations, seeDoPair } from '../model/verdict-rows.ts'
import { shownVariables } from '../model/shown-variables.ts'
import { defaultSliders, marginals, priorWithSliders } from '../model/probability-view.ts'
import { probLegend } from '../model/wording.ts'
import { ComparePanel } from './ComparePanel.tsx'
import { SliderBlock, SliderEquations, SliderSection } from './SliderSection.tsx'

export type ProbabilityView = 'sliders' | 'compare' | 'counterfactual' | 'adjust' | 'rules' | 'mediation'

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
   * For `mediation`: the treatment X, its mediators Z⃗, the outcome event and the transition
   * `from` → `to`, e.g. `{ treatment: 'X', mediators: ['Z'], outcome: 'Y=1', from: 0, to: 1 }`;
   * `formula: true` adds the mediation formula (Pearl 2009, 4.17 and 4.18) beside the natural
   * effects. Four steps on one graph: 總效應, 受控直接, 自然直接 and 自然間接 (a mediator held at
   * the value it takes under the other treatment value is tagged `Z←Z(X=0)`); under the graph the
   * 效應 tab lists every effect and the check TE = NDE − IE(reverse), the 背景 tab each background's
   * four worlds.
   */
  readonly mediation?: MediationSpec
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
  /** For `counterfactual` and `mediation`: the question in words, beside the formula in the head. */
  readonly actionLabel?: string
  /** The step shown first: for `counterfactual` 1 (abduction, default), 2 (action) or 3 (prediction); for `mediation` 1 (total effect, default) to 4 (natural indirect). */
  readonly initialStep?: number
  /** Link in the exported image's watermark. */
  readonly exportUrl?: string
  /**
   * Decimals of the probability under each node (and a stochastic do()'s tag, a bar chart's top
   * value, the 原本 notes, and in `compare` the two result numbers): a whole number from 1 to 6.
   * Default 2. Set it to the digits the text quotes, e.g. 3 for 0.175; a number within 10^-digits
   * of 0 or 1 still gets two significant digits of its distance from that end. Equation and table
   * numbers keep their own precision.
   */
  readonly digits?: number
  /** Interface language. Default: the surrounding LocaleProvider's, else zh-TW. */
  readonly locale?: Locale
}

/** Direction 1 probability mode: per-exogenous p sliders; node fill is P(V=1); observing vs do() side by side. */
export function ProbabilityPanel({ locale, digits, ...props }: ProbabilityPanelProps) {
  return (
    <LocaleScope locale={locale}>
      <DigitsScope digits={digits}>
        <CaseGate ids={casesOf(props.caseId, [props.doc])}>
          <ProbabilityPanelResolved {...props} />
        </CaseGate>
      </DigitsScope>
    </LocaleScope>
  )
}

function ProbabilityPanelResolved({ caseId, doc, ...props }: Omit<ProbabilityPanelProps, 'locale' | 'digits'>) {
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
  mediation,
}: {
  c: LoadedCase
  view?: ProbabilityView
  pair?: SeeDoPair | readonly SeeDoPair[]
  adjust?: AdjustSpec
  rules?: readonly RuleStep[]
  counterfactual?: CounterfactualSpec
  mediation?: MediationSpec
  actionLabel?: string
  initialStep?: number
  exportUrl?: string
  defaultNotation?: UiNotation
  /** The slider values, when the caller keeps them (with `onSliders`); else the panel does. */
  sliders?: Readonly<Record<string, number>>
  onSliders?: (next: Readonly<Record<string, number>>) => void
}) {
  const t = useMessages()
  const digits = useDigits()
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
    return <ComparePanel c={c} pairs={pairs} prior={prior} base={base} shown={shown} exportUrl={exportUrl} sliderSection={
      <SliderSection c={c} sliders={sliders} onSlider={onSlider} notation={notation} onNotation={setNotation} shown={shown} />
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
        sliderSection={<SliderSection c={c} sliders={sliders} onSlider={onSlider} notation={notation} onNotation={setNotation} shown={shown} />}
      />
    )
  }

  if (view === 'rules') {
    if (rules === undefined) throw new Error(`case ${c.data.id}: view="rules" needs rules (the steps)`)
    return <RulesPanel c={c} prior={prior} steps={rules} shown={shown} exportUrl={exportUrl} />
  }

  if (view === 'mediation') {
    if (mediation === undefined) throw new Error(`case ${c.data.id}: view="mediation" needs a mediation { treatment, mediators, outcome, from, to }`)
    return (
      <MediationStepper
        c={c}
        prior={prior}
        shown={shown}
        spec={mediation}
        actionLabel={actionLabel}
        initialStep={initialStep}
        exportUrl={exportUrl}
        sliderSection={<SliderSection c={c} sliders={sliders} onSlider={onSlider} notation={notation} onNotation={setNotation} shown={shown} />}
      />
    )
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
        sliderSection={<SliderSection c={c} sliders={sliders} onSlider={onSlider} notation={notation} onNotation={setNotation} shown={shown} />}
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
  const exportSource = (locale: Locale): ExportSource | undefined =>
    singleGraphSource(c, locale, t, wrap, digits, graph, (svg, m) => ({
      name: `${c.data.id}-probability`,
      panels: [{ svg, tags: [{ text: showValues ? m.actualWorld : m.probability, tone: 'fg' as const }] }],
      legend: showValues ? m.valueLegend : probLegend(m, c.model, shown),
    }))
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
        <div className="ca-prob-sliders">
          <SliderBlock c={c} sliders={sliders} onSlider={onSlider} />
        </div>
        <FigureTabs
          blocks={[
            {
              id: 'equations',
              label: t.equations,
              children: <SliderEquations c={c} sliders={sliders} notation={notation} onNotation={setNotation} shown={shown} />,
            },
          ]}
        />
      </div>
    </div>
  )
}

function isPairList(pair: SeeDoPair | readonly SeeDoPair[]): pair is readonly SeeDoPair[] {
  return Array.isArray(pair)
}
