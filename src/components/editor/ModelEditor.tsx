import { useId, useMemo, useReducer, useState } from 'react'
import { caseIds, getCase } from '../../data/index.ts'
import type { LoadedCase } from '../../data/load.ts'
import { caseToDoc, sameModel } from '../../data/model-doc.ts'
import type { ModelDoc } from '../../data/schema.ts'
import type { Assignment } from '../../engine/index.ts'
import { CaseInfo, ModelInfo } from './CaseInfo.tsx'
import { CaseList, CaseSheet } from './CaseList.tsx'
import type { Locale } from '../i18n/messages.ts'
import { LocaleScope, draftIssueMessage, errorMessage, useMessages } from '../i18n/messages.ts'
import type { DoState, ModelWorld } from '../model/model-state.ts'
import { solve } from '../model/model-state.ts'
import type { UiNotation } from '../model/notation.ts'
import { EquationBox } from '../panels/EquationBox.tsx'
import { GraphBox } from '../panels/GraphBox.tsx'
import { Disclosure, DocProblems, Tag } from '../shared/parts.tsx'
import { Rich } from '../text/typeset.tsx'
import { isIdent } from '../text/typeset-text.ts'
import type { ExtraModel, LessonLink } from './catalog.ts'
import { catalog, modelKey, textIn } from './catalog.ts'
import { NO_DO, NO_OBSERVATION, validInterventions, validObserved, validStochastic } from './do-state.ts'
import type { Draft } from './draft.ts'
import { compileDraft, draftFromImport } from './draft.ts'
import { withMove } from './draft-edits.ts'
import { EditorEquations } from './EditorEquations.tsx'
import { EditorNormality } from './EditorNormality.tsx'
import { EditorValues } from './EditorValues.tsx'
import { EditorVariables } from './EditorVariables.tsx'
import { SaveShare } from './SaveShare.tsx'
import { sessionReducer, startDraft, startFromDoc, startNamed, startSession } from './session.ts'
import type { EditorTask } from './tasks.ts'
import { TaskCard } from './TaskCard.tsx'
import { useHashSync } from './use-hash-sync.ts'

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

const NO_TASKS: readonly EditorTask[] = []

/** The list key that loads a task's start: an extra model's, or the case id. */
function startKey(id: string, extras: readonly ExtraModel[]): string {
  return !caseIds.includes(id) && extras.some((m) => m.id === id) ? modelKey(id) : id
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

  useHashSync({ syncUrl, hash, start: start.draft, draft, doState, base, doc: compiled.doc, t, extraModels, dispatch })

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
  const move = (id: string, dCol: number, dRow: number): void => edit((d) => withMove(d, id, dCol, dRow))

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
              <EditorVariables draft={draft} errors={compiled.errors} ids={draftIds} uid={uid} onEdit={edit} />

              <EditorEquations draft={draft} errors={compiled.errors} ids={draftIds} uid={uid} onEdit={edit} />

              <EditorValues draft={draft} errors={compiled.errors} ids={draftIds} onEdit={edit} />

              <EditorNormality draft={draft} onEdit={edit} />

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
