import { getCase } from '../data/index.ts'
import type { Assignment } from '../engine/index.ts'
import { useModel } from './model-state.ts'
import { EquationBox, GraphBox } from './ModelPanel.tsx'
import { assignmentText } from './view-model.ts'

export interface CausalPlaygroundProps {
  /** A bundled case id, e.g. `rock-throwing`. */
  readonly caseId: string
  /** do() applied at the start. */
  readonly initialInterventions?: Assignment
  /** Show the case's preset interventions as buttons. Default true. */
  readonly presets?: boolean
  /** Link in exported images' watermark. Default https://wayneh.tw/causal/. */
  readonly exportUrl?: string
}

/** One case's graph and equations; click a node to set or release do() on it. */
export function CausalPlayground({ caseId, initialInterventions, presets = true, exportUrl }: CausalPlaygroundProps) {
  const c = getCase(caseId)
  const { interventions, setInterventions, notation, setNotation, world } = useModel(c, initialInterventions)
  return (
    <div className="ca-root not-prose ca-playground" data-case={c.data.id}>
      <div className="ca-panel">
        <GraphBox c={c} world={world} interventions={interventions} onInterventions={setInterventions} legend exportUrl={exportUrl} />
        <EquationBox c={c} world={world} interventions={interventions} notation={notation} onNotation={setNotation} />
      </div>
      <div className="ca-playground-foot">
        <p className="ca-hint">點圖上的節點，可以把它設成另一個值；再點一次就放開。</p>
        {presets && c.data.showcase.length > 0 && (
          <div className="ca-presets" role="group" aria-label="預設的干預">
            {c.data.showcase.map((s) => (
              <button
                key={s.label.zh}
                type="button"
                className="ca-btn ca-btn-outline"
                aria-pressed={assignmentText(s.interventions) === assignmentText(interventions)}
                onClick={() => setInterventions(s.interventions)}
              >
                {s.label.zh}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
