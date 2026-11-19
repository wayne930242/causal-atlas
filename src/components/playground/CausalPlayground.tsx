import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { LoadedCase } from '../../data/load.ts'
import type { CaseDecision, ModelDoc } from '../../data/schema.ts'
import type { Assignment } from '../../engine/index.ts'
import { parseCause, valuesEqual } from '../../engine/index.ts'
import { DEFAULT_URL, watermarkLine } from '../export/cite.ts'
import { DEFAULT_EMBED_BASE, embedCode, embedHome, embedSrc, fitEmbedState, readEmbedState } from '../export/embed.ts'
import type { Locale } from '../i18n/messages.ts'
import { LocaleScope, useMessages } from '../i18n/messages.ts'
import { DigitsScope } from '../shared/digits.ts'
import { sameAssignment } from '../model/assignments.ts'
import { useCaseOrDoc } from '../model/doc-case.ts'
import type { DsepPair } from '../model/dsep-view.ts'
import { dsepView } from '../model/dsep-view.ts'
import type { Reading } from '../model/model-state.ts'
import { useModel } from '../model/model-state.ts'
import { normalityLine } from '../model/normality-view.ts'
import type { UiNotation } from '../model/notation.ts'
import { priorWithSliders } from '../model/probability-view.ts'
import type { VerdictQuery } from '../model/verdict-rows.ts'
import { actualGroups, defaultTheories, originCitations, originSources } from '../model/verdict-rows.ts'
import { readingText } from '../model/wording.ts'
import { EquationPanel } from '../panels/EquationBox.tsx'
import { GraphBox } from '../panels/GraphBox.tsx'
import { SliderList } from '../panels/SliderList.tsx'
import type { FigureBlock } from '../shared/FigureTabs.tsx'
import { heightAtInitialBlock } from '../shared/tab-height.ts'
import { DocProblems, Segmented, Tip } from '../shared/parts.tsx'
import { Rich } from '../text/typeset.tsx'
import { DecisionBars } from './DecisionBars.tsx'
import { DsepLine } from './DsepLine.tsx'
import type { PlaygroundPreset, PresetButton } from './playground-options.ts'
import type { BlameSpec } from './blame-view.ts'
import { blameView } from './blame-view.ts'
import { PlaygroundBlame } from './PlaygroundBlame.tsx'
import { NONE, activeQuery, checkTrack, checkVerdicts, decisionFor, dsepPairs, presetButtons, sliderStart } from './playground-options.ts'
import { PlaygroundVerdicts } from './PlaygroundVerdicts.tsx'
import { trailText } from './trail.ts'
import { useTrail } from './use-trail.ts'

export type { PlaygroundPreset } from './playground-options.ts'
export type { BlameSpec, BlameState } from './blame-view.ts'

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
  /**
   * Decimals of the probability under each node (and a stochastic do()'s tag, a bar chart's top
   * value and the 原本 notes): a whole number from 1 to 6, default 2. Set it to the digits the
   * text quotes, e.g. 3 for 0.175; a number within 10^-digits of 0 or 1 still gets two significant
   * digits of its distance from that end. Equation, table and slider numbers keep their own
   * precision. The embed code does not record it.
   */
  readonly digits?: number
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
   * The degree of blame (Halpern 2016, Def. 6.2.1) of one event for an outcome: a 責備 tab under
   * the graph with one row per epistemic state and one column per Halpern–Pearl standard, and each
   * state's backgrounds with their probabilities and responsibilities behind a fold. `states` are
   * `{ label?, prior?, given? }`: `prior` in the model document's `priors` format (default the
   * document's own, which a document without `priors` must then supply in every state), `given` an
   * observation that narrows the state, e.g. the outcome seen after acting. Without `states` there
   * is one, the document's `priors` (the sliders move it). Halpern's blame conditions on the cause
   * holding, so the probabilities are conditioned on it. Throws when no priors are available.
   */
  readonly blame?: BlameSpec
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
export function CausalPlayground({ locale, digits, ...props }: CausalPlaygroundProps) {
  return (
    <LocaleScope locale={locale}>
      <DigitsScope digits={digits}>
        <PlaygroundBody {...props} />
      </DigitsScope>
    </LocaleScope>
  )
}

function PlaygroundBody({ doc, ...props }: Omit<CausalPlaygroundProps, 'locale' | 'digits'>) {
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
  blame,
  normality = true,
  dsep,
  sliders = NO_TRACK,
  prior: startPrior,
  decision,
}: Omit<CausalPlaygroundOptions, 'locale' | 'digits'> & { readonly c: LoadedCase; readonly caseId?: string }) {
  const t = useMessages()
  const start = useMemo(() => sliderStart(base, sliders, startPrior), [base, sliders, startPrior])
  const [sliderValues, setSliderValues] = useState(start)
  const problem = useMemo(() => decisionFor(base, decision), [base, decision])
  // Everything below reads the case with the slider prior; an embed page reads its state from `base`.
  const c = useMemo(
    () => (Object.keys(sliderValues).length === 0 ? base : { ...base, prior: priorWithSliders(base, sliderValues) }),
    [base, sliderValues],
  )
  checkVerdicts(c, verdicts)
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
  const pairs = dsepPairs(c, dsep)
  const [pairAt, setPairAt] = useState(0)
  const pair = pairs[Math.min(pairAt, pairs.length - 1)]
  const dsepNow = pair === undefined || !prob ? undefined : dsepView(c, pair, observed, interventions, stochastic)
  const groups = useMemo(() => (verdicts === undefined ? [] : actualGroups(t, c, verdicts)), [t, c, verdicts])
  const theories = useMemo(() => (verdicts ?? []).map((q) => q.theories ?? defaultTheories(c)), [c, verdicts])
  const blamed = useMemo(() => (blame === undefined ? undefined : blameView(c, blame, t.locale)), [c, blame, t.locale])
  const active = verdicts === undefined ? -1 : activeQuery(c, verdicts, interventions)
  const activeCause = active < 0 || verdicts === undefined ? NONE : parseCause(c.model, verdicts[active].cause)
  // The hull shows what a step holds for as long as the reader leaves it at that value; with
  // verdicts, every do() on a variable other than the cause is held.
  const holding = Object.fromEntries(
    Object.entries(interventions).filter(([id, v]) => (id in held && valuesEqual(held[id], v)) || (verdicts !== undefined && !(id in activeCause))),
  )
  checkTrack(c, track)
  const setting = readingText(t, reading === 'counterfactual' && prob, interventions, stochastic, observed)
  const [trail, restartTrail] = useTrail(c, track, world, setting)
  const applyPreset = (s: PresetButton): void => {
    setDo({ interventions: s.interventions, stochastic: {} })
    setObserved(s.observed)
    setHeld(s.hold)
    restartTrail()
  }
  // A step stays pressed while everything it set still holds, even after the reader sets more; of the
  // steps that still hold, only the ones that set the most are pressed (so an empty step 1 does not light
  // up next to step 2).
  const within = (state: Assignment, part: Assignment): boolean =>
    sameAssignment(Object.fromEntries(Object.keys(part).filter((id) => id in state).map((id) => [id, state[id]])), part)
  const holds = (s: PresetButton): boolean =>
    within(observed, s.observed) && within(interventions, s.interventions) && within(holding, s.hold)
  const size = (s: PresetButton): number =>
    Object.keys(s.observed).length + Object.keys(s.interventions).length + Object.keys(s.hold).length
  const pressedSize = soft ? -1 : Math.max(-1, ...buttons.filter(holds).map(size))
  const pressed = (s: PresetButton): boolean => !soft && holds(s) && size(s) === pressedSize
  const src = embedded || embedUrl === false ? undefined : (embedUrl ?? (caseId === undefined ? undefined : `${DEFAULT_EMBED_BASE}case/${encodeURIComponent(caseId)}/`))
  // Under the graph, one block at a time: the figure's own (verdicts, expected utility, paths) open at first, the equations closed.
  const blocks: FigureBlock[] = []
  if (verdicts !== undefined) {
    blocks.push({
      id: 'verdicts',
      label: t.tab.verdicts,
      children: (
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
      ),
    })
  }
  if (problem !== undefined) {
    blocks.push({ id: 'ev', label: t.ev.title, children: <DecisionBars c={c} problem={problem} observed={observed} interventions={interventions} /> })
  }
  if (dsepNow !== undefined && pair !== undefined) {
    blocks.push({ id: 'dsep', label: t.tab.dsep, children: <DsepLine c={c} pair={pair} observed={observed} view={dsepNow} /> })
  }
  if (blame !== undefined && blamed !== undefined) {
    blocks.push({ id: 'blame', label: t.tab.blame, children: <PlaygroundBlame c={c} cause={blame.cause} effect={blame.effect} view={blamed} /> })
  }
  blocks.push({
    id: 'equations',
    label: t.equations,
    children: <EquationPanel c={c} world={world} interventions={interventions} stochastic={stochastic} observed={observed} reading={reading} notation={notation} onNotation={setNotation} defaults={defaults} />,
  })
  const initialBlock = blocks.find((b) => b.id !== 'equations')?.id
  const embed =
    src === undefined
      ? undefined
      : (): string =>
          embedCode({
            src: embedSrc(src, { interventions, stochastic, observed }, window.location.pathname, t.locale),
            title: c.data.title[t.locale],
            // The figure as it stands, plus the credit line the embed page adds under it.
            // The embed page starts with the figure's own block open, whatever is open here.
            height: heightAtInitialBlock(root.current, initialBlock, 640) + 72,
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
            restartTrail()
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
              <div className="ca-reading-box">
                <div className="ca-reading-row">
                  <span className="ca-reading-label" aria-hidden="true">
                    {t.readingLabel}
                  </span>
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
                </div>
                <p className="ca-reading-hint" aria-live="polite">
                  {reading === 'interventional' && Object.keys(interventions).length + Object.keys(stochastic).length === 0 ? '' : t.readingHint[reading]}
                </p>
              </div>
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
          blocks={blocks}
          initialBlock={initialBlock}
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

const NO_TRACK: readonly string[] = []

