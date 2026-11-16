import type { ReactNode } from 'react'
import { useId, useMemo, useState } from 'react'
import { getCase } from '../data/index.ts'
import type { LoadedCase } from '../data/load.ts'
import type { Assignment, CausalTheory, Edge, Value } from '../engine/index.ts'
import { actualCause, evaluate } from '../engine/index.ts'
import { formatValue, valuesEqual } from '../engine/values.ts'
import { Equations } from './Equations.tsx'
import { Arrow, Progress } from './parts.tsx'
import {
  assignmentText,
  columnOrder,
  doText,
  edgeLive,
  edgePolarity,
  label,
  outcomeVariable,
  shownEdges,
  shownVariables,
  textWidth,
} from './view-model.ts'

export interface WorldLanesProps {
  readonly caseId: string
  /** The counterfactual's do(); defaults to the case's first preset. */
  readonly interventions?: Assignment
  /** Text on the button that adds the counterfactual lane. */
  readonly actionLabel?: string
  /** Adds a third step: the HP witness world for this cause and effect. */
  readonly witness?: { readonly cause: string; readonly effect: string; readonly theory?: CausalTheory }
  readonly initialStep?: number
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
        {text}
      </text>
    </g>
  )
}

/** Direction 2 「世界分道」: each world is a row of cells; columns line up so changes read down a column. */
export function WorldLanes({ caseId, interventions, actionLabel, witness, initialStep = 1 }: WorldLanesProps) {
  const c = getCase(caseId)
  return <WorldLanesFor c={c} interventions={interventions} actionLabel={actionLabel} witness={witness} initialStep={initialStep} />
}

function WorldLanesFor({ c, interventions, actionLabel, witness, initialStep = 1 }: Omit<WorldLanesProps, 'caseId'> & { c: LoadedCase }) {
  const context = c.context
  if (context === undefined) throw new Error(`WorldLanes needs a case with an actual context; ${c.data.id} has none`)
  const preset = c.data.showcase[0]
  const doAssign = interventions ?? preset?.interventions
  if (doAssign === undefined) throw new Error(`WorldLanes: case ${c.data.id} has no preset; pass interventions`)
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const [showEq, setShowEq] = useState(false)

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
  const colX = new Map(shown.map((id, i) => [id, LEFT + i * STEP]))
  const width = LEFT + (n - 1) * STEP + RIGHT
  const edges = shownEdges(c.model.edges, shown)
  const longLabels = shown.some((id) => textWidth(`${id} ${label(c.model, id)}`, 13) > STEP - 6)
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

  const visible = lanes.slice(0, step)
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
      const marker = `url(#${uid}-${live ? 'live' : 'idle'})`
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
                切斷
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
              切斷
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
              ¬{e.from}
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
          {held && (
            <>
              <rect x={-28} y={-28} width={56} height={56} className="ca-hull" />
              {tagEl(-36, -56, `固定 ${id}=${formatValue(lane.fixed?.[id] ?? '')}`, 'amber')}
            </>
          )}
        </g>
      )
    })
    const ov = lane.values[outcome]
    const actualOut = lanes[0].values[outcome]
    const same = ov !== undefined && actualOut !== undefined && valuesEqual(ov, actualOut)
    const outX = LEFT + (n - 1) * STEP + 40
    const line2 =
      lane.kind === 'actual' ? (ov === true ? label(c.model, outcome) : `${label(c.model, outcome)}：沒有`) : same ? '和實際一樣' : '和實際不同'
    const ctx = Object.entries(context)
      .map(([id, v]) => `${id}=${formatValue(v as Value)}`)
      .join(' · ')
    return (
      <g key={lane.kind} className={`ca-lane ca-lane-${lane.kind}`} data-lane={lane.kind}>
        {cf && <rect x={1} y={top} width={width - 2} height={LANE} className="ca-lane-cf" />}
        <path d={shown.map((id) => `M${colX.get(id)} ${top}v${LANE}`).join('')} className="ca-guide" />
        {lane.kind === 'actual' && (
          <>
            {tagEl(16, cy - 32, '實際世界', 'fg')}
            <text x={16} y={cy + 14} className="ca-mono ca-svg-small ca-fill-muted">
              脈絡 {ctx}
            </text>
          </>
        )}
        {lane.kind === 'cf' && (
          <>
            {tagEl(16, cy - 46, '反事實世界', 'slate')}
            {tagEl(16, cy - 16, doText(lane.intervened), 'accent', true)}
            <text x={16} y={cy + 30} className="ca-svg-small ca-fill-slate">
              其餘照式子重算
            </text>
          </>
        )}
        {lane.kind === 'witness' && (
          <>
            {tagEl(16, cy - 46, 'HP 見證世界', 'amber')}
            {tagEl(16, cy - 16, doText(lane.intervened), 'accent', true)}
            <text x={16} y={cy + 30} className="ca-svg-small ca-fill-amber">
              {assignmentText(lane.fixed ?? {})} 固定在實際值
            </text>
          </>
        )}
        {parts}
        {cells}
        <text x={outX} y={cy - 4} className="ca-mono ca-svg-bold" fontSize={15}>
          {outcome}={ov === undefined ? '' : formatValue(ov)}
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
          差異
        </text>
        {shown.map((id) => {
          const x = colX.get(id) ?? 0
          const va = a.values[id]
          const vb = b.values[id]
          if (va === undefined || vb === undefined || valuesEqual(va, vb)) {
            return (
              <text key={id} x={x} y={yText} textAnchor="middle" className="ca-mono ca-svg-small ca-svg-bold ca-fill-muted" data-diff-cell={id} data-diff-kind="same">
                ＝
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
        <text x={LEFT + (n - 1) * STEP + 40} y={yText} className="ca-svg-small ca-svg-bold ca-svg-text">
          {outSame ? '一樣' : '不同'}
        </text>
      </g>
    )
  }

  const summary = visible
    .map((l) => {
      const name = l.kind === 'actual' ? '實際世界' : l.kind === 'cf' ? `反事實世界 ${doText(l.intervened)}` : 'HP 見證世界'
      return `${name}：${shown.map((id) => `${id}=${formatValue(l.values[id] ?? '')}`).join('，')}`
    })
    .join('。')

  const action = actionLabel ?? preset?.label.zh ?? `套上 ${doText(doAssign)}`
  const nextLabel = step === 1 ? action : '加上 HP 見證'
  return (
    <div className="ca-root not-prose ca-lanes" data-case={c.data.id} data-step={step}>
      <div className="ca-lanes-stage">
        <svg
          className="ca-lanes-svg"
          viewBox={`0 0 ${width} ${height}`}
          width={width}
          height={height}
          role="img"
          aria-label={summary}
        >
          <defs>
            <marker id={`${uid}-live`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto">
              <path d="M0 0.5L10 5L0 9.5z" className="ca-fill-fg" />
            </marker>
            <marker id={`${uid}-idle`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">
              <path d="M0 0.5L10 5L0 9.5z" className="ca-fill-idle" />
            </marker>
          </defs>
          {shown.map((id) => {
            const x = colX.get(id) ?? 0
            const name = label(c.model, id)
            return longLabels ? (
              <text key={id} x={x} y={24} textAnchor="middle" className="ca-svg-label">
                <tspan className="ca-mono ca-svg-bold">{id}</tspan>
                <tspan x={x} dy={17} className="ca-svg-small">
                  {name}
                </tspan>
              </text>
            ) : (
              <text key={id} x={x} y={29} textAnchor="middle" className="ca-svg-label">
                <tspan className="ca-mono ca-svg-bold">{id}</tspan> {name}
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
      </div>
      <div className="ca-lanes-foot">
        <div className="ca-lanes-foot-left">
          <Progress step={step} total={total} />
          <button type="button" className="ca-link" aria-expanded={showEq} onClick={() => setShowEq((s) => !s)}>
            {showEq ? '收起式子' : '看式子'}
          </button>
        </div>
        <div className="ca-lanes-foot-right">
          {step > 1 && (
            <button type="button" className="ca-link" onClick={() => setStep(step - 1)}>
              上一步
            </button>
          )}
          {step < total ? (
            <button type="button" className="ca-btn ca-btn-primary" onClick={() => setStep(step + 1)}>
              {nextLabel}
              <Arrow />
            </button>
          ) : (
            <button type="button" className="ca-btn ca-btn-outline" onClick={() => setStep(1)}>
              重來
            </button>
          )}
        </div>
      </div>
      {showEq && (
        <div className="ca-lanes-eq">
          <Equations
            c={c}
            shown={shown}
            notation="propositional"
            values={visible[visible.length - 1].values}
            interventions={visible[visible.length - 1].intervened}
          />
        </div>
      )}
    </div>
  )
}
