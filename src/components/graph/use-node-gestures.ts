import type { KeyboardEvent, PointerEvent, RefObject } from 'react'
import { useRef, useState } from 'react'
import type { Point } from './signal-shapes.ts'
import { snap } from './signal-shapes.ts'

/**
 * The pointer and keyboard gestures on a signal graph's nodes: a click (or Enter, Space) that
 * activates a node, dragging a node (reported in grid steps), the click a drag leaves behind
 * (ignored), and the arrow keys that move a node.
 */

/** A node being dragged: the pointer, where it went down (in svg px) and how far it has moved. */
export interface Drag {
  readonly id: string
  readonly pointer: number
  readonly x0: number
  readonly y0: number
  readonly dx: number
  readonly dy: number
  readonly moved: boolean
}

/** Arrow keys move a node by half a grid step. */
const ARROWS: Readonly<Record<string, readonly [number, number]>> = { ArrowLeft: [-0.5, 0], ArrowRight: [0.5, 0], ArrowUp: [0, -0.5], ArrowDown: [0, 0.5] }

export function useNodeGestures(svgRef: RefObject<SVGSVGElement | null>, onMove: ((id: string, dCol: number, dRow: number) => void) | undefined) {
  const [drag, setDrag] = useState<Drag | undefined>(undefined)
  // After a drag, the browser may still send a click to the node: ignore clicks until this time.
  const suppressUntil = useRef(0)
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
    if (moved && !drag.moved) svgRef.current?.setPointerCapture?.(e.pointerId)
    setDrag({ ...drag, dx, dy, moved })
  }
  /** Ends a drag and reports the move in grid steps of `col` × `row` px. */
  const endDrag = (e: PointerEvent<SVGSVGElement>, col: number, row: number): void => {
    if (drag === undefined || e.pointerId !== drag.pointer) return
    setDrag(undefined)
    if (!drag.moved) return
    suppressUntil.current = Date.now() + 400
    const dCol = snap(drag.dx / col)
    const dRow = snap(drag.dy / row)
    if (dCol !== 0 || dRow !== 0) onMove?.(drag.id, dCol, dRow)
  }
  const cancelDrag = (): void => setDrag(undefined)

  /** The handlers of node `id`; `activate` runs on a click, Enter or Space. */
  const nodeHandlers = (id: string, activate: () => void) => {
    const onKey = (event: KeyboardEvent<SVGGElement>): void => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        activate()
        return
      }
      const step = ARROWS[event.key]
      if (onMove !== undefined && step !== undefined) {
        event.preventDefault()
        onMove(id, step[0], step[1])
      }
    }
    const onClick = (): void => {
      if (Date.now() < suppressUntil.current) return
      activate()
    }
    return { onClick, onKeyDown: onKey, onPointerDown: (e: PointerEvent<SVGGElement>) => startDrag(id, e) }
  }

  return { drag, moveDrag, endDrag, cancelDrag, nodeHandlers }
}
