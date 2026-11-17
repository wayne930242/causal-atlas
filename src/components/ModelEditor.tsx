import type { ChangeEvent } from 'react'
import { useEffect, useId, useMemo, useState } from 'react'
import { caseIds, getCase } from '../data/index.ts'
import type { LoadedCase } from '../data/load.ts'
import { decodeShare, encodeShare, parseModelJson, schemaProblems, shareFromHash } from '../data/model-doc.ts'
import type { ModelDoc } from '../data/schema.ts'
import { modelDocSchema } from '../data/schema.ts'
import type { Assignment, Problem, Value } from '../engine/index.ts'
import { coerceToDomain } from '../engine/index.ts'
import { saveFile } from './download.ts'
import type { Draft, DraftMode, DraftVariable } from './editor/draft.ts'
import { blankDraft, compileDraft, draftFromCase, draftFromImport, freeCell, newKey, valueTexts } from './editor/draft.ts'
import type { Locale, Messages } from './i18n.ts'
import { LocaleScope, draftIssueMessage, errorMessage, problemMessage, useMessages } from './i18n.ts'
import type { ModelWorld } from './model-state.ts'
import { solve } from './model-state.ts'
import { EquationBox, GraphBox } from './ModelPanel.tsx'
import type { UiNotation } from './notation.ts'
import { Disclosure, DocProblems, Segmented } from './parts.tsx'

export interface ModelEditorProps {
  /** Notation the equations start in; the reader can still switch. Default 'propositional'. */
  readonly defaultNotation?: UiNotation
  /** Starting model: a bundled case id or `blank`. Default `rock-throwing`. */
  readonly initial?: string
  /**
   * Starting model as a document (a `modelDocSchema` value); wins over `initial`, so the editor
   * renders on the server with this model instead of a blank one. A share hash still overrides it
   * on the client. Its `from` keeps the case source only when the model is that bundled case's.
   * An invalid document starts blank and shows its problem codes.
   */
  readonly initialDoc?: ModelDoc
  /** Where to look for a shared model (`#model=…`); defaults to the page's hash. */
  readonly hash?: string
  /** Builds the share link from the encoded model. Default: this page with `#model=<value>`. */
  readonly shareHref?: (value: string) => string
  /** Link in exported images' watermark. */
  readonly exportUrl?: string
  /** Interface language; also the title a bundled case starts with. Default: the surrounding LocaleProvider's, else zh-TW. */
  readonly locale?: Locale
}

function startDraft(initial: string, t: Messages, initialDoc?: ModelDoc): { readonly draft: Draft; readonly problems: readonly Problem[] } {
  if (initialDoc !== undefined) {
    const parsed = modelDocSchema.safeParse(initialDoc, { reportInput: true })
    if (parsed.success) return { draft: draftFromImport(parsed.data), problems: [] }
    return { draft: blankDraft(t.editor.defaultTitle), problems: schemaProblems(parsed.error) }
  }
  return { draft: startFromCase(initial, t), problems: [] }
}

function startFromCase(initial: string, t: Messages): Draft {
  if (initial === 'blank' || !caseIds.includes(initial)) return blankDraft(t.editor.defaultTitle)
  return draftFromCase(getCase(initial), t.locale)
}

/** Interventions that still name a variable of the model with a value in its domain. */
function validInterventions(c: LoadedCase, interventions: Assignment): Assignment {
  const out: Record<string, Value> = {}
  for (const [id, value] of Object.entries(interventions)) {
    const v = c.model.byId.get(id)
    if (v === undefined || v.kind === 'exogenous') continue
    try {
      out[id] = coerceToDomain(v, value)
    } catch {
      // dropped: the domain changed
    }
  }
  return out
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

function EditorBody({ initial = 'rock-throwing', initialDoc, hash, shareHref, exportUrl, defaultNotation }: Omit<ModelEditorProps, 'locale'>) {
  const t = useMessages()
  const e = t.editor
  const [start] = useState(() => startDraft(initial, t, initialDoc))
  const [draft, setDraft] = useState<Draft>(start.draft)
  const [interventions, setInterventions] = useState<Assignment>({})
  const [notation, setNotation] = useState<UiNotation>(defaultNotation ?? 'propositional')
  // What reading the share link went wrong with; worded at render, so it follows the language.
  const [loadErrors, setLoadErrors] = useState<readonly unknown[]>([])
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
  const { world, runtimeError, active } = useMemo((): {
    readonly world?: ModelWorld
    readonly runtimeError?: string
    readonly active: Assignment
  } => {
    if (shown === undefined) return { active: {} }
    const valid = validInterventions(shown, interventions)
    try {
      return { world: solve(shown, valid), active: valid }
    } catch (error) {
      return { runtimeError: e.cannotCompute(errorMessage(error, t)), active: valid }
    }
  }, [shown, interventions, e, t])

  useEffect(() => {
    const value = shareFromHash(hash ?? (typeof window === 'undefined' ? '' : window.location.hash))
    if (value === undefined) return
    let live = true
    decodeShare(value)
      .then((result) => {
        if (!live) return
        if (result.ok) {
          setDraft(draftFromImport(result.doc))
          setInterventions({})
          setLoadErrors([])
        } else setLoadErrors(result.errors.map((p) => ({ problem: p })))
      })
      .catch((error: unknown) => {
        if (live) setLoadErrors([error])
      })
    return () => {
      live = false
    }
  }, [hash])

  const replace = (next: Draft): void => {
    setDraft(next)
    setInterventions({})
  }
  const update = (patch: Partial<Draft>): void => setDraft((d) => ({ ...d, ...patch }))
  const setVariable = (key: string, patch: Partial<DraftVariable>): void =>
    setDraft((d) => {
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
    setDraft((d) => {
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
    setDraft((d) => {
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
    setDraft((d) => {
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

  const exogenous = draft.variables.filter((v) => v.kind === 'exogenous')
  const endogenous = draft.variables.filter((v) => v.kind === 'endogenous')

  return (
    <div className="ca-root not-prose ca-editor" lang={t.locale}>
      <div className="ca-editor-bar">
        <label className="ca-field">
          <span className="ca-field-label">{e.startFrom}</span>
          <select
            aria-label={e.startFrom}
            value={draft.from ?? ''}
            onChange={(ev) => {
              const id = ev.currentTarget.value
              if (id === '') return
              replace(id === 'blank' ? blankDraft(e.defaultTitle) : draftFromCase(getCase(id), t.locale))
            }}
          >
            <option value="">{e.chooseCase}</option>
            <option value="blank">{e.blank}</option>
            {caseIds.map((id) => (
              <option key={id} value={id}>
                {getCase(id).data.title[t.locale]}
              </option>
            ))}
          </select>
        </label>
        <label className="ca-field ca-field-grow">
          <span className="ca-field-label">{e.title}</span>
          <input aria-label={e.title} value={draft.title} onChange={(ev) => update({ title: ev.currentTarget.value })} />
        </label>
      </div>

      {start.problems.length > 0 && <DocProblems problems={start.problems} />}
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
      {summary.length > 0 && (
        <div className="ca-editor-errors" role="alert">
          <p>{shown === undefined ? e.incomplete : e.lastGood}</p>
          <ul>
            {summary.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {shown !== undefined && world !== undefined ? (
        <div className="ca-panel">
          <GraphBox
            c={shown}
            world={world}
            interventions={active}
            onInterventions={setInterventions}
            onMove={move}
            legend
            exportUrl={exportUrl}
          />
          <EquationBox c={shown} world={world} interventions={active} notation={notation} onNotation={setNotation} />
        </div>
      ) : (
        <div className="ca-placeholder ca-editor-empty">
          <span className="ca-muted ca-small">{draft.variables.length === 0 ? e.addFirst : e.fillEquations}</span>
        </div>
      )}
      <p className="ca-hint">{e.hint}</p>

      <div className="ca-editor-panels">
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
                      {err}
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
          {exogenous.length > 0 && <p className="ca-muted ca-small">{e.noEquation(t.list(exogenous.map((v) => v.id)))}</p>}
          <ul className="ca-editor-eqs">
            {endogenous.map((v) => {
              const issue = compiled.errors.equations[v.key]
              const err = issue === undefined ? undefined : say(issue)
              const inCycle = compiled.errors.cycle?.includes(v.id) === true
              const errId = `${uid}-eq-${v.key}`
              return (
                <li key={v.key} className="ca-editor-eq" data-cycle={inCycle ? 'true' : undefined}>
                  <span className="ca-mono ca-editor-eq-lhs">{v.id} =</span>
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
                      {err}
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
          {compiled.errors.cycle !== undefined && compiled.errors.model !== undefined && (
            <p className="ca-field-error">{say(compiled.errors.model)}</p>
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
                      <span className="ca-field-label ca-mono">{v.id}</span>
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
                    {err !== undefined && <p className="ca-field-error">{err}</p>}
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
                        P({v.id}={t})
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
                  {err !== undefined && <p className="ca-field-error">{err}</p>}
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
                  <span className="ca-field-label ca-mono">{v.id}</span>
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
