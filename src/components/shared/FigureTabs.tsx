import type { ReactNode } from 'react'
import { useMessages } from '../i18n/messages.ts'
import type { Tabs } from './use-tabs.ts'
import { tabButtonId, tabPanelId, useTabs } from './use-tabs.ts'

/**
 * The blocks under a figure's graph (verdicts, a table, the equations) share one row of tab
 * buttons and open one at a time: a click opens a block, a click on the open one closes it. A
 * closed block stays in the page (`hidden`), so page search and screen readers still reach it.
 */

export interface FigureBlock {
  /** Stable key: `equations`, `verdicts`, `ev`, `dsep`, `blame`, `strata`, `effects`, `background`, `probabilities`. */
  readonly id: string
  readonly label: ReactNode
  readonly children: ReactNode
}

/** One tab button; the open state is `aria-expanded`. */
export function TabButton({ tabs, id, className = 'ca-tab', children }: { readonly tabs: Tabs; readonly id: string; readonly className?: string; readonly children: ReactNode }) {
  return (
    <button
      type="button"
      className={className}
      id={tabButtonId(tabs, id)}
      data-tab={id}
      aria-expanded={tabs.open === id}
      aria-controls={tabPanelId(tabs, id)}
      onClick={() => tabs.toggle(id)}
    >
      {children}
    </button>
  )
}

/** The block a tab button opens; hidden, not removed, while closed. */
export function TabPanel({ tabs, id, className, children }: { readonly tabs: Tabs; readonly id: string; readonly className?: string; readonly children: ReactNode }) {
  return (
    <div
      id={tabPanelId(tabs, id)}
      className={`ca-tab-panel${className === undefined ? '' : ` ${className}`}`}
      data-tab-panel={id}
      role="region"
      aria-labelledby={tabButtonId(tabs, id)}
      hidden={tabs.open !== id}
    >
      {children}
    </div>
  )
}

/** The row of tab buttons and the blocks under it. `initial` is the block open at first: the figure's own focus, else none. */
export function FigureTabs({ blocks, initial }: { readonly blocks: readonly FigureBlock[]; readonly initial?: string }) {
  const t = useMessages()
  const tabs = useTabs(
    blocks.map((b) => b.id),
    initial,
  )
  if (blocks.length === 0) return null
  return (
    <div className="ca-tabs" data-open={tabs.open ?? ''}>
      <div className="ca-tabs-bar" role="group" aria-label={t.tabsLabel}>
        {blocks.map((b) => (
          <TabButton key={b.id} tabs={tabs} id={b.id}>
            {b.label}
          </TabButton>
        ))}
      </div>
      {blocks.map((b) => (
        <TabPanel key={b.id} tabs={tabs} id={b.id}>
          {b.children}
        </TabPanel>
      ))}
    </div>
  )
}
