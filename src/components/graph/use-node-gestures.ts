import type { KeyboardEvent, MouseEvent, PointerEvent, RefObject } from 'react'
import { useEffect, useRef, useState } from 'react'
import type { Point } from './signal-shapes.ts'
import { snap } from './signal-shapes.ts'

/**
 * The pointer and keyboard gestures on a signal graph's nodes: dragging a node (reported in grid
 * steps), a long press or right-click that intervenes where a click observes, the click a drag or
 * long press leaves behind (ignored), and the arrow keys that move a node.
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

/** What a node does when activated: `activate` observes (or intervenes with Shift), `intervene` sets it by do(). */
export interface NodeActions {
  /** A node that do() can set: the long press and right-click apply to it. */
  readonly settable: boolean
  /** Clicks observe (so a long press, Shift or a right-click intervenes). */
  readonly observes: boolean
  readonly activate: (shift: boolean) => void
  readonly intervene: () => void
}

/** How long a press must last to intervene instead of observe, in ms. */
const LONG_PRESS = 500

/** Arrow keys move a node by half a grid step. */
const ARROWS: Readonly<Record<string, readonly [number, number]>> = { ArrowLeft: [-0.5, 0], ArrowRight: [0.5, 0], ArrowUp: [0, -0.5], ArrowDown: [0, 0.5] }

export function useNodeGestures(svgRef: RefObject<SVGSVGElement | null>, onMove: ((id: string, dCol: number, dRow: number) => void) | undefined) {
  const [drag, setDrag] = useState<Drag | undefined>(undefined)
  // After a drag, the browser may still send a click to the node: ignore clicks until this time.
  const suppressUntil = useRef(0)
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

  /** The handlers of node `id`. */
  const nodeHandlers = (id: string, { settable, observes, activate, intervene }: NodeActions) => {
    const onKey = (event: KeyboardEvent<SVGGElement>): void => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        activate(event.shiftKey)
        return
      }
      const step = ARROWS[event.key]
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
    return {
      onClick,
      onKeyDown: onKey,
      onPointerDown,
      onPointerUp: cancelPress,
      onPointerLeave: cancelPress,
      onPointerCancel: cancelPress,
      onContextMenu: observes ? onContextMenu : undefined,
    }
  }

  return { drag, pressing, moveDrag, endDrag, cancelDrag, nodeHandlers }
}
