import type { ReactNode } from 'react'
import { useRef, useState } from 'react'
import type { LoadedCase } from '../../data/load.ts'
import type { Assignment } from '../../engine/index.ts'
import { probability } from '../../engine/index.ts'
import { renderDetached } from '../export/export-render.tsx'
import type { ExportPanel, ExportSource } from '../export/export-image.ts'
import { ExportMenu } from '../export/ExportMenu.tsx'
import type { Locale, Messages } from '../i18n/messages.ts'
import { LocaleProvider, messagesFor, useMessages } from '../i18n/messages.ts'
import { FigureTabs } from '../shared/FigureTabs.tsx'
import { Segmented, Tag } from '../shared/parts.tsx'
import { SignalGraph } from '../graph/SignalGraph.tsx'
import { Formula, Rich } from '../text/typeset.tsx'
import type { SeeDoPair } from '../model/verdict-rows.ts'
import { originCitations, originSources } from '../model/verdict-rows.ts'
import { marginals, priorWithSliders } from '../model/probability-view.ts'
import { changeNotes, doText, probLegend, probText, phraseOf } from '../model/wording.ts'

function notesAgainst(
  t: Messages,
  base: Readonly<Record<string, number>>,
  now: Readonly<Record<string, number>>,
  shown: readonly string[],
  own: string,
  ownNote: string,
): Record<string, string> {
  const changed = changeNotes(t, base, now, shown)
  const out: Record<string, string> = {}
  for (const id of shown) out[id] = id === own ? ownNote : (changed[id] ?? t.unchanged)
  return out
}

export interface ComparePanelProps {
  readonly c: LoadedCase
  readonly pairs: readonly SeeDoPair[]
  readonly prior: ReturnType<typeof priorWithSliders>
  readonly base: Readonly<Record<string, number>>
  readonly shown: readonly string[]
  readonly sliderSection: ReactNode
  readonly exportUrl?: string
}

/** The compare view: the graph observing a value beside the graph setting it by do(), each with the event's probability. */
export function ComparePanel({ c, pairs, prior, base, shown, sliderSection, exportUrl }: ComparePanelProps) {
  const t = useMessages()
  const root = useRef<HTMLDivElement>(null)
  const [picked, setPicked] = useState(0)
  const pair = pairs[Math.min(picked, pairs.length - 1)]
  const labels = pairs.map((p) => p.observe)
  const pairLabel = (p: SeeDoPair, i: number): string => (labels.indexOf(p.observe) === i && labels.lastIndexOf(p.observe) === i ? p.observe : `${p.observe} · ${doText(p.intervene)}`)
  const observedId = /^\s*([A-Za-z_][A-Za-z0-9_]*)/.exec(pair.observe)?.[1] ?? ''
  const doId = Object.keys(pair.intervene)[0] ?? ''
  let see: Record<string, number> | undefined
  let seeDist: Readonly<Record<string, readonly number[]>> = {}
  let seeValue = Number.NaN
  try {
    const seen = marginals(c.model, prior, { given: pair.observe })
    see = { ...seen.p }
    seeDist = seen.dist
    seeValue = probability(c.model, prior, { event: pair.event, given: pair.observe }).value
  } catch {
    see = undefined
  }
  const doM = marginals(c.model, prior, { do: pair.intervene })
  const doP = doM.p
  const doValue = probability(c.model, prior, { event: pair.event, do: pair.intervene }).value
  const cut = new Set(Object.keys(pair.intervene))
  const removed = c.model.edges.filter((e) => cut.has(e.to))
  const seeExpr = `P(${pair.event} | ${pair.observe})`
  const doExpr = `P(${pair.event} | ${doText(pair.intervene)})`
  const obsPhrase = phraseOf(c.model, t.locale, pair.observe, false)
  const doPhrase = phraseOf(c.model, t.locale, doText(pair.intervene), true, pair.intervene)
  const seeGraph = (m: Messages) =>
    see === undefined ? null : (
      <SignalGraph
        c={c}
        shown={shown}
        probs={see}
        dists={seeDist}
        probNotes={notesAgainst(m, base, see, shown, observedId, m.observed)}
        observed={[observedId]}
        compact
        interventions={{}}
        removedEdges={[]}
        title={m.afterObserving(pair.observe)}
      />
    )
  const doGraph = (m: Messages) => (
    <SignalGraph
      c={c}
      shown={shown}
      probs={doP}
      dists={doM.dist}
      probNotes={notesAgainst(m, base, doP, shown, doId, m.setByDo)}
      interventions={pair.intervene as Assignment}
      removedEdges={removed}
      compact
      title={m.afterSetting(doText(pair.intervene))}
    />
  )
  const exportSource = (locale: Locale): ExportSource | undefined => {
    const m = messagesFor(locale)
    const view =
      locale === t.locale
        ? undefined
        : renderDetached(
            <LocaleProvider locale={locale}>
              <div data-side="see">{seeGraph(m)}</div>
              <div data-side="do">{doGraph(m)}</div>
            </LocaleProvider>,
          )
    const scope = view?.container ?? root.current
    const graph = (side: string) => scope?.querySelector<SVGSVGElement>(`[data-side="${side}"] svg.ca-graph`) ?? null
    const panels: ExportPanel[] = []
    const seeSvg = graph('see')
    const doSvg = graph('do')
    if (seeSvg !== null) {
      panels.push({ svg: seeSvg, tags: [{ text: m.observing(pair.observe), tone: 'outline' }], foot: `${seeExpr} = ${probText(seeValue)}` })
    }
    if (doSvg !== null) {
      panels.push({
        svg: doSvg,
        tags: [
          { text: m.afterDo, tone: 'slate' },
          { text: doText(pair.intervene), tone: 'accent', mono: true },
        ],
        foot: `${doExpr} = ${probText(doValue)}`,
        tint: true,
      })
    }
    return {
      name: `${c.data.id}-compare`,
      title: c.data.title[locale],
      panels,
      legend: probLegend(m, c.model, shown),
      origin: originSources(m, c),
      originCitations: originCitations(c),
      dispose: view?.dispose,
    }
  }
  return (
    <div className="ca-root not-prose ca-panel ca-prob" data-case={c.data.id} data-view="compare" lang={t.locale} ref={root}>
      <div className="ca-box-head ca-compare-head">
        <span className="ca-muted ca-small">{probLegend(t, c.model, shown)}</span>
        <div className="ca-box-actions">
          {pairs.length > 1 && (
            <Segmented
              label={t.comparePick}
              options={pairs.map((p, i) => ({ value: String(i), label: pairLabel(p, i) }))}
              value={String(Math.min(picked, pairs.length - 1))}
              onChange={(v) => setPicked(Number(v))}
            />
          )}
          <ExportMenu source={exportSource} url={exportUrl} origins={originCitations(c)} />
        </div>
      </div>
      <div className="ca-compare">
        <div className="ca-compare-side" data-side="see">
          <div className="ca-box-head">
            <Tag tone="outline">
              <Rich text={t.observing(pair.observe)} ids={c.model.byId} />
            </Tag>
          </div>
          <div className="ca-graph-wrap">{see === undefined ? <p className="ca-muted">{t.zeroObservation}</p> : seeGraph(t)}</div>
          <div className="ca-compare-result">
            <div>
              <code className="ca-mono ca-muted ca-small">
                <Formula text={seeExpr} />
              </code>
              <p className="ca-big ca-mono" data-testid="see-value">
                {probText(seeValue)}
              </p>
            </div>
            <p className="ca-compare-text">
              <Rich text={t.seeText(obsPhrase)} ids={c.model.byId} />
            </p>
          </div>
        </div>
        <div className="ca-compare-side is-cf" data-side="do">
          <div className="ca-box-head">
            <div className="ca-tags">
              <Tag tone="slate">{t.afterDo}</Tag>
              <Tag tone="accent" mono>
                <Formula text={doText(pair.intervene)} />
              </Tag>
            </div>
          </div>
          <div className="ca-graph-wrap">{doGraph(t)}</div>
          <div className="ca-compare-result">
            <div>
              <code className="ca-mono ca-muted ca-small">
                <Formula text={doExpr} />
              </code>
              <p className="ca-big ca-mono" data-testid="do-value">
                {probText(doValue)}
              </p>
            </div>
            <p className="ca-compare-text">
              <Rich text={t.doText(doPhrase)} ids={c.model.byId} />
            </p>
          </div>
        </div>
      </div>
      <FigureTabs blocks={[{ id: 'probabilities', label: t.probEquations, children: sliderSection }]} />
    </div>
  )
}
