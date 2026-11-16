import type { LoadedCase } from '../data/load.ts'
import type { Assignment } from '../engine/index.ts'
import { causalFormulas, renderExpr } from '../engine/index.ts'
import { formatValue } from '../engine/values.ts'
import type { UiNotation } from './notation.ts'
import { OkIcon, Tag } from './parts.tsx'
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
  const ids = equationIds(c, shown, interventions)
  const hasDo = Object.keys(interventions).length > 0
  if (notation === 'causal') {
    if (hasDo && values !== undefined) {
      const y = outcomeVariable(c)
      const v = values[y]
      const statement = `${bracketText(interventions)}(${y}=${formatValue(v ?? '')})`
      return (
        <div className="ca-eqs" data-notation={notation}>
          <div className="ca-eq-row ca-eq-statement">
            <code className="ca-eq-text">{statement}</code>
            <span className="ca-eq-note">
              {doText(interventions)} 之後，{label(c.model, y)}：{formatValue(v ?? '')}
            </span>
            <span className="ca-eq-holds">
              <OkIcon size={18} />
              成立
            </span>
          </div>
          <p className="ca-eq-reading">讀法：先做方括號裡的干預，再看圓括號裡的事成不成立。</p>
        </div>
      )
    }
    return (
      <div className="ca-eqs" data-notation={notation}>
        {ids.map((id) => (
          <div key={id} className="ca-eq-row">
            <code className="ca-eq-text">
              {causalFormulas(c.model, id)
                .map((f) => renderExpr(f, 'text'))
                .join(' ∧\n')}
            </code>
            <code className="ca-eq-worked" />
            <span className="ca-eq-note">{label(c.model, id)}</span>
          </div>
        ))}
        <p className="ca-eq-reading">讀法：[X←x](Y=y) 是把 X 設成 x 之後，Y 等於 y。</p>
      </div>
    )
  }
  const rows = equationRows(c, ids, notation, values, interventions, shown)
  return (
    <div className="ca-eqs" data-notation={notation}>
      {rows.map((r) => (
        <div key={r.id} className="ca-eq-row" data-intervened={r.intervened ? 'true' : 'false'}>
          <code className="ca-eq-text">
            {r.struck !== undefined && (
              <>
                <s className="ca-eq-struck">{r.struck}</s>{' '}
              </>
            )}
            {r.text}
            {r.intervened && (
              <>
                {' '}
                <Tag tone="accent" mono>
                  do
                </Tag>
              </>
            )}
          </code>
          <code className="ca-eq-worked">{r.worked ?? ''}</code>
          <span className="ca-eq-note">{r.note}</span>
        </div>
      ))}
    </div>
  )
}
