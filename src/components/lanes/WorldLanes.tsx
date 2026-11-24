import type { ReactNode } from 'react'
import { useId, useMemo, useRef, useState } from 'react'
import type { LoadedCase } from '../../data/load.ts'
import type { ModelDoc } from '../../data/schema.ts'
import type { Assignment, CausalTheory, Edge, Value } from '../../engine/index.ts'
import { actualCause, evaluate } from '../../engine/index.ts'
import { formatValue, valuesEqual } from '../../engine/values.ts'
import { CaseGate } from '../model/CaseGate.tsx'
import { casesOf } from '../model/cases-of.ts'
import { useCaseOrDoc } from '../model/doc-case.ts'
import { CopyLatex, Equations } from '../panels/Equations.tsx'
import { renderDetached } from '../export/export-render.tsx'
import type { ExportSource } from '../export/export-image.ts'
import { ExportMenu } from '../export/ExportMenu.tsx'
import type { Locale, Messages } from '../i18n/messages.ts'
import { LocaleProvider, LocaleScope, messagesFor, useMessages } from '../i18n/messages.ts'
import { sub } from '../text/svg-text.tsx'
import { originCitations, originSources } from '../model/verdict-rows.ts'
import type { UiNotation } from '../model/notation.ts'
import { notations } from '../model/notation.ts'
import { TabButton, TabPanel } from '../shared/FigureTabs.tsx'
import { useTabs } from '../shared/use-tabs.ts'
import { DocProblems, Arrow, Progress, Segmented } from '../shared/parts.tsx'
import { columnOrder, edgeLive, edgePolarity, shownEdges } from '../graph/graph-layout.ts'
import { shownVariables } from '../model/shown-variables.ts'
import { assignmentText, doText, idWithName, label, shortLabel } from '../model/wording.ts'
import { outcomeVariable } from '../panels/equation-rows.ts'
import { textWidth } from '../text/text-measure.ts'

export type WorldLanesProps = WorldLanesSource & WorldLanesOptions

/**
 * What to draw: a bundled case by id, or a model document with a `context` (invalid ones show
 * their problem codes). A document has no preset, so pass `interventions` with it.
 */
export type WorldLanesSource =
  | { readonly caseId: string; readonly doc?: undefined }
  | { readonly doc: ModelDoc; readonly caseId?: undefined }

export interface WorldLanesOptions {
  /** Notation the equations start in; the reader can still switch. Default 'propositional'. */
  readonly defaultNotation?: UiNotation
  /** The counterfactual's do(); defaults to the case's first preset. */
  readonly interventions?: Assignment
  /** Text on the button that adds the counterfactual lane. */
  readonly actionLabel?: string
  /** Adds a third step: the HP witness world for this cause and effect. */
  readonly witness?: { readonly cause: string; readonly effect: string; readonly theory?: CausalTheory }
  readonly initialStep?: number
  /** Link in the exported image's watermark. */
  readonly exportUrl?: string
  /** Interface language. Default: the surrounding LocaleProvider's, else zh-TW. */
  readonly locale?: Locale
}

const LEFT = 188
const STEP = 100
const RIGHT = 116
const HEAD = 44
const LANE = 140
const DIFF = 24
const HALF = 22

type LaneKind = 'actual' | 'cf' | 'witness'

interface LaneSpec {
  readonly kind: LaneKind
  readonly values: Assignment
  readonly intervened: Assignment
  readonly fixed?: Assignment
  readonly removed: readonly Edge[]
}

function tagEl(x: number, y: number, text: string, tone: 'fg' | 'slate' | 'accent' | 'amber', mono = false): ReactNode {
  const size = 12
  const w = Math.round(textWidth(text, size) + 20)
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect width={w} height={22} className={`ca-lane-tag-${tone}`} />
      <text x={w / 2} y={15} textAnchor="middle" className={`ca-svg-small ca-svg-bold ca-lane-tag-text-${tone}${mono ? ' ca-mono' : ''}`}>
        {mono ? sub(text) : text}
      </text>
    </g>
  )
}

/** Direction 2 「世界分道」: each world is a row of cells; columns line up so changes read down a column. */
export function WorldLanes({ caseId, doc, interventions, actionLabel, witness, initialStep = 1, exportUrl, defaultNotation, locale }: WorldLanesProps) {
  return (
    <LocaleScope locale={locale}>
      <CaseGate ids={casesOf(caseId, [doc])}>
        <WorldLanesResolved
          caseId={caseId}
          doc={doc}
          interventions={interventions}
          actionLabel={actionLabel}
          witness={witness}
          initialStep={initialStep}
          exportUrl={exportUrl}
          defaultNotation={defaultNotation}
        />
      </CaseGate>
    </LocaleScope>
  )
}

function WorldLanesResolved({ caseId, doc, ...rest }: Omit<WorldLanesProps, 'locale'>) {
  const resolved = useCaseOrDoc(caseId, doc)
  if (!resolved.ok) return <DocProblems problems={resolved.problems} />
  return <WorldLanesFor c={resolved.c} {...rest} />
}

function WorldLanesFor({
  c,
  interventions,
  actionLabel,
  witness,
  initialStep = 1,
  exportUrl,
  defaultNotation,
}: Omit<WorldLanesOptions, 'locale'> & { c: LoadedCase }) {
  const t = useMessages()
  const stage = useRef<HTMLDivElement>(null)
  const context = c.context
  if (context === undefined) throw new Error(`WorldLanes needs a case with an actual context; ${c.data.id} has none`)
  const preset = c.data.showcase[0]
  const doAssign = interventions ?? preset?.interventions
  if (doAssign === undefined) throw new Error(`WorldLanes: case ${c.data.id} has no preset; pass interventions`)
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const tabs = useTabs(['equations'])
  const [notation, setNotation] = useState<UiNotation>(defaultNotation ?? 'propositional')

  const shown = useMemo(() => columnOrder(c, shownVariables(c)), [c])
  const lanes = useMemo(() => {
    const actual = evaluate(c.model, context)
    const cf = evaluate(c.model, context, doAssign)
    const out: LaneSpec[] = [
      { kind: 'actual', values: actual.values, intervened: {}, removed: [] },
      { kind: 'cf', values: cf.values, intervened: cf.intervened.reduce((a, id) => ({ ...a, [id]: cf.values[id] }), {}), removed: cf.removedEdges },
    ]
    if (witness !== undefined) {
      const result = actualCause(c.model, context, witness, witness.theory ?? 'hp-modified', { normality: c.normality })
      const w = result.check.witness
      if (w !== undefined) {
        const all = { ...w.xPrime, ...w.w }
        const world = evaluate(c.model, context, all)
        out.push({ kind: 'witness', values: world.values, intervened: w.xPrime, fixed: w.w, removed: world.removedEdges })
      }
    }
    return out
  }, [c, context, doAssign, witness])

  const total = lanes.length
  const [step, setStep] = useState(Math.min(Math.max(initialStep, 1), total))
  const outcome = outcomeVariable(c)
  const n = shown.length
  const edges = shownEdges(c.model.edges, shown)
  const ctx = Object.entries(context)
    .map(([id, v]) => `${id}=${formatValue(v as Value)}`)
    .join(' · ')
  /** What a witness lane holds, split by whether each value is the one it has in the actual world. */
  const heldText = (m: Messages, lane: LaneSpec): string => {
    const held = Object.entries(lane.fixed ?? {})
    const at = (actual: boolean): string =>
      assignmentText(Object.fromEntries(held.filter(([id, v]) => valuesEqual(v, lanes[0].values[id] ?? v) === actual)))
    return m.lanes.held(at(true), at(false))
  }
  /** The lanes drawing in `m`'s language; `ids` keeps marker ids apart when drawn twice. */
  const drawing = (m: Messages, ids: string): ReactNode => {
    // The margins grow to fit the lane notes and outcome lines of the language drawn.
    const leftNotes = [
      m.lanes.context(ctx),
      m.lanes.recomputed,
      ...lanes.filter((l) => l.fixed !== undefined).map((l) => heldText(m, l)),
    ]
    const left = Math.max(LEFT, Math.ceil(16 + Math.max(...leftNotes.map((t) => textWidth(t, 12))) + HALF + 10))
    const outLabel = label(c.model, outcome, m.locale)
    /** The line under a lane's outcome: what it is in the actual world, else whether it differs. */
    const outcomeNote = (lane: LaneSpec): string => {
      const ov = lane.values[outcome]
      const actualOut = lanes[0].values[outcome]
      if (lane.kind === 'actual') return ov === true ? outLabel : m.lanes.outcomeNo(outLabel)
      const same = ov !== undefined && actualOut !== undefined && valuesEqual(ov, actualOut)
      return same ? m.lanes.sameAsActual : m.lanes.differsFromActual
    }
    const right = Math.max(RIGHT, Math.ceil(40 + Math.max(...lanes.map((l) => textWidth(outcomeNote(l), 13))) + 10))
    const colX = new Map(shown.map((id, i) => [id, left + i * STEP]))
    const width = left + (n - 1) * STEP + right
    const longLabels = shown.some((id) => textWidth(idWithName(id, shortLabel(c.model, id, m.locale)), 13) > STEP - 2)
    const head = longLabels ? HEAD + 16 : HEAD

    // Place long edges above or below the row so arcs on one side do not overlap.
    const sides = new Map<string, 'above' | 'below'>()
    const taken: { side: 'above' | 'below'; lo: number; hi: number }[] = []
    for (const e of edges) {
      const a = shown.indexOf(e.from)
      const b = shown.indexOf(e.to)
      if (Math.abs(a - b) < 2) continue
      const lo = Math.min(a, b)
      const hi = Math.max(a, b)
      const clash = (side: 'above' | 'below'): boolean => taken.some((t) => t.side === side && t.lo < hi && lo < t.hi)
      const side = clash('above') && !clash('below') ? 'below' : 'above'
      taken.push({ side, lo, hi })
      sides.set(`${e.from}>${e.to}`, side)
    }
    const endShift = (e: Edge, at: 'start' | 'end'): number => {
      const side = sides.get(`${e.from}>${e.to}`)
      const id = at === 'start' ? e.from : e.to
      const other = [...sides.entries()].some(([k, s]) => {
        if (s !== side || k === `${e.from}>${e.to}`) return false
        const [f, t] = k.split('>')
        return at === 'start' ? t === id : f === id
      })
      if (!other) return 0
      return at === 'start' ? 8 : -8
    }

    let y = head
    const laneTops: number[] = []
    visible.forEach((_, i) => {
      if (i === 1) y += DIFF
      laneTops.push(y)
      y += LANE
    })
    const height = y

    const laneEl = (lane: LaneSpec, top: number): ReactNode => {
      const cy = top + LANE / 2
      const cf = lane.kind !== 'actual'
      const cut = new Set(lane.removed.map((e) => `${e.from}>${e.to}`))
      const parts: ReactNode[] = []
      for (const e of edges) {
        const key = `${e.from}>${e.to}`
        const x1 = colX.get(e.from) ?? 0
        const x2 = colX.get(e.to) ?? 0
        const live = edgeLive(lane.values, e.from)
        const inhibit = edgePolarity(c.model, e.from, e.to) === 'inhibit'
        const cls = live ? 'ca-stroke-live' : 'ca-stroke-idle'
        const marker = `url(#${ids}-${live ? 'live' : 'idle'})`
        const side = sides.get(key)
        if (side !== undefined) {
          const dir = side === 'above' ? -1 : 1
          const lift = 46 + 6 * (Math.abs(shown.indexOf(e.to) - shown.indexOf(e.from)) - 2)
          const sx = x1 + endShift(e, 'start')
          const ex = x2 + endShift(e, 'end')
          const d = `M${sx} ${cy + dir * HALF}C${sx} ${cy + dir * (HALF + lift)} ${ex} ${cy + dir * (HALF + lift)} ${ex} ${cy + dir * (HALF + 2)}`
          if (cut.has(key)) {
            const mx = (sx + ex) / 2
            const my = cy + dir * (HALF + lift * 0.75)
            parts.push(
              <g key={key} data-edge={key} data-state="cut">
                <path d={d} className="ca-stroke-cut" />
                <rect x={mx - 11} y={my - 7} width={22} height={14} className="ca-lane-mask" />
                <path d={`M${mx - 7} ${my + 8}l6-17M${mx + 1} ${my + 8}l6-17`} className="ca-stroke-slash" />
                <text x={mx} y={my + (dir < 0 ? 24 : -14)} textAnchor="middle" className="ca-svg-small ca-svg-bold">
                  {m.cut}
                </text>
              </g>,
            )
          } else {
            parts.push(
              <g key={key} data-edge={key} data-state={live ? 'live' : 'idle'}>
                <path d={d} className={cls} markerEnd={inhibit ? undefined : marker} />
                {inhibit && <circle cx={ex} cy={cy + dir * (HALF + 5)} r={5} className={`ca-inhibit${live ? ' is-live' : ''}`} />}
              </g>,
            )
          }
          continue
        }
        // Adjacent columns: a straight segment between the cells.
        const forward = x2 > x1
        const sx = forward ? x1 + HALF : x1 - HALF
        const ex = forward ? x2 - HALF - 2 : x2 + HALF + 2
        if (cut.has(key)) {
          const mx = (sx + ex) / 2
          parts.push(
            <g key={key} data-edge={key} data-state="cut">
              <line x1={sx} y1={cy} x2={mx - 8} y2={cy} className="ca-stroke-cut" />
              <line x1={mx + 8} y1={cy} x2={ex} y2={cy} className="ca-stroke-cut" />
              <path d={`M${mx - 7} ${cy + 9}l6-17M${mx + 1} ${cy + 9}l6-17`} className="ca-stroke-slash" />
              <text x={mx} y={cy - 16} textAnchor="middle" className="ca-svg-small ca-svg-bold">
                {m.cut}
              </text>
            </g>,
          )
          continue
        }
        if (inhibit) {
          const end = forward ? ex - 10 : ex + 10
          parts.push(
            <g key={key} data-edge={key} data-state={live ? 'live' : 'idle'}>
              <line x1={sx} y1={cy} x2={end} y2={cy} className={cls} />
              <circle cx={end + (forward ? 5 : -5)} cy={cy} r={5} className={`ca-inhibit${live ? ' is-live' : ''}`} />
              <text x={(sx + end) / 2} y={cy - 8} textAnchor="middle" className={`ca-mono ca-svg-tiny ca-svg-bold${live ? '' : ' ca-fill-muted'}`}>
                {sub(`¬${e.from}`)}
              </text>
            </g>,
          )
          continue
        }
        parts.push(
          <g key={key} data-edge={key} data-state={live ? 'live' : 'idle'}>
            <line x1={sx} y1={cy} x2={ex} y2={cy} className={cls} markerEnd={marker} />
          </g>,
        )
      }
      const cells = shown.map((id) => {
        const x = colX.get(id) ?? 0
        const v = lane.values[id]
        const on = v === true
        const forced = id in lane.intervened
        const held = lane.fixed !== undefined && id in lane.fixed
        return (
          <g key={id} transform={`translate(${x} ${cy})`} data-cell={id} data-value={v === undefined ? '' : formatValue(v)}>
            <rect x={-HALF} y={-HALF} width={HALF * 2} height={HALF * 2} className={on ? 'ca-node-on' : 'ca-node-off'} />
            <text y={6.5} textAnchor="middle" className={`ca-mono ca-svg-bold${on ? ' ca-fill-bg-text' : ''}`} fontSize={typeof v === 'boolean' ? 18 : 12}>
              {v === undefined ? '' : formatValue(v)}
            </text>
            {forced && (
              <>
                <path d="M-28 -16v-12h12M16 -28h12v12M28 16v12h-12M-16 28h-12v-12" className="ca-stroke-clamp" />
                <g transform="translate(-62 -30)">
                  <rect width={28} height={16} className="ca-fill-accent" />
                  <text x={14} y={12} textAnchor="middle" className="ca-mono ca-svg-tiny ca-svg-bold ca-fill-on-accent">
                    do
                  </text>
                </g>
              </>
            )}
            {held && <rect x={-28} y={-28} width={56} height={56} className="ca-hull" />}
          </g>
        )
      })
      const ov = lane.values[outcome]
      const outX = left + (n - 1) * STEP + 40
      const line2 = outcomeNote(lane)
      return (
        <g key={lane.kind} className={`ca-lane ca-lane-${lane.kind}`} data-lane={lane.kind}>
          {cf && <rect x={1} y={top} width={width - 2} height={LANE} className="ca-lane-cf" />}
          {lane.kind === 'witness' && <line x1={0} y1={top + 0.5} x2={width} y2={top + 0.5} className="ca-hair" />}
          <path d={shown.map((id) => `M${colX.get(id)} ${top}v${LANE}`).join('')} className="ca-guide" />
          {lane.kind === 'actual' && (
            <>
              {tagEl(16, cy - 32, m.actualWorld, 'fg')}
              <text x={16} y={cy + 14} className="ca-mono ca-svg-small ca-fill-muted">
                {sub(m.lanes.context(ctx))}
              </text>
            </>
          )}
          {lane.kind === 'cf' && (
            <>
              {tagEl(16, cy - 46, m.lanes.counterfactual, 'slate')}
              {tagEl(16, cy - 16, doText(lane.intervened), 'accent', true)}
              <text x={16} y={cy + 30} className="ca-svg-small ca-fill-slate">
                {m.lanes.recomputed}
              </text>
            </>
          )}
          {lane.kind === 'witness' && (
            <>
              {tagEl(16, cy - 46, m.lanes.witness, 'amber')}
              {tagEl(16, cy - 16, doText(lane.intervened), 'accent', true)}
              <text x={16} y={cy + 30} className="ca-svg-small ca-fill-amber">
                {sub(heldText(m, lane))}
              </text>
            </>
          )}
          {parts}
          {cells}
          <text x={outX} y={cy - 4} className="ca-mono ca-svg-bold" fontSize={15}>
            {sub(`${outcome}=${ov === undefined ? '' : formatValue(ov)}`)}
          </text>
          <text x={outX} y={cy + 18} fontSize={13} className="ca-svg-text">
            {line2}
          </text>
        </g>
      )
    }

    const diffEl = (top: number): ReactNode => {
      const a = lanes[0]
      const b = lanes[1]
      const yText = top + 16.5
      const outSame = valuesEqual(a.values[outcome] ?? '', b.values[outcome] ?? '')
      return (
        <g className="ca-diff" data-diff="true">
          <rect x={1} y={top} width={width - 2} height={DIFF} className="ca-diff-bg" />
          <text x={16} y={yText} className="ca-svg-tiny ca-svg-bold ca-fill-muted">
            {m.lanes.diff}
          </text>
          {shown.map((id) => {
            const x = colX.get(id) ?? 0
            const va = a.values[id]
            const vb = b.values[id]
            if (va === undefined || vb === undefined || valuesEqual(va, vb)) {
              return (
                <text key={id} x={x} y={yText} textAnchor="middle" className="ca-mono ca-svg-small ca-svg-bold ca-fill-muted" data-diff-cell={id} data-diff-kind="same">
                  {m.lanes.sameCell}
                </text>
              )
            }
            const forced = id in b.intervened
            const text = `${formatValue(va)} → ${formatValue(vb)}`
            return (
              <g key={id} data-diff-cell={id} data-diff-kind={forced ? 'do' : 'recomputed'}>
                <rect x={x - 26} y={top + 3} width={52} height={18} className={forced ? 'ca-fill-accent' : 'ca-fill-slate-bg'} />
                <text x={x} y={yText} textAnchor="middle" className={`ca-mono ca-svg-small ca-svg-bold ${forced ? 'ca-fill-on-accent' : 'ca-fill-on-slate'}`}>
                  {text}
                </text>
              </g>
            )
          })}
          <text x={left + (n - 1) * STEP + 40} y={yText} className="ca-svg-small ca-svg-bold ca-svg-text">
            {outSame ? m.lanes.same : m.lanes.different}
          </text>
        </g>
      )
    }

    const summary = m.lanes.summaryJoin(
      visible.map((l) => {
        const name = l.kind === 'actual' ? m.actualWorld : l.kind === 'cf' ? `${m.lanes.counterfactual} ${doText(l.intervened)}` : m.lanes.witness
        return m.lanes.summaryLane(name, shown.map((id) => `${id}=${formatValue(l.values[id] ?? '')}`))
      }),
    )
    return (
      <svg
        className="ca-lanes-svg"
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        role="img"
        aria-label={summary}
      >
        <defs>
          <marker id={`${ids}-live`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto">
            <path d="M0 0.5L10 5L0 9.5z" className="ca-fill-fg" />
          </marker>
          <marker id={`${ids}-idle`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">
            <path d="M0 0.5L10 5L0 9.5z" className="ca-fill-idle" />
          </marker>
        </defs>
        {shown.map((id) => {
          const x = colX.get(id) ?? 0
          const name = shortLabel(c.model, id, m.locale)
          return longLabels ? (
            <text key={id} x={x} y={24} textAnchor="middle" className="ca-svg-label">
              <tspan className="ca-mono ca-svg-bold">{sub(id)}</tspan>
              <tspan x={x} dy={17} className="ca-svg-small">
                {name}
              </tspan>
            </text>
          ) : (
            <text key={id} x={x} y={29} textAnchor="middle" className="ca-svg-label">
              <tspan className="ca-mono ca-svg-bold">{sub(id)}</tspan>
              {name === '' ? null : ` ${name}`}
            </text>
          )
        })}
        <line x1={0} y1={head + 0.5} x2={width} y2={head + 0.5} className="ca-hair" />
        {visible.map((lane, i) => (
          <g key={lane.kind}>
            {i === 1 && diffEl(laneTops[1] - DIFF)}
            {laneEl(lane, laneTops[i])}
          </g>
        ))}
      </svg>
    )
  }

  const visible = lanes.slice(0, step)
  const action = actionLabel ?? preset?.label[t.locale] ?? t.lanes.apply(doText(doAssign))
  const nextLabel = step === 1 ? action : t.lanes.addWitness
  const exportSource = (locale: Locale): ExportSource | undefined => {
    const m = messagesFor(locale)
    const view = locale === t.locale ? undefined : renderDetached(<LocaleProvider locale={locale}>{drawing(m, `${uid}x`)}</LocaleProvider>)
    const svg = (view?.container ?? stage.current)?.querySelector<SVGSVGElement>('svg.ca-lanes-svg')
    if (svg === null || svg === undefined) {
      view?.dispose()
      return undefined
    }
    return { name: `${c.data.id}-lanes`, title: c.data.title[locale], panels: [{ svg }], origin: originSources(m, c),
      originCitations: originCitations(c), dispose: view?.dispose }
  }
  return (
    <div className="ca-root not-prose ca-lanes" data-case={c.data.id} data-step={step} lang={t.locale}>
      {/* Narrow screens scroll the lanes sideways; the region takes focus so keys can scroll it. */}
      <div className="ca-lanes-stage" role="region" aria-label={t.lanes.region} tabIndex={0} ref={stage}>
        {drawing(t, uid)}
      </div>
      <div className="ca-lanes-foot">
        <div className="ca-lanes-foot-left">
          <Progress step={step} total={total} />
          <TabButton tabs={tabs} id="equations" className="ca-link">
            {tabs.open === 'equations' ? t.lanes.hideEquations : t.lanes.showEquations}
          </TabButton>
          <ExportMenu url={exportUrl} source={exportSource} origins={originCitations(c)} />
        </div>
        <div className="ca-lanes-foot-right">
          {step > 1 && (
            <button type="button" className="ca-link" onClick={() => setStep(step - 1)}>
              {t.back}
            </button>
          )}
          {step < total ? (
            <button type="button" className="ca-btn ca-btn-primary" onClick={() => setStep(step + 1)}>
              {nextLabel}
              <Arrow />
            </button>
          ) : (
            <button type="button" className="ca-btn ca-btn-outline" onClick={() => setStep(1)}>
              {t.lanes.again}
            </button>
          )}
        </div>
      </div>
      <TabPanel tabs={tabs} id="equations" className="ca-lanes-eq">
        <div className="ca-eq-head">
          <Segmented label={t.notationLabel} options={notations(t)} value={notation} onChange={setNotation} />
          <CopyLatex
            c={c}
            shown={shown}
            notation={notation}
            values={visible[visible.length - 1].values}
            interventions={visible[visible.length - 1].intervened}
          />
        </div>
        <Equations
          c={c}
          shown={shown}
          notation={notation}
          values={visible[visible.length - 1].values}
          interventions={visible[visible.length - 1].intervened}
        />
      </TabPanel>
    </div>
  )
}
