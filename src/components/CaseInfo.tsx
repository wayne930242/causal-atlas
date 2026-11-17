import type { ReactNode } from 'react'
import { useMemo } from 'react'
import type { LoadedCase } from '../data/load.ts'
import type { LessonLink } from './editor/catalog.ts'
import type { Locale } from './i18n.ts'
import { LocaleScope, useMessages } from './i18n.ts'
import { NoIcon, OkIcon, Tag } from './parts.tsx'
import { Story } from './Story.tsx'
import { Formula, Rich } from './typeset.tsx'
import { intuition, verdictTable } from './verdict-rows.ts'

/** The editor's panel for a bundled case: story, intuition, model notes, each theory's verdict, sources, lesson links. */

export interface CaseInfoProps {
  readonly c: LoadedCase
  /** Host links, e.g. the lessons that use this case. */
  readonly links?: readonly LessonLink[]
  /** The model on screen no longer is the case's: say that the verdicts are the case's own. */
  readonly edited?: boolean
  /** Show the title, family and subtitle; off where the host already heads the panel (the editor). Default true. */
  readonly heading?: boolean
  readonly locale?: Locale
}

const ROLE_ORDER = { origin: 0, treatment: 1, reference: 2 } as const

/** A URL or a bare DOI in a citation; trailing punctuation is not part of it. */
const LINK = /(https?:\/\/[^\s<>"]+)|\b(10\.\d{4,9}\/[^\s<>"]+)/g

/** A citation with its URLs and DOIs as links (http and https only). */
function Citation({ text }: { readonly text: string }) {
  const out: ReactNode[] = []
  let at = 0
  for (const m of text.matchAll(LINK)) {
    const raw = m[0].replace(/[.,;:)\]]+$/, '')
    const start = m.index
    out.push(text.slice(at, start))
    const href = m[1] !== undefined ? raw : `https://doi.org/${raw}`
    out.push(
      <a key={start} className="ca-link" href={href} rel="noopener noreferrer">
        {raw}
      </a>,
    )
    at = start + raw.length
  }
  out.push(text.slice(at))
  return <>{out}</>
}

export function Links({ heading, links }: { readonly heading: string; readonly links: readonly LessonLink[] }) {
  if (links.length === 0) return null
  return (
    <section className="ca-editor-case-links" aria-label={heading}>
      <h3 className="ca-h3">{heading}</h3>
      <ul>
        {links.map((l) => (
          <li key={`${l.href}-${l.title}`}>
            <a className="ca-link" href={l.href}>
              {l.title}
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function CaseInfo({ locale, ...props }: CaseInfoProps) {
  return (
    <LocaleScope locale={locale}>
      <CaseInfoBody {...props} />
    </LocaleScope>
  )
}

function CaseInfoBody({ c, links = [], edited = false, heading = true }: Omit<CaseInfoProps, 'locale'>) {
  const t = useMessages()
  const e = t.editor
  const ids = c.model.byId
  const rows = useMemo(() => verdictTable(t, c), [t, c])
  const intu = intuition(t, c)
  const iq = c.data.intuition?.query
  const sources = [...c.data.sources].sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role])
  const title = c.data.title[t.locale]
  return (
    <section className="ca-editor-case" aria-label={e.casePanel(title)} data-case={c.data.id}>
      {heading && (
        <header>
          <p className="ca-kicker ca-mono">
            CASE <span aria-hidden="true">·</span> {t.family[c.data.family]}
          </p>
          <h2 className="ca-h2">{title}</h2>
          {c.data.subtitle !== undefined && <p className="ca-subtitle">{c.data.subtitle[t.locale]}</p>}
        </header>
      )}
      <div className="ca-editor-case-body">
        <div className="ca-editor-case-text">
          <Story c={c} />
          {intu !== undefined && iq !== undefined && (
            <p className="ca-editor-intuition" data-intuition={intu.verdict ?? intu.choice}>
              <Tag tone="chip">{e.intuitionIs}</Tag>{' '}
              {'cause' in iq ? (
                <>
                  <code className="ca-mono">
                    <Formula text={`${iq.cause.replace(/\s+and\s+/g, ' ∧ ')} ⇒ ${iq.effect}`} />
                  </code>{' '}
                  <strong>{intu.verdict === undefined ? '' : t.verdict[intu.verdict]}</strong>
                </>
              ) : (
                <strong>
                  {t.choose} <Rich text={intu.choice ?? ''} ids={ids} />
                </strong>
              )}
              <span className="ca-editor-intuition-text">
                <Rich text={intu.text} ids={ids} />
              </span>
            </p>
          )}
          <section className="ca-explain" aria-label={t.explanation}>
            <p>
              <Rich text={c.data.explanation[t.locale]} ids={ids} />
            </p>
          </section>
        </div>
        <div className="ca-editor-case-side">
          <section className="ca-editor-verdicts" aria-label={e.verdictTable.heading}>
            <h3 className="ca-h3">{e.verdictTable.heading}</h3>
            {edited && <p className="ca-editor-case-edited ca-muted ca-small">{e.editedNote}</p>}
            <div className="ca-table-wrap">
              <table className="ca-table">
                <thead>
                  <tr>
                    <th scope="col">{e.verdictTable.theory}</th>
                    <th scope="col">{e.verdictTable.query}</th>
                    <th scope="col">{e.verdictTable.expected}</th>
                    <th scope="col">{e.verdictTable.engine}</th>
                    <th scope="col">{e.verdictTable.match}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr
                      key={`${r.theory}-${i}`}
                      data-theory={r.theory}
                      data-expected={r.rawExpected}
                      data-engine={r.rawEngine}
                      data-ok={String(r.ok)}
                    >
                      <th scope="row">{r.name}</th>
                      <td className={r.formula ? 'ca-mono' : undefined}>{r.formula ? <Formula text={r.query} /> : <Rich text={r.query} ids={ids} />}</td>
                      <td>
                        <Rich text={r.expected} ids={ids} />
                      </td>
                      <td>
                        <Rich text={r.engine} ids={ids} />
                      </td>
                      <td className="ca-table-ok">
                        {r.ok ? <OkIcon size={16} /> : <NoIcon size={16} />}
                        <span className="ca-sr">{r.ok ? e.verdictTable.agree : e.verdictTable.disagree}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="ca-editor-sources" aria-label={t.sources}>
            <h3 className="ca-h3">{t.sources}</h3>
            <ul>
              {sources.map((s) => (
                <li key={s.citation} data-role={s.role}>
                  <Tag tone="chip">{e.sourceRole[s.role]}</Tag> <Citation text={s.citation} />
                  {s.pages !== undefined && <span className="ca-editor-pages">{e.pages(s.pages)}</span>}
                  {s.note !== undefined && <span className="ca-muted ca-small ca-editor-source-note">{s.note[t.locale]}</span>}
                </li>
              ))}
            </ul>
          </section>
          <Links heading={e.caseLinks} links={links} />
        </div>
      </div>
    </section>
  )
}

/** The editor's panel for a host model: its title and links; it has no story. */
export function ModelInfo({
  title,
  links = [],
  heading = true,
}: {
  readonly title: string
  readonly links?: readonly LessonLink[]
  /** Show the title; off where the editor already heads the panel. */
  readonly heading?: boolean
}) {
  const e = useMessages().editor
  return (
    <section className="ca-editor-case ca-editor-model" aria-label={e.modelPanel(title)}>
      {heading && <h2 className="ca-h2">{title}</h2>}
      <Links heading={e.modelLinks} links={links} />
    </section>
  )
}
