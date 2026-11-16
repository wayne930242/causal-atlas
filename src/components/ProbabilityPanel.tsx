import type { ReactNode } from 'react'
import { useMemo, useRef, useState } from 'react'
import { getCase } from '../data/index.ts'
import type { LoadedCase } from '../data/load.ts'
import type { Assignment } from '../engine/index.ts'
import { evaluate, getVariable, probability } from '../engine/index.ts'
import { Equations } from './Equations.tsx'
import type { UiNotation } from './notation.ts'
import { NOTATIONS } from './notation.ts'
import { Disclosure, Segmented, Tag } from './parts.tsx'
import { SignalGraph } from './SignalGraph.tsx'
import { useNarrow } from './use-narrow.ts'
import type { SeeDoPair } from './verdict-rows.ts'
import { seeDoPair } from './verdict-rows.ts'
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
} from './view-model.ts'

export type ProbabilityView = 'sliders' | 'compare'

export interface ProbabilityPanelProps {
  readonly caseId: string
  /** `sliders`: set p per exogenous variable. `compare`: observing vs do() side by side. */
  readonly view?: ProbabilityView
  /** For `compare`: the observation, the do() and the event. Defaults to the case's own pair. */
  readonly pair?: SeeDoPair
}

const SAME = 0.005

function notesAgainst(
  base: Readonly<Record<string, number>>,
  now: Readonly<Record<string, number>>,
  shown: readonly string[],
  own: string,
  ownNote: string,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const id of shown) {
    if (id === own) out[id] = ownNote
    else out[id] = Math.abs((now[id] ?? 0) - (base[id] ?? 0)) < SAME ? '不變' : `原本 ${probText(base[id] ?? Number.NaN)}`
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
  const ids = sliderVariables(c)
  return (
    <div className="ca-prob-sliders">
      <div className="ca-eq-head">
        {withHead && <h3 className="ca-h3">式子和機率</h3>}
        <Segmented label="式子的寫法" options={NOTATIONS} value={notation} onChange={onNotation} />
      </div>
      <Equations c={c} shown={shown} notation={notation} interventions={{}} />
      {ids.length === 0 ? (
        <p className="ca-muted">這個案例的機率是整張聯合分布，不能逐一調整。</p>
      ) : (
        <ul className="ca-slider-list">
          {ids.map((id) => {
            const variable = getVariable(c.model, id)
            const p = sliders[id] ?? 0
            return (
              <li key={id} className="ca-slider-row">
                <span className="ca-slider-var ca-mono">{id}</span>
                <label className="ca-slider-label" htmlFor={`ca-slider-${c.data.id}-${id}`}>
                  {label(c.model, id)}的機率
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
export function ProbabilityPanel({ caseId, view = 'sliders', pair }: ProbabilityPanelProps) {
  const c = getCase(caseId)
  return <ProbabilityPanelFor c={c} view={view} pair={pair} />
}

export function ProbabilityPanelFor({ c, view = 'sliders', pair }: { c: LoadedCase; view?: ProbabilityView; pair?: SeeDoPair }) {
  const [sliders, setSliders] = useState<Record<string, number>>(() => defaultSliders(c))
  const [notation, setNotation] = useState<UiNotation>('propositional')
  const [mode, setMode] = useState<'value' | 'probability'>('probability')
  const shown = useMemo(() => shownVariables(c), [c])
  const prior = useMemo(() => priorWithSliders(c, sliders), [c, sliders])
  const base = useMemo(() => marginals(c.model, prior).p, [c, prior])
  const onSlider = (id: string, p: number): void => setSliders((s) => ({ ...s, [id]: p }))
  const wrap = useRef<HTMLDivElement>(null)
  const narrow = useNarrow(wrap, 560)

  if (view === 'compare') {
    const p = pair ?? seeDoPair(c)
    if (p === undefined) throw new Error(`case ${c.data.id} has no observe/do pair for the comparison`)
    return <Compare c={c} pair={p} prior={prior} base={base} shown={shown} sliderSection={
      <SliderSection c={c} sliders={sliders} onSlider={onSlider} notation={notation} onNotation={setNotation} shown={shown} withHead={false} />
    } />
  }

  const showValues = mode === 'value' && c.context !== undefined
  const values = showValues && c.context !== undefined ? evaluate(c.model, c.context).values : undefined
  return (
    <div className="ca-root not-prose ca-panel ca-prob" data-case={c.data.id} data-view="sliders">
      <div className="ca-box ca-graph-box">
        <div className="ca-box-head">
          {c.context !== undefined ? (
            <Segmented
              label="節點顯示"
              options={[
                { value: 'value', label: '0／1' },
                { value: 'probability', label: '機率' },
              ]}
              value={mode}
              onChange={setMode}
            />
          ) : (
            <Tag tone="fg">機率</Tag>
          )}
          <span className="ca-muted ca-small">{probLegend(c.model, shown)}</span>
        </div>
        <div className="ca-graph-wrap" ref={wrap}>
          <SignalGraph
            compact={narrow}
            c={c}
            shown={shown}
            values={values}
            probs={showValues ? undefined : base}
            interventions={{}}
            removedEdges={[]}
            title={`${c.data.title.zh}：各變項等於 1 的機率`}
          />
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
}

function Compare({ c, pair, prior, base, shown, sliderSection }: CompareProps) {
  const observedId = /^\s*([A-Za-z_][A-Za-z0-9_]*)/.exec(pair.observe)?.[1] ?? ''
  const doId = Object.keys(pair.intervene)[0] ?? ''
  let see: Record<string, number> | undefined
  let seeValue = Number.NaN
  try {
    see = { ...marginals(c.model, prior, { given: pair.observe }).p }
    seeValue = probability(c.model, prior, { event: pair.event, given: pair.observe }).value
  } catch {
    see = undefined
  }
  const doP = marginals(c.model, prior, { do: pair.intervene }).p
  const doValue = probability(c.model, prior, { event: pair.event, do: pair.intervene }).value
  const cut = new Set(Object.keys(pair.intervene))
  const removed = c.model.edges.filter((e) => cut.has(e.to))
  const seeExpr = `P(${pair.event} | ${pair.observe})`
  const doExpr = `P(${pair.event} | ${doText(pair.intervene)})`
  const obsLabel = label(c.model, observedId)
  return (
    <div className="ca-root not-prose ca-panel ca-prob" data-case={c.data.id} data-view="compare">
      <div className="ca-compare">
        <div className="ca-compare-side" data-side="see">
          <div className="ca-box-head">
            <Tag tone="outline">觀察 {pair.observe}</Tag>
          </div>
          <div className="ca-graph-wrap">
            {see === undefined ? (
              <p className="ca-muted">這個觀察的機率是 0，無法以它為條件。</p>
            ) : (
              <SignalGraph
                c={c}
                shown={shown}
                probs={see}
                probNotes={notesAgainst(base, see, shown, observedId, '看到的')}
                observed={[observedId]}
                compact
                interventions={{}}
                removedEdges={[]}
                title={`觀察 ${pair.observe} 之後的機率`}
              />
            )}
          </div>
          <div className="ca-compare-result">
            <div>
              <code className="ca-mono ca-muted ca-small">{seeExpr}</code>
              <p className="ca-big ca-mono" data-testid="see-value">
                {probText(seeValue)}
              </p>
            </div>
            <p className="ca-compare-text">看到{obsLabel}，會改變對其他變項的猜測，上游的也會跟著變。</p>
          </div>
        </div>
        <div className="ca-compare-side is-cf" data-side="do">
          <div className="ca-box-head">
            <div className="ca-tags">
              <Tag tone="slate">干預後</Tag>
              <Tag tone="accent" mono>
                {doText(pair.intervene)}
              </Tag>
            </div>
          </div>
          <div className="ca-graph-wrap">
            <SignalGraph
              c={c}
              shown={shown}
              probs={doP}
              probNotes={notesAgainst(base, doP, shown, doId, '設定的')}
              interventions={pair.intervene as Assignment}
              removedEdges={removed}
              compact
              title={`${doText(pair.intervene)} 之後的機率`}
            />
          </div>
          <div className="ca-compare-result">
            <div>
              <code className="ca-mono ca-muted ca-small">{doExpr}</code>
              <p className="ca-big ca-mono" data-testid="do-value">
                {probText(doValue)}
              </p>
            </div>
            <p className="ca-compare-text">動手設定{label(c.model, doId)}，指進它的箭頭被剪斷，只有下游會變。</p>
          </div>
        </div>
      </div>
      <Disclosure kicker="" title="式子和機率" className="ca-compare-more">
        {sliderSection}
      </Disclosure>
    </div>
  )
}
