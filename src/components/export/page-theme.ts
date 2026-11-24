import type { ExportTheme } from './export-image.ts'

/** The page's theme around `el`: the nearest `data-theme`, else light. */
export function pageTheme(el: Element | null): ExportTheme {
  const holder = el?.closest('[data-theme]') ?? (typeof document === 'undefined' ? null : document.documentElement)
  return holder?.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
}
