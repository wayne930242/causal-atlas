import { useState } from 'react'
import { AUTHOR_EN, AUTHOR_ZH, DATA_LICENSE, DEFAULT_URL, authorYear, authorYearEn, bibtex } from './cite.ts'
import { Disclosure } from './parts.tsx'

export interface CiteBlockProps {
  /** Where the project lives; goes into every citation form. Default https://wayneh.tw/causal/. */
  readonly url?: string
}

/** How to cite causal-atlas: author-year in Chinese and English, BibTeX behind a disclosure, licences. */
export function CiteBlock({ url = DEFAULT_URL }: CiteBlockProps) {
  const [copied, setCopied] = useState(false)
  const bib = bibtex(url)
  const copy = (): void => {
    void navigator.clipboard?.writeText(bib).then(() => setCopied(true))
  }
  return (
    <section className="ca-root not-prose ca-cite" aria-label="如何引用">
      <h2 className="ca-h3">如何引用</h2>
      <p className="ca-cite-lead">學術或教學使用請引用：</p>
      <p className="ca-cite-entry">{authorYear(url)}</p>
      <p className="ca-cite-entry" lang="en">
        {authorYearEn(url)}
      </p>
      <Disclosure kicker="" title="BibTeX">
        <pre className="ca-cite-bib ca-mono">{bib}</pre>
        <button type="button" className="ca-btn ca-btn-outline" onClick={copy}>
          {copied ? '已複製' : '複製 BibTeX'}
        </button>
      </Disclosure>
      <p className="ca-muted ca-small">
        程式碼以 MIT 授權；案例資料與教學文字以 {DATA_LICENSE} 授權，轉用請標示「{AUTHOR_ZH}（{AUTHOR_EN}）」與出處。
      </p>
    </section>
  )
}
