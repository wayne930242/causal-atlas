import type { LoadedCase } from '../../data/load.ts'
import type { Assignment, DecisionProblem, Value } from '../../engine/index.ts'
import { evaluateDecision, formatValue, getVariable, valuesEqual } from '../../engine/index.ts'
import { useMessages } from '../i18n/messages.ts'
import { Tip } from '../shared/parts.tsx'
import { Rich } from '../text/typeset.tsx'
import { fixed } from '../model/view-model.ts'

export interface DecisionBarsProps {
  readonly c: LoadedCase
  readonly problem: DecisionProblem
  /** The act observed lights its evidential bar; the act set by do() its causal bar. */
  readonly observed: Assignment
  readonly interventions: Assignment
}

/** An expected utility as the bars write it: two decimals, a true minus, thousands grouped from 1,000. */
function euText(eu: number): string {
  const s = fixed(eu, 2)
  const [int, frac] = s.replace('-', '').split('.')
  const grouped = Math.abs(eu) >= 1000 ? int.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : int
  return `${eu < 0 && s !== '-0.00' ? '−' : ''}${grouped}.${frac}`
}

/**
 * Expected utility of each act, one row per theory (evidential, causal) and one bar per act on a
 * shared zero, with the act each picks and by how much. Observing the act lights its evidential
 * bar (its weights are what the graph now shows); do() on it lights its causal bar.
 */
export function DecisionBars({ c, problem, observed, interventions }: DecisionBarsProps) {
  const t = useMessages()
  const prior = c.prior
  if (prior === undefined) throw new Error(`${c.data.id}: decision needs probabilities`)
  const raw = evaluateDecision(c.model, prior, problem)
  // A boolean act reads 1 first, as the nodes do; listed acts keep their order.
  const boolAct = problem.acts === undefined && getVariable(c.model, problem.act).domain.kind === 'boolean'
  const result = boolAct ? { ...raw, acts: [...raw.acts].sort((a, b) => Number(b.act === true) - Number(a.act === true)) } : raw
  const actText = (a: Value): string => `${problem.act}=${formatValue(a)}`
  const all = result.acts.flatMap((a) => [a.cdt.eu, ...(a.edt === undefined ? [] : [a.edt.eu])])
  const lo = Math.min(0, ...all)
  const hi = Math.max(0, ...all)
  const span = hi - lo > 0 ? hi - lo : 1
  const at = (v: number): number => ((v - lo) / span) * 100
  const zero = at(0)
  const seen = observed[problem.act]
  const done = interventions[problem.act]
  const rows = (['edt', 'cdt'] as const).map((theory) => {
    const eus = result.acts.map((a) => (theory === 'edt' ? a.edt?.eu : a.cdt.eu))
    const choice = theory === 'edt' ? result.edtChoice : result.cdtChoice
    const best = Math.max(...eus.filter((e): e is number => e !== undefined))
    const rest = eus.filter((e, i): e is number => e !== undefined && !choice.some((ch) => valuesEqual(ch, result.acts[i].act)))
    const by = choice.length === 1 && rest.length > 0 ? euText(best - Math.max(...rest)) : undefined
    const lit = theory === 'edt' ? seen : done
    return { theory, eus, choice: t.ev.choose(t.list(choice.map(actText)), by), lit }
  })
  const utilityLines = problem.utility.rows.map(
    (r) => `U(${problem.utility.variables.map((id, i) => `${id}=${formatValue(r.when[i])}`).join(', ')}) = ${euText(r.utility).replace(/\.00$/, '')}`,
  )
  return (
    <div className="ca-ev" style={{ ['--ca-ev-acts' as string]: result.acts.length }}>
      <p className="ca-ev-head">
        <span className="ca-pg-now-kicker">{t.ev.title}</span>{' '}
        <Tip
          label={t.moreInfo}
          tip={
            <>
              {t.clauses(utilityLines)}
              <br />
              EU_EDT(a) = Σ P(o | a) · U(o){t.eu.edt}
              <br />
              EU_CDT(a) = Σ P(o | do(a)) · U(o){t.eu.cdt}
            </>
          }
        />
      </p>
      <div className="ca-ev-grid" role="table" aria-label={t.ev.title}>
        <div className="ca-ev-row ca-ev-acts" role="row">
          <span role="columnheader" />
          {result.acts.map((a) => (
            <span key={String(a.act)} role="columnheader" className="ca-ev-act ca-mono">
              <Rich text={actText(a.act)} ids={c.model.byId} />
            </span>
          ))}
          <span role="columnheader" />
        </div>
        {rows.map((r) => (
          <div key={r.theory} className="ca-ev-row" role="row" data-ev-row={r.theory}>
            <span role="rowheader" className="ca-ev-name">
              {t.ev[r.theory]}
            </span>
            {result.acts.map((a, i) => {
              const v = r.eus[i]
              const lit = r.lit !== undefined && valuesEqual(r.lit, a.act)
              const left = v === undefined ? zero : Math.min(zero, at(v))
              const width = v === undefined ? 0 : Math.abs(at(v) - zero)
              return (
                <span key={String(a.act)} role="cell" className="ca-ev-cell" data-ev-act={formatValue(a.act)} data-lit={lit ? 'true' : undefined}>
                  <span
                    className="ca-ev-num ca-mono"
                    data-ev-value={v === undefined ? '—' : fixed(v, 2)}
                    style={{ left: `${left}%`, width: `${width}%`, textAlign: v !== undefined && v < 0 ? 'right' : 'left' }}
                  >
                    {v === undefined ? '—' : euText(v)}
                  </span>
                  <span className="ca-ev-track">
                    <span className="ca-ev-zero" style={{ left: `${zero}%` }} />
                    {v !== undefined && <span className="ca-ev-bar" style={{ left: `${left}%`, width: `${width}%` }} />}
                  </span>
                </span>
              )
            })}
            <span role="cell" className="ca-ev-choice">
              <Rich text={r.choice} ids={c.model.byId} />
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
