import type { ReactNode, RefObject } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import type { LoadedCase } from '../../data/load.ts'
import type { Locale, Messages } from '../i18n/messages.ts'
import { LocaleProvider, messagesFor } from '../i18n/messages.ts'
import { originCitations, originSources } from '../model/verdict-rows.ts'
import { DEFAULT_DIGITS, DigitsScope } from '../shared/digits.ts'
import type { ExportPanel, ExportSource } from './export-image.ts'

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
  digits = DEFAULT_DIGITS,
): { readonly svg: SVGSVGElement | null; readonly dispose?: () => void } {
  if (locale === page.locale) return { svg: onPage() ?? null }
  const view = renderDetached(<LocaleProvider locale={locale}>
      <DigitsScope digits={digits}>{draw()}</DigitsScope>
    </LocaleProvider>)
  return { svg: view.container.querySelector<SVGSVGElement>('svg.ca-graph'), dispose: view.dispose }
}

/** What a single-graph panel puts into its export: the file name, its panels (the graph with its tags) and the legend. */
export interface GraphExportParts {
  readonly name: string
  readonly panels: readonly ExportPanel[]
  readonly legend: string
}

/**
 * The export of a panel that draws one graph (`svg.ca-graph` inside `wrap`): the graph on the page,
 * or drawn off-screen in `locale` (see {@link graphExport}), with the case's title and sources.
 * `draw` draws the graph in a language's messages (its probabilities written to `digits` decimals);
 * `parts` names the export and lays out its panels.
 * Undefined when there is no graph to export.
 */
export function singleGraphSource(
  c: LoadedCase,
  locale: Locale,
  page: Messages,
  wrap: RefObject<HTMLElement | null>,
  digits: number,
  draw: (m: Messages) => ReactNode,
  parts: (svg: SVGSVGElement, m: Messages) => GraphExportParts,
): ExportSource | undefined {
  const m = messagesFor(locale)
  const { svg, dispose } = graphExport(locale, page, () => wrap.current?.querySelector<SVGSVGElement>('svg.ca-graph'), () => draw(m), digits)
  if (svg === null) {
    dispose?.()
    return undefined
  }
  const { name, panels, legend } = parts(svg, m)
  return { name, title: c.data.title[locale], panels, legend, origin: originSources(m, c), originCitations: originCitations(c), dispose }
}
