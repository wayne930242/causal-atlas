import type { DraftIssue } from '../i18n/messages.ts'
import { draftIssueMessage, useMessages } from '../i18n/messages.ts'
import { Disclosure } from '../shared/parts.tsx'
import { Rich } from '../text/typeset.tsx'
import type { Draft, DraftErrors, DraftVariable } from './draft.ts'
import { withNewVariable, withVariable, withoutVariable } from './draft-edits.ts'

export interface EditorVariablesProps {
  readonly draft: Draft
  readonly errors: DraftErrors
  /** The ids the draft names, typeset in display text. */
  readonly ids: ReadonlySet<string>
  /** The editor's `useId`, for the ids that tie an input to its error. */
  readonly uid: string
  readonly onEdit: (edit: (draft: Draft) => Draft) => void
}

/** The variables section: per variable its id, labels, kind, domain (and values), whether it is drawn, and a remove button. */
export function EditorVariables({ draft, errors, ids: draftIds, uid, onEdit }: EditorVariablesProps) {
  const t = useMessages()
  const e = t.editor
  const say = (issue: DraftIssue): string => draftIssueMessage(issue, t)
  const setVariable = (key: string, patch: Partial<DraftVariable>): void => onEdit((d) => withVariable(d, key, patch))
  const addVariable = (): void => onEdit(withNewVariable)
  const removeVariable = (key: string): void => onEdit((d) => withoutVariable(d, key))
  return (
    <Disclosure kicker="" title={e.variables}>
      <ul className="ca-editor-vars">
        {draft.variables.map((v, i) => {
          const n = i + 1
          const issue = errors.variables[v.key]
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
  )
}
