import type { ReactNode, RefObject } from 'react'
import type { LoadedCase } from '../../data/load.ts'
import type { Assignment, Value } from '../../engine/index.ts'
import { getVariable } from '../../engine/index.ts'
import { formatValue, valuesEqual } from '../../engine/values.ts'
import { useMessages } from '../i18n/messages.ts'
import type { Stochastic } from '../model/assignments.ts'
import { idWithName, probText, shortLabel } from '../model/wording.ts'
import { around, placePop, shifted } from './graph-labels.ts'
import type { SignalLayout } from './signal-geometry.ts'

/** P*(X=1) slider step for a boolean node in probability mode. */
const P_STEP = 0.05

export interface ValuePickerProps {
  readonly c: LoadedCase
  /** The node under do() whose value (or P*(X=1)) the control sets. */
  readonly id: string
  readonly shown: readonly string[]
  readonly layout: SignalLayout
  readonly values?: Assignment
  readonly probs?: Readonly<Record<string, number>>
  readonly interventions: Assignment
  readonly stochastic: Stochastic
  readonly onSetValue?: (id: string, value: Value | undefined) => void
  readonly onSetProbability?: (id: string, p: number | undefined) => void
  readonly popRef: RefObject<HTMLDivElement | null>
  readonly sliderRef: RefObject<HTMLInputElement | null>
  /** After 放開: closes the control and gives the node its focus back. */
  readonly onClose: () => void
}

/**
 * The do() control beside a node, in the graph's view box: a slider over a multi-valued node's
 * values, or over P*(X=1) of a boolean one in probability mode, and a button that releases the do().
 */
export function ValuePicker(props: ValuePickerProps): ReactNode {
  const { c, id, shown, layout, values, probs, interventions, stochastic, onSetValue, onSetProbability, popRef, sliderRef, onClose } = props
  const { prob, r: R, pos, blocks, left, top, width: viewW, height } = layout
  const t = useMessages()
  const p = pos.get(id)
  const variable = getVariable(c.model, id)
  if (p === undefined) return null
  const who = idWithName(id, shortLabel(c.model, id, t.locale))
  const forced = interventions[id]
  const soft = stochastic[id]
  let control: {
    readonly max: number
    readonly step: number
    readonly index: number
    readonly text: string
    readonly label: string
    readonly idle: boolean
    readonly commit: (n: number) => void
    readonly release: () => void
  }
  if (prob && variable.domain.kind === 'boolean' && onSetProbability !== undefined) {
    // P*(X=1) in steps of P_STEP: the ends are do(X=0) and do(X=1), the rest a stochastic do().
    const set = forced !== undefined ? (forced === true || forced === 1 ? 1 : 0) : soft
    const shownP = set ?? Math.round((probs?.[id] ?? 0) / P_STEP) * P_STEP
    control = {
      max: 1,
      step: P_STEP,
      index: shownP,
      text: forced !== undefined ? `${id}=${formatValue(forced)}` : `P(${id}=1)=${probText(shownP)}`,
      label: t.doProbLabel(who),
      idle: set === undefined,
      commit: (n) => onSetProbability(id, n),
      release: () => onSetProbability(id, undefined),
    }
  } else if (variable.domain.kind === 'finite' && onSetValue !== undefined) {
    const options = variable.domain.values
    const shownValue = forced ?? values?.[id]
    const found = shownValue === undefined ? -1 : options.findIndex((o) => valuesEqual(o, shownValue))
    const index = found < 0 ? 0 : found
    control = {
      max: options.length - 1,
      step: 1,
      index,
      text: `${id}=${formatValue(options[index])}`,
      label: t.doPickLabel(who),
      idle: forced === undefined,
      commit: (n) => onSetValue(id, options[n]),
      release: () => onSetValue(id, undefined),
    }
  } else return null
  const W = 184
  const H = 72
  // Beside the node, centred on it, so the nodes under it stay visible; the do tag sits above that line.
  const others = shown.filter((o) => o !== id)
  const nodes = others.flatMap((o) => {
    const q = pos.get(o)
    return q === undefined ? [] : [around(q.x - left, q.y - top, R + 4)]
  })
  const labels = others.flatMap((o) => {
    const q = pos.get(o)
    return q === undefined ? [] : (blocks.get(o)?.boxes ?? []).map((b) => shifted(b, q.x - left, q.y - top))
  })
  const at = placePop({ x: p.x - left, y: p.y - top }, R, { w: W, h: H }, { w: viewW, h: height }, 16, nodes, labels)
  const release = (): void => {
    control.release()
    onClose()
  }
  return (
    <foreignObject className="ca-do-pop-box" x={at.x + left} y={at.y + top} width={W} height={H}>
      <div ref={popRef} className="ca-do-pop" role="dialog" aria-label={control.label} data-pick={id}>
        <div className="ca-do-pop-head">
          <output className={`ca-do-pop-value ca-mono${control.idle ? ' is-idle' : ''}`}>{control.text}</output>
          <button type="button" className="ca-do-pop-release" disabled={control.idle} onClick={release}>
            {t.doRelease}
          </button>
        </div>
        <input
          ref={sliderRef}
          className="ca-slider ca-do-pop-slider"
          type="range"
          min={0}
          max={control.max}
          step={control.step}
          value={control.index}
          aria-label={control.label}
          aria-valuetext={control.text}
          onChange={(e) => control.commit(Number(e.currentTarget.value))}
          // A press that does not move the thumb is still a choice: set the value it shows.
          onClick={() => control.idle && control.commit(control.index)}
        />
      </div>
    </foreignObject>
  )
}
