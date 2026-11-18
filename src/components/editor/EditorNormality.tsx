import { useMessages } from '../i18n/messages.ts'
import { Disclosure } from '../shared/parts.tsx'
import { Ident } from '../text/typeset.tsx'
import type { Draft } from './draft.ts'
import { valueTexts } from './draft.ts'

export interface EditorNormalityProps {
  readonly draft: Draft
  readonly onEdit: (edit: (draft: Draft) => Draft) => void
}

/** The normality section: each variable's default value, or none. */
export function EditorNormality({ draft, onEdit }: EditorNormalityProps) {
  const t = useMessages()
  const e = t.editor
  const update = (patch: Partial<Draft>): void => onEdit((d) => ({ ...d, ...patch }))
  return (
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
  )
}
