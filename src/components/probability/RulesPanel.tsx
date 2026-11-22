import type { CSSProperties } from 'react'
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { LoadedCase } from '../../data/load.ts'
import type { Prior } from '../../engine/index.ts'
import { tableNumber } from './adjust-view.ts'
import { MAX_PATHS, pathReason, pathText } from '../model/dsep-view.ts'
import { singleGraphSource } from '../export/export-render.tsx'
import type { ExportSource } from '../export/export-image.ts'
import { ExportMenu } from '../export/ExportMenu.tsx'
import type { Locale, Messages } from '../i18n/messages.ts'
import { useMessages } from '../i18n/messages.ts'
import type { RuleMark, RuleStep } from './rules-view.ts'
import { SIDE_TOLERANCE, nodeRoles, presentMarks, ruleView, sideText } from './rules-view.ts'
import { placeTip } from '../panels/menu-place.ts'
import { useDigits } from '../shared/digits.ts'
import { Segmented, Tag, Tip } from '../shared/parts.tsx'
import { SignalGraph } from '../graph/SignalGraph.tsx'
import { Formula, Rich } from '../text/typeset.tsx'
import { useNarrow } from '../shared/use-narrow.ts'
import { originCitations } from '../model/verdict-rows.ts'

const RULE_SYMBOLS = new Set(['Z', 'W'])

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
    clamp: <path d="M4 7V2h5M13 2h5v5M18 9v5h-5M9 14H4V9" className="ca-stroke-clamp" />,
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
  const digits = useDigits()
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
  const r = t.rules
  const rolesText = (m: Messages, id: string): string => {
    const roles = nodeRoles(step, known, id).map((role) => m.rules.role[role])
    return roles.length === 0 ? m.rules.role.none : m.rules.roles(roles)
  }
  const notes = Object.fromEntries(shown.map((id) => [id, rolesText(t, id)]))
  const marks = presentMarks(c, step, view, known, shown)
  // A node under the pointer (or keyboard focus) says what it is in this step, above the node.
  const [hover, setHover] = useState<string | undefined>(undefined)
  const hovered = hover !== undefined && shown.includes(hover) ? hover : undefined
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
      c={c}
      shown={shown}
      interventions={{}}
      removedEdges={view.removed}
      clamped={step.cutIn ?? []}
      observed={known}
      paths={view.marks}
      onPick={interactive ? pick : undefined}
      onHover={interactive ? setHover : undefined}
      nodeNotes={interactive ? notes : undefined}
      title={m.rules.graphTitle(c.data.title[m.locale], m.rules.rule(step.rule))}
    />
  )
  const exportSource = (locale: Locale): ExportSource | undefined =>
    singleGraphSource(c, locale, t, wrap, digits, (m) => graph(m, false), (svg, m) => ({
      name: `${c.data.id}-rule-${step.label}`,
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
    }))
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
          {hovered !== undefined && (
            <div className="ca-edge-tip ca-node-tip" role="tooltip" data-node-tip={hovered} style={tipStyle}>
              {r.nodeTip(rolesText(t, hovered), known.includes(hovered))}
            </div>
          )}
        </div>
        <ul className="ca-legend ca-rules-legend" aria-label={r.legend.label}>
          {marks.map((mark) => (
            <li key={mark} data-mark={mark}>
              <Swatch mark={mark} />
              {r.legend[mark]}
            </li>
          ))}
          <li data-mark="pick">{r.legend.pick}</li>
        </ul>
        <div className="ca-rules-line ca-dsep-line" data-dsep={result.separated ? 'blocked' : 'open'}>
          <p className="ca-dsep-head">
            <span className="ca-pg-now-kicker"><Rich text={d.pair(step.pair[0], step.pair[1])} ids={ids} /></span> <Rich text={d.known([...known])} ids={ids} /> →{' '}
            <strong>{result.separated ? t.rules.separated : d.open}</strong>
            {result.separated ? t.rules.applies(ruleName) : t.rules.notApplies(ruleName)} <Tip tip={<Rich text={t.rules.tip} ids={RULE_SYMBOLS} />} label={t.moreInfo} />
          </p>
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
