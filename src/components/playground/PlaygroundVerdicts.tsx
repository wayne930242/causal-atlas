import type { LoadedCase } from '../../data/load.ts'
import type { Assignment, CausalTheory } from '../../engine/index.ts'
import { useMessages } from '../i18n/messages.ts'
import { Tip } from '../shared/parts.tsx'
import { Rich } from '../text/typeset.tsx'
import type { ActualGroup, ActualRow, VerdictQuery } from '../model/verdict-rows.ts'
import { witnessNow } from '../model/verdict-rows.ts'

export interface PlaygroundVerdictsProps {
  readonly c: LoadedCase
  readonly groups: readonly ActualGroup[]
  readonly queries: readonly VerdictQuery[]
  readonly theories: readonly (readonly CausalTheory[])[]
  /** The query the 目前的世界 line answers. */
  readonly active: number
  readonly interventions: Assignment
  /** 在圖上看: set the witness, the cause at x⃗′ and W⃗ held at w⃗. */
  readonly onShow: (row: ActualRow) => void
}

/**
 * Under a playground's graph: for each query one row of verdicts, a standard per cell, each with
 * 在圖上看 when the engine found a witness; then whether the world on the graph is a witness.
 */
export function PlaygroundVerdicts({ c, groups, queries, theories, active, interventions, onShow }: PlaygroundVerdictsProps) {
  const t = useMessages()
  const ids = c.model.byId
  const query = queries[active]
  return (
    <div className="ca-pg-verdicts">
      {groups.map((g) => (
        <section key={`${g.cause}⇒${g.effect}`} className="ca-pg-verdict-group" data-query={`${g.cause}⇒${g.effect}`}>
          <p className="ca-pg-question">
            <Rich text={t.witness.question(g.cause.replace(/\s+and\s+/g, ' ∧ '), g.effect)} ids={ids} />
          </p>
          <ul className="ca-pg-cells">
            {g.rows.map((r) => (
              <li key={r.theory} className={`ca-pg-cell is-${r.verdict}`} data-verdict-cell={r.theory} data-verdict={r.verdict}>
                <span className="ca-pg-theory">{t.theory[r.theory]}</span>
                <span className="ca-pg-answer">
                  <strong>{t.witness.answer[r.verdict]}</strong>
                  {r.verdict === 'cause' && r.show !== undefined && (
                    <>
                      {' · '}
                      <button type="button" className="ca-link" onClick={() => onShow(r)}>
                        {t.showOnGraph}
                      </button>
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {query !== undefined && (
        <p className="ca-pg-now" data-witness-now="">
          <span className="ca-pg-now-kicker">{t.witness.now}</span>{' '}
          <Rich text={witnessNow(t, c, query, theories[active] ?? [], interventions)} ids={ids} /> <Tip tip={t.witness.tip} label={t.moreInfo} />
        </p>
      )}
    </div>
  )
}
