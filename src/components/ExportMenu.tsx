import { useId, useRef, useState } from 'react'
import type { ExportFormat, ExportSource, ExportStyle, ExportTheme } from './export-image.ts'
import { exportImage, pageTheme } from './export-image.ts'
import type { Locale } from './i18n.ts'
import { LANGUAGE_NAMES, errorMessage, messagesFor, useMessages } from './i18n.ts'
import { DEFAULT_URL, authorYear, authorYearEn, bibtex } from './cite.ts'
import { Segmented } from './parts.tsx'

export interface ExportMenuProps {
  /** Collects what to draw, in the chosen language, at click time; undefined when nothing is on screen. */
  readonly source: (locale: Locale) => ExportSource | undefined
  /** Link in the watermark. */
  readonly url?: string
  /** Full citations of the case's origin sources; the academic style's reminder lists them. */
  readonly origins?: readonly string[]
}

const LANGUAGES = (Object.keys(LANGUAGE_NAMES) as Locale[]).map((value) => ({ value, label: LANGUAGE_NAMES[value] }))

/**
 * 「下載圖片」: format, theme (default: the page's) and language (default: the component's), then
 * download. Client only on click.
 */
export function ExportMenu({ source, url, origins = [] }: ExportMenuProps) {
  const t = useMessages()
  const [open, setOpen] = useState(false)
  const [format, setFormat] = useState<ExportFormat>('png')
  const [style, setStyle] = useState<ExportStyle>('color')
  const [theme, setTheme] = useState<ExportTheme>('light')
  const [locale, setLocale] = useState<Locale>(t.locale)
  const [error, setError] = useState<string | undefined>(undefined)
  const root = useRef<HTMLDivElement>(null)
  const id = useId()

  const toggle = (): void => {
    if (!open) {
      setTheme(pageTheme(root.current))
      setLocale(t.locale)
    }
    setError(undefined)
    setOpen((o) => !o)
  }
  const download = (): void => {
    let s: ExportSource | undefined
    try {
      s = source(locale)
    } catch (e) {
      setError(t.export.failed(errorMessage(e, t)))
      return
    }
    if (s === undefined || s.panels.length === 0) {
      s?.dispose?.()
      setError(t.export.nothing)
      return
    }
    const done = s.dispose
    exportImage(s, { style, theme, format, url, locale })
      .catch((e: unknown) => setError(t.export.failed(errorMessage(e, t))))
      .finally(() => done?.())
  }

  return (
    <div className="ca-export" ref={root}>
      <button type="button" className="ca-link" aria-expanded={open} aria-controls={id} onClick={toggle}>
        {t.export.open}
      </button>
      {open && (
        <div className="ca-export-menu" id={id} role="group" aria-label={t.export.settings}>
          <Segmented
            label={t.export.format}
            options={[
              { value: 'png', label: t.export.png },
              { value: 'svg', label: 'SVG' },
            ]}
            value={format}
            onChange={setFormat}
          />
          <Segmented
            label={t.export.style}
            options={[
              { value: 'color', label: t.export.styleColor },
              { value: 'academic', label: t.export.styleAcademic },
            ]}
            value={style}
            onChange={setStyle}
          />
          {style === 'color' && (
            <Segmented
              label={t.export.theme}
              options={[
                { value: 'light', label: t.export.light },
                { value: 'dark', label: t.export.dark },
              ]}
              value={theme}
              onChange={setTheme}
            />
          )}
          <Segmented label={t.export.language} options={LANGUAGES} value={locale} onChange={setLocale} />
          {style === 'academic' && <CitationReminder locale={locale} url={url ?? DEFAULT_URL} origins={origins} />}
          <button type="button" className="ca-btn ca-btn-primary ca-export-go" onClick={download}>
            {t.export.download}
          </button>
          {error !== undefined && (
            <p className="ca-small ca-export-error" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function CopyButton({ text, label }: { readonly text: string; readonly label: string }) {
  const t = useMessages()
  const [copied, setCopied] = useState(false)
  const copy = (): void => {
    void navigator.clipboard?.writeText(text).then(() => setCopied(true))
  }
  return (
    <button type="button" className="ca-btn ca-btn-outline" onClick={copy}>
      {copied ? t.export.copied : label}
    </button>
  )
}

/** What to cite when using the academic image: this project (BibTeX, author-year) and the case's own sources. */
function CitationReminder({ locale, url, origins }: { readonly locale: Locale; readonly url: string; readonly origins: readonly string[] }) {
  const m = messagesFor(locale).export
  const line = locale === 'en' ? authorYearEn(url) : authorYear(url)
  return (
    <div className="ca-export-cite" role="note" lang={locale}>
      <p className="ca-small">{m.reminderHeading}</p>
      <p className="ca-cite-entry ca-small">{line}</p>
      <div className="ca-export-copy">
        <CopyButton text={line} label={m.copyAuthorYear} />
        <CopyButton text={bibtex(url)} label={messagesFor(locale).cite.copyBibtex} />
      </div>
      {origins.length > 0 && (
        <>
          <p className="ca-small">{m.reminderOrigins}</p>
          <ul className="ca-small">
            {origins.map((o) => (
              <li key={o}>{o}</li>
            ))}
          </ul>
          <div className="ca-export-copy">
            <CopyButton text={origins.join('\n')} label={m.copyOrigins} />
          </div>
        </>
      )}
    </div>
  )
}
