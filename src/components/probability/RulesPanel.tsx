import type { CSSProperties } from 'react'
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { LoadedCase } from '../../data/load.ts'
import type { Assignment, DoExpr, Prior, Value } from '../../engine/index.ts'
import { formatValue, probExprLatex, probExprText, switchId } from '../../engine/index.ts'
import { tableNumber } from './adjust-view.ts'
import { probText } from '../model/wording.ts'
import { MAX_PATHS, pathReason, pathText } from '../model/dsep-view.ts'
import { singleGraphSource } from '../export/export-render.tsx'
import type { ExportSource } from '../export/export-image.ts'
import { ExportMenu } from '../export/ExportMenu.tsx'
import type { Locale, Messages } from '../i18n/messages.ts'
import { useMessages } from '../i18n/messages.ts'
import type { CalculusStep, DerivationViewStep, RuleMark, RuleState, RuleStep, SwitchQuery } from './rules-view.ts'
import { SIDE_TOLERANCE, calculusView, clampSplit, initialRuleState, isCalculus, nodeRoles, nodeValues, pairSets, presentMarks, ruleView, sideText } from './rules-view.ts'
import { NodeMenu } from '../panels/NodeMenu.tsx'
import { useNodeMenu } from '../panels/use-node-menu.ts'
import { withValue } from '../model/model-state.ts'
import { placeTip } from '../panels/menu-place.ts'
import { useDigits } from '../shared/digits.ts'
import { Segmented, Tag, Tip } from '../shared/parts.tsx'
import { SignalGraph } from '../graph/SignalGraph.tsx'
import { Formula, Rich } from '../text/typeset.tsx'
import { Tex } from '../text/Tex.tsx'
import { useNarrow } from '../shared/use-narrow.ts'
import { originCitations } from '../model/verdict-rows.ts'

const RULE_SYMBOLS = new Set(['Z', 'W', 'Y', 'F_Z'])

/** A legend swatch drawn like its mark on the graph, in a 22 by 16 box. */
function Swatch({ mark }: { readonly mark: RuleMark }) {
  const shape = {
    pair: <circle cx={11} cy={8} r={6.5} className="ca-dsep-ring" />,
    known: (
      <>
        <circle cx={11} cy={8} r={6.5} className="ca-ring" />
        <circle cx={11} cy={8} r={4} className="ca-node-outline" />
      </>
    ),
    switch: <rect x={6} y={3} width={10} height={10} className="ca-switch-box" />,
    clamp: <path d="M4 7V2h5M13 2h5v5M18 9v5h-5M9 14H4V9" className="ca-stroke-clamp" />,
    switchSet: (
      <>
        <path d="M4 7V2h5M13 2h5v5M18 9v5h-5M9 14H4V9" className="ca-stroke-clamp" />
        <rect x={8} y={5.5} width={6} height={5} className="ca-fill-accent" />
      </>
    ),
    testClamp: <path d="M4 7V2h5M13 2h5v5M18 9v5h-5M9 14H4V9" className="ca-stroke-clamp ca-clamp-test" />,
    cut: (
      <>
        <line x1={1} y1={8} x2={21} y2={8} className="ca-stroke-cut" />
        <path d="M9 12l3-8M12 12l3-8" className="ca-stroke-slash" />
      </>
    ),
    open: <line x1={1} y1={8} x2={21} y2={8} className="ca-stroke-live ca-path-open" />,
    blocked: <line x1={1} y1={8} x2={21} y2={8} className="ca-stroke-live ca-path-blocked" />,
  }[mark]
  return (
    <svg className="ca-rules-swatch" width={22} height={16} viewBox="0 0 22 16" aria-hidden="true">
      {shape}
    </svg>
  )
}

/** A switch reading's query and its value; a query whose evidence has probability 0 says so. */
function Query({ q, noData }: { readonly q: SwitchQuery; readonly noData: string }) {
  return q.value === undefined ? (
    <>
      <Formula text={sideText(q.side)} /> = {noData}
    </>
  ) : (
    <Formula text={`${sideText(q.side)} = ${tableNumber(q.value)}`} />
  )
}

/** The event alone, `P(Y=1) = 0.29` at the graph's digits, its full query in the hover title; a query without data says so. */
function Short({ q, noData, bare, digits }: { readonly q: SwitchQuery; readonly noData: string; readonly bare?: boolean; readonly digits: number }) {
  const text = q.value === undefined ? noData : digits > 0 ? probText(q.value, digits) : tableNumber(q.value)
  return (
    <span title={sideText(q.side)} data-query={sideText(q.side)}>
      {bare === true ? text : <Formula text={`P(${q.side.event}) = ${text}`} />}
    </span>
  )
}

/**
 * The do-calculus rules on their graphs (lesson 06): a step button per step of the derivation,
 * the step's graph with no probabilities (known and switch-set variables show their values inside; cut arrows struck; the variables the expression sets by do()
 * clamped, those cut only for the test with a dashed clamp; intervention switches `F_Z` as small
 * squares; the known set ringed; the pair's paths lit or dashed), a line with the d-separation
 * verdict (a switch test: 可換 or 不可換; a cut graph: the rule applies or not, never while the
 * equation's sides differ), and the current equation on the full model. A node or its switch `F_v`
 * opens the node menu. Observations and ordinary do()s are known; only ordinary do()s cut arrows
 * for the test. A switch changes the drawn cuts, value and equation without changing the test.
 * The step button restores the original settings.
 *
 * A generated derivation (`derivationSteps`) also has symbolic steps: a rule step whose sides are
 * written with free variables, P(y | do(x), z) = P(y | do(x, z)), may test two sets, and its
 * equation line compares the sides at every assignment; a probability-calculus step shows the
 * identity it uses and the same comparison, with no graph.
 */
export function RulesPanel({
  c,
  prior,
  steps,
  shown,
  exportUrl,
}: {
  readonly c: LoadedCase
  readonly prior: Prior
  readonly steps: readonly DerivationViewStep[]
  readonly shown: readonly string[]
  readonly exportUrl?: string
}) {
  if (steps.length === 0) throw new Error(`case ${c.data.id}: view="rules" needs at least one step`)
  const [at, setAt] = useState(0)
  // Each press of a step button, even the current one, restores that step's settings.
  const [visit, setVisit] = useState(0)
  const index = Math.min(at, steps.length - 1)
  const step = steps[index]
  const go = (i: number): void => {
    setAt(i)
    setVisit((n) => n + 1)
  }
  if (isCalculus(step)) return <CalculusStepPanel c={c} prior={prior} step={step} steps={steps} index={index} go={go} />
  return <RuleStepPanel c={c} prior={prior} step={step} steps={steps} index={index} go={go} visit={visit} shown={shown} exportUrl={exportUrl} />
}

/** The step buttons, one per step, the current one pressed. */
function StepButtons({ steps, index, go }: { readonly steps: readonly DerivationViewStep[]; readonly index: number; readonly go: (i: number) => void }) {
  const t = useMessages()
  return <Segmented className="ca-rules-steps" label={t.rules.steps} options={steps.map((s, i) => ({ value: String(i), label: s.label }))} value={String(index)} onChange={(v) => go(Number(v))} />
}

/** A symbolic step's two sides typeset, with the model's lower-case variable names. */
function SymbolicEquation({ c, left, right, equal }: { readonly c: LoadedCase; readonly left: DoExpr; readonly right: DoExpr; readonly equal: boolean }) {
  const options = { names: c.model.endogenous }
  const op = equal ? '=' : '\\neq'
  return <Tex tex={`${probExprLatex(left, options)} ${op} ${probExprLatex(right, options)}`} text={`${probExprText(left, options)} ${equal ? '=' : '≠'} ${probExprText(right, options)}`} />
}

/** One variable as itself, a set as `{X, Z}`. */
function setText(ids: readonly string[]): string {
  return ids.length === 1 ? ids[0] : `{${ids.join(', ')}}`
}

/** How many assignments a symbolic comparison read, and how many it skipped. */
function checkedText(m: Messages, rows: number, skipped: number): string {
  return `${m.rules.symbolicChecked(rows)}${skipped > 0 ? m.rules.symbolicSkipped(skipped) : ''}`
}

/**
 * A probability-calculus step of a derivation: the identity it uses, and its two sides compared on
 * the full model at every assignment of their free variables. It tests no graph.
 */
function CalculusStepPanel({ c, prior, step, steps, index, go }: { readonly c: LoadedCase; readonly prior: Prior; readonly step: CalculusStep; readonly steps: readonly DerivationViewStep[]; readonly index: number; readonly go: (i: number) => void }) {
  const t = useMessages()
  const { check, verdict } = useMemo(() => calculusView(c, prior, step), [c, prior, step])
  const { rows, skipped } = check.comparison
  const holds = verdict === 'holds'
  return (
    <div className="ca-root not-prose ca-panel ca-prob" data-case={c.data.id} data-view="rules" data-calculus={step.calculus} lang={t.locale}>
      <div className="ca-box ca-graph-box">
        <div className="ca-box-head">
          <div className="ca-tags">
            <Tag tone="fg">{t.rules.calculusTag}</Tag>
          </div>
          <div className="ca-box-actions">
            <StepButtons steps={steps} index={index} go={go} />
          </div>
        </div>
        <div className="ca-rules-line">
          <p className="ca-dsep-head">
            <span className="ca-pg-now-kicker"><Rich text={t.rules.calculus[step.calculus]} ids={RULE_SYMBOLS} /></span>
          </p>
          <p className="ca-rules-equal" data-equal={String(holds)} data-verdict={verdict}>
            <code className="ca-mono">
              <SymbolicEquation c={c} left={check.left} right={check.right} equal={holds} />
            </code>{' '}
            <span className={holds ? 'ca-adj-ok' : 'ca-adj-no'}>{holds ? '✓' : '✗'}</span> {holds ? t.rules.calculusHolds : t.rules.calculusDiffers}{t.rules.switchStates}{checkedText(t, rows, skipped)}
          </p>
        </div>
      </div>
    </div>
  )
}

function RuleStepPanel({
  c,
  prior,
  step,
  steps,
  index,
  go: goTo,
  visit,
  shown,
  exportUrl,
}: {
  readonly c: LoadedCase
  readonly prior: Prior
  readonly step: RuleStep
  readonly steps: readonly DerivationViewStep[]
  readonly index: number
  readonly go: (i: number) => void
  readonly visit: number
  readonly shown: readonly string[]
  readonly exportUrl?: string
}) {
  const t = useMessages()
  const digits = useDigits()
  // The settings belong to one visit of the step: a step button starts a new visit at the step's own settings.
  const fresh = useMemo(() => initialRuleState(c, step), [c, step])
  const [held, setHeld] = useState(() => ({ visit, state: fresh }))
  const state = held.visit === visit ? held.state : fresh
  const setState = (next: (now: RuleState) => RuleState): void => {
    setHeld((h) => ({ visit, state: next(h.visit === visit ? h.state : fresh) }))
  }
  const { observed, interventions, setting } = state
  const view = useMemo(() => ruleView(c, prior, step, state), [c, prior, step, state])
  const values = nodeValues(state)
  const { known, reading } = view
  // A switch test writes the current prediction of the pair's other end under its node, when the event is its value 1.
  const probeEvent = reading === undefined ? undefined : new RegExp(`^${reading.target}\\s*==?\\s*(1|true)$`).test(reading.now.side.event.trim()) ? reading.target : undefined
  const probe = probeEvent === undefined || reading === undefined ? undefined : { [probeEvent]: reading.now.value ?? Number.NaN }
  const wrap = useRef<HTMLDivElement>(null)
  const narrow = useNarrow(wrap, 560)
  // The step's switches are drawn first, beside the variables they point into.
  const drawn = [...view.switchNodes, ...shown]
  const menu = useNodeMenu(wrap, drawn, view, narrow)
  const switched = (id: string): string | undefined => (step.switches ?? []).find((v) => switchId(v) === id)
  const menuId = menu.anchor === undefined ? undefined : switched(menu.anchor) ?? menu.anchor
  const menuSwitch = menuId !== undefined && (step.switches ?? []).includes(menuId)
  const [movedSet, headSet] = pairSets(step)
  const pairIds = [...movedSet, ...headSet]
  const pairLocked = menuId !== undefined && pairIds.includes(menuId)
  const go = (i: number): void => {
    menu.dismiss()
    goTo(i)
  }
  const observe = (id: string, value: Value | undefined): void => {
    setState((now) => ({ ...now, observed: withValue(now.observed, id, value) }))
  }
  const intervene = (id: string, value: Value | undefined): void => {
    setState((now) => menuSwitch
      ? { ...now, setting: withValue(now.setting, id, value) }
      : { ...now, interventions: withValue(now.interventions, id, value), observed: withValue(now.observed, id, undefined) })
  }
  const ruleName = t.rules.rule(step.rule)
  const r = t.rules
  /** The head's tags after the rule: the switches added, then what is cut (none said for a switch test that cuts nothing). */
  const headTags = (m: Messages): string[] => {
    const cutIn = [...new Set([...(step.cutIn ?? []), ...Object.keys(interventions)])].filter((id) => id in interventions || testClamps.includes(id))
    const cutOut = step.cutOut ?? []
    const out: string[] = []
    if (view.switchNodes.length > 0) out.push(m.rules.switchTag(view.switchNodes, step.switches ?? []))
    if (view.switchNodes.length === 0 || cutIn.length > 0 || cutOut.length > 0) out.push(m.rules.cut(cutIn, cutOut))
    return out
  }
  const rolesText = (m: Messages, id: string): string => {
    const roles = nodeRoles(step, known, id, state).map((role) => m.rules.role[role])
    return roles.length === 0 ? m.rules.role.none : m.rules.roles(roles)
  }
  const notes = Object.fromEntries(drawn.map((id) => [id, rolesText(t, id)]))
  const marks = presentMarks(step, view, drawn, state)
  const testClamps = clampSplit(step).test
  const forced = { ...interventions, ...setting }
  // A node under the pointer (or keyboard focus) says what it is in this step, above the node.
  const [hover, setHover] = useState<string | undefined>(undefined)
  const hovered = menu.anchor === undefined && hover !== undefined && drawn.includes(hover) ? hover : undefined
  const [tipStyle, setTipStyle] = useState<CSSProperties>({ visibility: 'hidden' })
  useLayoutEffect(() => {
    if (hovered === undefined) return
    const box = wrap.current?.getBoundingClientRect()
    const ring = wrap.current?.querySelector(`[data-node="${hovered}"] .ca-focus-ring`)?.getBoundingClientRect()
    if (box === undefined || ring === undefined) return
    const top = ring.top - box.top
    const p = placeTip({ left: ring.left - box.left, right: ring.right - box.left, top, bottom: top }, wrap.current?.clientWidth ?? 0)
    setTipStyle({ left: p.left, top: p.top, width: p.width })
  }, [hovered, narrow, step])
  const graph = (m: Messages, interactive: boolean) => (
    <SignalGraph
      compact={narrow}
      c={view.graph}
      shown={drawn}
      values={values}
      probe={probe}
      interventions={forced}
      removedEdges={view.removed}
      testClamped={testClamps}
      switches={view.switchNodes}
      observed={known}
      paths={view.marks}
      onOpen={interactive ? menu.toggle : undefined}
      observable
      open={interactive ? menu.anchor : undefined}
      onHover={interactive ? setHover : undefined}
      nodeNotes={interactive ? notes : undefined}
      title={(view.switchTest ? m.rules.switchTitle : m.rules.graphTitle)(c.data.title[m.locale], m.rules.rule(step.rule))}
    />
  )
  const exportSource = (locale: Locale): ExportSource | undefined =>
    singleGraphSource(view.graph, locale, t, wrap, digits, (m) => graph(m, false), (svg, m) => ({
      name: `${c.data.id}-rule-${step.label}`,
      panels: [
        {
          svg,
          tags: [{ text: m.rules.rule(step.rule), tone: 'fg' }, ...headTags(m).map((text) => ({ text, tone: 'outline' as const }))],
        },
      ],
      legend: '',
    }))
  const d = t.dsep
  const ids = view.graph.model.byId
  const { result } = view
  const [left, right] = view.equation ?? []
  const leftValue = left?.value
  const rightValue = right?.value
  const numeric = leftValue !== undefined && rightValue !== undefined
  const equal = numeric && Math.abs(leftValue - rightValue) < SIDE_TOLERANCE
  const assignmentOf = (a: Assignment): string =>
    Object.entries(a)
      .map(([k, v]) => `${k}=${formatValue(v)}`)
      .join(', ')
  // The line's numbers use the graph's digits, unless rounding would hide a difference.
  const lineDigits = reading?.on !== undefined && reading.same === false && reading.on.value !== undefined && reading.off.value !== undefined && probText(reading.on.value, digits) === probText(reading.off.value, digits) ? 0 : digits
  const seenText = reading === undefined ? '' : assignmentOf(reading.seen)
  const unseen = (step.switches ?? []).filter((id) => reading !== undefined && !(id in reading.seen))
  const baseState = [seenText === '' ? '' : r.switchSeen(seenText), unseen.length === 0 ? '' : r.switchUnknown(unseen)].filter((x) => x !== '').join(r.switchStates)
  const verdictText = {
    swap: r.swap,
    noSwap: r.noSwap,
    applies: r.applies(ruleName),
    notApplies: r.notApplies(ruleName),
    mismatch: r.mismatch,
  }[view.verdict]
  return (
    <div className="ca-root not-prose ca-panel ca-prob" data-case={c.data.id} data-view="rules" lang={t.locale}>
      <div className="ca-box ca-graph-box">
        <div className="ca-box-head">
          <div className="ca-tags">
            <Tag tone="fg">{ruleName}</Tag>
            {headTags(t).map((text) => (
              <Tag key={text} tone="outline">
                <Rich text={text} ids={ids} />
              </Tag>
            ))}
          </div>
          <div className="ca-box-actions">
            <StepButtons steps={steps} index={index} go={go} />
            <ExportMenu source={exportSource} url={exportUrl} origins={originCitations(c)} />
          </div>
        </div>
        <div className="ca-rules-stage">
          <div className="ca-graph-wrap" ref={wrap}>
            {graph(t, true)}
            {hovered !== undefined && (
              <div className="ca-edge-tip ca-node-tip" role="tooltip" data-node-tip={hovered} style={tipStyle}>
                {r.nodeTip(rolesText(t, hovered))}
              </div>
            )}
            {menuId !== undefined && (
              <NodeMenu
                key={menu.anchor}
                c={view.graph}
                id={menuId}
                world={{ shown: drawn, values, removedEdges: view.removed }}
                interventions={forced}
                stochastic={{}}
                observed={observed}
                observes
                intervenes
                counterfactual={false}
                pair={pairIds}
                rule={{ checked: pairLocked, switchId: menuSwitch ? switchId(menuId) : undefined }}
                onObserve={(v) => observe(menuId, v)}
                onDo={(v) => intervene(menuId, v)}
                onClose={menu.close}
                style={menu.style}
                menuRef={menu.menuRef}
              />
            )}
          </div>
          <aside className="ca-legend ca-rules-aside" aria-label={r.legend.label}>
            <p className="ca-rules-aside-head">{r.legend.label}</p>
            <ul className="ca-rules-legend">
              {marks.map((mark) => (
                <li key={mark} data-mark={mark}>
                  <Swatch mark={mark} />
                  <span>{r.legend[mark]}</span>
                </li>
              ))}
              <li data-mark="menu">{r.legend.menu}</li>
              {probeEvent !== undefined && <li data-mark="probe"><Rich text={r.legend.probe(probeEvent)} ids={ids} /></li>}
              {(step.switches ?? []).map((id) => (
                <li key={id} data-mark="switchMenu"><Rich text={r.legend.switchMenu(switchId(id), id, reading?.target ?? '')} ids={ids} /></li>
              ))}
            </ul>
          </aside>
        </div>
        <div className="ca-rules-line ca-dsep-line" data-dsep={result.separated ? 'blocked' : 'open'}>
          <p className="ca-dsep-head">
            <span className="ca-pg-now-kicker"><Rich text={d.pair(setText(movedSet), setText(headSet))} ids={ids} /></span> <Rich text={d.known([...known])} ids={ids} /> →{' '}
            <strong>{result.separated ? t.rules.separated : d.open}</strong>
            <span data-verdict={view.verdict}>{verdictText}</span> <Tip tip={<Rich text={view.switchTest ? t.rules.switchTip : t.rules.tip} ids={RULE_SYMBOLS} />} label={t.moreInfo} />
          </p>
          {reading !== undefined && (
            <p className="ca-rules-switch" data-switch-state={reading.on === undefined ? 'off' : 'on'} data-switch-same={reading.same === undefined ? undefined : String(reading.same)}>
              {reading.on === undefined ? (
                <span data-setting="off">
                  <Rich text={r.switchOff(reading.switches, baseState)} ids={ids} />
                  <Short q={reading.off} noData={r.noData} digits={lineDigits} />
                </span>
              ) : (
                <>
                  <span data-setting={assignmentOf(setting)}>
                    <Rich text={r.switchSet(assignmentOf(setting))} ids={ids} />
                    <Short q={reading.on} noData={r.noData} digits={lineDigits} />
                  </span>
                  {r.switchSep}
                  <span data-setting="off">
                    <Rich text={r.switchBase(baseState, Object.keys(reading.seen).length > 0)} ids={ids} />
                    <Short q={reading.off} noData={r.noData} digits={lineDigits} bare />
                  </span>
                  {reading.same !== undefined && (
                    <>
                      {' → '}
                      <strong className={reading.same ? 'ca-adj-ok' : 'ca-adj-no'}>{reading.same ? r.switchSame : r.switchDiffer}</strong>
                    </>
                  )}
                </>
              )}
            </p>
          )}
          {view.symbolic !== undefined && (
            <p className="ca-rules-equal" data-equal={String(view.symbolic.comparison.differsAt === undefined)}>
              <code className="ca-mono">
                <SymbolicEquation c={c} left={view.symbolic.left} right={view.symbolic.right} equal={view.symbolic.comparison.differsAt === undefined} />
              </code>{' '}
              <span className={view.symbolic.comparison.differsAt === undefined ? 'ca-adj-ok' : 'ca-adj-no'}>{view.symbolic.comparison.differsAt === undefined ? '✓' : '✗'}</span> {checkedText(t, view.symbolic.comparison.rows, view.symbolic.comparison.skipped)}
            </p>
          )}
          {reading === undefined && left !== undefined && right !== undefined && (
            <p className="ca-rules-equal" data-equal={numeric ? String(equal) : 'unavailable'}>
              {numeric ? (
                <>
                  <code className="ca-mono">
                    <Formula text={`${sideText(left.side)} = ${tableNumber(leftValue)} ${equal ? '=' : '≠'} ${sideText(right.side)} = ${tableNumber(rightValue)}`} />
                  </code>{' '}
                  <span className={equal ? 'ca-adj-ok' : 'ca-adj-no'}>{equal ? '✓' : '✗'}</span>
                </>
              ) : (
                <><Query q={left} noData={r.noData} />{r.switchSep}<Query q={right} noData={r.noData} /></>
              )}
            </p>
          )}
          <details className="ca-dsep-more">
            <summary>{r.paths(result.paths.length)}</summary>
            <ul className="ca-dsep-paths">
              {result.paths.length === 0 && <li>{d.noPath}</li>}
              {result.paths.slice(0, MAX_PATHS).map((p) => (
                <li key={p.nodes.join('-')} data-path-open={p.open ? 'true' : 'false'}>
                  <Formula text={pathText(p)} ids={ids} />
                  {d.pathSep}
                  <Rich text={pathReason(t, p)} ids={ids} />
                </li>
              ))}
              {result.paths.length > MAX_PATHS && <li>{d.more(result.paths.length - MAX_PATHS)}</li>}
            </ul>
          </details>
        </div>
      </div>
    </div>
  )
}
