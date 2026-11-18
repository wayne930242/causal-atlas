import type { ReactNode } from 'react'
import { useMemo, useRef, useState } from 'react'
import type { LoadedCase } from '../../data/load.ts'
import type { Prior } from '../../engine/index.ts'
import { formatValue, getVariable } from '../../engine/index.ts'
import type { AdjustView } from './adjust-view.ts'
import { adjustSets, adjustView, tableNumber } from './adjust-view.ts'
import { pathText } from '../model/dsep-view.ts'
import { graphExport } from '../export/export-render.tsx'
import type { ExportSource } from '../export/export-image.ts'
import { ExportMenu } from '../export/ExportMenu.tsx'
import type { Locale, Messages } from '../i18n/messages.ts'
import { messagesFor, useMessages } from '../i18n/messages.ts'
import { Disclosure, Segmented, Tag, Tip } from '../shared/parts.tsx'
import { SignalGraph } from '../graph/SignalGraph.tsx'
import { Formula, Rich } from '../text/typeset.tsx'
import { useNarrow } from '../shared/use-narrow.ts'
import { originCitations, originSources } from '../model/verdict-rows.ts'
import { marginals, probLegend } from '../model/view-model.ts'

/** What the adjustment calculator compares: the cause, the effect, and optionally the groupings offered. */
export interface AdjustSpec {
  readonly x: string
  readonly y: string
  /** Groupings for the switch; default every grouping of the endogenous variables other than x and y (at most three of them). */
  readonly sets?: readonly (readonly string[])[]
}

/** `Z、C`, or 不分組 for none. */
function setLabel(t: Messages, set: readonly string[]): string {
  return set.length === 0 ? t.adj.none : t.list(set)
}

function verdictLine(t: Messages, v: AdjustView, x: string): string {
  if (v.criterion) return `✓ ${t.adj.ok}`
  const reasons = [
    ...v.descendants.map((id) => t.adj.descendant(id, x)),
    ...v.opened.map((o) => t.adj.opened(o.by, pathText(o.path))),
    ...v.openBackdoors.map((p) => t.adj.backdoor(pathText(p))),
  ]
  return `✗ ${t.clauses(reasons)}`
}

/**
 * The adjustment formula, one grouping at a time (lesson 05): the graph with the grouped variables
 * ringed and only the non-causal paths between x and y marked, a line with the back-door verdict
 * and whether the weighted sum equals the do() value, and the table of strata behind the sum.
 */
export function AdjustPanel({
  c,
  prior,
  spec,
  shown: drawn,
  exportUrl,
  sliderSection,
}: {
  readonly c: LoadedCase
  readonly prior: Prior
  readonly shown: readonly string[]
  readonly spec: AdjustSpec
  readonly exportUrl?: string
  readonly sliderSection: ReactNode
}) {
  const t = useMessages()
  const { x, y } = spec
  getVariable(c.model, x)
  getVariable(c.model, y)
  const sets = useMemo(() => (spec.sets ?? adjustSets(c, x, y)).map((s) => [...s]), [c, spec.sets, x, y])
  for (const s of sets) for (const id of s) getVariable(c.model, id)
  const [picked, setPicked] = useState(0)
  const set = useMemo(() => sets[Math.min(picked, sets.length - 1)] ?? [], [sets, picked])
  const view = useMemo(() => adjustView(c, prior, x, y, set), [c, prior, x, y, set])
  const base = useMemo(() => marginals(c.model, prior), [c, prior])
  const wrap = useRef<HTMLDivElement>(null)
  const narrow = useNarrow(wrap, 560)
  const event = `${y}=${formatValue(view.yValue)}`
  const xText = (i: number): string => `${x}=${formatValue(view.xs[i])}`
  const graph = (m: Messages) => (
    <SignalGraph
      compact={narrow}
      c={c}
      shown={drawn}
      probs={base.p}
      dists={base.dist}
      probNotes={Object.fromEntries(set.map((id) => [id, m.adj.grouped]))}
      observed={set}
      interventions={{}}
      removedEdges={[]}
      paths={view.marks}
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
      name: `${c.data.id}-adjust`,
      title: c.data.title[locale],
      panels: [{ svg, tags: [{ text: m.adj.by(setLabel(m, set)), tone: 'fg' }] }],
      legend: probLegend(m, c.model, drawn),
      origin: originSources(m, c),
      originCitations: originCitations(c),
      dispose,
    }
  }
  return (
    <div className="ca-root not-prose ca-panel ca-prob" data-case={c.data.id} data-view="adjust" lang={t.locale}>
      <div className="ca-box ca-graph-box">
        <div className="ca-box-head">
          <Tag tone="fg">{t.adj.tag}</Tag>
          <div className="ca-box-actions">
            <Segmented
              label={t.adj.sets}
              options={sets.map((s, i) => ({ value: String(i), label: setLabel(t, s) }))}
              value={String(Math.min(picked, sets.length - 1))}
              onChange={(v) => setPicked(Number(v))}
            />
            <ExportMenu source={exportSource} url={exportUrl} origins={originCitations(c)} />
          </div>
        </div>
        <div className="ca-graph-wrap" ref={wrap}>
          {graph(t)}
        </div>
        <p className="ca-adj-line" data-criterion={view.criterion ? 'true' : 'false'}>
          <span className={view.criterion ? 'ca-adj-ok' : 'ca-adj-no'}>
            <Rich text={verdictLine(t, view, x)} ids={c.model.byId} />
          </span>{' '}
          <strong>{view.equal ? t.adj.equal : t.adj.differ}</strong> <Tip tip={t.adj.tip} label={t.moreInfo} />
        </p>
        <div className="ca-table-wrap">
          <table className="ca-table ca-adj-table">
            <thead>
              <tr>
                <th scope="col">{t.adj.group}</th>
                <th scope="col" className="ca-num">
                  {t.adj.pGroup}
                </th>
                {view.xs.map((_, i) => (
                  <th key={i} scope="col" className="ca-num">
                    <span className="ca-adj-formula">
                      <Formula text={`P(${event} | ${xText(i)}, ${t.adj.group})`} />
                    </span>
                    <span className="ca-adj-short">
                      <Formula text={xText(i)} />
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {view.strata.map((s) => (
                <tr key={JSON.stringify(s.values)} data-empty={s.weight > 0 ? undefined : 'true'}>
                  <th scope="row">
                    <Formula text={set.length === 0 ? t.adj.all : set.map((id) => `${id}=${formatValue(s.values[id])}`).join(', ')} />
                  </th>
                  <td className="ca-mono ca-num">{tableNumber(s.weight)}</td>
                  {s.given.map((g, i) => (
                    <td key={i} className="ca-mono ca-num">
                      {s.weight > 0 ? tableNumber(g) : '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="ca-adj-sum">
                <th scope="row" colSpan={2}>
                  {t.adj.weighted}{' '}
                  <span className="ca-adj-formula">
                    <Formula text={`Σ P(${event} | ${x}, ${t.adj.group}) P(${t.adj.group})`} />
                  </span>
                </th>
                {view.sums.map((s, i) => (
                  <td key={i} className="ca-mono ca-num" data-adj-sum={i}>
                    {tableNumber(s)}
                  </td>
                ))}
              </tr>
              <tr>
                <th scope="row" colSpan={2}>
                  {t.adj.doRow}{' '}
                  <span className="ca-adj-formula">
                    <Formula text={`P(${event} | do(${x}))`} />
                  </span>
                </th>
                {view.doValues.map((d, i) => (
                  <td key={i} className="ca-mono ca-num" data-adj-do={i}>
                    {tableNumber(d)}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
      <Disclosure kicker="" title={t.probEquations} className="ca-compare-more">
        {sliderSection}
      </Disclosure>
    </div>
  )
}
