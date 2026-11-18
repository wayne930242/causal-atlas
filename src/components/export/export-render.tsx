import type { ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import type { Locale, Messages } from '../i18n/messages.ts'
import { LocaleProvider } from '../i18n/messages.ts'

/**
 * Render `node` synchronously into a hidden element on the page, so an export can draw a graph in
 * another language than the one on screen. Client only; call from an event handler, then dispose.
 */
export function renderDetached(node: ReactNode): { readonly container: HTMLElement; readonly dispose: () => void } {
  const container = document.createElement('div')
  container.setAttribute('aria-hidden', 'true')
  container.style.cssText = 'position:absolute;left:-100000px;top:0;visibility:hidden;pointer-events:none'
  document.body.append(container)
  const root = createRoot(container)
  flushSync(() => root.render(node))
  return {
    container,
    dispose: () => {
      root.unmount()
      container.remove()
    },
  }
}

/**
 * The export of one graph: the SVG on the page in the page's language, else the same graph drawn
 * off-screen in `locale`. `draw` returns the graph element (without handlers).
 */
export function graphExport(
  locale: Locale,
  page: Messages,
  onPage: () => SVGSVGElement | null | undefined,
  draw: () => ReactNode,
): { readonly svg: SVGSVGElement | null; readonly dispose?: () => void } {
  if (locale === page.locale) return { svg: onPage() ?? null }
  const view = renderDetached(<LocaleProvider locale={locale}>{draw()}</LocaleProvider>)
  return { svg: view.container.querySelector<SVGSVGElement>('svg.ca-graph'), dispose: view.dispose }
}
