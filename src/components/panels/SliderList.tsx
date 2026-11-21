import type { FocusEvent, PointerEvent } from 'react'
import type { LoadedCase } from '../../data/load.ts'
import { getVariable } from '../../engine/index.ts'
import { useMessages } from '../i18n/messages.ts'
import { focusVisible } from '../shared/focus-visible.ts'
import { Ident, Rich } from '../text/typeset.tsx'
import { targetText } from '../model/probability-view.ts'
import { sliderGroups } from '../model/slider-groups.ts'
import { idWithName, label, probText, shortLabel } from '../model/wording.ts'

export interface SliderListProps {
  readonly c: LoadedCase
  readonly ids: readonly string[]
  /** P(target) per id. */
  readonly values: Readonly<Record<string, number>>
  readonly onChange: (id: string, p: number) => void
  /** Prefix of each input's id (`<prefix>-<variable>`). */
  readonly idPrefix: string
  /**
   * The drawn nodes: given, the rows sit under a heading per node they move (`S 灑水器開著`), so a
   * node's probabilities are found under its name.
   */
  readonly shown?: readonly string[]
  /** Rows drawn lit: the sliders of a hovered node. */
  readonly lit?: readonly string[]
  /** The pointer (a mouse or pen) is over a row or a group's heading (its first row), or the keyboard focus is in it; undefined when it leaves. */
  readonly onHover?: (id: string | undefined) => void
}

/** One row per exogenous variable: its id, its name, a slider for P(id = target) and the value; grouped by node when `shown` is given. */
export function SliderList({ c, ids, values, onChange, idPrefix, shown, lit = [], onHover }: SliderListProps) {
  const t = useMessages()
  const hover = (id: string) =>
    onHover === undefined
      ? {}
      : {
          onPointerEnter: (e: PointerEvent<HTMLElement>) => e.pointerType !== 'touch' && onHover(id),
          onPointerLeave: (e: PointerEvent<HTMLElement>) => e.pointerType !== 'touch' && onHover(undefined),
          onFocus: (e: FocusEvent<HTMLElement>) => focusVisible(e.target) && onHover(id),
          onBlur: () => onHover(undefined),
        }
  const row = (id: string) => {
    const variable = getVariable(c.model, id)
    const p = values[id] ?? 0
    const inputId = `${idPrefix}-${id}`
    return (
      <li key={id} className="ca-slider-row" data-slider={id} data-lit={lit.includes(id) ? 'true' : undefined} {...hover(id)}>
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
  }
  if (shown === undefined) return <ul className="ca-slider-list">{ids.map(row)}</ul>
  const groups = sliderGroups(c.model, shown, ids)
  return (
    <ul className="ca-slider-list is-grouped">
      {groups.map((g) => {
        const who = t.list(g.nodes.map((n) => idWithName(n, shortLabel(c.model, n, t.locale))))
        const key = g.nodes.join(',') || g.sliders.join(',')
        return (
          <li key={key} className="ca-slider-group" data-slider-group={g.nodes.join(',')}>
            {g.nodes.length > 0 && (
              <div className="ca-slider-group-head" data-lit={g.sliders.some((s) => lit.includes(s)) ? 'true' : undefined} {...hover(g.sliders[0])}>
                <Rich text={who} ids={c.model.byId} />
              </div>
            )}
            <ul className="ca-slider-sublist" aria-label={g.nodes.length > 0 ? t.sliderGroup(who) : undefined}>
              {g.sliders.map(row)}
            </ul>
          </li>
        )
      })}
    </ul>
  )
}
