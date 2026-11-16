import type { KeyboardEvent, PointerEvent } from 'react'
import { useId, useRef, useState } from 'react'
import type { LoadedCase } from '../data/load.ts'
import type { Assignment, Edge } from '../engine/index.ts'
import { getVariable } from '../engine/index.ts'
import { formatValue, valuesEqual } from '../engine/values.ts'
import { assignmentText, edgeLive, edgePolarity, gridLayout, label, probText, shownEdges, textWidth } from './view-model.ts'

export interface SignalGraphProps {
  readonly c: LoadedCase
  readonly shown: readonly string[]
  /** Deterministic world to draw (after any do). Omit in probability mode. */
  readonly values?: Assignment
  /** The world before do(), to note changed values. */
  readonly original?: Assignment
  /** Probability mode: P(V = 1) per variable. */
  readonly probs?: Readonly<Record<string, number>>
  /** Probability mode: a short note under each number. */
  readonly probNotes?: Readonly<Record<string, string>>
  /** Observed variables (drawn with a second ring). */
  readonly observed?: readonly string[]
  readonly interventions: Assignment
  readonly removedEdges: readonly Edge[]
  /** Variables a witness holds fixed: an amber hull. */
  readonly witness?: Assignment
  readonly onToggle?: (id: string) => void
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

const SNAP = 0.25

function snap(v: number): number {
  return Math.round(v / SNAP) * SNAP
}


interface Point {
  readonly x: number
  readonly y: number
}

function unit(a: Point, b: Point): { ux: number; uy: number; d: number } {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const d = Math.hypot(dx, dy) || 1
  return { ux: dx / d, uy: dy / d, d }
}

function clampPath(r: number): string {
  const o = r + 8
  const s = 14
  return `M${-o} ${-o + s}v${-s}h${s}M${o - s} ${-o}h${s}v${s}M${o} ${o - s}v${s}h${-s}M${-o + s} ${o}h${-s}v${-s}`
}

/** Direction 1 「訊號圖」: value nodes, signal edges, do() clamps and cut edges. */
export function SignalGraph(props: SignalGraphProps) {
  const { c, shown, values, original, probs, probNotes, observed = [], interventions, removedEdges, witness, onToggle, onMove } =
    props
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const svgRef = useRef<SVGSVGElement>(null)
  const [drag, setDrag] = useState<Drag | undefined>(undefined)
  const suppressClick = useRef(false)
  const prob = probs !== undefined
  const R = prob ? 34 : 30
  const COL = props.compact === true ? 132 : 220
  const ROW = props.compact === true ? 112 : 120
  const PAD_X = props.compact === true ? 60 : 96
  const PAD_Y = 72
  const grid = gridLayout(c, shown)
  const cells = [...grid.values()]
  const minCol = Math.min(...cells.map((p) => p.col))
  const maxCol = Math.max(...cells.map((p) => p.col))
  const minRow = Math.min(...cells.map((p) => p.row))
  const maxRow = Math.max(...cells.map((p) => p.row))
  const multiRow = maxRow > minRow
  const width = PAD_X * 2 + (maxCol - minCol) * COL
  const hasWitness = witness !== undefined && Object.keys(witness).length > 0
  const extraBottom = (prob ? 44 : 0) + (hasWitness ? 40 : 0)
  const height = PAD_Y * 2 + (maxRow - minRow) * ROW + extraBottom
  const pos = new Map<string, Point>()
  for (const [id, p] of grid) {
    const off = drag?.id === id ? drag : undefined
    pos.set(id, { x: PAD_X + (p.col - minCol) * COL + (off?.dx ?? 0), y: PAD_Y + (p.row - minRow) * ROW + (off?.dy ?? 0) })
  }
  const toSvg = (e: PointerEvent): Point => {
    const ctm = svgRef.current?.getScreenCTM?.()
    if (ctm === null || ctm === undefined) return { x: e.clientX, y: e.clientY }
    const inv = ctm.inverse()
    return { x: inv.a * e.clientX + inv.c * e.clientY + inv.e, y: inv.b * e.clientX + inv.d * e.clientY + inv.f }
  }
  const startDrag = (id: string, e: PointerEvent<SVGGElement>): void => {
    if (onMove === undefined || e.button !== 0) return
    const at = toSvg(e)
    svgRef.current?.setPointerCapture?.(e.pointerId)
    setDrag({ id, pointer: e.pointerId, x0: at.x, y0: at.y, dx: 0, dy: 0, moved: false })
  }
  const moveDrag = (e: PointerEvent<SVGSVGElement>): void => {
    if (drag === undefined || e.pointerId !== drag.pointer) return
    const at = toSvg(e)
    const dx = at.x - drag.x0
    const dy = at.y - drag.y0
    setDrag({ ...drag, dx, dy, moved: drag.moved || Math.hypot(dx, dy) > 4 })
  }
  const endDrag = (e: PointerEvent<SVGSVGElement>): void => {
    if (drag === undefined || e.pointerId !== drag.pointer) return
    setDrag(undefined)
    if (!drag.moved) return
    suppressClick.current = true
    const dCol = snap(drag.dx / COL)
    const dRow = snap(drag.dy / ROW)
    if (dCol !== 0 || dRow !== 0) onMove?.(drag.id, dCol, dRow)
  }
  const labelAbove = (id: string): boolean => multiRow && (grid.get(id)?.row ?? 0) === minRow
  const cut = new Set(removedEdges.map((e) => `${e.from}>${e.to}`))
  const edges = shownEdges(c.model.edges, shown)

  const edgeEls = edges.map((e) => {
    const a = pos.get(e.from)
    const b = pos.get(e.to)
    if (a === undefined || b === undefined) return null
    const { ux, uy } = unit(a, b)
    const x1 = a.x + R * ux
    const y1 = a.y + R * uy
    const polarity = edgePolarity(c.model, e.from, e.to)
    const key = `${e.from}>${e.to}`
    if (cut.has(key)) {
      const x2 = b.x - (R + 2) * ux
      const y2 = b.y - (R + 2) * uy
      const mx = (x1 + x2) / 2
      const my = (y1 + y2) / 2
      const nx = -uy
      const ny = ux
      const slash = (cx: number, cy: number): string =>
        `M${cx - 10 * nx - 3 * ux} ${cy - 10 * ny - 3 * uy}L${cx + 10 * nx + 3 * ux} ${cy + 10 * ny + 3 * uy}`
      return (
        <g key={key} className="ca-edge ca-edge-cut" data-edge={key} data-state="cut">
          <line x1={x1} y1={y1} x2={mx - 10 * ux} y2={my - 10 * uy} className="ca-stroke-cut" />
          <line x1={mx + 10 * ux} y1={my + 10 * uy} x2={x2} y2={y2} className="ca-stroke-cut" />
          <path d={slash(mx - 4 * ux, my - 4 * uy) + slash(mx + 4 * ux, my + 4 * uy)} className="ca-stroke-slash" />
          <text
            x={mx + 18 * uy}
            y={my - 18 * ux + 4}
            className="ca-svg-small ca-svg-bold"
            textAnchor={uy > 0.3 ? 'start' : uy < -0.3 ? 'end' : 'middle'}
          >
            切斷
          </text>
        </g>
      )
    }
    const live = edgeLive(values, e.from)
    const cls = live ? 'ca-stroke-live' : 'ca-stroke-idle'
    if (polarity === 'inhibit') {
      const x2 = b.x - (R + 7) * ux
      const y2 = b.y - (R + 7) * uy
      const lx = a.x + (b.x - a.x) * 0.55 + 14 * Math.abs(uy) + 4
      const ly = a.y + (b.y - a.y) * 0.55 - 12 * Math.abs(ux)
      return (
        <g key={key} className="ca-edge" data-edge={key} data-state={live ? 'live' : 'idle'}>
          <line x1={x1} y1={y1} x2={x2} y2={y2} className={cls} />
          <circle cx={x2 + 5 * ux} cy={y2 + 5 * uy} r={5} className={`ca-inhibit ${live ? 'is-live' : ''}`} />
          <text x={lx} y={ly} className={`ca-svg-small ca-svg-bold ca-mono ${live ? '' : 'ca-fill-muted'}`}>
            ¬{e.from}
          </text>
        </g>
      )
    }
    const x2 = b.x - (R + 2) * ux
    const y2 = b.y - (R + 2) * uy
    return (
      <g key={key} className="ca-edge" data-edge={key} data-state={live ? 'live' : 'idle'}>
        <line
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          className={cls}
          markerEnd={`url(#${uid}-${live ? 'live' : 'idle'})`}
        />
      </g>
    )
  })

  let hull: { x: number; y: number; w: number; h: number; text: string } | undefined
  if (witness !== undefined && Object.keys(witness).length > 0) {
    const pts = Object.keys(witness)
      .map((id) => pos.get(id))
      .filter((p): p is Point => p !== undefined)
    if (pts.length > 0) {
      const pad = R + 14
      const x = Math.min(...pts.map((p) => p.x)) - pad - 20
      const y = Math.min(...pts.map((p) => p.y)) - pad
      hull = {
        x,
        y,
        w: Math.max(...pts.map((p) => p.x)) + pad + 20 - x,
        // Include the label under the node.
        h: Math.max(...pts.map((p) => p.y)) + R + 34 - y,
        text: `見證：固定 ${assignmentText(witness)}`,
      }
    }
  }

  const nodeEls = shown.map((id) => {
    const p = pos.get(id)
    if (p === undefined) return null
    const variable = getVariable(c.model, id)
    const v = values?.[id]
    const forced = interventions[id]
    const intervened = forced !== undefined
    const held = witness !== undefined && id in witness
    const boolean = variable.domain.kind === 'boolean'
    const filled = !prob && v === true
    const text = v === undefined ? '' : formatValue(v)
    const before = original?.[id]
    const changed = !prob && before !== undefined && v !== undefined && !valuesEqual(before, v)
    const above = labelAbove(id)
    const name = label(c.model, id)
    const pv = probs?.[id]
    const state = prob
      ? `P(${id}${boolean ? '=1' : `=${String(variable.domain.kind === 'finite' ? variable.domain.values[0] : '')}`}) ${probText(pv ?? Number.NaN)}`
      : `值 ${text}`
    const aria = `${id} ${name}，${state}${intervened ? `，已干預成 ${formatValue(forced)}` : ''}${changed ? `，原本 ${formatValue(before)}` : ''}`
    const interactive = onToggle !== undefined || onMove !== undefined
    const arrows: Record<string, [number, number]> = { ArrowLeft: [-0.5, 0], ArrowRight: [0.5, 0], ArrowUp: [0, -0.5], ArrowDown: [0, 0.5] }
    const onKey = (event: KeyboardEvent<SVGGElement>): void => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        onToggle?.(id)
        return
      }
      const step = arrows[event.key]
      if (onMove !== undefined && step !== undefined) {
        event.preventDefault()
        onMove(id, step[0], step[1])
      }
    }
    const onClick = (): void => {
      if (suppressClick.current) {
        suppressClick.current = false
        return
      }
      onToggle?.(id)
    }
    const hint = [onToggle !== undefined ? `按一下${intervened ? '取消干預' : '套上干預'}` : '', onMove !== undefined ? '拖曳或用方向鍵移動' : '']
      .filter((h) => h !== '')
      .join('；')
    const level = prob && pv !== undefined && !Number.isNaN(pv) ? 2 * R * pv : 0
    // A non-boolean node's fill is P(V = its first value): say which value.
    const fillMeans = prob && variable.domain.kind === 'finite' ? `${id}=${String(variable.domain.values[0])} ` : ''
    const numberText = (
      <>
        {fillMeans !== '' && (
          <tspan className="ca-svg-small ca-fill-muted" data-fill-means={fillMeans.trim()}>
            {fillMeans}
          </tspan>
        )}
        {probText(pv ?? Number.NaN)}
      </>
    )
    const labelY = above ? -R - 16 : R + 24
    const numberRight = prob && above
    const doTagLeft = (grid.get(id)?.col ?? 0) === maxCol
    const doText = `${id}←${formatValue(forced ?? '')}`
    const doW = textWidth(doText, 12) + 18
    return (
      <g
        key={id}
        className={`ca-node${interactive ? ' is-interactive' : ''}${onMove !== undefined ? ' is-movable' : ''}`}
        data-node={id}
        data-value={text}
        data-intervened={intervened ? 'true' : 'false'}
        transform={`translate(${p.x} ${p.y})`}
        {...(interactive
          ? {
              role: 'button',
              tabIndex: 0,
              'aria-pressed': onToggle !== undefined ? intervened : undefined,
              'aria-label': `${aria}。${hint}`,
              onClick,
              onKeyDown: onKey,
              onPointerDown: (e: PointerEvent<SVGGElement>) => startDrag(id, e),
            }
          : { role: 'img', 'aria-label': aria })}
      >
        <circle r={R + 12} className="ca-focus-ring" />
        {observed.includes(id) && <circle r={R + 5} className="ca-ring" />}
        {prob ? (
          <>
            <clipPath id={`${uid}-cp-${id}`}>
              <circle r={R} />
            </clipPath>
            <circle r={R} className="ca-fill-bg" />
            <rect
              x={-R}
              y={R - level}
              width={2 * R}
              height={level}
              className="ca-fill-fg"
              clipPath={`url(#${uid}-cp-${id})`}
              data-level={pv === undefined ? '' : pv.toFixed(4)}
            />
            <circle r={R} className="ca-node-outline" />
          </>
        ) : (
          <>
            <circle r={R} className={filled ? 'ca-node-on' : 'ca-node-off'} />
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
        {intervened && !held && (
          <>
            <path d={clampPath(R)} className="ca-stroke-clamp" />
            <g transform={`translate(${doTagLeft ? -R - 12 - doW : R + 12} ${-R - 10})`}>
              <rect width={doW} height={22} className="ca-fill-accent" />
              <text x={doW / 2} y={15.5} textAnchor="middle" className="ca-mono ca-svg-small ca-svg-bold ca-fill-on-accent">
                {doText}
              </text>
            </g>
          </>
        )}
        {changed && (
          <text x={R + 14} y={R + 14} className="ca-svg-small ca-fill-muted">
            原本 {formatValue(before)}
          </text>
        )}
        <text y={labelY} textAnchor="middle" className="ca-svg-label">
          <tspan className="ca-mono ca-svg-bold">{id}</tspan> {name}
        </text>
        {prob &&
          (numberRight ? (
            <>
              <text x={R + 12} y={-2} className="ca-mono ca-svg-num">
                {numberText}
              </text>
              {probNotes?.[id] !== undefined && (
                <text x={R + 12} y={16} className="ca-svg-small ca-fill-muted">
                  {probNotes[id]}
                </text>
              )}
            </>
          ) : (
            <>
              <text y={labelY + 22} textAnchor="middle" className="ca-mono ca-svg-num">
                {numberText}
              </text>
              {probNotes?.[id] !== undefined && (
                <text y={labelY + 41} textAnchor="middle" className="ca-svg-small ca-fill-muted">
                  {probNotes[id]}
                </text>
              )}
            </>
          ))}
      </g>
    )
  })

  return (
    <svg
      ref={svgRef}
      onPointerMove={onMove === undefined ? undefined : moveDrag}
      onPointerUp={onMove === undefined ? undefined : endDrag}
      onPointerCancel={onMove === undefined ? undefined : () => setDrag(undefined)}
      className="ca-graph"
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="group"
      aria-label={props.title}
      data-mode={prob ? 'probability' : 'value'}
    >
      <defs>
        <marker id={`${uid}-live`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto">
          <path d="M0 0.5L10 5L0 9.5z" className="ca-fill-fg" />
        </marker>
        <marker id={`${uid}-idle`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">
          <path d="M0 0.5L10 5L0 9.5z" className="ca-fill-idle" />
        </marker>
      </defs>
      {hull !== undefined && (
        <g className="ca-witness" data-witness={Object.keys(witness ?? {}).join(',')}>
          <rect x={hull.x} y={hull.y} width={hull.w} height={hull.h} className="ca-hull" />
          <g transform={`translate(${hull.x} ${hull.y + hull.h + 6})`}>
            <rect width={textWidth(hull.text, 12) + 18} height={22} className="ca-amber-tag" />
            <text x={8} y={15.5} className="ca-svg-small ca-svg-bold ca-fill-amber">
              {hull.text}
            </text>
          </g>
        </g>
      )}
      {edgeEls}
      {nodeEls}
    </svg>
  )
}
