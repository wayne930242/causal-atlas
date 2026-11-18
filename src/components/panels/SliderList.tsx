import type { LoadedCase } from '../../data/load.ts'
import { getVariable } from '../../engine/index.ts'
import { useMessages } from '../i18n/messages.ts'
import { Ident } from '../text/typeset.tsx'
import { label, probText, targetText } from '../model/view-model.ts'

export interface SliderListProps {
  readonly c: LoadedCase
  readonly ids: readonly string[]
  /** P(target) per id. */
  readonly values: Readonly<Record<string, number>>
  readonly onChange: (id: string, p: number) => void
  /** Prefix of each input's id (`<prefix>-<variable>`). */
  readonly idPrefix: string
}

/** One row per exogenous variable: its id, its name, a slider for P(id = target) and the value. */
export function SliderList({ c, ids, values, onChange, idPrefix }: SliderListProps) {
  const t = useMessages()
  return (
    <ul className="ca-slider-list">
      {ids.map((id) => {
        const variable = getVariable(c.model, id)
        const p = values[id] ?? 0
        const inputId = `${idPrefix}-${id}`
        return (
          <li key={id} className="ca-slider-row">
            <span className="ca-slider-var ca-mono">
              <Ident id={id} />
            </span>
            <label className="ca-slider-label" htmlFor={inputId}>
              {t.sliderLabel(label(c.model, id, t.locale))}
            </label>
            <input
              id={inputId}
              className="ca-slider"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={p}
              aria-valuetext={`P(${targetText(variable)}) = ${probText(p)}`}
              onChange={(e) => onChange(id, Number(e.currentTarget.value))}
            />
            <output className="ca-slider-value ca-mono" htmlFor={inputId}>
              p = {probText(p)}
            </output>
          </li>
        )
      })}
    </ul>
  )
}
