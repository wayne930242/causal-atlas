import { useMemo, useRef, useState } from 'react'
import type { LoadedCase } from '../data/load.ts'
import type { Prior } from '../engine/index.ts'
import { tableNumber } from './adjust-view.ts'
import { MAX_PATHS, pathReason, pathText } from './dsep-view.ts'
import { graphExport } from './export-render.tsx'
import type { ExportSource } from './export-image.ts'
import { ExportMenu } from './ExportMenu.tsx'
import type { Locale, Messages } from './i18n.ts'
import { messagesFor, useMessages } from './i18n.ts'
import type { RuleStep } from './rules-view.ts'
import { SIDE_TOLERANCE, ruleView, sideText } from './rules-view.ts'
import { Segmented, Tag, Tip } from './parts.tsx'
import { SignalGraph } from './SignalGraph.tsx'
import { Formula, Rich } from './typeset.tsx'
import { useNarrow } from './use-narrow.ts'
import { originCitations, originSources } from './verdict-rows.ts'

/**
 * The do-calculus rules on their cut graphs (lesson 06): a step button per step of the
 * derivation, the step's cut graph with no numbers (cut arrows struck, the variables whose
 * incoming arrows are cut clamped, the known set ringed, the pair's paths lit or dashed), a line
 * saying whether the pair is separated and the rule applies, and the step's equation on the full
 * model. A click on a node adds it to the known set or takes it out; the step button restores it.
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
  readonly steps: readonly RuleStep[]
  readonly shown: readonly string[]
  readonly exportUrl?: string
}) {
  const t = useMessages()
  if (steps.length === 0) throw new Error(`case ${c.data.id}: view="rules" needs at least one step`)
  const [at, setAt] = useState(0)
  const step = steps[Math.min(at, steps.length - 1)]
  const [known, setKnown] = useState<readonly string[]>(step.given)
  const view = useMemo(() => ruleView(c, prior, step, known), [c, prior, step, known])
  const wrap = useRef<HTMLDivElement>(null)
  const narrow = useNarrow(wrap, 560)
  const go = (i: number): void => {
    setAt(i)
    setKnown(steps[i].given)
  }
  const pick = (id: string): void => setKnown((now) => (now.includes(id) ? now.filter((k) => k !== id) : [...now, id]))
  const ruleName = t.rules.rule(step.rule)
  const graph = (m: Messages, interactive: boolean) => (
    <SignalGraph
      compact={narrow}
      c={c}
      shown={shown}
      interventions={{}}
      removedEdges={view.removed}
      clamped={step.cutIn ?? []}
      observed={known}
      paths={view.marks}
      onPick={interactive ? pick : undefined}
      title={m.rules.graphTitle(c.data.title[m.locale], m.rules.rule(step.rule))}
    />
  )
  const exportSource = (locale: Locale): ExportSource | undefined => {
    const m = messagesFor(locale)
    const { svg, dispose } = graphExport(locale, t, () => wrap.current?.querySelector<SVGSVGElement>('svg.ca-graph'), () => graph(m, false))
    if (svg === null) {
      dispose?.()
      return undefined
    }
    return {
      name: `${c.data.id}-rule-${step.label}`,
      title: c.data.title[locale],
      panels: [
        {
          svg,
          tags: [
            { text: m.rules.rule(step.rule), tone: 'fg' },
            { text: m.rules.cut(step.cutIn ?? [], step.cutOut ?? []), tone: 'outline' },
          ],
        },
      ],
      legend: '',
      origin: originSources(m, c),
      originCitations: originCitations(c),
      dispose,
    }
  }
  const d = t.dsep
  const ids = c.model.byId
  const { result } = view
  const sides = view.sides
  const equal = sides !== undefined && Math.abs(sides[0] - sides[1]) < SIDE_TOLERANCE
  return (
    <div className="ca-root not-prose ca-panel ca-prob" data-case={c.data.id} data-view="rules" lang={t.locale}>
      <div className="ca-box ca-graph-box">
        <div className="ca-box-head">
          <div className="ca-tags">
            <Tag tone="fg">{ruleName}</Tag>
            <Tag tone="outline">
              <Rich text={t.rules.cut(step.cutIn ?? [], step.cutOut ?? [])} ids={ids} />
            </Tag>
          </div>
          <div className="ca-box-actions">
            <Segmented className="ca-rules-steps" label={t.rules.steps} options={steps.map((s, i) => ({ value: String(i), label: s.label }))} value={String(Math.min(at, steps.length - 1))} onChange={(v) => go(Number(v))} />
            <ExportMenu source={exportSource} url={exportUrl} origins={originCitations(c)} />
          </div>
        </div>
        <div className="ca-graph-wrap" ref={wrap}>
          {graph(t, true)}
        </div>
        <div className="ca-rules-line ca-dsep-line" data-dsep={result.separated ? 'blocked' : 'open'}>
          <p className="ca-dsep-head">
            <span className="ca-pg-now-kicker">{d.pair(step.pair[0], step.pair[1])}</span> <Rich text={d.known([...known])} ids={ids} /> →{' '}
            <strong>{result.separated ? t.rules.separated : d.open}</strong>
            {result.separated ? t.rules.applies(ruleName) : t.rules.notApplies(ruleName)} <Tip tip={t.rules.tip} label={t.moreInfo} />
          </p>
          <ul className="ca-dsep-paths">
            {result.paths.length === 0 && <li>{d.noPath}</li>}
            {result.paths.slice(0, MAX_PATHS).map((p) => (
              <li key={p.nodes.join('-')} data-path-open={p.open ? 'true' : 'false'}>
                <Formula text={pathText(p)} />
                {d.pathSep}
                <Rich text={pathReason(t, p)} ids={ids} />
              </li>
            ))}
            {result.paths.length > MAX_PATHS && <li>{d.more(result.paths.length - MAX_PATHS)}</li>}
          </ul>
        </div>
        {step.equal !== undefined && sides !== undefined && (
          <p className="ca-rules-equal" data-equal={equal ? 'true' : 'false'}>
            <code className="ca-mono">
              <Formula
                text={`${sideText(step.equal[0])} = ${tableNumber(sides[0])} ${equal ? '=' : '≠'} ${sideText(step.equal[1])} = ${tableNumber(sides[1])}`}
              />
            </code>{' '}
            <span className={equal ? 'ca-adj-ok' : 'ca-adj-no'}>{equal ? '✓' : '✗'}</span>
          </p>
        )}
      </div>
    </div>
  )
}
