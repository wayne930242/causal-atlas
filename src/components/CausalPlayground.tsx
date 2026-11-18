import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { LoadedCase } from '../data/load.ts'
import type { CaseDecision, ModelDoc } from '../data/schema.ts'
import { decisionProblem } from '../data/load.ts'
import type { Assignment, DecisionProblem, LocalizedText } from '../engine/index.ts'
import { useCaseOrDoc } from './doc-case.ts'
import type { Locale } from './i18n.ts'
import { LocaleScope, useMessages } from './i18n.ts'
import { DEFAULT_URL, watermarkLine } from './cite.ts'
import { DEFAULT_EMBED_BASE, embedCode, embedHome, embedSrc, fitEmbedState, readEmbedState } from './embed.ts'
import type { Reading } from './model-state.ts'
import { solve, useModel } from './model-state.ts'
import { EquationBox, GraphBox } from './ModelPanel.tsx'
import type { UiNotation } from './notation.ts'
import { DocProblems, Segmented, Tip } from './parts.tsx'
import { Rich } from './typeset.tsx'
import type { VerdictQuery } from './verdict-rows.ts'
import { actualGroups, defaultTheories, originCitations, originSources } from './verdict-rows.ts'
import { PlaygroundVerdicts } from './PlaygroundVerdicts.tsx'
import { DsepLine } from './DsepLine.tsx'
import type { DsepPair } from './dsep-view.ts'
import { dsepView } from './dsep-view.ts'
import { evaluate, getVariable, parseCause, valuesEqual } from '../engine/index.ts'
import type { TrailEntry } from './view-model.ts'
import { TRAIL_LENGTH, defaultSliders, normalityLine, priorWithSliders, readingText, sameAssignment, sliderVariables, trailEntry, trailText } from './view-model.ts'
import { SliderList } from './SliderList.tsx'
import { DecisionBars } from './DecisionBars.tsx'

/**
 * A step button under the graph: one press sets these do()s and observations (and nothing else).
 * A bundled case brings its own (do() only); a document takes a list.
 */
export interface PlaygroundPreset {
  readonly label: string | LocalizedText
  /** do() to set. */
  readonly interventions?: Assignment
  /** Observations to set; probability graphs only (a graph with values throws). */
  readonly observed?: Assignment
  /**
   * Variables an HP witness holds fixed: set by do() like `interventions`, but drawn in the amber
   * hull (固定) instead of with a clamp.
   */
  readonly hold?: Assignment
}

export type CausalPlaygroundProps = CausalPlaygroundSource & CausalPlaygroundOptions

/** What to draw: a bundled case by id, or a model document (a `modelDocSchema` value) such as one built in the editor. */
export type CausalPlaygroundSource =
  | {
      /** A bundled case id, e.g. `rock-throwing`. */
      readonly caseId: string
      readonly doc?: undefined
    }
  | {
      /**
       * A model document drawn on its own: graph, notation toggle, do() and export, no editor chrome.
       * A document that does not validate or build shows its problem codes instead of throwing.
       * The export credits a case source only when `doc.from` is a bundled case with the same model.
       */
      readonly doc: ModelDoc
      readonly caseId?: undefined
    }

export interface CausalPlaygroundOptions {
  /** Notation the equations start in; the reader can still switch. Default 'propositional'. */
  readonly defaultNotation?: UiNotation
  /** do() applied at the start. */
  readonly initialInterventions?: Assignment
  /**
   * Preset interventions as buttons. `true` (default) shows a bundled case's own; pass a list for
   * a document (it has none of its own); `false` hides them.
   */
  readonly presets?: boolean | readonly PlaygroundPreset[]
  /** Link in exported images' watermark. Default https://wayneh.tw/causal/. */
  readonly exportUrl?: string
  /** Interface language. Default: the surrounding LocaleProvider's, else zh-TW. */
  readonly locale?: Locale
  /**
   * The page that shows this figure alone, for the export menu's embed code (an iframe and the
   * citation). Default for a bundled case: https://wayneh.tw/causal/embed/case/<id>/; a document
   * has none unless given. `false` offers no embed code.
   */
  readonly embedUrl?: string | false
  /**
   * Drawn as an embed page: the state comes from the address (`#do=…&pdo=…&obs=…`, see
   * `embedFragment`) and a credit line with the licence, the case's sources and a link back to the
   * page it was copied from (`?from=`) sits under it.
   */
  readonly embedded?: boolean
  /**
   * Nodes whose number (or value) is followed under the graph: one line per node with its reading
   * after each change of what is set, `Y：0.50 → 0.67（Z=1）→ 0.50（Z=1, X=1）`, the last five.
   * 「回到原本」 and the step buttons start it again.
   */
  readonly track?: readonly string[]
  /**
   * Actual-cause questions for a graph with values: per query a row of verdicts (but-for, the three
   * HP definitions, HP with normality when the model has defaults; or `theories`), each with
   * 在圖上看 for its witness, and a line saying whether the world on the graph is a witness. A do()
   * on a variable other than the cause is drawn held (固定). With several queries, the line answers
   * the first whose cause is set away from its actual value.
   */
  readonly verdicts?: readonly VerdictQuery[]
  /**
   * The model's default values (`normality`), shown on a graph with values: a node off its default
   * says 偏離（預設 v）, a line under the graph compares this world's deviations with the actual
   * world's (更正常／一樣正常／較不正常／無法比較), each equation says 預設 v. On by default when the
   * model has defaults; `false` hides them.
   */
  readonly normality?: boolean
  /**
   * A pair of variables, or several (a switch in the head picks one), on a probability graph: every
   * path between the two in the graph after do() is lit when open and dashed when blocked, the
   * known set being what is observed, and a line under the graph gives the verdict, δ (lesson 04's
   * dependence, given the observed values) and up to three paths with why.
   */
  readonly dsep?: DsepPair | readonly DsepPair[]
  /**
   * Exogenous variables with a slider under the graph (boolean or two-valued ones, on a probability
   * graph): P(id = 1, or its first value). Dragging recomputes everything drawn with the new prior;
   * 「回到原本的機率」 puts the sliders back. The embed code does not record them.
   */
  readonly sliders?: readonly string[]
  /** Start values P(id = 1, or its first value) of exogenous variables, slider or not; the rest keep the case's prior. */
  readonly prior?: Readonly<Record<string, number>>
  /**
   * Expected-utility bars under the graph (a probability graph): one row per theory (evidential,
   * causal), one bar per act, the act each picks and by how much; the utilities sit in its ⓘ.
   * `true` takes the case's own `decision`; or give one in the case-file format
   * (`{ variable, acts?, utility: { variables, rows: [[...values, utility]] } }`). Observing the act
   * lights its evidential bar, do() on it the causal one; the sliders move both rows.
   */
  readonly decision?: true | CaseDecision
}

/** One case's graph and equations; click a node to observe it (probabilities) or set do() on it (values). */
export function CausalPlayground({ locale, ...props }: CausalPlaygroundProps) {
  return (
    <LocaleScope locale={locale}>
      <PlaygroundBody {...props} />
    </LocaleScope>
  )
}

function PlaygroundBody({ doc, ...props }: Omit<CausalPlaygroundProps, 'locale'>) {
  const resolved = useCaseOrDoc(props.caseId, doc)
  return resolved.ok ? <PlaygroundFor c={resolved.c} {...props} /> : <DocProblems problems={resolved.problems} />
}

function PlaygroundFor({
  c: base,
  caseId,
  initialInterventions,
  presets = true,
  exportUrl,
  defaultNotation,
  embedUrl,
  embedded = false,
  track = NO_TRACK,
  verdicts,
  normality = true,
  dsep,
  sliders = NO_TRACK,
  prior: startPrior,
  decision,
}: Omit<CausalPlaygroundOptions, 'locale'> & { readonly c: LoadedCase; readonly caseId?: string }) {
  const t = useMessages()
  const start = useMemo(() => sliderStart(base, sliders, startPrior), [base, sliders, startPrior])
  const [sliderValues, setSliderValues] = useState(start)
  const problem = useMemo(() => decisionFor(base, decision), [base, decision])
  // Everything below reads the case with the slider prior; an embed page reads its state from `base`.
  const c = useMemo(
    () => (Object.keys(sliderValues).length === 0 ? base : { ...base, prior: priorWithSliders(base, sliderValues) }),
    [base, sliderValues],
  )
  if (verdicts !== undefined && c.context === undefined) throw new Error(`${c.data.id}: verdicts need a graph with values (an actual context)`)
  const [reading, setReading] = useState<Reading>('interventional')
  const { interventions, stochastic, observed, setDo, setObserved, notation, setNotation, world } = useModel(
    c,
    initialInterventions,
    defaultNotation,
    reading,
  )
  /** Switch the reading, keeping what is set; back to interventional, a node keeps only its do(). */
  const switchReading = (next: Reading): void => {
    if (next === 'interventional') {
      const kept = Object.fromEntries(Object.entries(observed).filter(([id]) => !(id in interventions) && !(id in stochastic)))
      if (Object.keys(kept).length !== Object.keys(observed).length) setObserved(kept)
    }
    setReading(next)
  }
  const root = useRef<HTMLDivElement>(null)
  const sliderId = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  // An embed page takes its state from the address once mounted (the server has no address hash).
  useEffect(() => {
    if (!embedded) return
    const state = fitEmbedState(base, readEmbedState(window.location.hash))
    setDo({ interventions: state.interventions, stochastic: state.stochastic })
    setObserved(state.observed)
    // Read once per case: later clicks are the reader's own.
  }, [base, embedded, setDo, setObserved])
  const [held, setHeld] = useState<Assignment>(NONE)
  const soft = Object.keys(stochastic).length > 0
  const buttons = presetButtons(c, presets, t.locale)
  const prob = world.probs !== undefined
  const defaults = normality && c.context !== undefined ? c.normality : undefined
  const pairs: readonly DsepPair[] = dsep === undefined ? [] : isPair(dsep) ? [dsep] : dsep
  if (pairs.length > 0 && (c.context !== undefined || c.prior === undefined)) throw new Error(`${c.data.id}: dsep needs a probability graph (priors, no context)`)
  for (const [x, y] of pairs) {
    getVariable(c.model, x)
    getVariable(c.model, y)
  }
  const [pairAt, setPairAt] = useState(0)
  const pair = pairs[Math.min(pairAt, pairs.length - 1)]
  const dsepNow = pair === undefined || !prob ? undefined : dsepView(c, pair, observed, interventions, stochastic)
  const groups = useMemo(() => (verdicts === undefined ? [] : actualGroups(t, c, verdicts)), [t, c, verdicts])
  const theories = useMemo(() => (verdicts ?? []).map((q) => q.theories ?? defaultTheories(c)), [c, verdicts])
  const active = verdicts === undefined ? -1 : activeQuery(c, verdicts, interventions)
  const activeCause = active < 0 || verdicts === undefined ? NONE : parseCause(c.model, verdicts[active].cause)
  // The hull shows what a step holds for as long as the reader leaves it at that value; with
  // verdicts, every do() on a variable other than the cause is held.
  const holding = Object.fromEntries(
    Object.entries(interventions).filter(([id, v]) => (id in held && valuesEqual(held[id], v)) || (verdicts !== undefined && !(id in activeCause))),
  )
  for (const id of track) getVariable(c.model, id)
  const startTrail = (): Trail => ({ entries: [trailEntry(solve(c, {}), track, '')], dropped: false })
  const [trail, setTrail] = useState<Trail>(startTrail)
  const setting = readingText(t, reading === 'counterfactual' && prob, interventions, stochastic, observed)
  if (track.length > 0 && trail.entries[trail.entries.length - 1]?.setting !== setting) {
    const entries = [...trail.entries, trailEntry(world, track, setting)]
    setTrail({ entries: entries.slice(-TRAIL_LENGTH), dropped: trail.dropped || entries.length > TRAIL_LENGTH })
  }
  const applyPreset = (s: PresetButton): void => {
    setDo({ interventions: s.interventions, stochastic: {} })
    setObserved(s.observed)
    setHeld(s.hold)
    setTrail(startTrail())
  }
  const pressed = (s: PresetButton): boolean =>
    !soft &&
    sameAssignment(observed, s.observed) &&
    sameAssignment(interventions, s.interventions) &&
    sameAssignment(holding, s.hold)
  const src = embedded || embedUrl === false ? undefined : (embedUrl ?? (caseId === undefined ? undefined : `${DEFAULT_EMBED_BASE}case/${encodeURIComponent(caseId)}/`))
  const embed =
    src === undefined
      ? undefined
      : (): string =>
          embedCode({
            src: embedSrc(src, { interventions, stochastic, observed }, window.location.pathname, t.locale),
            title: c.data.title[t.locale],
            // The figure as it stands, plus the credit line the embed page adds under it.
            height: (root.current?.offsetHeight ?? 640) + 72,
            locale: t.locale,
            url: exportUrl,
            origins: originCitations(c),
          })
  return (
    <div className="ca-root not-prose ca-playground" data-case={c.data.id} lang={t.locale} ref={root}>
      <div className="ca-panel">
        <GraphBox
          c={c}
          world={world}
          interventions={interventions}
          stochastic={stochastic}
          onDo={setDo}
          observed={observed}
          onObserve={setObserved}
          witness={Object.keys(holding).length > 0 ? holding : undefined}
          holdNotes
          defaults={defaults}
          legend
          exportUrl={exportUrl}
          embedCode={embed}
          onReset={() => {
            setSliderValues(start)
            setTrail(startTrail())
          }}
          reading={reading}
          paths={dsepNow?.marks}
          actions={
            prob ? (
              <>
              {pairs.length > 1 && (
                <Segmented
                  label={t.dsep.pairs}
                  options={pairs.map((p, i) => ({ value: String(i), label: t.dsep.pair(p[0], p[1]) }))}
                  value={String(Math.min(pairAt, pairs.length - 1))}
                  onChange={(v) => setPairAt(Number(v))}
                />
              )}
              <Segmented
                className="ca-reading"
                label={t.readingLabel}
                options={[
                  { value: 'interventional', label: t.reading.interventional },
                  { value: 'counterfactual', label: t.reading.counterfactual },
                ]}
                value={reading}
                onChange={switchReading}
              />
              </>
            ) : undefined
          }
          foot={
            <div className="ca-playground-foot">
              {sliders.length > 0 && (
                <SliderList
                  c={c}
                  ids={sliders}
                  values={sliderValues}
                  onChange={(id, p) => setSliderValues({ ...sliderValues, [id]: p })}
                  idPrefix={`ca-pg-slider-${sliderId}`}
                />
              )}
              {verdicts !== undefined && (
                <PlaygroundVerdicts
                  c={c}
                  groups={groups}
                  queries={verdicts}
                  theories={theories}
                  active={active}
                  interventions={interventions}
                  onShow={(row) => {
                    const hold = row.fixed ?? NONE
                    const xPrime = Object.fromEntries(Object.entries(row.show ?? NONE).filter(([id]) => !(id in hold)))
                    applyPreset({ text: '', interventions: { ...xPrime, ...hold }, observed: NONE, hold })
                  }}
                />
              )}
              {problem !== undefined && <DecisionBars c={c} problem={problem} observed={observed} interventions={interventions} />}
              {dsepNow !== undefined && pair !== undefined && <DsepLine c={c} pair={pair} observed={observed} view={dsepNow} />}
              {defaults !== undefined && world.values !== undefined && world.original !== undefined && (
                <p className="ca-norm-line" data-normality="">
                  <span className="ca-pg-now-kicker">{t.normality.kicker}</span>{' '}
                  <Rich
                    text={normalityLine(t, c.model, world.values, world.original, defaults, !sameAssignment(world.values, world.original))}
                    ids={c.model.byId}
                  />{' '}
                  <Tip tip={t.normality.tip} label={t.moreInfo} />
                </p>
              )}
              {track.length > 0 && (
                <ul className="ca-trail" aria-label={t.trail}>
                  {track.map((id) => {
                    const text = trailText(t, id, trail.entries, trail.dropped)
                    return (
                      <li key={id} data-trail={id} data-text={text}>
                        <span className="ca-trail-kicker">{t.trail}</span> <Rich text={text} ids={c.model.byId} />
                      </li>
                    )
                  })}
                </ul>
              )}
              <p className="ca-hint">
                {reading === 'counterfactual' && prob ? t.cfHint : t.playgroundHint(prob)}{' '}
                <Tip
                  tip={`${reading === 'counterfactual' && prob ? t.cfHintMore : t.playgroundHintMore(prob)}${sliders.length > 0 ? t.sliderEmbed : ''}`}
                  label={t.moreInfo}
                />
              </p>
              {buttons.length > 0 && (
                <div className="ca-presets" role="group" aria-label={t.presets}>
                  {buttons.map((s) => (
                    <button key={s.text} type="button" className="ca-btn ca-btn-outline" aria-pressed={pressed(s)} onClick={() => applyPreset(s)}>
                      <Rich text={s.text} ids={c.model.byId} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          }
        />
        <EquationBox
          c={c}
          world={world}
          interventions={interventions}
          stochastic={stochastic}
          observed={observed}
          reading={reading}
          notation={notation}
          onNotation={setNotation}
          defaults={defaults}
        />
      </div>
      {embedded && <EmbedCredit c={c} url={exportUrl ?? DEFAULT_URL} />}
    </div>
  )
}

const noSubscription = (): (() => void) => () => {}

/** The credit under an embedded figure: author, project, licence and link; the case's sources; the page it came from. */
function EmbedCredit({ c, url }: { readonly c: LoadedCase; readonly url: string }) {
  const t = useMessages()
  // The address never changes under an embed page: read it on the client, the project page on the server.
  const home = useSyncExternalStore(
    noSubscription,
    () => embedHome(window.location.search, window.location.origin, url),
    () => url,
  )
  const origins = originCitations(c)
  return (
    <footer className="ca-embed-credit ca-small">
      <p>{watermarkLine(url, t.locale)}</p>
      {origins.length > 0 && <p>{t.export.caseSource(originSources(t, c))}</p>}
      <p>
        <a href={home} target="_blank" rel="noopener">
          {t.export.embedOpen}
        </a>
      </p>
    </footer>
  )
}

const NONE: Assignment = {}
const NO_TRACK: readonly string[] = []

interface Trail {
  readonly entries: readonly TrailEntry[]
  /** Older readings gave way to the last TRAIL_LENGTH. */
  readonly dropped: boolean
}

interface PresetButton {
  readonly text: string
  /** Every do(), the held variables included. */
  readonly interventions: Assignment
  readonly observed: Assignment
  readonly hold: Assignment
}

/** The decision problem the bars show: the case's own for `true`. */
function decisionFor(c: LoadedCase, decision: true | CaseDecision | undefined): DecisionProblem | undefined {
  if (decision === undefined) return undefined
  if (c.context !== undefined || c.prior === undefined) throw new Error(`${c.data.id}: decision needs a probability graph (priors, no context)`)
  if (decision !== true) return decisionProblem(decision)
  if (c.decision === undefined) throw new Error(`${c.data.id}: decision={true} needs the case's own decision; give one instead`)
  return c.decision
}

/** The sliders' and `prior`'s start values; throws on a variable no slider can set. */
function sliderStart(c: LoadedCase, sliders: readonly string[], prior: Readonly<Record<string, number>> | undefined): Record<string, number> {
  const ids = [...sliders, ...Object.keys(prior ?? {})]
  if (ids.length === 0) return {}
  if (c.context !== undefined || c.prior === undefined) throw new Error(`${c.data.id}: sliders and prior need a probability graph (priors, no context)`)
  const settable = new Set(sliderVariables(c))
  for (const id of ids) {
    getVariable(c.model, id)
    if (!settable.has(id)) throw new Error(`${c.data.id}: no slider can set ${id} (a boolean or two-valued exogenous variable, independent prior)`)
  }
  for (const [id, p] of Object.entries(prior ?? {})) {
    if (!(p >= 0 && p <= 1)) throw new Error(`${c.data.id}: prior ${id} = ${p} is not a probability`)
  }
  const own = defaultSliders(c)
  return Object.fromEntries(ids.map((id) => [id, prior?.[id] ?? own[id]]))
}

function isPair(dsep: DsepPair | readonly DsepPair[]): dsep is DsepPair {
  return typeof dsep[0] === 'string'
}

/** The query whose cause is set, every cause variable, not all at actual values; else the first. */
function activeQuery(c: LoadedCase, queries: readonly VerdictQuery[], interventions: Assignment): number {
  const actual = c.context === undefined ? NONE : evaluate(c.model, c.context).values
  const i = queries.findIndex((q) => {
    const cause = parseCause(c.model, q.cause)
    const ids = Object.keys(cause)
    return ids.every((id) => id in interventions) && ids.some((id) => !valuesEqual(interventions[id], actual[id]))
  })
  return i < 0 ? 0 : i
}

function presetButtons(c: LoadedCase, presets: boolean | readonly PlaygroundPreset[], locale: Locale): PresetButton[] {
  if (presets === false) return []
  const list: readonly PlaygroundPreset[] = presets === true ? c.data.showcase : presets
  return list.map((s) => {
    const text = typeof s.label === 'string' ? s.label : s.label[locale]
    const observed = s.observed ?? NONE
    if (c.context !== undefined && Object.keys(observed).length > 0) {
      throw new Error(`preset "${text}": observed needs probabilities, and ${c.data.id} has an actual context`)
    }
    const hold = s.hold ?? NONE
    return { text, interventions: { ...(s.interventions ?? NONE), ...hold }, observed, hold }
  })
}
