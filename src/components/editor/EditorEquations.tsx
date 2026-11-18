import type { DraftIssue } from '../i18n/messages.ts'
import { draftIssueMessage, useMessages } from '../i18n/messages.ts'
import { Disclosure } from '../shared/parts.tsx'
import { Ident, Rich } from '../text/typeset.tsx'
import type { Draft, DraftErrors } from './draft.ts'

export interface EditorEquationsProps {
  readonly draft: Draft
  readonly errors: DraftErrors
  /** The ids the draft names, typeset in display text. */
  readonly ids: ReadonlySet<string>
  /** The editor's `useId`, for the ids that tie an input to its error. */
  readonly uid: string
  readonly onEdit: (edit: (draft: Draft) => Draft) => void
}

/** The equations section: the syntax note, one input per endogenous variable, and the cycle's message. */
export function EditorEquations({ draft, errors, ids: draftIds, uid, onEdit }: EditorEquationsProps) {
  const t = useMessages()
  const e = t.editor
  const say = (issue: DraftIssue): string => draftIssueMessage(issue, t)
  const update = (patch: Partial<Draft>): void => onEdit((d) => ({ ...d, ...patch }))
  const exogenous = draft.variables.filter((v) => v.kind === 'exogenous')
  const endogenous = draft.variables.filter((v) => v.kind === 'endogenous')
  return (
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
          const issue = errors.equations[v.key]
          const err = issue === undefined ? undefined : say(issue)
          const inCycle = errors.cycle?.includes(v.id) === true
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
      {errors.cycle !== undefined && errors.model !== undefined && (
        <p className="ca-field-error">
          <Rich text={say(errors.model)} ids={draftIds} />
        </p>
      )}
    </Disclosure>
  )
}
