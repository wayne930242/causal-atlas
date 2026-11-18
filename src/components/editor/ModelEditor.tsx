import type { ChangeEvent } from 'react'
import { useEffect, useId, useMemo, useReducer, useRef, useState } from 'react'
import { caseIds, getCase } from '../../data/index.ts'
import type { LoadedCase } from '../../data/load.ts'
import { caseToDoc, decodeShare, encodeShare, parseModelJson, sameModel, schemaProblems } from '../../data/model-doc.ts'
import type { ModelDoc } from '../../data/schema.ts'
import { modelDocSchema } from '../../data/schema.ts'
import type { Assignment, Problem } from '../../engine/index.ts'
import { CaseInfo, ModelInfo } from '../case/CaseInfo.tsx'
import { CaseList, CaseSheet } from '../case/CaseList.tsx'
import { saveFile } from '../export/download.ts'
import type { ExtraModel, LessonLink } from './catalog.ts'
import { catalog, modelKey, textIn } from './catalog.ts'
import type { Draft, DraftMode, DraftVariable } from './draft.ts'
import { blankDraft, compileDraft, draftFromCase, draftFromImport, freeCell, newKey, valueTexts } from './draft.ts'
import { NO_DO, NO_OBSERVATION, validInterventions, validObserved, validStochastic } from './do-state.ts'
import type { Start } from './session.ts'
import { sessionReducer, startSession } from './session.ts'
import { hashFragment, readHashState, replaceHash } from './url-state.ts'
import type { EditorTask } from './tasks.ts'
import { TaskCard } from './TaskCard.tsx'
import type { Locale, Messages } from '../i18n/messages.ts'
import { LocaleScope, draftIssueMessage, errorMessage, problemMessage, useMessages } from '../i18n/messages.ts'
import type { DoState, ModelWorld } from '../model/model-state.ts'
import { solve } from '../model/model-state.ts'
import { EquationBox } from '../panels/EquationBox.tsx'
import { GraphBox } from '../panels/GraphBox.tsx'
import type { UiNotation } from '../model/notation.ts'
import { Disclosure, DocProblems, Segmented, Tag } from '../shared/parts.tsx'
import { Formula, Ident, Rich } from '../text/typeset.tsx'
import { isIdent } from '../text/typeset-text.ts'

export interface ModelEditorProps {
  /** Notation the equations start in; the reader can still switch. Default 'propositional'. */
  readonly defaultNotation?: UiNotation
  /** Starting model: a bundled case id, an `extraModels` id, or `blank`. Default `rock-throwing`. */
  readonly initial?: string
  /**
   * Starting model as a document (a `modelDocSchema` value); wins over `initial`, so the editor
   * renders on the server with this model instead of a blank one. A share hash still overrides it
   * on the client. Its `from` keeps the case source only when the model is that bundled case's.
   * An invalid document starts blank and shows its problem codes.
   */
  readonly initialDoc?: ModelDoc
  /**
   * Where to look for a shared model (`#model=…`) or a case (`#case=<id>`); defaults to the page's
   * hash. When given, the host owns the address: the editor reads this and never writes the URL.
   */
  readonly hash?: string
  /**
   * Keep the page address in step with the model on screen (default true): `#case=<id>` while a
   * bundled case or host model is unedited, `#model=<share value>` once edited (debounced), with
   * `&do=…` for the interventions (and `&pdo=…` for stochastic ones). Uses `history.replaceState`, so no history entries or scrolling.
   */
  readonly syncUrl?: boolean
  /** Builds the share link from the encoded model. Default: this page with `#model=<value>`. */
  readonly shareHref?: (value: string) => string
  /** Link in exported images' watermark. */
  readonly exportUrl?: string
  /** Interface language; also the title a bundled case starts with. Default: the surrounding LocaleProvider's, else zh-TW. */
  readonly locale?: Locale
  /** Links per bundled case id, listed in the case panel as 講義中用到這個案例 (e.g. the lessons that use it). */
  readonly caseLinks?: Readonly<Record<string, readonly LessonLink[]>>
  /**
   * The host's own models (e.g. lesson models), listed after the bundled cases under their `group`.
   * Choosing one loads its `doc` (validated; an invalid one starts blank and shows its problems) and
   * shows its title and `links` above the model.
   */
  readonly extraModels?: readonly ExtraModel[]
  /** The case list's one filter chip for all `extraModels`. Default 講義模型 / Lesson models. */
  readonly modelsLabel?: string
  /**
   * Guided tasks, one card each above the inputs: the question, 從它開始 (loads `start`), the
   * guesses (which definitions count `predict.cause` a cause of `predict.effect`), and 檢查, which
   * compares the edited equations with `goal.equations` at every value of their parents and then
   * reveals the edited model's verdicts, or names one setting where they differ. Not kept in the link.
   */
  readonly tasks?: readonly EditorTask[]
}

export type { ExtraModel, LessonLink } from './catalog.ts'

/** A draft from a host model's document; an invalid document gives a blank draft and its problems. */
function startFromDoc(doc: ModelDoc, t: Messages, picked?: string): Start {
  const parsed = modelDocSchema.safeParse(doc, { reportInput: true })
  if (parsed.success) return { draft: draftFromImport(parsed.data), problems: [], picked, named: picked }
  return { draft: blankDraft(t.editor.defaultTitle), problems: schemaProblems(parsed.error), picked, named: picked }
}

/** A bundled case, an extra model, or `blank` (also for an id that is neither). */
function startNamed(id: string, t: Messages, extras: readonly ExtraModel[]): Start {
  const extra = caseIds.includes(id) ? undefined : extras.find((m) => m.id === id)
  if (extra !== undefined) return startFromDoc(extra.doc, t, extra.id)
  const known = id !== 'blank' && caseIds.includes(id)
  return { draft: startFromCase(id, t), problems: [], named: known ? id : 'blank' }
}

function startDraft(initial: string, t: Messages, extras: readonly ExtraModel[], initialDoc?: ModelDoc): Start {
  if (initialDoc !== undefined) return { ...startFromDoc(initialDoc, t), named: undefined }
  return startNamed(initial, t, extras)
}

const NO_TASKS: readonly EditorTask[] = []

/** The list key that loads a task's start: an extra model's, or the case id. */
function startKey(id: string, extras: readonly ExtraModel[]): string {
  return !caseIds.includes(id) && extras.some((m) => m.id === id) ? modelKey(id) : id
}

/** Whether `#case=<id>` names something the editor can show. */
const knownName = (id: string, extras: readonly ExtraModel[]): boolean =>
  id === 'blank' || caseIds.includes(id) || extras.some((m) => m.id === id)

/** How long the address waits after the last edit before it is rewritten. */
const URL_DEBOUNCE_MS = 400

function startFromCase(initial: string, t: Messages): Draft {
  if (initial === 'blank' || !caseIds.includes(initial)) return blankDraft(t.editor.defaultTitle)
  return draftFromCase(getCase(initial), t.locale)
}

function priorsFor(v: DraftVariable): number[] {
  const n = valueTexts(v).length
  return v.domain === 'boolean' ? [0.5] : Array.from({ length: n }, () => 1 / Math.max(n, 1))
}

/**
 * Build a structural causal model yourself: variables, equations, context or priors, defaults,
 * layout. Draws it with the same graph and equations as the case pages; shares it by link or JSON.
 */
export function ModelEditor({ locale, ...props }: ModelEditorProps) {
  return (
    <LocaleScope locale={locale}>
      <EditorBody {...props} />
    </LocaleScope>
  )
}

const NO_EXTRAS: readonly ExtraModel[] = []

function EditorBody({
  initial = 'rock-throwing',
  initialDoc,
  hash,
  shareHref,
  exportUrl,
  defaultNotation,
  caseLinks,
  extraModels = NO_EXTRAS,
  modelsLabel,
  syncUrl = true,
  tasks = NO_TASKS,
}: Omit<ModelEditorProps, 'locale'>) {
  const t = useMessages()
  const e = t.editor
  const [start] = useState(() => startDraft(initial, t, extraModels, initialDoc))
  const [session, dispatch] = useReducer(sessionReducer, start, startSession)
  const { draft, picked, docProblems, doState, observed, base, loadErrors } = session
  const [notation, setNotation] = useState<UiNotation>(defaultNotation ?? 'propositional')
  const compiled = useMemo(
    () =>
      compileDraft(
        draft,
        draft.from !== undefined && caseIds.includes(draft.from) ? getCase(draft.from).data.sources : undefined,
        e.defaultTitle,
      ),
    [draft, e.defaultTitle],
  )
  // The last model that built: the graph keeps showing it while the draft has errors.
  const [lastGood, setLastGood] = useState<LoadedCase | undefined>(compiled.loaded)
  if (compiled.loaded !== undefined && compiled.loaded !== lastGood) setLastGood(compiled.loaded)
  const shown = compiled.loaded ?? (draft.variables.length === 0 ? undefined : lastGood)
  const uid = useId()

  // Solving enumerates contexts: do it once per model and intervention, not on every render.
  const { world, runtimeError, active, seenNow } = useMemo((): {
    readonly world?: ModelWorld
    readonly runtimeError?: string
    readonly active: DoState
    readonly seenNow: Assignment
  } => {
    if (shown === undefined) return { active: NO_DO, seenNow: NO_OBSERVATION }
    const hard = validInterventions(shown, doState.interventions)
    const valid: DoState = { interventions: hard, stochastic: validStochastic(shown, doState, hard) }
    try {
      const obs = validObserved(shown, observed, valid)
      const solved = solve(shown, valid.interventions, valid.stochastic, obs)
      // An edit that leaves the observation impossible drops it rather than show no numbers.
      if (Object.keys(obs).length > 0 && !((solved.evidence ?? 1) > 0)) {
        return { world: solve(shown, valid.interventions, valid.stochastic), active: valid, seenNow: NO_OBSERVATION }
      }
      return { world: solved, active: valid, seenNow: obs }
    } catch (error) {
      return { runtimeError: e.cannotCompute(errorMessage(error, t)), active: valid, seenNow: NO_OBSERVATION }
    }
  }, [shown, doState, observed, e, t])

  // The state the address already shows: changes to anything else rewrite it.
  const synced = useRef<{ draft: Draft; doState: DoState }>({ draft: start.draft, doState })
  // The state the writing effect last ran with: only a change is written, so a re-run of the
  // effect with the state of an earlier render (Strict Mode on mount) never rewrites the address.
  const seen = useRef<{ draft: Draft; doState: DoState }>({ draft: start.draft, doState })
  const ownsUrl = syncUrl && hash === undefined

  const showNamed = (next: Start, doNext: DoState): void => {
    dispatch({ type: 'show', start: next, doState: doNext })
    synced.current = { draft: next.draft, doState: doNext }
  }

  // Write the address: a name at once, an encoded model once the edits pause. It acts on a new
  // draft or new interventions only; `base` and the document change with the draft.
  const doc = compiled.doc
  useEffect(() => {
    const changed = draft !== seen.current.draft || doState !== seen.current.doState
    seen.current = { draft, doState }
    if (!ownsUrl || !changed) return
    if (draft === synced.current.draft && doState === synced.current.doState) return
    if (base !== undefined && draft === base.draft) {
      synced.current = { draft, doState }
      replaceHash(hashFragment({ caseId: base.id }, doState.interventions, doState.stochastic))
      return
    }
    // A draft with errors leaves the address at the last model that built.
    if (doc === undefined) return
    let live = true
    const timer = window.setTimeout(() => {
      encodeShare(doc)
        .then((model) => {
          if (!live) return
          synced.current = { draft, doState }
          replaceHash(hashFragment({ model }, doState.interventions, doState.stochastic))
        })
        .catch(() => {
          // too large to share: the address keeps the last model it could carry
        })
    }, URL_DEBOUNCE_MS)
    return () => {
      live = false
      window.clearTimeout(timer)
    }
  }, [ownsUrl, draft, doState, base, doc])

  // What reading the address needs, without re-reading it when a host passes new arrays.
  const reading = useRef({ t, extraModels })
  useEffect(() => {
    reading.current = { t, extraModels }
  }, [t, extraModels])

  // Read the address: on mount, from `hash` when given, and on hashchange while the editor owns it.
  useEffect(() => {
    let live = true
    const read = (text: string): void => {
      const wanted = readHashState(text)
      if (wanted.model !== undefined) {
        decodeShare(wanted.model)
          .then((result) => {
            if (!live) return
            if (result.ok) {
              const next = draftFromImport(result.doc)
              showNamed({ draft: next, problems: [] }, { interventions: wanted.interventions, stochastic: wanted.stochastic })
            } else dispatch({ type: 'loadFailed', errors: result.errors.map((p) => ({ problem: p })) })
          })
          .catch((error: unknown) => {
            if (live) dispatch({ type: 'loadFailed', errors: [error] })
          })
        return
      }
      // An unknown id keeps what is on screen.
      const { t: now, extraModels: extras } = reading.current
      if (wanted.caseId !== undefined && knownName(wanted.caseId, extras)) {
        showNamed(startNamed(wanted.caseId, now, extras), { interventions: wanted.interventions, stochastic: wanted.stochastic })
      }
    }
    if (hash !== undefined) read(hash)
    else if (typeof window !== 'undefined') read(window.location.hash)
    const onHashChange = (): void => read(window.location.hash)
    if (ownsUrl) window.addEventListener('hashchange', onHashChange)
    return () => {
      live = false
      if (ownsUrl) window.removeEventListener('hashchange', onHashChange)
    }
  }, [hash, ownsUrl])

  const replace = (next: Draft): void => dispatch({ type: 'replace', draft: next })
  const pick = (key: string): void => {
    const extra = extraModels.find((m) => modelKey(m.id) === key)
    const next = extra !== undefined ? startFromDoc(extra.doc, t, extra.id) : startNamed(key, t, NO_EXTRAS)
    dispatch({ type: 'pick', start: next })
  }
  const groups = useMemo(() => catalog(t, extraModels), [t, extraModels])
  const pickedModel = picked === undefined ? undefined : extraModels.find((m) => m.id === picked)
  const caseId = picked === undefined && draft.from !== undefined && caseIds.includes(draft.from) ? draft.from : undefined
  const edited = useMemo(
    () => caseId !== undefined && (compiled.doc === undefined || !sameModel(compiled.doc, caseToDoc(getCase(caseId), t.locale))),
    [caseId, compiled.doc, t.locale],
  )
  // The list marks the case or host model on screen, and the blank model while it is untouched.
  const listValue =
    pickedModel !== undefined ? modelKey(pickedModel.id) : (caseId ?? (base?.id === 'blank' && base.draft === draft ? 'blank' : ''))
  const headTitle = draft.title.trim() === '' ? e.defaultTitle : draft.title
  const headTag =
    caseId !== undefined
      ? t.family[getCase(caseId).data.family]
      : pickedModel !== undefined
        ? pickedModel.group === undefined
          ? e.lessonModels
          : textIn(pickedModel.group, t.locale)
        : e.customModel
  const headSubtitle = caseId === undefined ? undefined : getCase(caseId).data.subtitle?.[t.locale]
  const edit = (change: (d: Draft) => Draft): void => dispatch({ type: 'edit', edit: change })
  const update = (patch: Partial<Draft>): void => edit((d) => ({ ...d, ...patch }))
  const setVariable = (key: string, patch: Partial<DraftVariable>): void =>
    edit((d) => {
      const variables = d.variables.map((v) => (v.key === key ? { ...v, ...patch } : v))
      const v = variables.find((x) => x.key === key)
      if (v === undefined) return d
      const texts = valueTexts(v)
      const context = { ...d.context }
      if (v.kind === 'exogenous' && !texts.includes(context[key] ?? '')) context[key] = texts[0] ?? ''
      const priors = { ...d.priors }
      const want = v.domain === 'boolean' ? 1 : texts.length
      if ((priors[key]?.length ?? 0) !== want) priors[key] = priorsFor(v)
      const layout = { ...d.layout }
      if (v.shown && layout[key] === undefined) layout[key] = freeCell(layout)
      return { ...d, variables, context, priors, layout }
    })
  const addVariable = (): void =>
    edit((d) => {
      const ids = new Set(d.variables.map((v) => v.id))
      let n = d.variables.length + 1
      while (ids.has(`V${n}`)) n += 1
      const key = newKey()
      const v: DraftVariable = { key, id: `V${n}`, label: '', en: '', kind: 'endogenous', domain: 'boolean', values: '', shown: true }
      return {
        ...d,
        variables: [...d.variables, v],
        equations: { ...d.equations, [key]: '' },
        context: { ...d.context, [key]: '1' },
        priors: { ...d.priors, [key]: [0.5] },
        layout: { ...d.layout, [key]: freeCell(d.layout) },
      }
    })
  const removeVariable = (key: string): void =>
    edit((d) => {
      const drop = <T,>(r: Readonly<Record<string, T>>): Record<string, T> => {
        const out = { ...r }
        delete out[key]
        return out
      }
      return {
        ...d,
        variables: d.variables.filter((v) => v.key !== key),
        equations: drop(d.equations),
        context: drop(d.context),
        priors: drop(d.priors),
        normality: drop(d.normality),
        layout: drop(d.layout),
      }
    })
  const move = (id: string, dCol: number, dRow: number): void =>
    edit((d) => {
      const v = d.variables.find((x) => x.id === id)
      const at = v === undefined ? undefined : d.layout[v.key]
      if (v === undefined || at === undefined) return d
      return { ...d, layout: { ...d.layout, [v.key]: [at[0] + dCol, at[1] + dRow] } }
    })

  const summary: string[] = []
  const nameOf = (key: string): string => draft.variables.find((v) => v.key === key)?.id ?? key
  const say = (issue: Parameters<typeof draftIssueMessage>[0]): string => draftIssueMessage(issue, t)
  for (const [key, issue] of Object.entries(compiled.errors.variables)) summary.push(e.summaryVariable(nameOf(key), say(issue)))
  for (const [key, issue] of Object.entries(compiled.errors.equations)) summary.push(e.summaryEquation(nameOf(key), say(issue)))
  for (const [key, issue] of Object.entries(compiled.errors.values)) summary.push(e.summaryValue(nameOf(key), say(issue)))
  if (compiled.errors.model !== undefined) summary.push(say(compiled.errors.model))
  if (runtimeError !== undefined) summary.push(runtimeError)

  // Display-only text typesets the ids the draft names; the inputs stay plain text.
  const draftIds = new Set(draft.variables.map((v) => v.id).filter(isIdent))
  const exogenous = draft.variables.filter((v) => v.kind === 'exogenous')
  const endogenous = draft.variables.filter((v) => v.kind === 'endogenous')

  return (
    <div className="ca-root not-prose ca-editor" lang={t.locale}>
      <div className="ca-editor-shell">
        <div className="ca-editor-side">
          <CaseList groups={groups} value={listValue} onPick={pick} modelsLabel={modelsLabel} />
        </div>
        <div className="ca-editor-content">
          <CaseSheet groups={groups} value={listValue} title={headTitle} onPick={pick} modelsLabel={modelsLabel} />
          <header className="ca-editor-head">
            <div className="ca-editor-head-line">
              <h2 className="ca-h2">{headTitle}</h2>
              <Tag tone="chip">{headTag}</Tag>
            </div>
            {headSubtitle !== undefined && <p className="ca-subtitle">{headSubtitle}</p>}
          </header>
          {(docProblems.length > 0 || loadErrors.length > 0) && (
            <div className="ca-editor-notices">
              {docProblems.length > 0 && <DocProblems problems={docProblems} />}
              {loadErrors.length > 0 && (
                <div className="ca-editor-errors" role="alert">
                  <p>{e.shareUnreadable}</p>
                  <ul>
                    {loadErrors
                      .map((err) => errorMessage(err, t))
                      .map((text) => (
                        <li key={text}>{text}</li>
                      ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="ca-editor-layout">
            <div className="ca-editor-main">
              {summary.length > 0 && (
                <div className="ca-editor-errors" role="alert">
                  <p>{shown === undefined ? e.incomplete : e.lastGood}</p>
                  <ul>
                    {summary.map((e) => (
                      <li key={e}>
                        <Rich text={e} ids={draftIds} />
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {shown !== undefined && world !== undefined ? (
                <div className="ca-panel">
                  <GraphBox
                    c={shown}
                    world={world}
                    interventions={active.interventions}
                    stochastic={active.stochastic}
                    onDo={(next) => dispatch({ type: 'setDo', doState: next })}
                    observed={seenNow}
                    onObserve={(next) => dispatch({ type: 'observe', observed: next })}
                    onMove={move}
                    legend
                    exportUrl={exportUrl}
                  />
                  <EquationBox
                    c={shown}
                    world={world}
                    interventions={active.interventions}
                    stochastic={active.stochastic}
                    observed={seenNow}
                    notation={notation}
                    onNotation={setNotation}
                  />
                </div>
              ) : (
                <div className="ca-placeholder ca-editor-empty">
                  <span className="ca-muted ca-small">{draft.variables.length === 0 ? e.addFirst : e.fillEquations}</span>
                </div>
              )}
              <p className="ca-hint">{e.hint}</p>
            </div>

            <div className="ca-editor-right">
            {tasks.length > 0 && (
              <div className="ca-editor-tasks">
                {tasks.map((task, i) => (
                  <TaskCard key={task.id} n={i + 1} task={task} model={compiled.loaded} onStart={() => pick(startKey(task.start, extraModels))} />
                ))}
              </div>
            )}
            <div className="ca-editor-panels">
              <label className="ca-field ca-editor-name">
                <span className="ca-field-label">{e.title}</span>
                <input aria-label={e.title} value={draft.title} onChange={(ev) => update({ title: ev.currentTarget.value })} />
              </label>
              <Disclosure kicker="" title={e.variables}>
                <ul className="ca-editor-vars">
                  {draft.variables.map((v, i) => {
                    const n = i + 1
                    const issue = compiled.errors.variables[v.key]
                    const err = issue === undefined ? undefined : say(issue)
                    const errId = `${uid}-var-${v.key}`
                    return (
                      <li key={v.key} className="ca-editor-var">
                        <input
                          className="ca-mono ca-input-id"
                          aria-label={e.varId(n)}
                          aria-invalid={err !== undefined}
                          aria-describedby={err !== undefined ? errId : undefined}
                          value={v.id}
                          onChange={(ev) => setVariable(v.key, { id: ev.currentTarget.value.trim() })}
                        />
                        <input
                          aria-label={e.varZh(n)}
                          lang="zh-TW"
                          placeholder={e.zhPlaceholder}
                          value={v.label}
                          onChange={(ev) => setVariable(v.key, { label: ev.currentTarget.value })}
                        />
                        <input
                          aria-label={e.varEn(n)}
                          lang="en"
                          placeholder={e.enPlaceholder}
                          value={v.en}
                          onChange={(ev) => setVariable(v.key, { en: ev.currentTarget.value })}
                        />
                        <select
                          aria-label={e.varKind(n)}
                          value={v.kind}
                          onChange={(ev) => setVariable(v.key, { kind: ev.currentTarget.value as DraftVariable['kind'] })}
                        >
                          <option value="exogenous">{e.exogenous}</option>
                          <option value="endogenous">{e.endogenous}</option>
                        </select>
                        <select
                          aria-label={e.varDomain(n)}
                          value={v.domain}
                          onChange={(ev) =>
                            setVariable(v.key, {
                              domain: ev.currentTarget.value as DraftVariable['domain'],
                              values: v.values === '' ? 'a, b' : v.values,
                            })
                          }
                        >
                          <option value="boolean">{e.domainBoolean}</option>
                          <option value="list">{e.domainList}</option>
                        </select>
                        {v.domain === 'list' && (
                          <input
                            className="ca-mono"
                            aria-label={e.varValues(n)}
                            placeholder={e.valuesPlaceholder}
                            value={v.values}
                            onChange={(ev) => setVariable(v.key, { values: ev.currentTarget.value })}
                          />
                        )}
                        <label className="ca-check">
                          <input
                            type="checkbox"
                            aria-label={e.varShown(n)}
                            checked={v.shown}
                            onChange={(ev) => setVariable(v.key, { shown: ev.currentTarget.checked })}
                          />
                          {e.shown}
                        </label>
                        <button type="button" className="ca-link" aria-label={e.removeVar(n)} onClick={() => removeVariable(v.key)}>
                          {e.remove}
                        </button>
                        {err !== undefined && (
                          <p className="ca-field-error" id={errId}>
                            <Rich text={err} ids={draftIds} />
                          </p>
                        )}
                      </li>
                    )
                  })}
                </ul>
                <button type="button" className="ca-btn ca-btn-outline" onClick={addVariable}>
                  {e.addVar}
                </button>
              </Disclosure>

              <Disclosure kicker="" title={t.equations}>
                <p className="ca-muted ca-small">
                  {e.syntax.lead}
                  <code>and</code>
                  {e.syntax.sep}
                  <code>or</code>
                  {e.syntax.sep}
                  <code>not</code>
                  {e.syntax.sep}
                  <code>if … then … else …</code>
                  {e.syntax.compare}
                  <code>=</code>
                  {e.syntax.quote}
                  <code>if U then &apos;bright&apos; else &apos;dark&apos;</code>
                  {e.syntax.end}
                </p>
                {exogenous.length > 0 && <p className="ca-muted ca-small">
                    <Rich text={e.noEquation(t.list(exogenous.map((v) => v.id)))} ids={draftIds} />
                  </p>}
                <ul className="ca-editor-eqs">
                  {endogenous.map((v) => {
                    const issue = compiled.errors.equations[v.key]
                    const err = issue === undefined ? undefined : say(issue)
                    const inCycle = compiled.errors.cycle?.includes(v.id) === true
                    const errId = `${uid}-eq-${v.key}`
                    return (
                      <li key={v.key} className="ca-editor-eq" data-cycle={inCycle ? 'true' : undefined}>
                        <span className="ca-mono ca-editor-eq-lhs">
                          <Ident id={v.id} /> =
                        </span>
                        <input
                          className="ca-mono"
                          aria-label={e.equationOf(v.id)}
                          aria-invalid={err !== undefined || inCycle}
                          aria-describedby={err !== undefined ? errId : undefined}
                          value={draft.equations[v.key] ?? ''}
                          spellCheck={false}
                          autoComplete="off"
                          onChange={(ev) => update({ equations: { ...draft.equations, [v.key]: ev.currentTarget.value } })}
                        />
                        {err !== undefined && (
                          <p className="ca-field-error" id={errId}>
                            <Rich text={err} ids={draftIds} />
                          </p>
                        )}
                      </li>
                    )
                  })}
                </ul>
                {compiled.errors.cycle !== undefined && compiled.errors.model !== undefined && (
                  <p className="ca-field-error">
                    <Rich text={say(compiled.errors.model)} ids={draftIds} />
                  </p>
                )}
              </Disclosure>

              <Disclosure kicker="" title={e.exogenousValues}>
                <Segmented
                  label={e.exogenousLabel}
                  options={[
                    { value: 'value', label: e.modes.value },
                    { value: 'probability', label: e.modes.probability },
                  ]}
                  value={draft.mode}
                  onChange={(mode: DraftMode) => update({ mode })}
                />
                <p className="ca-muted ca-small">{draft.mode === 'value' ? e.valueModeNote : e.probabilityModeNote}</p>
                <ul className="ca-editor-values">
                  {exogenous.map((v) => {
                    const texts = valueTexts(v)
                    const issue = compiled.errors.values[v.key]
                    const err = issue === undefined ? undefined : say(issue)
                    if (draft.mode === 'value') {
                      return (
                        <li key={v.key}>
                          <label className="ca-field">
                            <span className="ca-field-label ca-mono">
                              <Ident id={v.id} />
                            </span>
                            <select
                              aria-label={e.valueOf(v.id)}
                              value={draft.context[v.key] ?? texts[0]}
                              onChange={(ev) => update({ context: { ...draft.context, [v.key]: ev.currentTarget.value } })}
                            >
                              {texts.map((t) => (
                                <option key={t} value={t}>
                                  {t}
                                </option>
                              ))}
                            </select>
                          </label>
                          {err !== undefined && (
                            <p className="ca-field-error">
                              <Rich text={err} ids={draftIds} />
                            </p>
                          )}
                        </li>
                      )
                    }
                    const ps = draft.priors[v.key] ?? priorsFor(v)
                    const targets = v.domain === 'boolean' ? ['1'] : texts
                    return (
                      <li key={v.key} className="ca-editor-prior">
                        {targets.map((t, i) => (
                          <label key={t} className="ca-field">
                            <span className="ca-field-label ca-mono">
                              {isIdent(v.id) ? <Formula text={`P(${v.id}=${t})`} /> : `P(${v.id}=${t})`}
                            </span>
                            <input
                              type="number"
                              min={0}
                              max={v.domain === 'boolean' ? 1 : undefined}
                              step={0.01}
                              aria-label={`P(${v.id}=${t})`}
                              value={ps[i] ?? 0}
                              onChange={(ev: ChangeEvent<HTMLInputElement>) => {
                                const next = [...ps]
                                next[i] = Number(ev.currentTarget.value)
                                update({ priors: { ...draft.priors, [v.key]: next } })
                              }}
                            />
                          </label>
                        ))}
                        {err !== undefined && (
                          <p className="ca-field-error">
                            <Rich text={err} ids={draftIds} />
                          </p>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </Disclosure>

              <Disclosure kicker="" title={e.normality}>
                <p className="ca-muted ca-small">{e.normalityNote}</p>
                <ul className="ca-editor-values">
                  {draft.variables.map((v) => (
                    <li key={v.key}>
                      <label className="ca-field">
                        <span className="ca-field-label ca-mono">
                          <Ident id={v.id} />
                        </span>
                        <select
                          aria-label={e.normalOf(v.id)}
                          value={draft.normality[v.key] ?? ''}
                          onChange={(ev) => update({ normality: { ...draft.normality, [v.key]: ev.currentTarget.value } })}
                        >
                          <option value="">{e.unset}</option>
                          {valueTexts(v).map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                      </label>
                    </li>
                  ))}
                </ul>
              </Disclosure>

              <Disclosure kicker="" title={e.saveShare}>
                <SaveShare
                  doc={compiled.doc}
                  shareHref={shareHref}
                  onImport={(doc) => replace(draftFromImport(doc))}
                />
              </Disclosure>
            </div>

            <div className="ca-editor-info">
              {caseId !== undefined && (
                <CaseInfo c={getCase(caseId)} links={caseLinks?.[caseId]} edited={edited} recompute={edited ? compiled.loaded : undefined} heading={false} />
              )}
              {pickedModel !== undefined && (pickedModel.links?.length ?? 0) > 0 && (
                <ModelInfo title={textIn(pickedModel.title, t.locale)} links={pickedModel.links} heading={false} />
              )}
            </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function defaultHref(value: string): string {
  const { origin, pathname, search } = window.location
  return `${origin}${pathname}${search}#model=${value}`
}

function SaveShare({
  doc,
  shareHref,
  onImport,
}: {
  readonly doc: ModelDoc | undefined
  readonly shareHref?: (value: string) => string
  readonly onImport: (doc: ModelDoc) => void
}) {
  const t = useMessages()
  const e = t.editor
  const problems = (list: readonly Problem[]): string[] => list.map((p) => problemMessage(p, t))
  const [link, setLink] = useState<string | undefined>(undefined)
  const [copied, setCopied] = useState(false)
  const [pasted, setPasted] = useState('')
  const [errors, setErrors] = useState<readonly string[]>([])
  const [imported, setImported] = useState(false)

  const share = (): void => {
    if (doc === undefined) return
    setCopied(false)
    setErrors([])
    encodeShare(doc)
      .then((value) => setLink((shareHref ?? defaultHref)(value)))
      .catch((error: unknown) => {
        setLink(undefined)
        setErrors([errorMessage(error, t)])
      })
  }
  const importText = (text: string): void => {
    try {
      const result = parseModelJson(text)
      setImported(result.ok)
      if (result.ok) {
        setErrors([])
        onImport(result.doc)
      } else setErrors(problems(result.errors))
    } catch (error) {
      setImported(false)
      setErrors([errorMessage(error, t)])
    }
  }

  return (
    <div className="ca-editor-save">
      {doc === undefined && <p className="ca-muted ca-small">{e.fixFirst}</p>}
      <div className="ca-editor-row">
        <button type="button" className="ca-btn ca-btn-outline" disabled={doc === undefined} onClick={share}>
          {e.makeLink}
        </button>
        <button
          type="button"
          className="ca-btn ca-btn-outline"
          disabled={doc === undefined}
          onClick={() => doc !== undefined && saveFile('causal-model.json', `${JSON.stringify(doc, null, 2)}\n`, 'application/json')}
        >
          {e.downloadJson}
        </button>
      </div>
      {link !== undefined && (
        <div className="ca-editor-row">
          <input className="ca-mono ca-field-grow" aria-label={e.shareLink} readOnly value={link} onFocus={(ev) => ev.currentTarget.select()} />
          <button
            type="button"
            className="ca-link"
            onClick={() => void navigator.clipboard?.writeText(link).then(() => setCopied(true))}
          >
            {copied ? e.copied : e.copy}
          </button>
        </div>
      )}
      <div className="ca-editor-import" role="group" aria-label={e.importJson}>
        <textarea
          className="ca-mono"
          aria-label={e.pasteJson}
          placeholder={e.pastePlaceholder}
          rows={4}
          value={pasted}
          onChange={(ev) => setPasted(ev.currentTarget.value)}
        />
        <div className="ca-editor-row">
          <button type="button" className="ca-btn ca-btn-outline" onClick={() => importText(pasted)}>
            {e.import}
          </button>
          <label className="ca-link">
            {e.chooseFile}
            <input
              className="ca-sr"
              type="file"
              accept="application/json,.json"
              aria-label={e.chooseFile}
              onChange={(ev) => {
                const file = ev.currentTarget.files?.[0]
                if (file !== undefined) void file.text().then(importText, (error: unknown) => setErrors([errorMessage(error, t)]))
              }}
            />
          </label>
          {imported && errors.length === 0 && <span className="ca-muted ca-small">{e.imported}</span>}
        </div>
        {errors.length > 0 && (
          <div className="ca-editor-errors" role="alert">
            <p>{e.unusable}</p>
            <ul>
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
