import type { ReactNode } from 'react'
import { useRef, useState } from 'react'
import type { LoadedCase } from '../../data/load.ts'
import type { Prior } from '../../engine/index.ts'
import { formatValue } from '../../engine/values.ts'
import type { CfStepNumber, CounterfactualSpec } from './cf-steps.ts'
import { cfText, cfView } from './cf-steps.ts'
import { graphExport } from '../export/export-render.tsx'
import type { ExportSource } from '../export/export-image.ts'
import { ExportMenu } from '../export/ExportMenu.tsx'
import type { Locale, Messages } from '../i18n/messages.ts'
import { messagesFor, useMessages } from '../i18n/messages.ts'
import { Disclosure, Segmented, Tag } from '../shared/parts.tsx'
import { SignalGraph } from '../graph/SignalGraph.tsx'
import { Tex } from '../text/Tex.tsx'
import { Formula, Rich } from '../text/typeset.tsx'
import { useNarrow } from '../shared/use-narrow.ts'
import { originCitations, originSources } from '../model/verdict-rows.ts'
import { assignmentText, doText, fixed, probLegend } from '../model/wording.ts'

export interface CfStepperProps {
  readonly c: LoadedCase
  readonly prior: Prior
  readonly shown: readonly string[]
  readonly spec: CounterfactualSpec
  readonly actionLabel?: string
  readonly initialStep?: number
  readonly sliderSection: ReactNode
  readonly exportUrl?: string
}

const STEPS: readonly CfStepNumber[] = [1, 2, 3]

/**
 * The counterfactual in three steps on one graph (abduction, action, prediction), with the table
 * of backgrounds the lesson reads: each background's prior, its probability given the evidence,
 * and in the last step the event variable after do().
 */
export function CfStepper({ c, prior, shown, spec, actionLabel, initialStep = 1, sliderSection, exportUrl }: CfStepperProps) {
  const t = useMessages()
  const [step, setStep] = useState<CfStepNumber>(() => (STEPS.includes(initialStep as CfStepNumber) ? (initialStep as CfStepNumber) : 1))
  const wrap = useRef<HTMLDivElement>(null)
  const narrow = useNarrow(wrap, 560)
  const view = cfView(t, c, prior, spec, shown)
  const g = view.graphs[step]
  // `X=1 and Y=1` reads `X=1, Y=1` in the head and the table.
  const evidence = spec.evidence.replace(/\s+and\s+/g, ', ')
  const head = t.cf.head(evidence, doText(spec.do))
  const ids = c.model.byId
  const graph = (m: Messages, compact: boolean) => (
    <SignalGraph
      compact={compact}
      c={c}
      shown={shown}
      probs={g.probs}
      dists={g.dists}
      probNotes={g.notes}
      observed={Object.keys(g.observed)}
      observedValues={g.observed}
      interventions={g.interventions}
      removedEdges={g.removedEdges}
      title={m.cf.graphTitle(c.data.title[m.locale], m.cf.steps[step - 1])}
    />
  )
  const exportSource = (locale: Locale): ExportSource | undefined => {
    const m = messagesFor(locale)
    const { svg, dispose } = graphExport(locale, t, () => wrap.current?.querySelector<SVGSVGElement>('svg.ca-graph'), () => graph(m, narrow))
    if (svg === null) {
      dispose?.()
      return undefined
    }
    return {
      name: `${c.data.id}-counterfactual-${step}`,
      title: c.data.title[locale],
      panels: [
        {
          svg,
          tags: [
            { text: m.cf.kicker, tone: 'slate' },
            { text: m.cf.head(evidence, doText(spec.do)), tone: 'accent', mono: true },
          ],
          foot: step === 3 ? `${view.expression.text} = ${cfText(view.probability)}` : m.cf.steps[step - 1],
          tint: step > 1,
        },
      ],
      legend: probLegend(m, c.model, shown),
      origin: originSources(m, c),
      originCitations: originCitations(c),
      dispose,
    }
  }
  return (
    <div className="ca-root not-prose ca-panel ca-prob ca-cf" data-case={c.data.id} data-view="counterfactual" data-step={step} lang={t.locale}>
      <div className={`ca-box ca-graph-box${step > 1 ? ' is-cf' : ''}`}>
        <div className="ca-box-head">
          <div className="ca-tags">
            <Tag tone="slate">{t.cf.kicker}</Tag>
            <Tag tone="accent" mono>
              <Rich text={head} ids={ids} />
            </Tag>
            {actionLabel !== undefined && <span className="ca-cf-label">{actionLabel}</span>}
          </div>
          <div className="ca-box-actions">
            <Segmented
              label={t.cf.stepsLabel}
              options={STEPS.map((n) => ({ value: String(n), label: `${n} ${t.cf.steps[n - 1]}` }))}
              value={String(step)}
              onChange={(v) => setStep(Number(v) as CfStepNumber)}
            />
            <button type="button" className="ca-link" onClick={() => setStep(step === 3 ? 1 : ((step + 1) as CfStepNumber))}>
              {step === 3 ? t.lanes.again : t.cf.next}
            </button>
            <ExportMenu source={exportSource} url={exportUrl} origins={originCitations(c)} />
          </div>
        </div>
        <div className="ca-graph-wrap" ref={wrap}>
          {graph(t, narrow)}
        </div>
        <p className="ca-cf-caption">
          <Rich text={t.cf.caption(step, evidence, assignmentText(spec.do))} ids={ids} />
        </p>
      </div>
      <div className="ca-box ca-cf-table-box">
        <table className="ca-cf-table">
          <thead>
            <tr>
              <th scope="col">{t.cf.background(c.model.exogenous)}</th>
              <th scope="col">{t.cf.prior}</th>
              <th scope="col">
                <Rich text={t.cf.given(evidence)} ids={ids} />
              </th>
              {step === 3 && (
                <th scope="col">
                  <Rich text={t.cf.after(doText(spec.do), view.eventVariable ?? spec.event)} ids={ids} />
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {view.rows.map((r) => {
              const zero = r.posterior === 0
              const holds = step === 3 && r.eventHolds === true && !zero
              return (
                <tr
                  key={assignmentText(r.context)}
                  data-background={assignmentText(r.context)}
                  data-zero={zero ? 'true' : undefined}
                  data-event={holds ? 'true' : undefined}
                  className={`${zero ? 'is-zero' : ''}${holds ? ' is-event' : ''}`}
                >
                  <th scope="row">
                    <Formula text={assignmentText(r.context)} />
                  </th>
                  <td className="ca-mono">{cfText(r.prior)}</td>
                  <td className="ca-mono" data-posterior={fixed(r.posterior, 4)}>
                    {zero ? '0' : cfText(r.posterior)}
                    {!zero && <span className="ca-cf-bar" style={{ width: `${Math.max(2, Math.round(r.posterior * 60))}px` }} aria-hidden="true" />}
                  </td>
                  {step === 3 && (
                    <td className="ca-mono" data-cf-value="">
                      {zero ? '—' : r.after !== undefined ? formatValue(r.after) : r.eventHolds === true ? t.holds : '—'}
                    </td>
                  )}
                </tr>
              )
            })}
            {view.hiddenZero > 0 && (
              <tr className="is-zero" data-hidden-zero={view.hiddenZero}>
                <td colSpan={step === 3 ? 4 : 3}>{t.cf.hiddenZero(view.hiddenZero)}</td>
              </tr>
            )}
          </tbody>
        </table>
        {step === 3 && (
          <div className="ca-cf-result">
            <code className="ca-mono ca-muted ca-small" data-testid="cf-expression">
              <Tex tex={view.expression.latex} text={view.expression.text} />
            </code>
            <p className="ca-big ca-mono" data-testid="cf-value">
              {cfText(view.probability)}
            </p>
          </div>
        )}
      </div>
      <Disclosure kicker="" title={t.probEquations} className="ca-compare-more">
        {sliderSection}
      </Disclosure>
    </div>
  )
}
