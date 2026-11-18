import type { LoadedCase } from '../../data/load.ts'
import type { Assignment, Prior } from '../../engine/index.ts'
import { useMessages } from '../i18n/messages.ts'
import type { ModelWorld, Reading } from '../model/model-state.ts'
import { CopyLatex, Equations } from './Equations.tsx'
import type { UiNotation } from '../model/notation.ts'
import { notations } from '../model/notation.ts'
import { Segmented } from '../shared/parts.tsx'
import type { Stochastic } from '../model/assignments.ts'

const NONE: Stochastic = {}

export interface EquationBoxProps {
  readonly c: LoadedCase
  readonly world: ModelWorld
  readonly interventions: Assignment
  readonly stochastic?: Stochastic
  readonly notation: UiNotation
  readonly onNotation: (n: UiNotation) => void
  /** Default values: 預設 v beside each equation that has one. */
  readonly defaults?: Assignment
  /** Observations: the causal notation lists only the rows that can hold given them. */
  readonly observed?: Assignment
  /** How the observations are read (see `Reading`). */
  readonly reading?: Reading
  /** The prior when the caller changes it (sliders); default the case's. */
  readonly prior?: Prior
}

/** The equations box: its head with the notation switch and the LaTeX copy, then the equations. */
export function EquationBox({ c, world, interventions, stochastic = NONE, notation, onNotation, defaults, observed, reading, prior }: EquationBoxProps) {
  const counterfactual = reading === 'counterfactual' && world.probs !== undefined
  const eq = { c, shown: world.shown, notation, values: world.values, interventions, stochastic, observed, prior, counterfactual }
  const t = useMessages()
  return (
    <div className="ca-box ca-eq-box">
      <div className="ca-eq-head">
        <h3 className="ca-h3">{t.equations}</h3>
        <Segmented label={t.notationLabel} options={notations(t)} value={notation} onChange={onNotation} />
        <CopyLatex {...eq} />
      </div>
      <Equations {...eq} defaults={defaults} />
    </div>
  )
}
