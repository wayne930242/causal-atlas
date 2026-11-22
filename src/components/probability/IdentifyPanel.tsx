import { useId, useMemo, useRef, useState } from 'react'
import type { LoadedCase } from '../../data/load.ts'
import type { Admg, DeriveResult, DoAtom, Hedge } from '../../engine/index.ts'
import { DerivationError, admgForPrior, admgOf, derive, formatValue, identify, probExprLatex, probExprText, problemOf } from '../../engine/index.ts'
import { SignalGraph } from '../graph/SignalGraph.tsx'
import type { Locale } from '../i18n/messages.ts'
import { LocaleScope, useMessages } from '../i18n/messages.ts'
import { useCaseOrDoc } from '../model/doc-case.ts'
import { idWithName, shortLabel } from '../model/wording.ts'
import { DocProblems } from '../shared/parts.tsx'
import { Tex } from '../text/Tex.tsx'
import type { ProbabilitySource } from './ProbabilityPanel.tsx'
import { RulesPanel } from './RulesPanel.tsx'
import type { IdentifyQuery } from './identify-view.ts'
import { graphCase, hasEdge, modelComparison, sameEdges, toggleEdge, wouldCycle } from './identify-view.ts'
import { SIDE_TOLERANCE, derivationSteps, isCalculus } from './rules-view.ts'

export type IdentifyPanelProps = (ProbabilitySource | { readonly c: LoadedCase; readonly caseId?: never; readonly doc?: never }) & {
  /** The initial disjoint treatment, outcome and optional observed condition. */
  readonly query?: IdentifyQuery
  readonly locale?: Locale
}

/** Identify and derive an effect on an editable copy of the model's observed graph. */
export function IdentifyPanel({ locale, ...props }: IdentifyPanelProps) {
  return <LocaleScope locale={locale}>{'c' in props ? <IdentifyFor c={props.c} query={props.query} /> : <IdentifyFromSource {...props} />}</LocaleScope>
}

function IdentifyFromSource({ caseId, doc, query }: ProbabilitySource & { readonly query?: IdentifyQuery }) {
  const resolved = useCaseOrDoc(caseId, doc)
  if (!resolved.ok) return <DocProblems problems={resolved.problems} />
  return <IdentifyFor c={resolved.c} query={query} />
}

function IdentifyFor({ c, query }: { readonly c: LoadedCase; readonly query?: IdentifyQuery }) {
  const base = useMemo(() => c.prior?.kind === 'joint' ? admgForPrior(c.model, c.prior) : admgOf(c.model), [c])
  const initial = query ?? { x: base.nodes[0], y: base.nodes[1] }
  return <Experiment key={JSON.stringify([c.data.id, base.nodes, initial.x, initial.y, initial.w])} c={c} base={base} initial={initial} />
}

function Experiment({ c, base, initial }: { readonly c: LoadedCase; readonly base: Admg; readonly initial: IdentifyQuery }) {
  const t = useMessages()
  const m = t.identify
  const uid = useId()
  const verdictHeading = useRef<HTMLHeadingElement>(null)
  const [query, setQuery] = useState(initial)
  const [draft, setDraft] = useState<{ readonly base: Admg; readonly graph: Admg }>()
  const g = draft?.base === base ? draft.graph : base
  const edited = !sameEdges(g, base)
  const graph = useMemo(() => graphCase(c, edited ? g : base, edited), [c, base, g, edited])
  const [isOpen, setOpen] = useState(false)
  const { x, y, w } = query
  const outcome = useMemo(() => {
    try {
      return { result: identify(g, [y], [x], w === undefined ? [] : [w]) }
    } catch (error) {
      const problem = problemOf(error)
      if (problem === undefined) throw error
      return { problem }
    }
  }, [g, x, y, w])
  if (outcome.problem !== undefined && outcome.problem.code !== 'identify-budget') return <DocProblems problems={[outcome.problem]} />
  const result = outcome.result
  const hedge = result?.identifiable === false ? result.hedge : undefined
  const expr: DoAtom = { kind: 'p', vars: [y], do: [x], given: w === undefined ? [] : [w] }
  const options = { names: g.nodes }
  const lhs = probExprLatex(expr, options)
  const lhsText = probExprText(expr, options)
  const focusVerdict = () => {
    verdictHeading.current?.focus({ preventScroll: true })
    verdictHeading.current?.scrollIntoView({ block: 'start' })
  }
  const label = (id: string): string => idWithName(id, shortLabel(c.model, id, t.locale))
  return (
    <section className="ca-root not-prose ca-panel ca-identify" data-case={c.data.id} data-view="identify" lang={t.locale} aria-labelledby={`${uid}-title`}>
      <header className="ca-id-header"><h2 id={`${uid}-title`}>{m.title}</h2></header>
      <section className="ca-id-graph" aria-labelledby={`${uid}-graph`}>
        <div className="ca-id-head">
          <h3 id={`${uid}-graph`}>{m.graph}</h3>
          <button className="ca-btn ca-btn-outline" type="button" aria-expanded={isOpen} aria-controls={`${uid}-editor`} onClick={() => setOpen(!isOpen)}>{isOpen ? m.collapse : m.edit}</button>
        </div>
        <div className="ca-id-svg">
          <SignalGraph c={graph} shown={g.nodes} structural compact hedge={hedge} interventions={{}} removedEdges={[]} title={m.graph} />
        </div>
        <div className="ca-id-key">
          <span className="ca-id-directed">{m.directed}</span><span className="ca-id-arc">{m.arc}</span>
        </div>
        <div id={`${uid}-editor`} hidden={!isOpen}>
          {isOpen && <EdgeEditor g={g} start={[x, y]} label={label} edited={edited} onChange={(next) => setDraft({ base, graph: next })} onRestore={() => setDraft(undefined)} jump={focusVerdict} />}
        </div>
      </section>
      <section className="ca-id-result" aria-labelledby={`${uid}-result`}>
        <div className="ca-id-head">
          <h3 id={`${uid}-result`} ref={verdictHeading} tabIndex={-1}>{m.result}</h3>
          {edited && <span className="ca-id-muted">{m.edited}</span>}
        </div>
        <div className="ca-id-fields">
          <VariableSelect title={m.x} value={x} ids={g.nodes.filter((id) => id !== w)} label={label} onChange={(id) => setQuery({ ...query, x: id, y: id === y ? x : y })} />
          <VariableSelect title={m.y} value={y} ids={g.nodes.filter((id) => id !== w)} label={label} onChange={(id) => setQuery({ ...query, y: id, x: id === x ? y : x })} />
          <VariableSelect title={m.w} value={w ?? ''} ids={g.nodes.filter((id) => id !== x && id !== y)} none={m.none} label={label} onChange={(id) => setQuery({ ...query, w: id || undefined })} />
        </div>
        {result === undefined ? <DocProblems problems={outcome.problem === undefined ? [] : [outcome.problem]} /> : (
          <>
            <div className="ca-id-verdict" data-identification={result.identifiable ? 'identified' : 'hedge'} role="status">
              <strong>{result.identifiable ? `✓ ${m.yes}` : m.no}</strong><span data-query={lhsText}><Tex tex={lhs} text={lhsText} /></span>
            </div>
            {result.identifiable ? (
              <>
                <div className="ca-id-formula" data-observational-formula="">
                  <p className="ca-id-muted">{m.formula}</p>
                  <div className="ca-id-math"><Tex tex={lhs} text={lhsText} /> <Tex tex={`= ${result.latex}`} text={`= ${result.text}`} /></div>
                </div>
                <Numbers c={c} edited={edited} query={query} />
                <Derivation key={JSON.stringify([g.directed, g.bidirected, x, y, w])} c={c} graph={graph} g={g} query={query} edited={edited} />
              </>
            ) : <><HedgeResult hedge={result.hedge} />{edited && <p className="ca-id-muted ca-id-limit">{m.editedNoModel}</p>}</>}
          </>
        )}
      </section>
    </section>
  )
}

function VariableSelect({ title, ids, value, none, label, onChange }: {
  readonly title: string; readonly ids: readonly string[]; readonly value: string; readonly none?: string
  readonly label: (id: string) => string; readonly onChange: (id: string) => void
}) {
  return <label className="ca-id-select"><span>{title}</span><select value={value} onChange={(e) => onChange(e.currentTarget.value)}>
    {none !== undefined && <option value="">{none}</option>}
    {ids.map((id) => <option key={id} value={id}>{label(id)}</option>)}
  </select></label>
}

function EdgeEditor({ g, start, label, edited, onChange, onRestore, jump }: {
  readonly g: Admg; readonly start: readonly [string, string]; readonly label: (id: string) => string
  readonly edited: boolean; readonly onChange: (g: Admg) => void; readonly onRestore: () => void; readonly jump: () => void
}) {
  const m = useMessages().identify
  const [pair, setPair] = useState(start)
  const [a, b] = pair
  const uid = useId()
  const cyclic = !hasEdge(g, 'directed', pair) && wouldCycle(g, pair)
  return (
    <div className="ca-id-editor">
      <h4>{m.edges}</h4>
      <p className="ca-id-muted">{m.edgeHint}</p>
      <div className="ca-id-edgedesc">
        <div className="ca-id-fields ca-id-endpoints">
          <VariableSelect title={m.from} ids={g.nodes} value={a} label={label} onChange={(id) => setPair([id, id === b ? a : b])} />
          <VariableSelect title={m.to} ids={g.nodes} value={b} label={label} onChange={(id) => setPair([id === a ? b : a, id])} />
        </div>
        <div className="ca-id-buttons">
          {(['directed', 'bidirected'] as const).map((kind) => {
            const has = hasEdge(g, kind, pair)
            const edge = `${a} ${kind === 'directed' ? '→' : '↔'} ${b}`
            const disabled = kind === 'directed' && cyclic
            return <button key={kind} type="button" className="ca-btn ca-btn-outline" disabled={disabled} aria-describedby={disabled ? uid : undefined} onClick={() => onChange(toggleEdge(g, kind, pair))}>{(has ? m.remove : m.add)(edge)}</button>
          })}
          <button type="button" className="ca-btn ca-btn-outline" disabled={!edited} onClick={onRestore}>{m.restore}</button>
        </div>
      </div>
      {cyclic && <p id={uid} className="ca-id-muted">{m.cycle}</p>}
      <button type="button" className="ca-btn ca-btn-outline ca-id-jump" onClick={jump}>{m.jump}</button>
    </div>
  )
}

function Numbers({ c, edited, query }: { readonly c: LoadedCase; readonly edited: boolean; readonly query: IdentifyQuery }) {
  const m = useMessages().identify
  const row = useMemo(() => modelComparison(c, edited, query), [c, edited, query])
  if (typeof row === 'string') return <p className="ca-id-muted ca-id-limit">{m[row]}</p>
  const assignment = Object.entries(row.at).map(([id, v]) => `${id}=${formatValue(v)}`).join(', ')
  const same = Math.abs(row.formulaValue - row.doValue) < SIDE_TOLERANCE
  return <div className="ca-id-check">
    <p className="ca-id-muted">{m.at(assignment)}</p>
    <dl className="ca-id-numbers">
      <div><dt>{m.formulaValue}</dt><dd className="ca-mono">{row.formulaValue.toFixed(3)}</dd></div>
      <div><dt>{m.doValue}</dt><dd className="ca-mono">{row.doValue.toFixed(3)}</dd></div>
    </dl>
    <p className={same ? 'ca-adj-ok' : 'ca-adj-no'}>{same ? '✓' : '✗'} {same ? m.same : m.different}</p>
  </div>
}

function HedgeResult({ hedge }: { readonly hedge: Hedge }) {
  const m = useMessages().identify
  return <>
    <p className="ca-id-why">{m.why}</p>
    <ul className="ca-id-forest">
      <li><strong>F</strong>{` = {${hedge.f.join(', ')}} · ${m.f}`}</li>
      <li><strong>F′</strong>{` = {${hedge.fPrime.join(', ')}} · ${m.fPrime}`}</li>
    </ul>
  </>
}

function Derivation({ c, graph, g, query: { x, y, w }, edited }: { readonly c: LoadedCase; readonly graph: LoadedCase; readonly g: Admg; readonly query: IdentifyQuery; readonly edited: boolean }) {
  const t = useMessages()
  const [selected, select] = useState<number>()
  const uid = useId()
  const origin = useMemo(() => {
    let d: DeriveResult
    try {
      d = derive(g, [y], [x], w === undefined ? [] : [w])
    } catch (error) {
      if (error instanceof DerivationError || problemOf(error)?.code === 'identify-budget') return undefined
      throw error
    }
    return d.identifiable ? { steps: derivationSteps(d.steps), matches: d.matches } : undefined
  }, [g, x, y, w])
  const options = { names: g.nodes }
  return <section className="ca-id-derivation" aria-labelledby={`${uid}-heading`}>
    <h4 id={`${uid}-heading`}>{t.identify.derivation}</h4>
    {origin === undefined ? <p className="ca-id-muted">{t.identify.derivationUnavailable}</p> : <>
      {!origin.matches && <p className="ca-id-muted">{t.identify.equivalent}</p>}
      {origin.steps.length > 0 && <ol className="ca-id-steps">
        {origin.steps.map((step, i) => <li key={step.label}>
          <button type="button" aria-expanded={selected === i} className="ca-id-step" onClick={() => select(selected === i ? undefined : i)}>
            <span className="ca-id-muted">{step.label}</span>
            <span className="ca-id-step-kind">{isCalculus(step) ? t.rules.calculusTag : t.rules.rule(step.rule)}</span>
            <code>{step.symbolic?.map((term) => probExprText(term, options)).join(' = ')}</code>
            <span aria-hidden="true" className="ca-id-step-open">{selected === i ? '↑' : '↗'}</span>
          </button>
        </li>)}
      </ol>}
      {selected !== undefined && <RulesPanel key={selected} c={graph} shown={g.nodes} prior={edited ? undefined : c.prior} comparisonModel={c.model} steps={origin.steps} startAt={selected} />}
    </>}
  </section>
}
