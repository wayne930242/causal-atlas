import type { RefObject } from 'react'
import { useEffect, useState } from 'react'

/**
 * True once the element is narrower than `limit` px. Starts false (the server render and the first
 * client render agree) and only reads layout inside an effect.
 */
export function useNarrow(ref: RefObject<HTMLElement | null>, limit: number): boolean {
  const [narrow, setNarrow] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (el === null || typeof ResizeObserver === 'undefined') return
    const check = (): void => setNarrow(el.clientWidth > 0 && el.clientWidth < limit)
    check()
    const observer = new ResizeObserver(check)
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref, limit])
  return narrow
}
