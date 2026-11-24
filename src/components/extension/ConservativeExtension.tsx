import { useMemo, useState } from 'react'
import type { LoadedCase } from '../../data/load.ts'
import type { Assignment } from '../../engine/index.ts'
import { formatValue, valuesEqual } from '../../engine/index.ts'
import { SignalGraph } from '../graph/SignalGraph.tsx'
import type { Locale, Messages } from '../i18n/messages.ts'
import { LocaleScope, useMessages } from '../i18n/messages.ts'
import { CaseGate } from '../model/CaseGate.tsx'
import { casesOf } from '../model/cases-of.ts'
import { shownVariables } from '../model/shown-variables.ts'
import type { VerdictQuery } from '../model/verdict-rows.ts'
import { assignmentText, doText } from '../model/wording.ts'
import { DocProblems, Progress, Tag } from '../shared/parts.tsx'
import { Rich } from '../text/typeset.tsx'
import type { ExtensionModel } from './extension-view.ts'
import { NO_CONTEXT, checkPair, clickDo, oldVariables, resolveModels, solveIn, startContext, verdictLines, verdictText } from './extension-view.ts'

export type { ExtensionModel } from './extension-view.ts'

export interface ConservativeExtensionProps {
  /**
   * The models, each a bundled case id (e.g. `rock-throwing`) or a model document. Two: the pair,
   * the second checked as a conservative extension of the first. More: a sequence M1 … Mn, stepped
   * through one pair (Mk, Mk+1) at a time.
   */
  readonly models: readonly ExtensionModel[]
  /** Short names of the models, in order; default M1, M2, … */
  readonly names?: readonly string[]
  /**
   * Actual-cause questions, as `CausalPlayground`'s (`{ cause: 'B=1', effect: 'VS=1' }`): a table
   * under the graphs gives each model's verdict per standard in its own actual context, so a verdict
   * that flips along the sequence shows.
   */
  readonly verdicts?: readonly VerdictQuery[]
  /** The step shown first in a sequence, 1 to n − 1 (step k compares Mk with Mk+1). Default 1. */
  readonly initialStep?: number
  /** do() on old variables at the start; each step keeps those its base model has. */
  readonly initialInterventions?: Assignment
  /** The context both graphs are solved in. Default the first model's actual context, else the next one's. */
  readonly context?: Assignment
  /** Interface language. Default: the surrounding LocaleProvider's, else zh-TW. */
  readonly locale?: Locale
}

/**
 * Conservative extensions (Halpern 2016, Def. 4.2.1): a model beside its extension, both solved in
 * the same context under the reader's do() on old variables, a line per old variable saying whether
 * its value agrees, and the verdict over every context and intervention; with more models, a
 * stepper through the sequence.
 */
export function ConservativeExtension({ locale, ...props }: ConservativeExtensionProps) {
  return (
    <LocaleScope locale={locale}>
      <CaseGate ids={casesOf(undefined, props.models)}>
        <ExtensionBody {...props} />
      </CaseGate>
    </LocaleScope>
  )
}

function ExtensionBody({ models, ...props }: Omit<ConservativeExtensionProps, 'locale'>) {
  const resolved = useMemo(() => resolveModels(models), [models])
  if (!resolved.ok) return <DocProblems problems={resolved.problems} />
  const context = startContext(resolved.cases, props.context)
  if (context === undefined) return <DocProblems problems={[NO_CONTEXT]} />
  return <ExtensionFor cases={resolved.cases} startAt={context} {...props} />
}

const NONE: Assignment = {}

function ExtensionFor({
  cases,
  startAt,
  names: givenNames,
  verdicts,
  initialStep = 1,
  initialInterventions = NONE,
}: Omit<ConservativeExtensionProps, 'locale' | 'models' | 'context'> & { readonly cases: readonly LoadedCase[]; readonly startAt: Assignment }) {
  const t = useMessages()
  const steps = cases.length - 1
  const names = useMemo(() => cases.map((_, i) => givenNames?.[i] ?? t.ext.modelName(i + 1)), [cases, givenNames, t])
  const [step, setStep] = useState(() => Math.min(steps, Math.max(1, Math.round(initialStep))))
  const [context, setContext] = useState<Assignment>(startAt)
  const [chosen, setChosen] = useState<Assignment>(initialInterventions)
  const [hover, setHover] = useState<string>()
  const base = cases[step - 1]
  const extension = cases[step]
  const baseName = names[step - 1]
  const extName = names[step]
  const old = oldVariables(base, extension)
  const interventions = Object.fromEntries(Object.entries(chosen).filter(([id]) => old.includes(id)))
  const ids = useMemo(() => new Set([...cases.flatMap((c) => [...c.model.byId.keys()]), ...names]), [cases, names])
  const results = useMemo(() => cases.slice(1).map((c, i) => checkPair(t, cases[i], c, startAt)), [t, cases, startAt])
  const result = results[step - 1]
  const lines = useMemo(() => (verdicts === undefined ? [] : verdictLines(t, cases, verdicts)), [t, cases, verdicts])
  const added = typeof result === 'string' || result.kind === 'precondition' ? extension.model.variables.filter((v) => v.kind === 'endogenous' && !base.model.byId.has(v.id)).map((v) => v.id) : result.added
  const a = solveIn(base, context, interventions)
  const b = solveIn(extension, context, interventions)
  const pick = (id: string): void => setChosen(clickDo(base, context, interventions, id))
  const shownContext = Object.fromEntries(base.model.exogenous.map((id) => [id, a.values[id]]))
  const go = (next: number): void => setStep(Math.min(steps, Math.max(1, next)))
  const graph = (c: LoadedCase, name: string, world: ReturnType<typeof solveIn>, fresh: readonly string[]) => (
    <SignalGraph
      c={c}
      shown={shownVariables(c)}
      values={world.values}
      original={world.original}
      interventions={world.interventions}
      removedEdges={world.removedEdges}
      fresh={fresh}
      nodeNotes={Object.fromEntries(fresh.map((id) => [id, t.ext.newNode]))}
      onPick={pick}
      pickable={old}
      pickHint={t.ext.hint(baseName)}
      lit={hover === undefined ? NO_IDS : [hover]}
      onHover={setHover}
      compact
      title={t.ext.graphTitle(name, c.data.title[t.locale])}
    />
  )
  const side = (which: 'base' | 'extension', c: LoadedCase, name: string, world: ReturnType<typeof solveIn>, fresh: readonly string[]) => (
    <div className="ca-ext-side" data-side={which} data-model={name}>
      <div className="ca-box-head">
        <div className="ca-tags">
          <Tag tone={which === 'base' ? 'outline' : 'slate'}>
            <Rich text={name} ids={ids} />
          </Tag>
          <span className="ca-small ca-muted">{c.data.title[t.locale]}</span>
        </div>
      </div>
      <div className="ca-graph-wrap">{graph(c, name, world, fresh)}</div>
    </div>
  )
  const counter = typeof result !== 'string' && result.kind === 'counterexample' ? result.counterexample : undefined
  const onCounter = counter !== undefined && sameSetting(counter.context, shownContext) && sameSetting(counter.interventions, interventions)
  return (
    <div className="ca-root not-prose ca-ext" lang={t.locale} data-step={step} data-steps={steps} role="group" aria-label={t.ext.figure(baseName, extName)}>
      <div className="ca-panel">
        {steps > 1 && (
          <div className="ca-box ca-ext-stepper">
            <button type="button" className="ca-btn ca-btn-outline" data-ext-prev="" disabled={step === 1} onClick={() => go(step - 1)}>
              {t.ext.prev}
            </button>
            <Progress step={step} total={steps} />
            <span className="ca-ext-step-pair" aria-live="polite">
              <Rich text={t.ext.stepPair(baseName, extName)} ids={ids} />
            </span>
            <button type="button" className="ca-btn ca-btn-outline" data-ext-next="" disabled={step === steps} onClick={() => go(step + 1)}>
              {t.ext.next}
            </button>
          </div>
        )}
        <div className="ca-ext-pair">
          {side('base', base, baseName, a, NO_IDS)}
          {side('extension', extension, extName, b, added)}
        </div>
        <div className="ca-box ca-ext-legend ca-legend">
          {added.length > 0 && (
            <p>
              <svg width="18" height="18" viewBox="-9 -9 18 18" aria-hidden="true" className="ca-ext-swatch">
                <circle r="7" className="ca-new-ring" />
              </svg>{' '}
              <Rich text={t.ext.newLegend(extName, t.list(added))} ids={ids} />
            </p>
          )}
          <p>{t.ext.oldLegend}</p>
          <p>
            <Rich text={t.ext.hint(baseName)} ids={ids} />
          </p>
        </div>
        <div className="ca-box ca-ext-now">
          <p className="ca-ext-setting">
            <Rich text={t.ext.setting(assignmentText(shownContext), Object.keys(interventions).length === 0 ? undefined : doText(interventions))} ids={ids} />
            {Object.keys(interventions).length > 0 && (
              <>
                {' '}
                <button type="button" className="ca-link" data-ext-clear="" onClick={() => setChosen(NONE)}>
                  {t.ext.clear}
                </button>
              </>
            )}
          </p>
          <div className="ca-table-wrap">
            <table className="ca-table ca-ext-agree" data-testid="ext-agree">
              <thead>
                <tr>
                  <th scope="col">{t.ext.oldHead}</th>
                  <th scope="col">
                    <Rich text={baseName} ids={ids} />
                  </th>
                  <th scope="col">
                    <Rich text={extName} ids={ids} />
                  </th>
                  <th scope="col">{t.ext.agreeHead}</th>
                </tr>
              </thead>
              <tbody>
                {old.map((id) => {
                  const same = valuesEqual(a.values[id], b.values[id])
                  return (
                    <tr key={id} data-old={id} data-ok={same ? 'true' : 'false'}>
                      <th scope="row">
                        <Rich text={id} ids={ids} />
                      </th>
                      <td className="ca-mono">{formatValue(a.values[id])}</td>
                      <td className="ca-mono">{formatValue(b.values[id])}</td>
                      <td>{same ? t.ext.agree : t.ext.differ}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
        <div className="ca-box ca-ext-verdict" role="status" data-verdict={typeof result === 'string' ? 'error' : result.kind}>
          <p>
            <Rich text={typeof result === 'string' ? result : verdictText(t, result, baseName, extName)} ids={ids} />
          </p>
          {counter !== undefined && !onCounter && (
            <button
              type="button"
              className="ca-btn ca-btn-outline"
              data-ext-show=""
              onClick={() => {
                setContext(counter.context)
                setChosen(counter.interventions)
              }}
            >
              {t.ext.showCounterexample}
            </button>
          )}
        </div>
        {(steps > 1 || lines.length > 0) && <Overview t={t} names={names} ids={ids} step={step} results={results} lines={lines} onStep={steps > 1 ? go : undefined} />}
      </div>
    </div>
  )
}

/** The row over all models: whether each extends the one before, and each standard's verdict. */
function Overview({
  t,
  names,
  ids,
  step,
  results,
  lines,
  onStep,
}: {
  readonly t: Messages
  readonly names: readonly string[]
  readonly ids: ReadonlySet<string>
  readonly step: number
  readonly results: readonly ReturnType<typeof checkPair>[]
  readonly lines: ReturnType<typeof verdictLines>
  readonly onStep?: (step: number) => void
}) {
  const current = (i: number): boolean => i === step - 1 || i === step
  return (
    <div className="ca-box ca-ext-overview">
      <div className="ca-table-wrap">
        <table className="ca-table" data-testid="ext-overview">
          <thead>
            <tr>
              <th scope="col">{t.ext.rowHead}</th>
              {names.map((name, i) => (
                <th key={name} scope="col" data-current={current(i) ? 'true' : undefined} title={current(i) ? t.ext.current : undefined}>
                  {onStep !== undefined && i > 0 && !current(i) ? (
                    <button type="button" className="ca-link" onClick={() => onStep(i)}>
                      <Rich text={name} ids={ids} />
                    </button>
                  ) : (
                    <Rich text={name} ids={ids} />
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr data-row="extends">
              <th scope="row">{t.ext.extendsRow}</th>
              {names.map((name, i) => {
                const r = i === 0 ? undefined : results[i - 1]
                const text = r === undefined || typeof r === 'string' ? t.ext.extendsNone : r.conservative ? t.ext.extendsYes : t.ext.extendsNo
                return (
                  <td key={name} data-current={current(i) ? 'true' : undefined} data-extends={r === undefined || typeof r === 'string' ? undefined : String(r.conservative)}>
                    {text}
                  </td>
                )
              })}
            </tr>
            {lines.map((line) => (
              <tr key={line.key} data-row={line.key}>
                <th scope="row">
                  <Rich text={line.label} ids={ids} />
                </th>
                {line.cells.map((v, i) => (
                  <td key={names[i]} data-current={current(i) ? 'true' : undefined} data-verdict={v}>
                    {v === undefined ? t.ext.extendsNone : t.verdict[v]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function sameSetting(a: Assignment, b: Assignment): boolean {
  const keys = Object.keys(a)
  return keys.length === Object.keys(b).length && keys.every((id) => id in b && valuesEqual(a[id], b[id]))
}

const NO_IDS: readonly string[] = []
