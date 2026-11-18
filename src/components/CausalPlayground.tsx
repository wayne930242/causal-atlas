import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { LoadedCase } from '../data/load.ts'
import type { ModelDoc } from '../data/schema.ts'
import type { Assignment, LocalizedText } from '../engine/index.ts'
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
import { originCitations, originSources } from './verdict-rows.ts'
import { getVariable, valuesEqual } from '../engine/index.ts'
import type { TrailEntry } from './view-model.ts'
import { TRAIL_LENGTH, readingText, sameAssignment, trailEntry, trailText } from './view-model.ts'

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
  c,
  caseId,
  initialInterventions,
  presets = true,
  exportUrl,
  defaultNotation,
  embedUrl,
  embedded = false,
  track = NO_TRACK,
}: Omit<CausalPlaygroundOptions, 'locale'> & { readonly c: LoadedCase; readonly caseId?: string }) {
  const t = useMessages()
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
  // An embed page takes its state from the address once mounted (the server has no address hash).
  useEffect(() => {
    if (!embedded) return
    const state = fitEmbedState(c, readEmbedState(window.location.hash))
    setDo({ interventions: state.interventions, stochastic: state.stochastic })
    setObserved(state.observed)
    // Read once per case: later clicks are the reader's own.
  }, [c, embedded, setDo, setObserved])
  const [held, setHeld] = useState<Assignment>(NONE)
  const soft = Object.keys(stochastic).length > 0
  const buttons = presetButtons(c, presets, t.locale)
  const prob = world.probs !== undefined
  // The hull shows what a step holds for as long as the reader leaves it at that value.
  const holding = Object.fromEntries(Object.entries(held).filter(([id, v]) => id in interventions && valuesEqual(interventions[id], v)))
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
          legend
          exportUrl={exportUrl}
          embedCode={embed}
          onReset={() => setTrail(startTrail())}
          reading={reading}
          actions={
            prob ? (
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
            ) : undefined
          }
          foot={
            <div className="ca-playground-foot">
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
                <Tip tip={reading === 'counterfactual' && prob ? t.cfHintMore : t.playgroundHintMore(prob)} label={t.moreInfo} />
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
        <EquationBox c={c} world={world} interventions={interventions} stochastic={stochastic} notation={notation} onNotation={setNotation} />
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
