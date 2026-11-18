import { useEffect, useRef, useSyncExternalStore } from 'react'
import type { LoadedCase } from '../data/load.ts'
import type { ModelDoc } from '../data/schema.ts'
import type { Assignment, LocalizedText } from '../engine/index.ts'
import { useCaseOrDoc } from './doc-case.ts'
import type { Locale } from './i18n.ts'
import { LocaleScope, useMessages } from './i18n.ts'
import { DEFAULT_URL, watermarkLine } from './cite.ts'
import { DEFAULT_EMBED_BASE, embedCode, embedHome, embedSrc, fitEmbedState, readEmbedState } from './embed.ts'
import { useModel } from './model-state.ts'
import { EquationBox, GraphBox } from './ModelPanel.tsx'
import type { UiNotation } from './notation.ts'
import { DocProblems } from './parts.tsx'
import { Rich } from './typeset.tsx'
import { originCitations, originSources } from './verdict-rows.ts'
import { assignmentText } from './view-model.ts'

/** A preset intervention button for a model document (a bundled case brings its own). */
export interface PlaygroundPreset {
  readonly label: string | LocalizedText
  readonly interventions: Assignment
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
}: Omit<CausalPlaygroundOptions, 'locale'> & { readonly c: LoadedCase; readonly caseId?: string }) {
  const t = useMessages()
  const { interventions, stochastic, observed, setInterventions, setDo, setObserved, notation, setNotation, world } = useModel(
    c,
    initialInterventions,
    defaultNotation,
  )
  const root = useRef<HTMLDivElement>(null)
  // An embed page takes its state from the address once mounted (the server has no address hash).
  useEffect(() => {
    if (!embedded) return
    const state = fitEmbedState(c, readEmbedState(window.location.hash))
    setDo({ interventions: state.interventions, stochastic: state.stochastic })
    setObserved(state.observed)
    // Read once per case: later clicks are the reader's own.
  }, [c, embedded, setDo, setObserved])
  const soft = Object.keys(stochastic).length > 0
  const buttons = presetButtons(c, presets, t.locale)
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
          legend
          exportUrl={exportUrl}
          embedCode={embed}
        />
        <EquationBox c={c} world={world} interventions={interventions} stochastic={stochastic} notation={notation} onNotation={setNotation} />
      </div>
      <div className="ca-playground-foot">
        <p className="ca-hint">{t.playgroundHint(world.probs !== undefined)}</p>
        {buttons.length > 0 && (
          <div className="ca-presets" role="group" aria-label={t.presets}>
            {buttons.map((s) => (
              <button
                key={s.text}
                type="button"
                className="ca-btn ca-btn-outline"
                aria-pressed={!soft && Object.keys(observed).length === 0 && assignmentText(s.interventions) === assignmentText(interventions)}
                onClick={() => setInterventions(s.interventions)}
              >
                <Rich text={s.text} ids={c.model.byId} />
              </button>
            ))}
          </div>
        )}
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

function presetButtons(c: LoadedCase, presets: boolean | readonly PlaygroundPreset[], locale: Locale): { text: string; interventions: Assignment }[] {
  if (presets === false) return []
  const list: readonly PlaygroundPreset[] = presets === true ? c.data.showcase : presets
  return list.map((s) => ({
    text: typeof s.label === 'string' ? s.label : s.label[locale],
    interventions: s.interventions,
  }))
}
