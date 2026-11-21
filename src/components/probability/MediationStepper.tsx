import type { ReactNode } from 'react'
import { useMemo, useRef, useState } from 'react'
import type { LoadedCase } from '../../data/load.ts'
import type { Prior } from '../../engine/index.ts'
import { useDigits } from '../shared/digits.ts'
import { singleGraphSource } from '../export/export-render.tsx'
import type { ExportSource } from '../export/export-image.ts'
import { ExportMenu } from '../export/ExportMenu.tsx'
import type { Locale, Messages } from '../i18n/messages.ts'
import { useMessages } from '../i18n/messages.ts'
import { FigureTabs } from '../shared/FigureTabs.tsx'
import { NoIcon, OkIcon, Segmented, Tag, Tip } from '../shared/parts.tsx'
import { SignalGraph } from '../graph/SignalGraph.tsx'
import { Tex } from '../text/Tex.tsx'
import { Formula, MathProse, Rich } from '../text/typeset.tsx'
import { useNarrow } from '../shared/use-narrow.ts'
import { originCitations } from '../model/verdict-rows.ts'
import { assignmentText, probLegend } from '../model/wording.ts'
import type { MediationSpec, MediationStepNumber, MediationStepView } from './mediation-steps.ts'
import { cfText } from './cf-steps.ts'
import { effectText, mediationChecks, mediationView } from './mediation-steps.ts'

export interface MediationStepperProps {
  readonly c: LoadedCase
  readonly prior: Prior
  readonly shown: readonly string[]
  readonly spec: MediationSpec
  readonly actionLabel?: string
  readonly initialStep?: number
  readonly sliderSection: ReactNode
  readonly exportUrl?: string
}

const MED_DECOMPOSITION = 'TE = NDE − IE(reverse)'
const MED_MATH = {
  'TE = P(Y_x*) − P(Y_x)': 'TE=P(Y_{x^*})-P(Y_x)',
  'NDE = P(Y_{x*, Z_x}) − P(Y_x)': 'NDE=P(Y_{x^*,Z_x})-P(Y_x)',
  'NIE = P(Y_{x, Z_x*}) − P(Y_x)': 'NIE=P(Y_{x,Z_{x^*}})-P(Y_x)',
  'IE(reverse) = P(Y_{x*, Z_x}) − P(Y_x*)': 'IE(\\text{reverse})=P(Y_{x^*,Z_x})-P(Y_{x^*})',
  [MED_DECOMPOSITION]: 'TE=NDE-IE(\\text{reverse})',
  'P(x, z) = 0': 'P(x,z)=0',
  'P(x, z)': 'P(x,z)',
  x: 'x', X: 'X', NDE: 'NDE', NIE: 'NIE',
}

const STEPS: readonly MediationStepNumber[] = [1, 2, 3, 4]

/** Past this many backgrounds the table shows the first ones and a button for the rest. */
const MAX_ROWS = 8

/**
 * Direct and indirect effects (Pearl 2009, §4.5) in four steps on one graph: the total effect, the
 * controlled direct effect (a switch over the mediators' values), the natural direct effect and the
 * natural indirect effect, where each mediator is tagged as held at the value it takes under the
 * other treatment value (`Z←Z(X=0)`). Under the graph: every effect with the checks the lesson
 * reads, and the table of backgrounds with the four worlds each one evaluates.
 */
export function MediationStepper({ c, prior, shown, spec, actionLabel, initialStep = 1, sliderSection, exportUrl }: MediationStepperProps) {
  const t = useMessages()
  const digits = useDigits()
  const [step, setStep] = useState<MediationStepNumber>(() =>
    STEPS.includes(initialStep as MediationStepNumber) ? (initialStep as MediationStepNumber) : 1,
  )
  const [zAt, setZAt] = useState(0)
  const [all, setAll] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const narrow = useNarrow(wrap, 560)
  const view = useMemo(() => mediationView(c, prior, spec, shown), [c, prior, spec, shown])
  const checks = mediationChecks(view.result)
  const z = Math.min(zAt, view.controlled.length - 1)
  const current: MediationStepView = step === 2 ? view.controlled[z] : view.steps[step]
  const mediators = t.list(spec.mediators)
  const settingNow = step === 2 ? assignmentText(view.controlled[z].z) : ''
  const effectName = t.med.effect[step - 1]
  const head = t.med.head(view.transition, spec.outcome)
  const graph = (m: Messages, compact: boolean) => (
    <SignalGraph
      compact={compact}
      c={c}
      shown={shown}
      probs={current.graph.probs}
      dists={current.graph.dists}
      interventions={current.graph.interventions}
      tagText={current.natural}
      removedEdges={current.graph.removedEdges}
      title={m.med.graphTitle(c.data.title[m.locale], m.med.steps[step - 1])}
    />
  )
  const numbers = `${cfText(current.drawn.value)} − ${cfText(current.reference.value)}`
  const exportSource = (locale: Locale): ExportSource | undefined =>
    singleGraphSource(
      c,
      locale,
      t,
      wrap,
      digits,
      (m) => graph(m, narrow),
      (svg, m) => ({
        name: `${c.data.id}-mediation-${step}`,
        panels: [
          {
            svg,
            tags: [
              { text: m.med.kicker, tone: 'slate' },
              { text: m.med.head(view.transition, spec.outcome), tone: 'accent', mono: true },
            ],
            foot: `${m.med.effect[step - 1]} = ${numbers} = ${effectText(current.effect)}`,
            tint: step > 1,
          },
        ],
        legend: probLegend(m, c.model, shown),
      }),
    )

  const ok = (b: boolean): ReactNode => (b ? <OkIcon size={16} /> : <NoIcon size={16} />)
  const formula = view.result.formula
  const rows = view.result.worlds
  const shownRows = all || rows.length <= MAX_ROWS ? rows : rows.slice(0, MAX_ROWS)
  // The cells show whether the outcome event holds (1 or 0): label the column with the event unless it is Y=1.
  const outcomeEvent = /^\s*[^=\s]+\s*=\s*(.+?)\s*$/.exec(spec.outcome)?.[1]
  const outcomeId =
    view.outcomeVariable === undefined ? spec.outcome : outcomeEvent === '1' || outcomeEvent === 'true' ? view.outcomeVariable : `[${spec.outcome}]`
  const xAt = (x: string): string => `${spec.treatment}=${x}`
  const mediatorId = spec.mediators.join(', ')
  return (
    <div
      className="ca-root not-prose ca-panel ca-prob ca-cf ca-med"
      data-case={c.data.id}
      data-view="mediation"
      data-step={step}
      lang={t.locale}
    >
      <div className={`ca-box ca-graph-box${step > 1 ? ' is-cf' : ''}`}>
        <div className="ca-box-head">
          <div className="ca-tags">
            <Tag tone="slate">{t.med.kicker}</Tag>
            <Tag tone="accent" mono>
              <Rich text={head} ids={c.model.byId} />
            </Tag>
            {actionLabel !== undefined && <span className="ca-cf-label">{actionLabel}</span>}
          </div>
          <div className="ca-box-actions">
            <Segmented
              label={t.med.stepsLabel}
              options={STEPS.map((n) => ({ value: String(n), label: `${n} ${t.med.steps[n - 1]}` }))}
              value={String(step)}
              onChange={(v) => setStep(Number(v) as MediationStepNumber)}
            />
            <button type="button" className="ca-link" onClick={() => setStep(step === 4 ? 1 : ((step + 1) as MediationStepNumber))}>
              {step === 4 ? t.lanes.again : t.med.next}
            </button>
            <ExportMenu source={exportSource} url={exportUrl} origins={originCitations(c)} />
          </div>
        </div>
        {step === 2 && view.controlled.length > 1 && (
          <div className="ca-med-z">
            <Segmented
              label={t.med.mediatorsLabel}
              options={view.controlled.map((entry, i) => ({ value: String(i), label: assignmentText(entry.z) }))}
              value={String(z)}
              onChange={(v) => setZAt(Number(v))}
            />
          </div>
        )}
        <div className="ca-graph-wrap" ref={wrap}>
          {graph(t, narrow)}
        </div>
        <p className="ca-cf-caption">
          <Rich text={t.med.caption(step, spec.treatment, view.fromText, view.toText, mediators, settingNow)} ids={c.model.byId} />
        </p>
        <div className="ca-cf-result">
          <code className="ca-mono ca-muted ca-small" data-testid="med-expression">
            <Tex
              tex={`${current.drawn.term.latex} - ${current.reference.term.latex}`}
              text={`${current.drawn.term.text} − ${current.reference.term.text}`}
            />
          </code>
          <p className="ca-mono ca-small ca-muted" data-testid="med-numbers">
            {numbers}
          </p>
          <p className="ca-big ca-mono" data-testid="med-value" data-effect={effectName}>
            {effectText(current.effect)}
          </p>
        </div>
        <FigureTabs
          initial="effects"
          blocks={[
            {
              id: 'effects',
              label: t.tab.effects,
              children: (
                <>
                  <div className="ca-scroll-x">
                    <table className="ca-cf-table ca-med-effects" data-testid="med-effects">
                      <thead>
                        <tr>
                          <th scope="col">{t.med.effectsHead.effect}</th>
                          <th scope="col">{t.med.effectsHead.value}</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr data-effect="total">
                          <th scope="row">{t.med.effect[0]}</th>
                          <td className="ca-mono" data-value={view.result.total}>
                            {effectText(view.result.total)}
                          </td>
                        </tr>
                        {view.result.controlled.map((entry) => (
                          <tr key={assignmentText(entry.z)} data-effect="controlled" data-z={assignmentText(entry.z)}>
                            <th scope="row"><Rich text={t.med.controlledAt(assignmentText(entry.z))} ids={c.model.byId} /></th>
                            <td className="ca-mono" data-value={entry.value}>
                              {effectText(entry.value)}
                            </td>
                          </tr>
                        ))}
                        <tr data-effect="natural-direct">
                          <th scope="row">{t.med.effect[2]}</th>
                          <td className="ca-mono" data-value={view.result.naturalDirect}>
                            {effectText(view.result.naturalDirect)}
                          </td>
                        </tr>
                        <tr data-effect="natural-indirect">
                          <th scope="row">{t.med.effect[3]}</th>
                          <td className="ca-mono" data-value={view.result.naturalIndirect}>
                            {effectText(view.result.naturalIndirect)}
                          </td>
                        </tr>
                        <tr data-effect="reverse-indirect">
                          <th scope="row">{t.med.reverse}</th>
                          <td className="ca-mono" data-value={view.result.reverseIndirect}>
                            {effectText(view.result.reverseIndirect)}
                          </td>
                        </tr>
                        <tr data-effect="decomposition" data-ok={checks.decomposes ? 'true' : 'false'}>
                          <th scope="row"><Tex tex={MED_MATH[MED_DECOMPOSITION]} text={t.med.decomposition} /></th>
                          <td className="ca-mono">
                            {t.med.decomposes(
                              effectText(view.result.total),
                              effectText(view.result.naturalDirect),
                              effectText(view.result.reverseIndirect),
                            )}{' '}
                            {ok(checks.decomposes)}
                          </td>
                        </tr>
                        {formula !== undefined && (
                          <>
                            <tr data-effect="formula-direct" data-check={checks.formulaDirect}>
                              <th scope="row">{t.med.formulaDirect}</th>
                              <td className="ca-mono" data-value={formula.direct ?? ''}>
                                {formula.direct === undefined ? t.med.undefinedCell : effectText(formula.direct)}
                                {checks.formulaDirect !== 'undefined' && (
                                  <>
                                    {' '}
                                    <Tex tex={checks.formulaDirect === 'equal' ? '=NDE' : '\\neq NDE'} text={checks.formulaDirect === 'equal' ? t.med.equal('NDE') : t.med.differ('NDE')} />{' '}
                                    {ok(checks.formulaDirect === 'equal')}
                                  </>
                                )}
                              </td>
                            </tr>
                            <tr data-effect="formula-indirect" data-check={checks.formulaIndirect}>
                              <th scope="row">{t.med.formulaIndirect}</th>
                              <td className="ca-mono" data-value={formula.indirect ?? ''}>
                                {formula.indirect === undefined ? t.med.undefinedCell : effectText(formula.indirect)}
                                {checks.formulaIndirect !== 'undefined' && (
                                  <>
                                    {' '}
                                    <Tex tex={checks.formulaIndirect === 'equal' ? '=NIE' : '\\neq NIE'} text={checks.formulaIndirect === 'equal' ? t.med.equal('NIE') : t.med.differ('NIE')} />{' '}
                                    {ok(checks.formulaIndirect === 'equal')}
                                  </>
                                )}
                              </td>
                            </tr>
                          </>
                        )}
                      </tbody>
                    </table>
                  </div>
                  {formula !== undefined && formula.missing.length > 0 && (
                    <p className="ca-small ca-muted" data-testid="med-missing">
                      <Rich text={t.med.missing(t.list(formula.missing.map((cell) => assignmentText(cell))))} ids={c.model.byId} />
                    </p>
                  )}
                  <p className="ca-small ca-muted">
                    <Tip tip={<MathProse text={t.med.tip} math={MED_MATH} />} label={t.moreInfo} />
                  </p>
                </>
              ),
            },
            {
              id: 'background',
              label: t.tab.background,
              children: (
                <>
                  <table className="ca-cf-table ca-med-background" data-testid="med-background">
                    <thead>
                      <tr>
                        <th scope="col"><Rich text={t.cf.background(c.model.exogenous)} ids={c.model.byId} /></th>
                        <th scope="col">{t.med.background.p}</th>
                        <th scope="col">
                          <Formula text={t.med.background.zAt(mediatorId, xAt(view.fromText))} />
                        </th>
                        <th scope="col">
                          <Formula text={t.med.background.zAt(mediatorId, xAt(view.toText))} />
                        </th>
                        <th scope="col">
                          <Formula text={t.med.background.yAt(outcomeId, xAt(view.fromText))} />
                        </th>
                        <th scope="col">
                          <Formula text={t.med.background.yAt(outcomeId, xAt(view.toText))} />
                        </th>
                        <th scope="col">
                          <Formula text={t.med.background.yAtZ(outcomeId, xAt(view.toText), `${mediatorId}(${xAt(view.fromText)})`)} />
                        </th>
                        <th scope="col">
                          <Formula text={t.med.background.yAtZ(outcomeId, xAt(view.fromText), `${mediatorId}(${xAt(view.toText)})`)} />
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {shownRows.map((w) => (
                        <tr key={assignmentText(w.context)} data-background={assignmentText(w.context)}>
                          <th scope="row">
                            <Formula text={assignmentText(w.context)} />
                          </th>
                          <td className="ca-mono" data-p={w.p.toFixed(6)}>
                            {cfText(w.p)}
                          </td>
                          <td className="ca-mono" data-z-from="">
                            <Formula text={assignmentText(w.zFrom)} />
                          </td>
                          <td className="ca-mono" data-z-to="">
                            <Formula text={assignmentText(w.zTo)} />
                          </td>
                          <td className="ca-mono" data-y="from">
                            {w.yFrom ? 1 : 0}
                          </td>
                          <td className="ca-mono" data-y="to">
                            {w.yTo ? 1 : 0}
                          </td>
                          <td className="ca-mono" data-y="to-z-from">
                            {w.yToZFrom ? 1 : 0}
                          </td>
                          <td className="ca-mono" data-y="from-z-to">
                            {w.yFromZTo ? 1 : 0}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {rows.length > MAX_ROWS && (
                    <p className="ca-small">
                      <button type="button" className="ca-link" aria-expanded={all} onClick={() => setAll(!all)}>
                        {all ? t.med.fewer : t.med.showAll(rows.length)}
                      </button>
                    </p>
                  )}
                </>
              ),
            },
            { id: 'probabilities', label: t.probEquations, children: sliderSection },
          ]}
        />
      </div>
    </div>
  )
}
