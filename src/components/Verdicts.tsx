import type { LoadedCase } from '../data/load.ts'
import type { Assignment } from '../engine/index.ts'
import { formatValue } from '../engine/values.ts'
import { Disclosure, NoIcon, OkIcon, PartIcon, Pin, Tag } from './parts.tsx'
import type { ActualGroup, ActualRow } from './verdict-rows.ts'
import { THEORY_NAME, THEORY_REF, VERDICT_WORD, actualGroups, decisionRows, numberRows } from './verdict-rows.ts'
import { assignmentText, probText } from './view-model.ts'

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

function ActualRowView({ row, onShow }: { readonly row: ActualRow; readonly onShow?: VerdictsProps['onShow'] }) {
  const hasWitness = row.fixed !== undefined && row.theory !== 'butfor'
  return (
    <li className="ca-verdict" data-theory={row.theory} data-verdict={row.verdict}>
      <div className="ca-verdict-main">
        <span className="ca-verdict-theory">
          <Tag tone={hasWitness ? 'amber' : 'chip'}>{THEORY_NAME[row.theory]}</Tag>
        </span>
        <span className="ca-verdict-word">
          <VerdictIcon verdict={row.verdict} />
          <strong>{VERDICT_WORD[row.verdict]}</strong>
        </span>
        <span className="ca-verdict-sentence">{row.sentence}</span>
        {hasWitness && row.fixed !== undefined && (
          <span className="ca-verdict-aside">
            <Tag tone="amber">
              <Pin />
              見證：固定 {assignmentText(row.fixed)}
            </Tag>
          </span>
        )}
      </div>
      {(row.formula !== undefined || THEORY_REF[row.theory] !== '') && (
        <div className="ca-verdict-detail">
          {row.formula !== undefined && (
            <>
              <code className="ca-mono">{row.formula}</code>
              <span className="ca-holds">
                <OkIcon size={18} />
                成立
              </span>
              {onShow !== undefined && row.show !== undefined && (
                <button type="button" className="ca-link" onClick={() => onShow(row.show ?? {}, row.fixed)}>
                  在圖上看
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

function HpSupplement({ group, href, linkLabel }: { group: ActualGroup; href?: string; linkLabel?: string }) {
  const row = group.rows.find((r) => r.theory !== 'butfor' && r.formula !== undefined)
  const witnessRow = row ?? group.rows.find((r) => r.formula !== undefined)
  const causeVars = group.cause.replace(/\s+and\s+/g, ' ∧ ')
  return (
    <div className="ca-supplement">
      <div className="ca-supplement-def">
        <p>在模型 M 和脈絡 u 之下，X=x 是 φ 的實際原因，要三個條件都成立。</p>
        <dl className="ca-defs">
          <dt className="ca-mono">AC1</dt>
          <dd>X=x 和 φ 在實際世界都成立。</dd>
          <dt className="ca-mono">AC2</dt>
          <dd>
            有一組變項 W 和另一個值 x′：把 W 固定在實際值 w*，再把 X 設成 x′，φ 就不成立。
            <br />
            <code className="ca-mono">(M,u) ⊨ [X←x′, W←w*]¬φ</code>
          </dd>
          <dt className="ca-mono">AC3</dt>
          <dd>X 的任何真子集都不能同時滿足 AC1 和 AC2。</dd>
        </dl>
        {href !== undefined && (
          <a className="ca-link" href={href}>
            {linkLabel ?? '形式系列：實際因果'}
          </a>
        )}
      </div>
      <div className="ca-supplement-case">
        <p className="ca-muted">套到這個案例</p>
        <p>
          X=x 是 <code className="ca-mono">{causeVars}</code>
        </p>
        {witnessRow?.fixed !== undefined && (
          <p>
            W 是 {'{'}
            {Object.keys(witnessRow.fixed).join(', ')}
            {'}'}，w* 是 {Object.values(witnessRow.fixed).map(formatValue).join(', ')}
          </p>
        )}
        <p>
          φ 是 <code className="ca-mono">{group.effect}</code>
        </p>
        {witnessRow?.formula !== undefined && (
          <p>
            <code className="ca-mono">{witnessRow.formula}</code>{' '}
            <span className="ca-holds">
              <OkIcon size={18} />
              成立
            </span>
          </p>
        )}
        <p className="ca-verdict-ref ca-mono">Halpern 2016，第 2 章</p>
      </div>
    </div>
  )
}

/** Each standard's verdict, one row per standard; formal definitions stay in a closed 補充 box. */
export function Verdicts({ c, onShow, lessonHref, lessonLabel }: VerdictsProps) {
  const groups = actualGroups(c)
  const numbers = numberRows(c)
  const decisions = decisionRows(c)
  return (
    <div className="ca-verdicts">
      {groups.map((g) => (
        <section key={`${g.cause}>${g.effect}`} className="ca-verdict-group">
          <h2 className="ca-h2">{g.heading}</h2>
          <ul className="ca-verdict-list">
            {g.rows.map((r, i) => (
              <ActualRowView key={`${r.theory}-${i}`} row={r} onShow={onShow} />
            ))}
          </ul>
        </section>
      ))}
      {numbers.length > 0 && (
        <section className="ca-verdict-group">
          <h2 className="ca-h2">機率</h2>
          <ul className="ca-verdict-list">
            {numbers.map((n) => (
              <li key={n.expression} className="ca-verdict ca-number-row" data-kind={n.kind}>
                <code className="ca-mono">{n.expression}</code>
                <strong className="ca-mono">{probText(n.value)}</strong>
                <span className="ca-muted">{n.kind === 'counterfactual' ? '反事實：先依證據回推，再干預、預測' : ''}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {decisions.length > 0 && (
        <section className="ca-verdict-group">
          <h2 className="ca-h2">該怎麼選</h2>
          <ul className="ca-verdict-list">
            {decisions.map((d) => (
              <li key={d.theory} className="ca-verdict ca-decision-row" data-theory={d.theory}>
                <Tag tone="chip">{d.name}</Tag>
                <span>
                  選 <strong className="ca-mono">{d.choice}</strong>
                </span>
                <span className="ca-muted ca-mono">
                  {d.utilities
                    .map((u) => `${u.act}：${u.eu === undefined ? '—' : u.eu.toFixed(1)}`)
                    .join('　')}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {groups.length > 0 && (
        <Disclosure title="HP 定義的三個條件">
          <HpSupplement group={groups[0]} href={lessonHref} linkLabel={lessonLabel} />
        </Disclosure>
      )}
      {groups.length === 0 && decisions.length > 0 && (
        <Disclosure title="兩種期望效用">
          <div className="ca-supplement-def">
            <p>
              <code className="ca-mono">EU_EDT(a) = Σ P(o | a) · U(o)</code>：看到自己做了 a 之後，結果的機率。
            </p>
            <p>
              <code className="ca-mono">EU_CDT(a) = Σ P(o | do(a)) · U(o)</code>：動手做 a 之後，結果的機率。
            </p>
            {lessonHref !== undefined && (
              <a className="ca-link" href={lessonHref}>
                {lessonLabel ?? '形式系列：因果決策'}
              </a>
            )}
          </div>
        </Disclosure>
      )}
    </div>
  )
}
