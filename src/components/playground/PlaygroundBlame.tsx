import type { LoadedCase } from '../../data/load.ts'
import { useMessages } from '../i18n/messages.ts'
import { degreeText } from '../model/verdict-rows.ts'
import { assignmentText } from '../model/wording.ts'
import { Tip } from '../shared/parts.tsx'
import { Formula, Rich } from '../text/typeset.tsx'
import type { BlameView } from './blame-view.ts'
import { degreeNumber } from './blame-view.ts'

export interface PlaygroundBlameProps {
  readonly c: LoadedCase
  readonly cause: string
  readonly effect: string
  readonly view: BlameView
}

/**
 * Under a playground's graph: the degree of blame (Halpern 2016, Def. 6.2.1) of one event for an
 * outcome, one row per epistemic state and one column per standard; each state's backgrounds, their
 * probabilities and the responsibility in each, behind a fold.
 */
export function PlaygroundBlame({ c, cause, effect, view }: PlaygroundBlameProps) {
  const t = useMessages()
  const ids = c.model.byId
  const causeText = cause.replace(/\s+and\s+/g, ' ∧ ')
  const name = (i: number): string => view.states[i].label ?? t.blame.documentState
  return (
    <div className="ca-pg-blame" data-blame-block="">
      <p className="ca-pg-question">
        <Rich text={t.blame.question(causeText, effect)} ids={ids} /> <Tip tip={<Rich text={t.blame.tip(causeText)} ids={ids} />} label={t.moreInfo} />
      </p>
      <div className="ca-scroll-x">
        <table className="ca-cf-table ca-blame-table" data-testid="blame-table">
          <thead>
            <tr>
              <th scope="col">{t.blame.state}</th>
              {view.theories.map((theory) => (
                <th key={theory} scope="col">
                  {t.theory[theory]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.states.map((state, i) => (
              <tr key={i} data-state={i}>
                <th scope="row">
                  {name(i)}
                  {state.given !== undefined && (
                    <>
                      {' · '}
                      <Rich text={t.blame.given(state.given)} ids={ids} />
                    </>
                  )}
                  <span className="ca-muted ca-small ca-blame-count"> · {t.blame.contexts(state.contexts)}</span>
                </th>
                {view.theories.map((theory) => (
                  <td key={theory} className="ca-mono" data-blame={theory} data-degree={state.results[theory].degree.toFixed(6)}>
                    {degreeNumber(state.results[theory].degree)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {view.states.map((state, i) => (
        <details key={i} className="ca-blame-fold" data-fold={i}>
          <summary>
            {name(i)} · {t.blame.fold(state.contexts)}
          </summary>
          <div className="ca-blame-fold-table">
            <table className="ca-cf-table">
              <thead>
                <tr>
                  <th scope="col"><Rich text={t.blame.background(c.model.exogenous)} ids={ids} /></th>
                  <th scope="col">{t.blame.probability}</th>
                  {view.theories.map((theory) => (
                    <th key={theory} scope="col">
                      {t.blame.responsibility(t.theory[theory])}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {state.results[view.theories[0]].rows.map((row, r) => (
                  <tr key={assignmentText(row.context)} data-background={assignmentText(row.context)}>
                    <th scope="row">
                      <Formula text={assignmentText(row.context)} />
                    </th>
                    <td className="ca-mono">{degreeNumber(row.p)}</td>
                    {view.theories.map((theory) => {
                      const cell = state.results[theory].rows[r]
                      return (
                        <td key={theory} className="ca-mono" data-responsibility={degreeText({ degree: cell.responsibility, k: cell.k })}>
                          {degreeText({ degree: cell.responsibility, k: cell.k })}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ))}
    </div>
  )
}
