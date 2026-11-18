import type { KeyboardEvent, MouseEvent, PointerEvent, ReactNode } from 'react'
import { useEffect, useId, useRef, useState } from 'react'
import type { LoadedCase } from '../../data/load.ts'
import type { Assignment, Edge, Value } from '../../engine/index.ts'
import { getVariable } from '../../engine/index.ts'
import { formatValue, valuesEqual } from '../../engine/values.ts'
import { around, placePop, shifted } from './graph-labels.ts'
import type { NodeToggle } from '../i18n/messages.ts'
import { useMessages } from '../i18n/messages.ts'
import { Tip } from '../shared/parts.tsx'
import { sub } from '../text/svg-text.tsx'
import type { PathMarks } from '../model/dsep-view.ts'
import type { Stochastic } from '../model/assignments.ts'
import { idWithName, probText, shortLabel } from '../model/wording.ts'
import { barLayout, textWidth } from '../text/text-measure.ts'
import { layoutSignalGraph } from './signal-geometry.ts'
import type { Block, Point } from './signal-shapes.ts'
import { BAR_H, BAR_LABEL, EXO_INSET, arrowHead, clampPath, exoDash, snap } from './signal-shapes.ts'

export interface SignalGraphProps {
  readonly c: LoadedCase
  readonly shown: readonly string[]
  /** Deterministic world to draw (after any do). Omit in probability mode. */
  readonly values?: Assignment
  /** The world before do(), to note changed values. */
  readonly original?: Assignment
  /** Probability mode: P(V = 1) per variable. */
  readonly probs?: Readonly<Record<string, number>>
  /** Probability mode: P(V = value) in domain order for each non-boolean variable; drawn as one bar per value. */
  readonly dists?: Readonly<Record<string, readonly number[]>>
  /** Probability mode: a short note under each number. */
  readonly probNotes?: Readonly<Record<string, string>>
  /** Observed variables (drawn with a second ring). */
  readonly observed?: readonly string[]
  /** The observed values, written in a tag beside each observed node. */
  readonly observedValues?: Assignment
  /** The observations are counterfactual evidence: ringed, with no tag (a 實際 v note says it instead). */
  readonly evidence?: boolean
  readonly interventions: Assignment
  /** Stochastic interventions: P*(X=1) of a boolean node, 0 < p < 1 (drawn like a do(), with that probability). */
  readonly stochastic?: Stochastic
  readonly removedEdges: readonly Edge[]
  /** Variables a witness holds fixed: an amber hull. */
  readonly witness?: Assignment
  /**
   * Each held variable says 固定（實際 v） beside it when held away from its actual value, else
   * 固定（實際值）, instead of the hull's 見證 tag (the playground: what is held need not be a witness).
   */
  readonly holdNotes?: boolean
  /** Default values (the model's normality): a node off its default says 偏離（預設 v） under its label. Graphs with values only. */
  readonly defaults?: Assignment
  /** d-separation: edges on an open path between the pair lit, edges only on blocked ones dashed, the two ends ringed. */
  readonly paths?: PathMarks
  /** Nodes drawn with the do() clamp but no value tag: the arrows into them are cut in a graph without numbers (do-calculus). */
  readonly clamped?: readonly string[]
  /** A click (or Enter) on a node picks it, e.g. into or out of a known set; no observing or do(). */
  readonly onPick?: (id: string) => void
  /** Click on a node: toggles a boolean one; a multi-valued one opens the value control when `onSetValue` is given. */
  readonly onToggle?: (id: string) => void
  /** The value control of a multi-valued node: the chosen value, or undefined to release the intervention. */
  readonly onSetValue?: (id: string, value: Value | undefined) => void
  /**
   * Probability mode: intervening on a boolean node sets P*(X=1) = 1 at once (the observed value,
   * when it was observed) and opens a slider for P*(X=1), reported here; 0 and 1 mean do(X=0) and
   * do(X=1), undefined releases the intervention.
   */
  readonly onSetProbability?: (id: string, p: number | undefined) => void
  /**
   * Given, a click (or Enter) observes the node, and a long press, Shift+click or Shift+Enter
   * intervenes on it; without it every click intervenes.
   */
  readonly onObserve?: (id: string) => void
  readonly title: string
  /** Narrower columns, for two graphs side by side. */
  readonly compact?: boolean
  /** Lets nodes be dragged (or moved with arrow keys); reports the move in grid columns and rows. */
  readonly onMove?: (id: string, dCol: number, dRow: number) => void
}

interface Drag {
  readonly id: string
  readonly pointer: number
  readonly x0: number
  readonly y0: number
  readonly dx: number
  readonly dy: number
  readonly moved: boolean
}

/** P*(X=1) slider step for a boolean node in probability mode. */
const P_STEP = 0.05
/** How long a press must last to intervene instead of observe, in ms. */
const LONG_PRESS = 500

/** Direction 1 「訊號圖」: value nodes, signal edges, do() clamps and cut edges. */
export function SignalGraph(props: SignalGraphProps) {
  const {
    c,
    shown,
    values,
    original,
    probs,
    dists,
    probNotes,
    observed = [],
    interventions,
    stochastic = {},
    removedEdges,
    witness,
    onToggle,
    onSetValue,
    onSetProbability,
    onObserve,
    onMove,
    observedValues = {},
    evidence = false,
    holdNotes = false,
    defaults,
    paths,
    clamped = [],
    onPick,
  } = props
  const t = useMessages()
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const svgRef = useRef<SVGSVGElement>(null)
  const [drag, setDrag] = useState<Drag | undefined>(undefined)
  // After a drag, the browser may still send a click to the node: ignore clicks until this time.
  const suppressUntil = useRef(0)
  const [picking, setPicking] = useState<string | undefined>(undefined)
  // A long press in progress, and whether the last one fired (so the click after it is ignored).
  const [pressing, setPressing] = useState<string | undefined>(undefined)
  const pressTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const pressFired = useRef(false)
  // The kind of pointer that last pressed a node: a contextmenu from a mouse intervenes, one from
  // a touch (Android sends it on a long press) does not, since the long-press timer already did.
  const lastPointer = useRef('')
  const cancelPress = (): void => {
    if (pressTimer.current !== undefined) clearTimeout(pressTimer.current)
    pressTimer.current = undefined
    setPressing(undefined)
  }
  useEffect(() => () => {
    if (pressTimer.current !== undefined) clearTimeout(pressTimer.current)
  }, [])
  // The control belongs to a node under do(): once that do() is gone (reset by a button, a preset,
  // the keyboard), the control closes.
  if (picking !== undefined && !(picking in interventions) && !(picking in stochastic)) setPicking(undefined)
  const popRef = useRef<HTMLDivElement>(null)
  const sliderRef = useRef<HTMLInputElement>(null)
  const focusNode = (id: string): void => svgRef.current?.querySelector<SVGGElement>(`[data-node="${id}"]`)?.focus()
  useEffect(() => {
    if (picking === undefined) return
    sliderRef.current?.focus()
    const outside = (e: Event): void => {
      const target = e.target
      if (!(target instanceof Element)) return
      // A press on a node is that node's own click (it closes this control, or opens another).
      if (popRef.current?.contains(target) === true || target.closest('[data-node]') !== null) return
      setPicking(undefined)
    }
    const escape = (e: globalThis.KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      setPicking(undefined)
      focusNode(picking)
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [picking])
  const layout = layoutSignalGraph(
    {
      c,
      shown,
      values,
      original,
      probs,
      dists,
      probNotes,
      observedValues,
      evidence,
      interventions,
      stochastic,
      removedEdges,
      witness,
      holdNotes,
      defaults,
      paths,
      clamped,
      compact: props.compact === true,
      drag,
    },
    t,
  )
  const { prob, r: R, col: COL, row: ROW, pos, blocks, arcs, hull, left, top, width: viewW, height } = layout
  const barred = (id: string): boolean => prob && getVariable(c.model, id).domain.kind === 'finite'

  const toSvg = (e: PointerEvent): Point => {
    const ctm = svgRef.current?.getScreenCTM?.()
    if (ctm === null || ctm === undefined) return { x: e.clientX, y: e.clientY }
    const inv = ctm.inverse()
    return { x: inv.a * e.clientX + inv.c * e.clientY + inv.e, y: inv.b * e.clientX + inv.d * e.clientY + inv.f }
  }
  const startDrag = (id: string, e: PointerEvent<SVGGElement>): void => {
    if (onMove === undefined || e.button !== 0) return
    const at = toSvg(e)
    setDrag({ id, pointer: e.pointerId, x0: at.x, y0: at.y, dx: 0, dy: 0, moved: false })
  }
  const moveDrag = (e: PointerEvent<SVGSVGElement>): void => {
    if (drag === undefined || e.pointerId !== drag.pointer) return
    const at = toSvg(e)
    const dx = at.x - drag.x0
    const dy = at.y - drag.y0
    const moved = drag.moved || Math.hypot(dx, dy) > 4
    // Capture only once it is a drag, so a plain press-release stays a click on the node.
    if (moved && !drag.moved) {
      svgRef.current?.setPointerCapture?.(e.pointerId)
      cancelPress()
    }
    setDrag({ ...drag, dx, dy, moved })
  }
  const endDrag = (e: PointerEvent<SVGSVGElement>): void => {
    if (drag === undefined || e.pointerId !== drag.pointer) return
    setDrag(undefined)
    if (!drag.moved) return
    suppressUntil.current = Date.now() + 400
    const dCol = snap(drag.dx / COL)
    const dRow = snap(drag.dy / ROW)
    if (dCol !== 0 || dRow !== 0) onMove?.(drag.id, dCol, dRow)
  }
  const nameOf = (id: string): string => shortLabel(c.model, id, t.locale)

  const edgeEls = layout.edges.map((edge) => {
    if (edge.kind === 'cut') {
      const { key, x1, y1, x2, y2, mx, my, ux, uy, label: cutLabel } = edge
      return (
        <g key={key} className="ca-edge ca-edge-cut" data-edge={key} data-state="cut">
          <line x1={x1} y1={y1} x2={mx - 10 * ux} y2={my - 10 * uy} className="ca-stroke-cut" />
          <line x1={mx + 10 * ux} y1={my + 10 * uy} x2={x2} y2={y2} className="ca-stroke-cut" />
          <path d={edge.slash} className="ca-stroke-slash" />
          <text x={cutLabel.x} y={cutLabel.y} className="ca-svg-small ca-svg-bold" textAnchor={cutLabel.anchor}>
            {t.cut}
          </text>
        </g>
      )
    }
    const { key, x1, y1, x2, y2, live, onPath, cls } = edge
    if (edge.kind === 'inhibit') {
      const { ux, uy, text, label: inhibitLabel } = edge
      return (
        <g key={key} className="ca-edge" data-edge={key} data-state={live ? 'live' : 'idle'} data-path={onPath}>
          <line x1={x1} y1={y1} x2={x2} y2={y2} className={cls} />
          <circle cx={x2 + 5 * ux} cy={y2 + 5 * uy} r={5} className={`ca-inhibit ${live ? 'is-live' : ''}`} />
          <text x={inhibitLabel.x} y={inhibitLabel.y} className={`ca-svg-small ca-svg-bold ca-mono ${live ? '' : 'ca-fill-muted'}`}>
            {sub(text)}
          </text>
        </g>
      )
    }
    return (
      <g key={key} className="ca-edge" data-edge={key} data-state={live ? 'live' : 'idle'} data-path={onPath}>
        <line
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          className={cls}
          markerEnd={`url(#${uid}-${onPath === 'open' ? 'open' : live ? 'live' : 'idle'})`}
        />
      </g>
    )
  })

  const arcEls = arcs.map(({ plan, label }) => {
    const key = `${plan.via}:${plan.a}-${plan.b}`
    const edgeKeys = [`${plan.via}>${plan.a}`, `${plan.via}>${plan.b}`]
    const onPath = edgeKeys.every((k) => paths?.open.has(k) === true)
      ? 'open'
      : edgeKeys.every((k) => paths?.open.has(k) === true || paths?.blocked.has(k) === true)
        ? 'blocked'
        : undefined
    const cls = `ca-stroke-arc${onPath === undefined ? '' : ` ca-path-${onPath}`}`
    const box = label.box
    return (
      <g key={key} className="ca-arc" data-arc={key} data-path={onPath}>
        <path d={`M${plan.start.x} ${plan.start.y}Q${plan.control.x} ${plan.control.y} ${plan.end.x} ${plan.end.y}`} className={cls} />
        <path d={arrowHead(plan.start, plan.start.x - plan.control.x, plan.start.y - plan.control.y)} className="ca-arc-head ca-fill-fg" />
        <path d={arrowHead(plan.end, plan.end.x - plan.control.x, plan.end.y - plan.control.y)} className="ca-arc-head ca-fill-fg" />
        <text x={label.x} y={label.y} textAnchor="middle" className="ca-svg-small ca-fill-muted" aria-hidden="true">
          {t.arc.label}
        </text>
        <foreignObject className="ca-arc-tip-box" x={box.x0} y={box.y0} width={box.x1 - box.x0} height={box.y1 - box.y0}>
          <Tip tip={t.arc.tip(plan.via, plan.a, plan.b)} className="ca-arc-tip">
            <span className="ca-arc-hit">{t.arc.label}</span>
          </Tip>
        </foreignObject>
      </g>
    )
  })

  const nodeEls = shown.map((id) => {
    const p = pos.get(id)
    const block = blocks.get(id)
    if (p === undefined || block === undefined) return null
    const variable = getVariable(c.model, id)
    const v = values?.[id]
    const forced = interventions[id]
    const soft = stochastic[id]
    const intervened = forced !== undefined || soft !== undefined
    const held = witness !== undefined && id in witness
    const boolean = variable.domain.kind === 'boolean'
    const filled = !prob && v === true
    const text = v === undefined ? '' : formatValue(v)
    const before = original?.[id]
    const changed = !prob && before !== undefined && v !== undefined && !valuesEqual(before, v)
    const name = nameOf(id)
    const who = idWithName(id, name)
    const pv = probs?.[id]
    // A non-boolean node shows one bar per value, so each value gets its own number.
    const bars = barred(id) && variable.domain.kind === 'finite' ? variable.domain.values : undefined
    const dist = dists?.[id]
    const barText = (i: number): string => `P(${id}=${formatValue((bars ?? [])[i])})=${probText(dist?.[i] ?? Number.NaN)}`
    const state = prob
      ? bars !== undefined
        ? bars.map((_, i) => barText(i)).join(', ')
        : `P(${id}=1) ${probText(pv ?? Number.NaN)}`
      : t.nodeValue(text)
    const forcedText = forced !== undefined ? formatValue(forced) : soft !== undefined ? `P(${id}=1)=${probText(soft)}` : undefined
    const seen = observedValues[id]
    const aria = t.nodeAria(who, state, forcedText, changed ? formatValue(before) : undefined, seen === undefined ? undefined : formatValue(seen))
    // A multi-valued node does not flip: intervening on it sets a value and opens a control to pick
    // another. In probability mode a boolean one is set to 1 and opens a control for P*(X=1).
    // An exogenous node is the context: it can be observed, never set by do().
    const settable = variable.kind === 'endogenous'
    const picksValue = settable && onToggle !== undefined && onSetValue !== undefined && !boolean
    const picksProb = settable && prob && boolean && onSetProbability !== undefined
    const picks = picksValue || picksProb
    const toggles = settable && onToggle !== undefined
    const observes = onObserve !== undefined
    const interactive = toggles || onMove !== undefined || picks || observes || onPick !== undefined
    /** Intervene: set the node at once (to its observed or current value) and open its control. */
    const intervene = (): void => {
      if (picksProb) {
        if (!intervened) onSetProbability?.(id, seen === undefined || seen === true || seen === 1 ? 1 : 0)
        setPicking(intervened && picking === id ? undefined : id)
      } else if (picksValue && variable.domain.kind === 'finite') {
        if (!intervened) onSetValue?.(id, seen ?? v ?? variable.domain.values[0])
        setPicking(intervened && picking === id ? undefined : id)
      } else if (toggles) onToggle?.(id)
    }
    const activate = (shift: boolean): void => {
      if (onPick !== undefined) {
        onPick(id)
        return
      }
      if (observes && !shift) {
        setPicking(undefined)
        onObserve(id)
      } else intervene()
    }
    const arrows: Record<string, [number, number]> = { ArrowLeft: [-0.5, 0], ArrowRight: [0.5, 0], ArrowUp: [0, -0.5], ArrowDown: [0, 0.5] }
    const onKey = (event: KeyboardEvent<SVGGElement>): void => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        activate(event.shiftKey)
        return
      }
      const step = arrows[event.key]
      if (onMove !== undefined && step !== undefined) {
        event.preventDefault()
        onMove(id, step[0], step[1])
      }
    }
    const onClick = (event: MouseEvent<SVGGElement>): void => {
      if (pressFired.current) {
        pressFired.current = false
        return
      }
      if (Date.now() < suppressUntil.current) return
      activate(event.shiftKey)
    }
    const onPointerDown = (e: PointerEvent<SVGGElement>): void => {
      lastPointer.current = e.pointerType
      startDrag(id, e)
      if (!observes || !settable || e.button !== 0 || e.shiftKey) return
      pressFired.current = false
      cancelPress()
      setPressing(id)
      pressTimer.current = setTimeout(() => {
        pressTimer.current = undefined
        pressFired.current = true
        setPressing(undefined)
        intervene()
      }, LONG_PRESS)
    }
    /** A right-click intervenes, as a long press does; only from a mouse (see `lastPointer`). */
    const onContextMenu = (e: MouseEvent<SVGGElement>): void => {
      e.preventDefault()
      const own = (e.nativeEvent as { pointerType?: string }).pointerType
      const kind = own === undefined ? lastPointer.current : own
      if (kind !== 'mouse' || !settable) return
      cancelPress()
      intervene()
    }
    const toggle: NodeToggle | undefined = onPick !== undefined
      ? 'pick'
      : observes
      ? settable
        ? 'observe'
        : 'observeOnly'
      : picksProb
      ? intervened
        ? 'adjustProb'
        : 'chooseProb'
      : !toggles
        ? undefined
        : picksValue
          ? intervened
            ? 'adjust'
            : 'choose'
          : intervened
            ? 'release'
            : 'set'
    const hint = t.nodeHint(toggle, onMove !== undefined)
    // An exogenous node is a dashed ring with its value or fill a little inside it.
    const exo = variable.kind === 'exogenous'
    const inner = exo ? R - EXO_INSET : R
    const level = prob && pv !== undefined && !Number.isNaN(pv) ? 2 * inner * pv : 0
    const tag = layout.tags.get(id)
    const hold = layout.holdNotes.get(id)
    const deviant = layout.deviantNotes.get(id)
    return (
      <g
        key={id}
        className={`ca-node${interactive ? ' is-interactive' : ''}${onMove !== undefined ? ' is-movable' : ''}`}
        data-node={id}
        data-value={text}
        data-intervened={intervened ? 'true' : 'false'}
        data-observed={seen === undefined ? undefined : formatValue(seen)}
        data-pressing={pressing === id ? 'true' : undefined}
        data-do-p={soft === undefined ? undefined : soft.toFixed(2)}
        data-block={block.side}
        transform={`translate(${p.x} ${p.y})`}
        {...(interactive
          ? {
              role: 'button',
              tabIndex: 0,
              'aria-pressed': toggles && !picks ? intervened : undefined,
              'aria-haspopup': picks ? 'dialog' : undefined,
              'aria-expanded': picks ? picking === id : undefined,
              'aria-label': t.withHint(aria, hint),
              onClick,
              onKeyDown: onKey,
              onPointerDown,
              onPointerUp: cancelPress,
              onPointerLeave: cancelPress,
              onPointerCancel: cancelPress,
              onContextMenu: observes ? onContextMenu : undefined,
            }
          : { role: 'img', 'aria-label': aria })}
      >
        <circle r={R + 12} className="ca-focus-ring" />
        {pressing === id && <circle r={R + 8} className="ca-press-ring" pathLength={100} />}
        {observed.includes(id) && <circle r={R + 5} className="ca-ring" />}
        {paths?.ends.includes(id) === true && <circle r={R + 9} className="ca-dsep-ring" data-dsep-end={id} />}
        {prob ? (
          <>
            <clipPath id={`${uid}-cp-${id}`}>
              <circle r={inner} />
            </clipPath>
            <circle r={R} className="ca-fill-bg" />
            {bars === undefined && (
              <rect
                x={-inner}
                y={inner - level}
                width={2 * inner}
                height={level}
                className="ca-fill-fg"
                clipPath={`url(#${uid}-cp-${id})`}
                data-level={pv === undefined ? '' : pv.toFixed(4)}
              />
            )}
            <circle r={R} className={`ca-node-outline${exo ? ' ca-exo' : ''}`} strokeDasharray={exo ? exoDash(R) : undefined} />
          </>
        ) : (
          <>
            {exo ? (
              <>
                <circle r={R} className="ca-node-off ca-exo" strokeDasharray={exoDash(R)} />
                {filled && <circle r={inner} className="ca-fill-fg ca-exo-core" />}
              </>
            ) : (
              <circle r={R} className={filled ? 'ca-node-on' : 'ca-node-off'} />
            )}
            <text
              y={boolean ? 7.5 : 5}
              textAnchor="middle"
              className={`ca-mono ca-svg-bold ${filled ? 'ca-fill-bg-text' : ''}`}
              fontSize={boolean || text.length <= 2 ? 21 : 13}
            >
              {text}
            </text>
          </>
        )}
        {((intervened && !held) || (!intervened && clamped.includes(id))) && (
          <>
            <path d={clampPath(R)} className="ca-stroke-clamp" />
            {intervened && tag !== undefined && (
              <g transform={`translate(${tag.box.x0} ${tag.box.y0})`}>
                <rect width={tag.box.x1 - tag.box.x0} height={22} className="ca-fill-accent" />
                <text
                  x={(tag.box.x1 - tag.box.x0) / 2}
                  y={15.5}
                  textAnchor="middle"
                  className="ca-mono ca-svg-small ca-svg-bold ca-fill-on-accent"
                >
                  {sub(tag.text)}
                </text>
              </g>
            )}
          </>
        )}
        {!intervened && tag !== undefined && tag.seen && (
          <g transform={`translate(${tag.box.x0} ${tag.box.y0})`} className="ca-seen-tag">
            <rect width={tag.box.x1 - tag.box.x0} height={22} className="ca-seen-tag-box" />
            <text x={(tag.box.x1 - tag.box.x0) / 2} y={15.5} textAnchor="middle" className="ca-mono ca-svg-small ca-svg-bold">
              {sub(tag.text)}
            </text>
          </g>
        )}
        {hold !== undefined ? (
          <text y={block.noteY} textAnchor="middle" className="ca-svg-small ca-svg-bold ca-fill-amber" data-held={id}>
            {hold}
          </text>
        ) : (
          changed && (
            <text x={R + 14} y={R + 14} className="ca-svg-small ca-fill-muted">
              {t.was(formatValue(before))}
            </text>
          )
        )}
        {deviant !== undefined && (
          <g className="ca-deviant" data-deviant={id}>
            <rect
              x={-(textWidth(deviant ?? '', 11) + 8) / 2}
              y={block.note2Y - 11}
              width={textWidth(deviant ?? '', 11) + 8}
              height={15}
              className="ca-deviant-box"
            />
            <text y={block.note2Y} textAnchor="middle" className="ca-svg-tiny ca-svg-bold">
              {deviant}
            </text>
          </g>
        )}
        <text y={block.labelY} textAnchor="middle" className="ca-svg-label">
          <tspan className="ca-mono ca-svg-bold">{sub(id)}</tspan>
          {name === '' ? null : ` ${name}`}
        </text>
        {bars !== undefined
          ? barChart(id, bars.map(formatValue), dist, block, barText)
          : prob && (
              <text y={block.numberY} textAnchor="middle" className="ca-mono ca-svg-num" data-readout={id}>
                {probText(pv ?? Number.NaN)}
              </text>
            )}
        {prob && probNotes?.[id] !== undefined && hold === undefined && (
          <text y={block.noteY} textAnchor="middle" className="ca-svg-small ca-fill-muted" data-note={id}>
            {probNotes[id]}
          </text>
        )}
      </g>
    )
  })

  /** One bar per value, scaled so the most likely value fills the chart's height; that probability is written beside it. */
  function barChart(
    id: string,
    labels: readonly string[],
    dist: readonly number[] | undefined,
    block: Block,
    barText: (i: number) => string,
  ): ReactNode {
    const layout = barLayout(labels, BAR_LABEL)
    const known = (dist ?? []).filter((x) => !Number.isNaN(x))
    const max = known.length === 0 ? Number.NaN : Math.max(...known)
    return (
      <g className="ca-bars" data-bars={id} transform={`translate(${block.x0} ${block.baseline})`}>
        <line x1={0} x2={layout.width} y1={0} y2={0} className="ca-hair" />
        {!Number.isNaN(max) && (
          <text x={-5} y={-BAR_H + 8} textAnchor="end" className="ca-mono ca-svg-tiny ca-fill-muted" data-max={max.toFixed(4)}>
            {t.barMax(probText(max))}
          </text>
        )}
        {labels.map((text, i) => {
          const p = dist?.[i]
          const ok = p !== undefined && !Number.isNaN(p)
          const h = ok && max > 0 && p > 0 ? Math.max(1, (p / max) * BAR_H) : 0
          const cx = i * layout.pitch + layout.pitch / 2
          const edge = i === 0 || i === labels.length - 1
          return (
            <g key={text} data-bar={text} data-p={ok ? p.toFixed(4) : ''}>
              <title>{barText(i)}</title>
              <rect x={cx - layout.barW / 2} y={-h} width={layout.barW} height={h} className="ca-fill-fg" />
              {(layout.labelsFit || edge) && (
                <text x={cx} y={BAR_LABEL + 2} textAnchor="middle" className="ca-mono ca-svg-tiny ca-fill-muted">
                  {text}
                </text>
              )}
            </g>
          )
        })}
      </g>
    )
  }

  const pickPop = (): ReactNode => {
    if (picking === undefined) return null
    const p = pos.get(picking)
    const variable = getVariable(c.model, picking)
    if (p === undefined) return null
    const id = picking
    const who = idWithName(id, nameOf(id))
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
      setPicking(undefined)
      focusNode(id)
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

  return (
    <svg
      ref={svgRef}
      onPointerMove={onMove === undefined ? undefined : moveDrag}
      onPointerUp={onMove === undefined ? undefined : endDrag}
      onPointerCancel={onMove === undefined ? undefined : () => setDrag(undefined)}
      className="ca-graph"
      viewBox={`${left} ${top} ${viewW} ${height}`}
      width={viewW}
      height={height}
      role="group"
      aria-label={props.title}
      data-mode={prob ? 'probability' : 'value'}
    >
      <defs>
        <marker id={`${uid}-live`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto">
          <path d="M0 0.5L10 5L0 9.5z" className="ca-fill-fg" />
        </marker>
        <marker id={`${uid}-open`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto">
          <path d="M0 0.5L10 5L0 9.5z" className="ca-fill-accent" />
        </marker>
        <marker id={`${uid}-idle`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">
          <path d="M0 0.5L10 5L0 9.5z" className="ca-fill-idle" />
        </marker>
      </defs>
      {hull !== undefined && (
        <g className="ca-witness" data-witness={Object.keys(witness ?? {}).join(',')}>
          <rect x={hull.x} y={hull.y} width={hull.w} height={hull.h} className="ca-hull" />
          {!holdNotes && (
            <g transform={`translate(${hull.x} ${hull.y + hull.h + 6})`}>
              <rect width={textWidth(hull.text, 12) + 18} height={22} className="ca-amber-tag" />
              <text x={8} y={15.5} className="ca-svg-small ca-svg-bold ca-fill-amber">
                {sub(hull.text)}
              </text>
            </g>
          )}
        </g>
      )}
      {edgeEls}
      {arcEls}
      {nodeEls}
      {pickPop()}
    </svg>
  )
}
