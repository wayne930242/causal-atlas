import type { FocusEvent, PointerEvent } from 'react'
import { useId, useRef } from 'react'
import type { LoadedCase } from '../../data/load.ts'
import type { Assignment, Edge, Hedge } from '../../engine/index.ts'
import { getVariable } from '../../engine/index.ts'
import { formatValue, valuesEqual } from '../../engine/values.ts'
import type { NodeToggle } from '../i18n/messages.ts'
import { useMessages } from '../i18n/messages.ts'
import type { Stochastic } from '../model/assignments.ts'
import type { PathMarks } from '../model/dsep-view.ts'
import { edgeTipText } from '../model/dsep-view.ts'
import { idWithName, probText, shortLabel } from '../model/wording.ts'
import { useDigits } from '../shared/digits.ts'
import { focusVisible } from '../shared/focus-visible.ts'
import { Tip } from '../shared/parts.tsx'
import { sub } from '../text/svg-text.tsx'
import { textWidth } from '../text/text-measure.ts'
import { Rich } from '../text/typeset.tsx'
import { BarChart } from './BarChart.tsx'
import { SWITCH_HALF, layoutSignalGraph } from './signal-geometry.ts'
import { EXO_INSET, arrowHead, clampPath, exoDash, nodeReadout } from './signal-shapes.ts'
import type { Block } from './signal-shapes.ts'
import { useNodeGestures } from './use-node-gestures.ts'

export interface SignalGraphProps {
  readonly c: LoadedCase
  readonly shown: readonly string[]
  /** Structural graph: show variable ids rather than readings and name arcs without a specific latent. */
  readonly structural?: boolean
  /** Identification failure: rings for F and F′, with the edges in F highlighted. */
  readonly hedge?: Hedge
  /** Deterministic world to draw (after any do). Omit in probability mode. */
  readonly values?: Assignment
  /** The world before do(), to note changed values. */
  readonly original?: Assignment
  /** Probability mode: P(V = 1) per variable. */
  readonly probs?: Readonly<Record<string, number>>
  /** Value mode: P(V = 1) under these nodes only (the do-calculus view's prediction); NaN when it is undefined. */
  readonly probe?: Readonly<Record<string, number>>
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
  /** The text of a do() tag in place of `X←1`, per intervened variable: a mediator held at its natural value reads `Z←Z(X=0)`. */
  readonly tagText?: Readonly<Record<string, string>>
  /** Stochastic interventions: P*(X=1) of a boolean node, 0 < p < 1 (drawn like a do(), with that probability). */
  readonly stochastic?: Stochastic
  readonly removedEdges: readonly Edge[]
  /** Variables a witness holds fixed: an amber hull. */
  readonly witness?: Assignment
  /**
   * Each held variable says 固定為 w（實際 v） beside it when held away from its actual value, else
   * 固定（實際值）, instead of the hull's 見證 tag (the playground: what is held need not be a witness).
   */
  readonly holdNotes?: boolean
  /** Default values (the model's normality): a node off its default says 偏離（預設 v） under its label. Graphs with values only. */
  readonly defaults?: Assignment
  /** d-separation: edges on an open path between the pair lit, edges only on blocked ones dashed, the two ends ringed. */
  readonly paths?: PathMarks
  /** Nodes drawn with the do() clamp but no value tag: the arrows into them are cut in a graph without numbers (do-calculus). */
  readonly clamped?: readonly string[]
  /** Nodes drawn with a dashed clamp: the arrows into them are cut for a test only, not by a do() of the expression (do-calculus rule 3). */
  readonly testClamped?: readonly string[]
  /**
   * Intervention switch nodes (`F_Z`, Pearl's regime indicator): each a small square labelled by its
   * id, beside the variable its one arrow points into. They must be in `c` and `shown`.
   */
  readonly switches?: readonly string[]
  /** Words read after a node's state in its label, e.g. its roles in a do-calculus step; not drawn. */
  readonly nodeNotes?: Readonly<Record<string, string>>
  /** A click (or Enter) on a variable picks it without opening a menu. */
  readonly onPick?: (id: string) => void
  /** With `onPick`, only these variables can be picked; the others are drawn as plain images. Default every variable. */
  readonly pickable?: readonly string[]
  /** With `onPick`, the hint a pickable node's label ends with, in place of the known-set one. */
  readonly pickHint?: string
  /** New variables (only in a conservative extension): a green ring around each. */
  readonly fresh?: readonly string[]
  /** A click (or Enter, Space) on a node or switch opens its menu, drawn by the caller. */
  readonly onOpen?: (id: string) => void
  /** The menu observes: an exogenous node, which do() cannot set, opens one only then. */
  readonly observable?: boolean
  /** The node whose menu is open (its `aria-expanded`). */
  readonly open?: string
  /** Nodes drawn with a soft halo: the ones a hovered slider feeds. */
  readonly lit?: readonly string[]
  /** The pointer (a mouse or pen) is over a node, or the keyboard focus is on it; undefined when it leaves. */
  readonly onHover?: (id: string | undefined) => void
  /** The marked edge (on a d-separation path, or cut by do()) whose explanation is shown, by key. */
  readonly edgeTip?: string
  /** A marked edge is hovered, focused or tapped: its explanation, or undefined to hide it. */
  readonly onEdgeTip?: (tip: EdgeTip | undefined) => void
  readonly title: string
  /** Narrower columns, for two graphs side by side. */
  readonly compact?: boolean
  /** Lets nodes be dragged (or moved with arrow keys); reports the move in grid columns and rows. */
  readonly onMove?: (id: string, dCol: number, dRow: number) => void
}

/** The explanation of a marked edge, shown by the caller beside `[data-edge="key"]`. */
export interface EdgeTip {
  readonly key: string
  readonly text: string
}

/** Direction 1 「訊號圖」: value nodes, signal edges, do() clamps and cut edges. */
export function SignalGraph(props: SignalGraphProps) {
  const {
    c,
    shown,
    structural = false,
    hedge,
    values,
    original,
    probs,
    probe = {},
    dists,
    probNotes,
    observed = [],
    interventions,
    tagText,
    stochastic = {},
    removedEdges,
    witness,
    onMove,
    observedValues = {},
    evidence = false,
    holdNotes = false,
    defaults,
    paths,
    clamped = [],
    testClamped = [],
    switches = [],
    nodeNotes = {},
    onPick,
    pickable,
    pickHint,
    fresh = [],
    onOpen,
    observable = false,
    open,
    lit = [],
    onHover,
    edgeTip,
    onEdgeTip,
  } = props
  const t = useMessages()
  const digits = useDigits()
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const svgRef = useRef<SVGSVGElement>(null)
  const { drag, moveDrag, endDrag, cancelDrag, nodeHandlers } = useNodeGestures(svgRef, onMove)
  /** Hover from a mouse or pen only: a tap is a click. */
  const hoverHandlers = (id: string) =>
    onHover === undefined
      ? {}
      : {
          onPointerEnter: (e: PointerEvent<SVGGElement>) => e.pointerType !== 'touch' && onHover(id),
          onPointerLeave: (e: PointerEvent<SVGGElement>) => e.pointerType !== 'touch' && onHover(undefined),
          onFocus: (e: FocusEvent<SVGGElement>) => focusVisible(e.currentTarget) && onHover(id),
          onBlur: () => onHover(undefined),
        }
  const layout = layoutSignalGraph(
    {
      c,
      shown,
      structural,
      values,
      original,
      probs,
      probe,
      dists,
      probNotes,
      observedValues,
      evidence,
      interventions,
      tagText,
      stochastic,
      removedEdges,
      witness,
      hedge,
      holdNotes,
      defaults,
      paths,
      clamped: [...clamped, ...testClamped],
      switches,
      compact: props.compact === true,
      drag,
      digits,
    },
    t,
  )
  const { prob, r: R, col: COL, row: ROW, pos, blocks, arcs, hull, left, top, width: viewW, height } = layout
  const barred = (id: string): boolean => prob && getVariable(c.model, id).domain.kind === 'finite'

  const nameOf = (id: string): string => shortLabel(c.model, id, t.locale)

  /** The pointer that pressed an edge last: a tap toggles its explanation, a mouse click only shows it. */
  const edgePointer = useRef<string>('mouse')
  /** A marked edge explains itself: on hover (mouse, pen) and keyboard focus, and on a tap, which toggles it. */
  const tipProps = (key: string, text: string | undefined) =>
    text === undefined || onEdgeTip === undefined
      ? {}
      : {
          tabIndex: 0,
          role: 'img',
          'aria-label': text,
          'data-tip': edgeTip === key ? 'open' : undefined,
          onPointerEnter: (e: PointerEvent<SVGGElement>) => e.pointerType !== 'touch' && onEdgeTip({ key, text }),
          onPointerLeave: (e: PointerEvent<SVGGElement>) => e.pointerType !== 'touch' && onEdgeTip(undefined),
          onPointerDown: (e: PointerEvent<SVGGElement>) => {
            edgePointer.current = e.pointerType
          },
          // A press focuses the edge too; only keyboard focus shows the tip, so a tap's click can toggle it.
          onFocus: (e: FocusEvent<SVGGElement>) => focusVisible(e.currentTarget) && onEdgeTip({ key, text }),
          onBlur: () => onEdgeTip(undefined),
          onClick: () => onEdgeTip(edgePointer.current === 'touch' && edgeTip === key ? undefined : { key, text }),
        }
  const pathTip = (key: string, onPath: 'open' | 'blocked' | undefined): string | undefined =>
    onPath === undefined || paths === undefined ? undefined : edgeTipText(t, paths, key, onPath)
  /** An invisible wide stroke over a marked edge, so a finger or pointer finds it. */
  const hit = (key: string, x1: number, y1: number, x2: number, y2: number, text: string | undefined) =>
    text === undefined || onEdgeTip === undefined ? null : <line key={`${key}-hit`} x1={x1} y1={y1} x2={x2} y2={y2} className="ca-edge-hit" />

  const inF = (id: string): boolean => hedge?.f.includes(id) === true
  /** A block's texts sit on its middle line; one under or over its node writes no x. */
  const blockX = (block: Block): number | undefined => (block.cx === 0 ? undefined : block.cx)
  const edgeEls = layout.edges.map((edge) => {
    if (edge.kind === 'cut') {
      const { key, x1, y1, x2, y2, mx, my, ux, uy, label: cutLabel } = edge
      const [cutFrom = '', cutTo = ''] = edge.key.split('>')
      const tip = t.edgeTip.cut(cutFrom, cutTo)
      return (
        <g key={key} className="ca-edge ca-edge-cut" data-edge={key} data-state="cut" {...tipProps(key, tip)}>
          {hit(key, x1, y1, x2, y2, tip)}
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
      const tip = pathTip(key, onPath)
      return (
        <g key={key} className="ca-edge" data-edge={key} data-state={live ? 'live' : 'idle'} data-path={onPath} {...tipProps(key, tip)}>
          {hit(key, x1, y1, x2, y2, tip)}
          <line x1={x1} y1={y1} x2={x2} y2={y2} className={cls} />
          <circle cx={x2 + 5 * ux} cy={y2 + 5 * uy} r={5} className={`ca-inhibit ${live ? 'is-live' : ''}`} />
          <rect
            x={inhibitLabel.box.x0}
            y={inhibitLabel.box.y0}
            width={inhibitLabel.box.x1 - inhibitLabel.box.x0}
            height={inhibitLabel.box.y1 - inhibitLabel.box.y0}
            rx={(inhibitLabel.box.y1 - inhibitLabel.box.y0) / 2}
            className={`ca-inhibit-chip ${live ? 'is-live' : ''}`}
          />
          <text x={inhibitLabel.x} y={inhibitLabel.y} textAnchor="middle" className={`ca-svg-small ca-svg-bold ca-mono ${live ? '' : 'ca-fill-muted'}`}>
            {sub(text)}
          </text>
        </g>
      )
    }
    const tip = pathTip(key, onPath)
    const marked = key.split('>').every(inF)
    return (
      <g key={key} className="ca-edge" data-edge={key} data-state={live ? 'live' : 'idle'} data-path={onPath} data-hedge-edge={marked ? '' : undefined} {...tipProps(key, tip)}>
        {hit(key, x1, y1, x2, y2, tip)}
        <line
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          className={cls}
          markerEnd={`url(#${uid}-${marked ? 'hedge' : onPath === 'open' ? 'open' : live ? 'live' : 'idle'})`}
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
      <g key={key} className="ca-arc" data-arc={key} data-path={onPath} data-hedge-edge={inF(plan.a) && inF(plan.b) ? '' : undefined}>
        <path d={`M${plan.start.x} ${plan.start.y}Q${plan.control.x} ${plan.control.y} ${plan.end.x} ${plan.end.y}`} className={cls} />
        <path d={arrowHead(plan.start, plan.start.x - plan.control.x, plan.start.y - plan.control.y)} className="ca-arc-head ca-fill-fg" />
        <path d={arrowHead(plan.end, plan.end.x - plan.control.x, plan.end.y - plan.control.y)} className="ca-arc-head ca-fill-fg" />
        <text x={label.x} y={label.y} textAnchor="middle" className="ca-svg-small ca-fill-muted" aria-hidden="true">
          {t.arc.label}
        </text>
        <foreignObject className="ca-arc-tip-box" x={box.x0} y={box.y0} width={box.x1 - box.x0} height={box.y1 - box.y0}>
          <Tip tip={structural ? t.identify.arc : <Rich text={t.arc.tip(plan.via, plan.a, plan.b)} ids={c.model.byId} />} className="ca-arc-tip">
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
    if (switches.includes(id)) {
      const aria = t.withHint(idWithName(id, nameOf(id)), nodeNotes[id] ?? '')
      const S = SWITCH_HALF
      return (
        <g
          key={id}
          className={`ca-node ca-switch${onOpen !== undefined ? ' is-interactive' : ''}`}
          data-node={id}
          data-switch="true"
          data-block={block.side}
          transform={`translate(${p.x} ${p.y})`}
          {...(onOpen !== undefined
            ? { role: 'button', tabIndex: 0, 'aria-haspopup': 'dialog', 'aria-expanded': open === id, 'aria-label': t.withHint(aria, t.nodeHint('switch', false)), ...nodeHandlers(id, () => onOpen(id)) }
            : { role: 'img', 'aria-label': aria })}
          {...hoverHandlers(id)}
        >
          <circle r={S + 12} className="ca-focus-ring" />
          {open === id && <circle r={S + 12} className="ca-open-ring" />}
          {observed.includes(id) && <rect x={-S - 4} y={-S - 4} width={2 * S + 8} height={2 * S + 8} className="ca-ring" />}
          {paths?.ends.includes(id) === true && <circle r={S + 8 + (observed.includes(id) ? 4 : 0)} className="ca-dsep-ring" data-dsep-end={id} />}
          <rect x={-S} y={-S} width={2 * S} height={2 * S} className="ca-switch-box" />
          <text x={blockX(block)} y={block.labelY} textAnchor="middle" className="ca-svg-label">
            <tspan className="ca-mono ca-svg-bold">{sub(id)}</tspan>
          </text>
        </g>
      )
    }
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
    const barText = (i: number): string => `P(${id}=${formatValue((bars ?? [])[i])})=${probText(dist?.[i] ?? Number.NaN, digits)}`
    const state = prob
      ? bars !== undefined
        ? bars.map((_, i) => barText(i)).join(', ')
        : `P(${id}=1) ${probText(pv ?? Number.NaN, digits)}`
      : id in probe
        ? `P(${id}=1) ${probText(probe[id], digits)}`
        : t.nodeValue(text)
    const readout = id in probe && !prob ? nodeReadout(t, digits, probe[id], undefined, undefined) : nodeReadout(t, digits, pv, forced, evidence ? undefined : observedValues[id])
    const forcedText = forced !== undefined ? (tagText?.[id] ?? formatValue(forced)) : soft !== undefined ? `P(${id}=1)=${probText(soft, digits)}` : undefined
    const seen = observedValues[id]
    const aria = t.withHint(
      t.nodeAria(who, state, forcedText, changed ? formatValue(before) : undefined, seen === undefined ? undefined : formatValue(seen)),
      nodeNotes[id] ?? '',
    )
    // An exogenous node is the context: it can be observed, never set by do().
    const opens = onPick === undefined && onOpen !== undefined && (variable.kind === 'endogenous' || observable)
    const picks = onPick !== undefined && (pickable === undefined || pickable.includes(id))
    const interactive = opens || onMove !== undefined || picks
    const activate = (): void => {
      if (onPick !== undefined) {
        if (picks) onPick(id)
      } else onOpen?.(id)
    }
    const toggle: NodeToggle | undefined = picks ? 'pick' : !opens ? undefined : observable ? (variable.kind === 'exogenous' ? 'observe' : 'observeOrDo') : 'do'
    const hint = picks && pickHint !== undefined ? t.withHint(pickHint, onMove !== undefined ? t.nodeHint(undefined, true) : '') : t.nodeHint(toggle, onMove !== undefined)
    // An exogenous node is a dashed ring with its value or fill a little inside it.
    const exo = variable.kind === 'exogenous'
    const inner = exo ? R - EXO_INSET : R
    const level = prob && pv !== undefined && !Number.isNaN(pv) ? 2 * inner * pv : 0
    const tag = layout.tags.get(id)
    const hold = layout.holdNotes.get(id)
    // A long name the layout wrapped: its first part beside the id, the rest on a second line.
    const lines = layout.labelLines.get(id)
    const deviant = layout.deviantNotes.get(id)
    const was = layout.wasNotes.get(id)
    return (
      <g
        key={id}
        className={`ca-node${interactive ? ' is-interactive' : ''}${onMove !== undefined ? ' is-movable' : ''}`}
        data-node={id}
        data-value={text}
        data-intervened={intervened ? 'true' : 'false'}
        data-observed={seen === undefined ? undefined : formatValue(seen)}
        data-do-p={soft === undefined ? undefined : soft.toFixed(2)}
        data-block={block.side}
        transform={`translate(${p.x} ${p.y})`}
        {...(interactive
          ? {
              role: 'button',
              tabIndex: 0,
              'aria-haspopup': opens ? 'dialog' : undefined,
              'aria-expanded': opens ? open === id : undefined,
              'aria-label': t.withHint(aria, hint),
              ...nodeHandlers(id, activate),
            }
          : { role: 'img', 'aria-label': aria })}
        {...hoverHandlers(id)}
      >
        {inF(id) && <circle r={R + 9} className="ca-hedge-ring" data-hedge="f" data-member={id} />}
        {hedge?.fPrime.includes(id) === true && <circle r={R + 16} className="ca-hedge-inner" data-hedge="f-prime" data-member={id} />}
        {lit.includes(id) && <circle r={R + 14} className="ca-lit-ring" data-lit={id} />}
        {fresh.includes(id) && <circle r={R + 7} className="ca-new-ring" data-new={id} />}
        <circle r={R + 12} className="ca-focus-ring" />
        {open === id && <circle r={R + 12} className="ca-open-ring" />}
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
              fontSize={structural ? 14 : boolean || text.length <= 2 ? 21 : 13}
            >
              {structural ? sub(id) : text}
            </text>
          </>
        )}
        {!intervened && testClamped.includes(id) && <path d={clampPath(R)} className="ca-stroke-clamp ca-clamp-test" data-clamp="test" />}
        {((intervened && !held) || (!intervened && clamped.includes(id))) && (
          <>
            <path d={clampPath(R)} className={tag?.reset ? 'ca-stroke-reset' : 'ca-stroke-clamp'} />
            {intervened && tag !== undefined && (
              <g transform={`translate(${tag.box.x0} ${tag.box.y0})`}>
                <rect width={tag.box.x1 - tag.box.x0} height={22} className={tag.reset ? 'ca-fill-reset' : 'ca-fill-accent'} />
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
          <text x={blockX(block)} y={block.noteY} textAnchor="middle" className="ca-svg-small ca-svg-bold ca-fill-amber" data-held={id}>
            {hold}
          </text>
        ) : (
          was !== undefined && (
            <text x={was.x} y={was.y} textAnchor={was.anchor} className="ca-svg-small ca-fill-muted">
              {was.text}
            </text>
          )
        )}
        {deviant !== undefined && (
          <g className="ca-deviant" data-deviant={id}>
            <rect
              x={block.cx - (textWidth(deviant ?? '', 11) + 8) / 2}
              y={block.note2Y - 11}
              width={textWidth(deviant ?? '', 11) + 8}
              height={15}
              className="ca-deviant-box"
            />
            <text x={blockX(block)} y={block.note2Y} textAnchor="middle" className="ca-svg-tiny ca-svg-bold">
              {deviant}
            </text>
          </g>
        )}
        <text x={blockX(block)} y={block.labelY} textAnchor="middle" className="ca-svg-label">
          {!structural && <tspan className="ca-mono ca-svg-bold">{sub(id)}</tspan>}
          {lines !== undefined ? (
            <>
              {structural ? lines[0] : ` ${lines[0]}`}
              <tspan x={block.cx} y={block.label2Y}>
                {lines[1]}
              </tspan>
            </>
          ) : name === '' ? null : structural ? name : ` ${name}`}
        </text>
        {bars !== undefined
          ? <BarChart id={id} labels={bars.map(formatValue)} dist={dist} block={block} barText={barText} />
          : (prob || id in probe) && (
              <text x={blockX(block)} y={block.numberY} textAnchor="middle" className="ca-mono ca-svg-num">
                {readout.prefix !== '' && <tspan className="ca-svg-small ca-fill-muted">{readout.prefix}</tspan>}
                <tspan data-readout={id} fontSize={readout.settled ? 14 : undefined}>
                  {readout.text}
                </tspan>
              </text>
            )}
        {prob && (!readout.settled || evidence) && probNotes?.[id] !== undefined && hold === undefined && (
          <text x={blockX(block)} y={block.noteY} textAnchor="middle" className="ca-svg-small ca-fill-muted" data-note={id}>
            {probNotes[id]}
          </text>
        )}
      </g>
    )
  })

  return (
    <svg
      ref={svgRef}
      onPointerMove={onMove === undefined ? undefined : moveDrag}
      onPointerUp={onMove === undefined ? undefined : (e) => endDrag(e, COL, ROW)}
      onPointerCancel={onMove === undefined ? undefined : cancelDrag}
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
        {hedge !== undefined && <marker id={`${uid}-hedge`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto">
          <path d="M0 0.5L10 5L0 9.5z" className="ca-hedge-arrow" />
        </marker>}
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
    </svg>
  )
}
