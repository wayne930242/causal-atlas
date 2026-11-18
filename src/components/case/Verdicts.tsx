import type { LoadedCase } from '../../data/load.ts'
import type { Assignment } from '../../engine/index.ts'
import { formatValue } from '../../engine/values.ts'
import { useMessages } from '../i18n/messages.ts'
import type { KnownIds } from '../text/typeset-text.ts'
import { Disclosure, NoIcon, OkIcon, PartIcon, Pin, Tag } from '../shared/parts.tsx'
import type { ActualGroup, ActualRow, Intuition } from '../model/verdict-rows.ts'
import { Formula, Rich } from '../text/typeset.tsx'
import { THEORY_REF, actualGroups, decisionRows, intuition, numberRows } from '../model/verdict-rows.ts'
import { assignmentText, fixed, probText } from '../model/wording.ts'

export interface VerdictsProps {
  readonly c: LoadedCase
  /** Show a witness world on the graph. */
  readonly onShow?: (interventions: Assignment, fixed: Assignment | undefined) => void
  /** Link for the 補充 box, e.g. the series lesson on actual causation. */
  readonly lessonHref?: string
  readonly lessonLabel?: string
}

function VerdictIcon({ verdict }: { readonly verdict: ActualRow['verdict'] }) {
  if (verdict === 'cause') return <OkIcon />
  if (verdict === 'part-of-cause') return <PartIcon />
  return <NoIcon />
}

function Mismatch() {
  const t = useMessages()
  return (
    <span className="ca-mismatch">
      <Tag tone="line">{t.againstIntuition}</Tag>
    </span>
  )
}

function IntuitionRow({ i, ids }: { readonly i: Intuition; readonly ids: KnownIds }) {
  const t = useMessages()
  return (
    <li className="ca-verdict" data-theory="intuition" data-intuition="true" data-verdict={i.verdict ?? ''}>
      <div className="ca-verdict-main">
        <span className="ca-verdict-theory">
          <Tag tone="chip">{t.intuition}</Tag>
        </span>
        <span className="ca-verdict-word">
          {i.verdict !== undefined ? (
            <>
              <VerdictIcon verdict={i.verdict} />
              <strong>{t.verdict[i.verdict]}</strong>
            </>
          ) : (
            <strong>
              {t.choose} <span className="ca-mono"><Rich text={i.choice ?? ''} ids={ids} /></span>
            </strong>
          )}
        </span>
        <span className="ca-verdict-sentence">
          <Rich text={i.text} ids={ids} />
        </span>
      </div>
    </li>
  )
}

function ActualRowView({
  row,
  ids,
  onShow,
  mismatch = false,
}: {
  readonly row: ActualRow
  readonly ids: KnownIds
  readonly onShow?: VerdictsProps['onShow']
  readonly mismatch?: boolean
}) {
  const t = useMessages()
  const hasWitness = row.fixed !== undefined && row.theory !== 'butfor'
  return (
    <li className="ca-verdict" data-theory={row.theory} data-verdict={row.verdict} data-mismatch={mismatch ? 'true' : undefined}>
      <div className="ca-verdict-main">
        <span className="ca-verdict-theory">
          <Tag tone={hasWitness ? 'amber' : 'chip'}>{t.theory[row.theory]}</Tag>
        </span>
        <span className="ca-verdict-word">
          <VerdictIcon verdict={row.verdict} />
          <strong>{t.verdict[row.verdict]}</strong>
        </span>
        <span className="ca-verdict-sentence">
          <Rich text={row.sentence} ids={ids} />
        </span>
        {mismatch && <Mismatch />}
        {hasWitness && row.fixed !== undefined && (
          <span className="ca-verdict-aside">
            <Tag tone="amber">
              <Pin />
              <Rich text={t.witnessHold(assignmentText(row.fixed))} ids={ids} />
            </Tag>
          </span>
        )}
      </div>
      {(row.formula !== undefined || THEORY_REF[row.theory] !== '') && (
        <div className="ca-verdict-detail">
          {row.formula !== undefined && (
            <>
              <code className="ca-mono">
                <Formula text={row.formula} />
              </code>
              <span className="ca-holds">
                <OkIcon size={18} />
                {t.holds}
              </span>
              {onShow !== undefined && row.show !== undefined && (
                <button type="button" className="ca-link" onClick={() => onShow(row.show ?? {}, row.fixed)}>
                  {t.showOnGraph}
                </button>
              )}
            </>
          )}
          {THEORY_REF[row.theory] !== '' && <span className="ca-verdict-ref ca-mono">{THEORY_REF[row.theory]}</span>}
        </div>
      )}
    </li>
  )
}

function HpSupplement({ group, ids, href, linkLabel }: { group: ActualGroup; ids: KnownIds; href?: string; linkLabel?: string }) {
  const t = useMessages()
  const row = group.rows.find((r) => r.theory !== 'butfor' && r.formula !== undefined)
  const witnessRow = row ?? group.rows.find((r) => r.formula !== undefined)
  const causeVars = group.cause.replace(/\s+and\s+/g, ' ∧ ')
  return (
    <div className="ca-supplement">
      <div className="ca-supplement-def">
        <p>{t.hp.intro}</p>
        <dl className="ca-defs">
          <dt className="ca-mono">AC1</dt>
          <dd>{t.hp.ac1}</dd>
          <dt className="ca-mono">AC2</dt>
          <dd>
            {t.hp.ac2}
            <br />
            <code className="ca-mono">(M,u) ⊨ [X←x′, W←w*]¬φ</code>
          </dd>
          <dt className="ca-mono">AC3</dt>
          <dd>{t.hp.ac3}</dd>
        </dl>
        {href !== undefined && (
          <a className="ca-link" href={href}>
            {linkLabel ?? t.hp.lesson}
          </a>
        )}
      </div>
      <div className="ca-supplement-case">
        <p className="ca-muted">{t.hp.applied}</p>
        <p>
          {t.hp.causeIs}{' '}
          <code className="ca-mono">
            <Rich text={causeVars} ids={ids} />
          </code>
        </p>
        {witnessRow?.fixed !== undefined && (
          <p>
            <Rich text={t.hp.witnessIs(Object.keys(witnessRow.fixed).join(', '), Object.values(witnessRow.fixed).map(formatValue).join(', '))} ids={ids} />
          </p>
        )}
        <p>
          {t.hp.effectIs}{' '}
          <code className="ca-mono">
            <Rich text={group.effect} ids={ids} />
          </code>
        </p>
        {witnessRow?.formula !== undefined && (
          <p>
            <code className="ca-mono">
              <Formula text={witnessRow.formula} />
            </code>{' '}
            <span className="ca-holds">
              <OkIcon size={18} />
              {t.holds}
            </span>
          </p>
        )}
        <p className="ca-verdict-ref ca-mono">{t.hp.ref}</p>
      </div>
    </div>
  )
}

/** Each standard's verdict, one row per standard; formal definitions stay in a closed 補充 box. */
export function Verdicts({ c, onShow, lessonHref, lessonLabel }: VerdictsProps) {
  const t = useMessages()
  const ids = c.model.byId
  const groups = actualGroups(t, c)
  const numbers = numberRows(c)
  const decisions = decisionRows(t, c)
  const intu = intuition(t, c)
  return (
    <div className="ca-verdicts">
      {groups.map((g) => (
        <section key={`${g.cause}>${g.effect}`} className="ca-verdict-group">
          <h2 className="ca-h2">
            <Rich text={g.heading} ids={ids} />
          </h2>
          <ul className="ca-verdict-list">
            {intu?.key === `${g.cause}⇒${g.effect}` && <IntuitionRow i={intu} ids={ids} />}
            {g.rows.map((r, i) => (
              <ActualRowView
                key={`${r.theory}-${i}`}
                row={r}
                ids={ids}
                onShow={onShow}
                mismatch={intu?.key === `${g.cause}⇒${g.effect}` && !intu.agree.has(r.theory)}
              />
            ))}
          </ul>
        </section>
      ))}
      {numbers.length > 0 && (
        <section className="ca-verdict-group">
          <h2 className="ca-h2">{t.probabilities}</h2>
          <ul className="ca-verdict-list">
            {numbers.map((n) => (
              <li key={n.expression} className="ca-verdict ca-number-row" data-kind={n.kind}>
                <code className="ca-mono">
                  <Formula text={n.expression} />
                </code>
                <strong className="ca-mono">{probText(n.value)}</strong>
                <span className="ca-muted">{n.kind === 'counterfactual' ? t.counterfactualNote : ''}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {decisions.length > 0 && (
        <section className="ca-verdict-group">
          <h2 className="ca-h2">{t.whatToChoose}</h2>
          <ul className="ca-verdict-list">
            {intu?.choice !== undefined && <IntuitionRow i={intu} ids={ids} />}
            {decisions.map((d) => (
              <li
                key={d.theory}
                className="ca-verdict ca-decision-row"
                data-theory={d.theory}
                data-mismatch={intu?.choice !== undefined && !intu.agree.has(d.theory) ? 'true' : undefined}
              >
                <Tag tone="chip">{d.name}</Tag>
                <span>
                  {t.choose}{' '}
                  <strong className="ca-mono">
                    <Rich text={d.choice} ids={ids} />
                  </strong>
                </span>
                <span className="ca-muted ca-mono">
                  <Rich
                    text={d.utilities.map((u) => t.utility(u.act, u.eu === undefined ? '—' : fixed(u.eu, 1))).join(t.utilitySep)}
                    ids={ids}
                  />
                </span>
                {intu?.choice !== undefined && !intu.agree.has(d.theory) && <Mismatch />}
              </li>
            ))}
          </ul>
        </section>
      )}
      {groups.length > 0 && (
        <Disclosure title={t.hpConditions}>
          <HpSupplement group={groups[0]} ids={ids} href={lessonHref} linkLabel={lessonLabel} />
        </Disclosure>
      )}
      {groups.length === 0 && decisions.length > 0 && (
        <Disclosure title={t.twoUtilities}>
          <div className="ca-supplement-def">
            <p>
              <code className="ca-mono">EU_EDT(a) = Σ P(o | a) · U(o)</code>
              {t.eu.edt}
            </p>
            <p>
              <code className="ca-mono">EU_CDT(a) = Σ P(o | do(a)) · U(o)</code>
              {t.eu.cdt}
            </p>
            {lessonHref !== undefined && (
              <a className="ca-link" href={lessonHref}>
                {lessonLabel ?? t.eu.lesson}
              </a>
            )}
          </div>
        </Disclosure>
      )}
    </div>
  )
}
