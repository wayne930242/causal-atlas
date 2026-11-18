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
}

/** The sliders of the exogenous variables, or the note that the case's probabilities are one joint distribution. */
export function SliderBlock({ c, sliders, onSlider }: Pick<SliderSectionProps, 'c' | 'sliders' | 'onSlider'>) {
  const t = useMessages()
  const ids = sliderVariables(c)
  return ids.length === 0 ? (
    <p className="ca-muted">{t.jointOnly}</p>
  ) : (
    <SliderList c={c} ids={ids} values={sliders} onChange={onSlider} idPrefix={`ca-slider-${c.data.id}`} />
  )
}

/** The notation switch and the equations under it, for the prior the sliders set. */
export function SliderEquations({ c, sliders, notation, onNotation, shown }: Omit<SliderSectionProps, 'onSlider'>) {
  const t = useMessages()
  const prior = useMemo(() => (c.prior === undefined ? undefined : priorWithSliders(c, sliders)), [c, sliders])
  return (
    <>
      <div className="ca-eq-head">
        <Segmented label={t.notationLabel} options={notations(t)} value={notation} onChange={onNotation} />
        <CopyLatex c={c} shown={shown} notation={notation} interventions={NO_DO} prior={prior} />
      </div>
      <Equations c={c} shown={shown} notation={notation} interventions={NO_DO} prior={prior} />
    </>
  )
}

/** The exogenous variables' sliders with the equations above them (one block behind the 式子和機率 tab). */
export function SliderSection({ c, sliders, onSlider, notation, onNotation, shown }: SliderSectionProps) {
  return (
    <div className="ca-prob-sliders">
      <SliderEquations c={c} sliders={sliders} notation={notation} onNotation={onNotation} shown={shown} />
      <SliderBlock c={c} sliders={sliders} onSlider={onSlider} />
    </div>
  )
}
