import { useState } from 'react'
import { encodeShare, parseModelJson } from '../../data/model-doc.ts'
import type { ModelDoc } from '../../data/schema.ts'
import type { Problem } from '../../engine/index.ts'
import { saveFile } from '../export/download.ts'
import { errorMessage, problemMessage, useMessages } from '../i18n/messages.ts'

function defaultHref(value: string): string {
  const { origin, pathname, search } = window.location
  return `${origin}${pathname}${search}#model=${value}`
}

/** Save and share: a share link, the JSON download, and importing JSON pasted or from a file. */
export function SaveShare({
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
