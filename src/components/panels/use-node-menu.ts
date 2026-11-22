import type { CSSProperties, RefObject } from 'react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { placeMenu } from './menu-place.ts'

type Wrapper = RefObject<HTMLDivElement | null>

function focusAnchor(wrap: Wrapper, id: string): void {
  wrap.current?.querySelector<SVGGElement>(`[data-node="${id}"]`)?.focus()
}

/** Open the node dialog beside its trigger; outside press dismisses it, Escape returns focus. */
export function useNodeMenu(wrap: Wrapper, shown: readonly string[], layout: object, narrow: boolean) {
  const [at, setAt] = useState<string | undefined>(undefined)
  const anchor = at !== undefined && shown.includes(at) ? at : undefined
  // Don't reopen a dialog if its hidden trigger comes back later.
  if (at !== undefined && anchor === undefined) setAt(undefined)
  const menuRef = useRef<HTMLDivElement>(null)
  const [style, setStyle] = useState<CSSProperties>({ visibility: 'hidden' })
  const close = (): void => {
    if (anchor !== undefined) focusAnchor(wrap, anchor)
    setAt(undefined)
  }
  useLayoutEffect(() => {
    if (anchor === undefined) return
    const place = (): void => {
      const box = wrap.current?.getBoundingClientRect()
      const r = wrap.current?.querySelector(`[data-node="${anchor}"] .ca-focus-ring`)?.getBoundingClientRect()
      if (box === undefined || r === undefined) {
        setStyle({})
        return
      }
      const p = placeMenu({ left: r.left - box.left, right: r.right - box.left, top: r.top - box.top, bottom: r.bottom - box.top }, wrap.current?.clientWidth ?? 0)
      setStyle({ left: p.left, top: p.top, width: p.width })
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [anchor, layout, narrow, wrap])
  useEffect(() => {
    if (anchor === undefined) return
    const outside = (e: Event): void => {
      const target = e.target
      if (!(target instanceof Element)) return
      if (menuRef.current?.contains(target) !== true && !(wrap.current?.contains(target) === true && target.closest('[data-node]') !== null)) setAt(undefined)
    }
    const escape = (e: globalThis.KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      const active = document.activeElement
      if (active === null || active === document.body || wrap.current?.contains(active) === true) focusAnchor(wrap, anchor)
      setAt(undefined)
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [anchor, wrap])
  return { anchor, menuRef, style, close, dismiss: () => setAt(undefined), toggle: (id: string) => setAt(anchor === id ? undefined : id) }
}
