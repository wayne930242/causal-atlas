import type { CSSProperties, ReactNode, RefObject } from 'react'
import { useEffect } from 'react'
import type { LoadedCase } from '../../data/load.ts'
import type { Assignment, Value } from '../../engine/index.ts'
import { formatValue, getVariable, valuesEqual } from '../../engine/index.ts'
import { useMessages } from '../i18n/messages.ts'
import type { Stochastic } from '../model/assignments.ts'
import type { ModelWorld } from '../model/model-state.ts'
import { idWithName, probText, shortLabel } from '../model/wording.ts'
import { useDigits } from '../shared/digits.ts'
import { Rich } from '../text/typeset.tsx'

/** P*(X=1) slider step for a boolean node in probability mode. */
const P_STEP = 0.05

export interface NodeMenuProps {
  readonly c: LoadedCase
  readonly id: string
  readonly world: ModelWorld
  readonly interventions: Assignment
  readonly stochastic: Stochastic
  readonly observed: Assignment
  /** A probability graph whose nodes can be observed. */
  readonly observes: boolean
  /** do() can be set (the graph has `onDo`). */
  readonly intervenes: boolean
  /** Read as a counterfactual: observations are evidence about the actual world, do() a supposition. */
  readonly counterfactual: boolean
  /** The pair whose d-separation the graph marks. */
  readonly pair?: readonly string[]
  /** Under the actions: the node's own probability sliders. */
  readonly extra?: ReactNode
  readonly onObserve: (value: Value | undefined) => void
  readonly onDo: (value: Value | undefined) => void
  /** Probability mode, boolean node: P*(X=1), 0 and 1 meaning do(X=0) and do(X=1). */
  readonly onDoProbability: (p: number | undefined) => void
  readonly onClose: () => void
  readonly style: CSSProperties
  readonly menuRef: RefObject<HTMLDivElement | null>
}

/**
 * The menu a click on a node opens: what its marks mean now (fill, double ring, red clamp, red outer
 * ring), observing it at each value or not, intervening on it at each value (or at a probability)
 * or releasing it, and the sliders of its own probabilities.
 */
export function NodeMenu(props: NodeMenuProps) {
  const { c, id, world, interventions, stochastic, observed, observes, intervenes, counterfactual, pair, extra, onClose, style, menuRef } = props
  const t = useMessages()
  const digits = useDigits()
  const variable = getVariable(c.model, id)
  const who = idWithName(id, shortLabel(c.model, id, t.locale))
  const values: readonly Value[] = variable.domain.kind === 'boolean' ? [true, false] : variable.domain.values
  const prob = world.probs !== undefined
  const boolean = variable.domain.kind === 'boolean'
  const forced = interventions[id]
  const soft = stochastic[id]
  const intervened = forced !== undefined || soft !== undefined
  const seen = observed[id]
  const exo = variable.kind === 'exogenous'
  useEffect(() => {
    menuRef.current?.focus()
    // Focus once per node: the menu stays where the reader works in it.
  }, [id, menuRef])

  const notes: string[] = []
  if (exo) notes.push(t.menu.exo)
  if (prob) {
    const p = world.probs?.[id]
    if (!boolean) notes.push(t.menu.bars)
    else if (!intervened && seen === undefined && p !== undefined) notes.push(t.menu.fill(id, probText(p, digits)))
  } else {
    const v = world.values?.[id]
    if (v !== undefined) notes.push(boolean ? t.menu.value(id, formatValue(v)) : t.menu.valueFinite(id, formatValue(v)))
  }
  if (seen !== undefined) notes.push((counterfactual ? t.menu.ringEvidence : t.menu.ring)(`${id}=${formatValue(seen)}`))
  if (forced !== undefined) notes.push(t.menu.clamp(`do(${id}=${formatValue(forced)})`))
  else if (soft !== undefined) notes.push(t.menu.clamp(`do(P(${id}=1)=${probText(soft, digits)})`))
  if (pair !== undefined && pair.length === 2 && pair.includes(id)) notes.push(t.menu.dsepEnd(pair[0], pair[1]))

  const softShown = forced !== undefined ? (forced === true || forced === 1 ? 1 : 0) : (soft ?? Math.round((world.probs?.[id] ?? 0) / P_STEP) * P_STEP)
  return (
    <div
      ref={menuRef}
      className="ca-node-menu"
      role="dialog"
      aria-label={t.menu.label(who, observes, !exo && intervenes)}
      data-menu={id}
      tabIndex={-1}
      style={style}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return
        e.stopPropagation()
        onClose()
      }}
    >
      <div className="ca-node-menu-head">
        <span className="ca-node-menu-title">
          <Rich text={who} ids={c.model.byId} />
        </span>
        <button type="button" className="ca-node-menu-close" aria-label={t.menu.close} onClick={onClose}>
          ×
        </button>
      </div>
      {notes.length > 0 && (
        <ul className="ca-node-menu-notes">
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
      {observes ? (
        <div className="ca-node-menu-row" role="group" aria-label={counterfactual ? t.menu.evidence : t.menu.observe}>
          <span className="ca-node-menu-kicker">{counterfactual ? t.menu.evidence : t.menu.observe}</span>
          <span className="ca-node-menu-buttons">
            {values.map((v) => (
              <button
                key={formatValue(v)}
                type="button"
                className="ca-node-menu-btn ca-mono"
                aria-pressed={seen !== undefined && valuesEqual(seen, v)}
                data-observe={formatValue(v)}
                onClick={() => props.onObserve(v)}
              >
                {id}={formatValue(v)}
              </button>
            ))}
            <button type="button" className="ca-node-menu-btn" disabled={seen === undefined} data-observe="" onClick={() => props.onObserve(undefined)}>
              {t.menu.unobserve}
            </button>
          </span>
        </div>
      ) : (
        !prob && <p className="ca-node-menu-note">{t.menu.allKnown}</p>
      )}
      {exo ? (
        <p className="ca-node-menu-note">{t.menu.exoOnly}</p>
      ) : (
        intervenes && (
          <div className="ca-node-menu-row" role="group" aria-label={counterfactual ? t.menu.suppose : t.menu.intervene}>
            <span className="ca-node-menu-kicker">{counterfactual ? t.menu.suppose : t.menu.intervene}</span>
            <span className="ca-node-menu-buttons">
              {values.map((v) => (
                <button
                  key={formatValue(v)}
                  type="button"
                  className="ca-node-menu-btn ca-mono"
                  aria-pressed={forced !== undefined && valuesEqual(forced, v)}
                  data-do={formatValue(v)}
                  onClick={() => props.onDo(v)}
                >
                  do({id}={formatValue(v)})
                </button>
              ))}
              <button type="button" className="ca-node-menu-btn" disabled={!intervened} data-do="" onClick={() => props.onDo(undefined)}>
                {t.menu.release}
              </button>
            </span>
            {prob && boolean && (
              <label className="ca-node-menu-soft">
                <span className="ca-mono">{t.menu.doProb(id)}</span>
                <input
                  className="ca-slider"
                  type="range"
                  min={0}
                  max={1}
                  step={P_STEP}
                  value={softShown}
                  aria-label={t.doProbLabel(who)}
                  aria-valuetext={`P*(${id}=1)=${probText(softShown)}`}
                  data-do-slider={id}
                  onChange={(e) => props.onDoProbability(Number(e.currentTarget.value))}
                />
                <output className={`ca-mono${intervened ? '' : ' ca-muted'}`}>{probText(softShown)}</output>
              </label>
            )}
          </div>
        )
      )}
      {extra !== undefined && (
        <div className="ca-node-menu-probs">
          <span className="ca-node-menu-kicker">{t.menu.probs}</span>
          {extra}
        </div>
      )}
    </div>
  )
}
