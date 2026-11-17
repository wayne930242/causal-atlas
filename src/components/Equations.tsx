import type { LoadedCase } from '../data/load.ts'
import type { Assignment, Expr } from '../engine/index.ts'
import { causalFormulas, renderExpr } from '../engine/index.ts'
import { formatValue } from '../engine/values.ts'
import type { UiNotation } from './notation.ts'
import { useMessages } from './i18n.ts'
import { OkIcon, Tag } from './parts.tsx'
import { Tex } from './Tex.tsx'
import { Rich } from './typeset.tsx'
import { bracketText, doText, equationIds, equationRows, label, outcomeVariable } from './view-model.ts'

export interface EquationsProps {
  readonly c: LoadedCase
  readonly shown: readonly string[]
  readonly notation: UiNotation
  readonly values?: Assignment
  readonly interventions: Assignment
}

/** The model's equations in one notation at a time. */
export function Equations({ c, shown, notation, values, interventions }: EquationsProps) {
  const t = useMessages()
  const ids = equationIds(c, shown, interventions)
  const hasDo = Object.keys(interventions).length > 0
  if (notation === 'causal') {
    if (hasDo && values !== undefined) {
      const y = outcomeVariable(c)
      const v = values[y]
      const statement = `${bracketText(interventions)}(${y}=${formatValue(v ?? '')})`
      const statementExpr: Expr = {
        op: 'do',
        interventions: Object.entries(interventions).map(([variable, value]) => ({ variable, value })),
        body: { op: 'eq', left: { op: 'var', name: y }, right: { op: 'const', value: v ?? '' }, negated: false },
      }
      return (
        <div className="ca-eqs" data-notation={notation}>
          <div className="ca-eq-row ca-eq-statement">
            <code className="ca-eq-text">
              <Tex tex={renderExpr(statementExpr, 'latex')} text={statement} />
            </code>
            <span className="ca-eq-note">
              <Rich text={t.afterDoNote(doText(interventions), label(c.model, y, t.locale), formatValue(v ?? ''))} ids={c.model.byId} />
            </span>
            <span className="ca-eq-holds">
              <OkIcon size={18} />
              {t.holds}
            </span>
          </div>
          <p className="ca-eq-reading">{t.readBrackets}</p>
        </div>
      )
    }
    return (
      <div className="ca-eqs" data-notation={notation}>
        {ids.map((id) => (
          <div key={id} className="ca-eq-row">
            <code className="ca-eq-text">
              {causalFormulas(c.model, id).map((f, i, all) => (
                <span key={i} className="ca-eq-line">
                  <Tex
                    tex={`${renderExpr(f, 'latex')}${i < all.length - 1 ? ' \\land' : ''}`}
                    text={`${renderExpr(f, 'text')}${i < all.length - 1 ? ' ∧' : ''}`}
                  />
                </span>
              ))}
            </code>
            <code className="ca-eq-worked" />
            <span className="ca-eq-note">{label(c.model, id, t.locale)}</span>
          </div>
        ))}
        <p className="ca-eq-reading">{t.readCausal}</p>
      </div>
    )
  }
  const rows = equationRows(t, c, ids, notation, values, interventions, shown)
  return (
    <div className="ca-eqs" data-notation={notation}>
      {rows.map((r) => (
        <div key={r.id} className="ca-eq-row" data-intervened={r.intervened ? 'true' : 'false'}>
          <code className="ca-eq-text">
            {r.struck !== undefined && (
              <>
                <s className="ca-eq-struck">
                  <Tex tex={r.struckLatex ?? r.struck} text={r.struck} />
                </s>{' '}
              </>
            )}
            <Tex tex={r.latex} text={r.text} />
            {r.intervened && (
              <>
                {' '}
                <Tag tone="accent" mono>
                  do
                </Tag>
              </>
            )}
          </code>
          <code className="ca-eq-worked">
            {r.worked !== undefined && <Tex tex={r.workedLatex ?? r.worked} text={r.worked} />}
          </code>
          <span className="ca-eq-note">
            <Rich text={r.note} ids={c.model.byId} />
          </span>
        </div>
      ))}
    </div>
  )
}
