import type { ChangeEvent } from 'react'
import type { DraftIssue } from '../i18n/messages.ts'
import { draftIssueMessage, useMessages } from '../i18n/messages.ts'
import { Disclosure, Segmented } from '../shared/parts.tsx'
import { Formula, Ident, Rich } from '../text/typeset.tsx'
import { isIdent } from '../text/typeset-text.ts'
import type { Draft, DraftErrors, DraftMode } from './draft.ts'
import { valueTexts } from './draft.ts'
import { priorsFor } from './draft-edits.ts'

export interface EditorValuesProps {
  readonly draft: Draft
  readonly errors: DraftErrors
  /** The ids the draft names, typeset in display text. */
  readonly ids: ReadonlySet<string>
  readonly onEdit: (edit: (draft: Draft) => Draft) => void
}

/** The exogenous values section: fixed values (a context) or probabilities (priors), per exogenous variable. */
export function EditorValues({ draft, errors, ids: draftIds, onEdit }: EditorValuesProps) {
  const t = useMessages()
  const e = t.editor
  const say = (issue: DraftIssue): string => draftIssueMessage(issue, t)
  const update = (patch: Partial<Draft>): void => onEdit((d) => ({ ...d, ...patch }))
  const exogenous = draft.variables.filter((v) => v.kind === 'exogenous')
  return (
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
          const issue = errors.values[v.key]
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
  )
}
