import { useMemo } from 'react'
import type { LoadedCase } from '../../data/load.ts'
import type { Assignment } from '../../engine/index.ts'
import { CopyLatex, Equations } from '../panels/Equations.tsx'
import { useMessages } from '../i18n/messages.ts'
import type { UiNotation } from '../model/notation.ts'
import { notations } from '../model/notation.ts'
import { Segmented } from '../shared/parts.tsx'
import { SliderList } from '../panels/SliderList.tsx'
import { priorWithSliders, sliderVariables } from '../model/probability-view.ts'

const NO_DO: Assignment = {}

export interface SliderSectionProps {
  readonly c: LoadedCase
  readonly sliders: Readonly<Record<string, number>>
  readonly onSlider: (id: string, p: number) => void
  readonly notation: UiNotation
  readonly onNotation: (n: UiNotation) => void
  readonly shown: readonly string[]
  readonly withHead: boolean
}

/** The exogenous variables' sliders with the equations under them, optionally under their own head with the notation switch. */
export function SliderSection({ c, sliders, onSlider, notation, onNotation, shown, withHead }: SliderSectionProps) {
  const t = useMessages()
  const prior = useMemo(() => (c.prior === undefined ? undefined : priorWithSliders(c, sliders)), [c, sliders])
  const ids = sliderVariables(c)
  return (
    <div className="ca-prob-sliders">
      <div className="ca-eq-head">
        {withHead && <h3 className="ca-h3">{t.probEquations}</h3>}
        <Segmented label={t.notationLabel} options={notations(t)} value={notation} onChange={onNotation} />
        <CopyLatex c={c} shown={shown} notation={notation} interventions={NO_DO} prior={prior} />
      </div>
      <Equations c={c} shown={shown} notation={notation} interventions={NO_DO} prior={prior} />
      {ids.length === 0 ? (
        <p className="ca-muted">{t.jointOnly}</p>
      ) : (
        <SliderList c={c} ids={ids} values={sliders} onChange={onSlider} idPrefix={`ca-slider-${c.data.id}`} />
      )}
    </div>
  )
}
