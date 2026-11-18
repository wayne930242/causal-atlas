import { useId, useState } from 'react'

export interface Tabs {
  /** The open block, if any. */
  readonly open: string | undefined
  readonly toggle: (id: string) => void
  /** Prefix of the DOM ids. */
  readonly base: string
}

/** Which block is open: `initial` at first, then what the reader clicked. An id that is not among `ids` counts as none. */
export function useTabs(ids: readonly string[], initial?: string): Tabs {
  const base = useId()
  const [picked, setPicked] = useState<string | undefined>(initial)
  const open = picked !== undefined && ids.includes(picked) ? picked : undefined
  return { open, base, toggle: (id) => setPicked(open === id ? undefined : id) }
}

export const tabButtonId = (tabs: Tabs, id: string): string => `${tabs.base}-tab-${id}`
export const tabPanelId = (tabs: Tabs, id: string): string => `${tabs.base}-panel-${id}`
