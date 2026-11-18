import { useState } from 'react'
import { DATA_LICENSE, DEFAULT_URL, authorYear, authorYearEn, bibtex } from './cite.ts'
import type { Locale } from '../i18n/messages.ts'
import { LocaleScope, useMessages } from '../i18n/messages.ts'
import { Disclosure } from '../shared/parts.tsx'

export interface CiteBlockProps {
  /** Where the project lives; goes into every citation form. Default https://wayneh.tw/causal/. */
  readonly url?: string
  /** Interface language. Default: the surrounding LocaleProvider's, else zh-TW. */
  readonly locale?: Locale
}

/**
 * How to cite causal-atlas: author-year in both languages (the page's language first), BibTeX
 * behind a disclosure, licences.
 */
export function CiteBlock({ url = DEFAULT_URL, locale }: CiteBlockProps) {
  return (
    <LocaleScope locale={locale}>
      <CiteBody url={url} />
    </LocaleScope>
  )
}

function CiteBody({ url }: { readonly url: string }) {
  const t = useMessages()
  const [copied, setCopied] = useState(false)
  const bib = bibtex(url)
  const copy = (): void => {
    void navigator.clipboard?.writeText(bib).then(() => setCopied(true))
  }
  const zh = (
    <p className="ca-cite-entry" lang="zh-TW" key="zh">
      {authorYear(url)}
    </p>
  )
  const en = (
    <p className="ca-cite-entry" lang="en" key="en">
      {authorYearEn(url)}
    </p>
  )
  return (
    <section className="ca-root not-prose ca-cite" aria-label={t.cite.heading} lang={t.locale}>
      <h2 className="ca-h3">{t.cite.heading}</h2>
      <p className="ca-cite-lead">{t.cite.lead}</p>
      {t.locale === 'en' ? [en, zh] : [zh, en]}
      <Disclosure kicker="" title="BibTeX">
        <pre className="ca-cite-bib ca-mono">{bib}</pre>
        <button type="button" className="ca-btn ca-btn-outline" onClick={copy}>
          {copied ? t.cite.copied : t.cite.copyBibtex}
        </button>
      </Disclosure>
      <p className="ca-muted ca-small">{t.cite.licence(DATA_LICENSE)}</p>
    </section>
  )
}
